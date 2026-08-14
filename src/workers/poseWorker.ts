// Dedicated pose-inference worker. The YOLO26n-pose model has a fixed
// 640x640 input and each run takes tens of milliseconds — on the main thread
// that froze the game's render loop every frame, so all inference lives here.
// The main thread ships one ImageBitmap per frame and gets back the 17 COCO
// keypoints (mirrored x) of the most confident person.

import * as ort from 'onnxruntime-web/wasm';
import ortWasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

// Mirror of utils/assets.ts without its DOM side effects (no document here).
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? '').replace(/\/+$/, '');
const assetUrl = (path: string): string => `${ASSET_BASE}${path}`;

const MODEL_URL = assetUrl('/models/yolo26n-pose.onnx');
const INPUT_SIZE = 640;
const PERSON_CONF = 0.5;

// Pinned to the installed onnxruntime-web version; fallback when the locally
// served wasm binary fails to compile inside the worker.
const ORT_VERSION = '1.27.0';
const ORT_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

export interface Keypoint {
  x: number;
  y: number;
  score: number;
}

export interface DetectRequest {
  id: number;
  bitmap: ImageBitmap;
  videoWidth: number;
  videoHeight: number;
}

export interface DetectResponse {
  id: number;
  keypoints: Keypoint[] | null;
  error?: string;
}

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let inputCanvas: OffscreenCanvas | null = null;

function createSession(wasmPaths: { mjs: string; wasm: string }) {
  ort.env.wasm.wasmPaths = wasmPaths;
  // Multi-threaded wasm needs SharedArrayBuffer, i.e. cross-origin isolation
  // (COOP/COEP headers, set in vite.config). Without it, stay single-threaded.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))
    : 1;
  return ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

function loadSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    // Exactly one session create in flight at a time (see the main-thread
    // notes in utils/poseDetector.ts); the CDN retry is only chained after a
    // genuinely settled failure, and a rejected session is not cached.
    sessionPromise = createSession(
      ASSET_BASE
        ? {
            mjs: assetUrl('/wasm/ort-wasm-simd-threaded.mjs'),
            wasm: assetUrl('/wasm/ort-wasm-simd-threaded.wasm'),
          }
        : {
            mjs: ortWasmModuleUrl,
            wasm: ortWasmBinaryUrl,
          },
    ).catch((e) => {
      console.warn('Local ORT wasm failed in worker, retrying with CDN copy:', e);
      return createSession({
        mjs: `${ORT_CDN_BASE}/ort-wasm-simd-threaded.mjs`,
        wasm: `${ORT_CDN_BASE}/ort-wasm-simd-threaded.wasm`,
      });
    });
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

function preprocess(
  bitmap: ImageBitmap,
  vw: number,
  vh: number,
): { tensor: ort.Tensor; lb: Letterbox } {
  if (!inputCanvas) {
    inputCanvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  }
  const ctx = inputCanvas.getContext('2d', { willReadFrequently: true })!;

  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const dw = Math.round(vw * scale);
  const dh = Math.round(vh * scale);
  const padX = Math.floor((INPUT_SIZE - dw) / 2);
  const padY = Math.floor((INPUT_SIZE - dh) / 2);

  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(bitmap, padX, padY, dw, dh);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const float = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    float[i] = data[i * 4] / 255; // R
    float[plane + i] = data[i * 4 + 1] / 255; // G
    float[2 * plane + i] = data[i * 4 + 2] / 255; // B
  }
  return {
    tensor: new ort.Tensor('float32', float, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    lb: { scale, padX, padY },
  };
}

async function detect(req: DetectRequest): Promise<Keypoint[] | null> {
  const session = await loadSession();
  const { tensor, lb } = preprocess(req.bitmap, req.videoWidth, req.videoHeight);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const output = results[session.outputNames[0]];
  const dims = output.dims;
  const data = output.data as Float32Array;

  // Same output-layout normalization as the main-thread fallback path:
  //   e2e (YOLO26):   (1, N, 56|57) -> [x1,y1,x2,y2, conf, (cls,) 17*(x,y,c)]
  //   legacy (v8):    (1, 56, 8400) -> channel-major, transposed here
  let rows: ArrayLike<number>[] = [];
  if (dims.length === 3 && (dims[2] === 56 || dims[2] === 57)) {
    const n = dims[1];
    const stride = dims[2];
    rows = Array.from({ length: n }, (_, i) => data.subarray(i * stride, (i + 1) * stride));
  } else if (dims.length === 3 && dims[1] === 56) {
    const anchors = dims[2];
    const transposed = new Array(anchors) as Float32Array[];
    for (let a = 0; a < anchors; a++) {
      const row = new Float32Array(56);
      for (let c = 0; c < 56; c++) row[c] = data[c * anchors + a];
      transposed[a] = row;
    }
    rows = transposed;
  } else {
    console.warn('Unexpected pose model output shape:', dims);
    return null;
  }

  // Pick the most confident person
  let best: ArrayLike<number> | null = null;
  let bestConf = PERSON_CONF;
  for (const row of rows) {
    if (row[4] > bestConf) {
      bestConf = row[4];
      best = row;
    }
  }
  if (!best) return null;

  const kptOffset = best.length === 57 ? 6 : 5;
  const vw = req.videoWidth;
  const keypoints: Keypoint[] = [];
  for (let k = 0; k < 17; k++) {
    const rawX = (best[kptOffset + k * 3] - lb.padX) / lb.scale;
    const rawY = (best[kptOffset + k * 3 + 1] - lb.padY) / lb.scale;
    keypoints.push({
      x: vw - rawX, // mirror to match the scale-x-[-1] PiP display
      y: rawY,
      score: best[kptOffset + k * 3 + 2],
    });
  }
  return keypoints;
}

const scope = self as unknown as Worker;

scope.onmessage = async (e: MessageEvent<DetectRequest>) => {
  const req = e.data;
  try {
    const keypoints = await detect(req);
    scope.postMessage({ id: req.id, keypoints } satisfies DetectResponse);
  } catch (err) {
    scope.postMessage({ id: req.id, keypoints: null, error: String(err) } satisfies DetectResponse);
  } finally {
    req.bitmap.close();
  }
};
