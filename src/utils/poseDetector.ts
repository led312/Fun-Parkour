// YOLO26n-pose browser-side inference via onnxruntime-web (WASM backend).
// Loads the ONNX model from /models/yolo26n-pose.onnx (or from
// VITE_ASSET_BASE when assets are served from COS) and returns 17 COCO
// keypoints in *mirrored* video coordinates (matching the on-screen PiP feed,
// so "user moves left" == decreasing x).
//
// Inference runs in a dedicated Web Worker (workers/poseWorker.ts): the model
// input is fixed at 640x640 and each run takes tens of milliseconds, which
// froze the game's render loop when it ran on the main thread. The
// main-thread path below is kept as a fallback in case the worker itself
// fails to start or its model load fails.

import * as ort from 'onnxruntime-web/wasm';
// Wasm-only build on purpose: ORT's WebGPU path hangs session creation on
// machines with headless/software GPUs (adapter probe can even succeed while
// the actual session init never settles), and the WebGPU-capable jsep wasm
// binary is 2x the size. The plain simd+threaded wasm build is smaller and
// works everywhere.
// Let Vite bundle the ORT WASM artifacts as real assets (serving them from
// /public breaks in dev: ORT imports the .mjs with ?import, which Vite rejects
// for public-dir files). onnxruntime-web's package exports map exposes these
// two subpaths explicitly.
import ortWasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { assetUrl, hasAssetBase } from './assets';

export interface Keypoint {
  x: number;
  y: number;
  score: number;
}

// COCO keypoint indices
export const KP = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
} as const;

const MODEL_URL = assetUrl('/models/yolo26n-pose.onnx');
const INPUT_SIZE = 640;
const PERSON_CONF = 0.5;
const KP_CONF = 0.5;

/** Standing-pose reference captured during calibration; all gesture
 *  thresholds are normalized against these measurements. */
export interface PoseBaseline {
  headY: number; // face-keypoint average, the most jitter-resistant drop signal
  shoulderY: number;
  hipY: number;
  torso: number; // shoulder->hip distance, the normalization scale
  centerX: number;
  shoulderW: number;
}

const kpOk = (kp: Keypoint | undefined): kp is Keypoint => !!kp && kp.score > KP_CONF;
const kpMid = (a: Keypoint, b: Keypoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Extract baseline measurements (shoulder/hip position, torso length,
 *  center x, shoulder width) from a keyframe, or null when the core body
 *  keypoints are not confidently visible. */
export function measureBaseline(kps: Keypoint[]): PoseBaseline | null {
  const ls = kps[KP.LEFT_SHOULDER];
  const rs = kps[KP.RIGHT_SHOULDER];
  const lh = kps[KP.LEFT_HIP];
  const rh = kps[KP.RIGHT_HIP];
  if (!kpOk(ls) || !kpOk(rs) || !kpOk(lh) || !kpOk(rh)) return null;
  const shoulder = kpMid(ls, rs);
  const hip = kpMid(lh, rh);
  const torso = Math.max(1, hip.y - shoulder.y);
  return {
    // Head sits roughly half a torso above the shoulders; the anatomical
    // estimate only kicks in when every face keypoint is blurry
    headY: measureHeadY(kps) ?? shoulder.y - 0.45 * torso,
    shoulderY: shoulder.y,
    hipY: hip.y,
    torso,
    centerX: hip.x,
    shoulderW: Math.max(1, Math.abs(rs.x - ls.x)),
  };
}

/** Average a series of baseline samples into one stable reference. */
export function averageBaseline(samples: PoseBaseline[]): PoseBaseline {
  const avg = (pick: (b: PoseBaseline) => number) =>
    samples.reduce((s, b) => s + pick(b), 0) / samples.length;
  return {
    headY: avg((b) => b.headY),
    shoulderY: avg((b) => b.shoulderY),
    hipY: avg((b) => b.hipY),
    torso: avg((b) => b.torso),
    centerX: avg((b) => b.centerX),
    shoulderW: avg((b) => b.shoulderW),
  };
}

/** Face-keypoint average y (nose/eyes/ears), or null when none are
 *  confidently visible. The face is the most stable part of the skeleton —
 *  it doesn't blur with arm/leg motion — so this is the primary squat
 *  signal: squatting drops the head clearly below the standing baseline. */
export function measureHeadY(kps: Keypoint[]): number | null {
  let sum = 0;
  let n = 0;
  for (const i of [KP.NOSE, KP.LEFT_EYE, KP.RIGHT_EYE, KP.LEFT_EAR, KP.RIGHT_EAR]) {
    const kp = kps[i];
    if (kpOk(kp)) {
      sum += kp.y;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Hip midpoint y, or null when hips aren't confidently visible. */
export function measureHipY(kps: Keypoint[]): number | null {
  const lh = kps[KP.LEFT_HIP];
  const rh = kps[KP.RIGHT_HIP];
  if (!kpOk(lh) || !kpOk(rh)) return null;
  return (lh.y + rh.y) / 2;
}

/** Shoulder midpoint y, or null when shoulders aren't confidently visible.
 *  Used for squat detection: hips often lose confidence mid-squat (thigh
 *  occlusion), while shoulders stay visible and drop clearly. */
export function measureShoulderY(kps: Keypoint[]): number | null {
  const ls = kps[KP.LEFT_SHOULDER];
  const rs = kps[KP.RIGHT_SHOULDER];
  if (!kpOk(ls) || !kpOk(rs)) return null;
  return (ls.y + rs.y) / 2;
}

/** Shoulder midpoint x, or null when shoulders aren't confidently visible.
 *  Used for lane detection: the upper body leads sideways steps and the
 *  shoulders stay trackable when the hips lose confidence mid-move. */
export function measureShoulderX(kps: Keypoint[]): number | null {
  const ls = kps[KP.LEFT_SHOULDER];
  const rs = kps[KP.RIGHT_SHOULDER];
  if (!kpOk(ls) || !kpOk(rs)) return null;
  return (ls.x + rs.x) / 2;
}

// COCO skeleton limb pairs for overlay rendering
const LIMBS: [number, number][] = [
  [KP.NOSE, KP.LEFT_EYE], [KP.NOSE, KP.RIGHT_EYE],
  [KP.LEFT_EYE, KP.LEFT_EAR], [KP.RIGHT_EYE, KP.RIGHT_EAR],
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW], [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW], [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP], [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE], [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE], [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
];

/** Draw the detected skeleton onto an overlay canvas that covers the video.
 *  Assumes the video is displayed with object-cover (both the PiP feed and
 *  the fullscreen calibration feed use it), so crop offsets are applied. */
export function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  kps: Keypoint[] | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !video.videoWidth) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!kps) return;

  // object-cover mapping: uniform scale to fill, crop the overflow
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const offX = (canvas.width - video.videoWidth * scale) / 2;
  const offY = (canvas.height - video.videoHeight * scale) / 2;
  const px = (x: number) => x * scale + offX;
  const py = (y: number) => y * scale + offY;

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = Math.max(2, canvas.width / 100);
  ctx.lineCap = 'round';
  for (const [a, b] of LIMBS) {
    const pa = kps[a];
    const pb = kps[b];
    if (!kpOk(pa) || !kpOk(pb)) continue;
    ctx.beginPath();
    ctx.moveTo(px(pa.x), py(pa.y));
    ctx.lineTo(px(pb.x), py(pb.y));
    ctx.stroke();
  }
  ctx.fillStyle = '#34d399';
  const dotR = Math.max(3, canvas.width / 60);
  for (const kp of kps) {
    if (!kpOk(kp)) continue;
    ctx.beginPath();
    ctx.arc(px(kp.x), py(kp.y), dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let inputCanvas: HTMLCanvasElement | null = null;

// Pinned to the installed onnxruntime-web version; used only when the locally
// served wasm binary fails to compile (e.g. a truncated copy in node_modules
// or a network filter mangling the 13MB download).
const ORT_VERSION = '1.27.0';
const ORT_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

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

export function loadPoseModel(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    // Exactly one session create in flight at a time — ORT's wasm runtime
    // initializes once globally, and any create issued while another is still
    // pending fails with "multiple calls to 'initWasm()' detected". The CDN
    // retry is therefore only chained after a genuinely settled failure.
    // With VITE_ASSET_BASE set, the 13MB wasm is served from the COS bucket
    // (/wasm/...) alongside the model instead of the local origin.
    sessionPromise = createSession(
      hasAssetBase
        ? {
            mjs: assetUrl('/wasm/ort-wasm-simd-threaded.mjs'),
            wasm: assetUrl('/wasm/ort-wasm-simd-threaded.wasm'),
          }
        : {
            mjs: ortWasmModuleUrl,
            wasm: ortWasmBinaryUrl,
          },
    ).catch((e) => {
      console.warn('Local ORT wasm failed, retrying with CDN copy:', e);
      return createSession({
        mjs: `${ORT_CDN_BASE}/ort-wasm-simd-threaded.mjs`,
        wasm: `${ORT_CDN_BASE}/ort-wasm-simd-threaded.wasm`,
      });
    });
    // A rejected session must not be cached forever: clear it so the next
    // detectPose() call retries from scratch.
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

function preprocess(video: HTMLVideoElement): { tensor: ort.Tensor; lb: Letterbox } {
  if (!inputCanvas) {
    inputCanvas = document.createElement('canvas');
    inputCanvas.width = INPUT_SIZE;
    inputCanvas.height = INPUT_SIZE;
  }
  const ctx = inputCanvas.getContext('2d', { willReadFrequently: true })!;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const dw = Math.round(vw * scale);
  const dh = Math.round(vh * scale);
  const padX = Math.floor((INPUT_SIZE - dw) / 2);
  const padY = Math.floor((INPUT_SIZE - dh) / 2);

  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(video, 0, 0, vw, vh, padX, padY, dw, dh);

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

// --- Worker offload -------------------------------------------------------
// One ImageBitmap per frame is transferred (zero-copy) to the worker, which
// runs preprocessing + inference off the main thread. Any worker-level
// failure (construction, script error, or a rejected model load) permanently
// switches detectPose() to the main-thread fallback below.

interface WorkerResponse {
  id: number;
  keypoints: Keypoint[] | null;
  error?: string;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextReqId = 1;
const pending = new Map<
  number,
  { resolve: (k: Keypoint[] | null) => void; reject: (e: Error) => void }
>();

function failWorker(reason: unknown) {
  console.warn('Pose worker unavailable, using main-thread inference:', reason);
  workerFailed = true;
  worker?.terminate();
  worker = null;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  pending.forEach((p) => p.reject(err));
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/poseWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, keypoints, error } = e.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (error !== undefined) {
          // The worker itself is alive but its model load failed; the
          // main-thread fallback has its own CDN retry, so give it a shot.
          p.reject(new Error(error));
          failWorker(error);
        } else {
          p.resolve(keypoints);
        }
      };
      worker.onerror = (e) => failWorker(e.message);
    } catch (e) {
      failWorker(e);
      return null;
    }
  }
  return worker;
}

async function detectPoseInWorker(video: HTMLVideoElement): Promise<Keypoint[] | null> {
  const w = getWorker();
  if (!w) throw new Error('pose worker unavailable');
  const bitmap = await createImageBitmap(video);
  const id = nextReqId++;
  return new Promise<Keypoint[] | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(
      { id, bitmap, videoWidth: video.videoWidth, videoHeight: video.videoHeight },
      [bitmap],
    );
  });
}

/**
 * Run pose detection on the current video frame.
 * Returns the 17 keypoints of the most confident person (mirrored x),
 * or null when nobody is detected.
 */
export async function detectPose(video: HTMLVideoElement): Promise<Keypoint[] | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  if (!workerFailed && typeof createImageBitmap === 'function') {
    try {
      return await detectPoseInWorker(video);
    } catch {
      workerFailed = true; // fall through to the main-thread path
    }
  }

  const session = await loadPoseModel();

  const { tensor, lb } = preprocess(video);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const output = results[session.outputNames[0]];
  const dims = output.dims;
  const data = output.data as Float32Array;

  // Normalize both known YOLO pose export layouts into row records:
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
  const vw = video.videoWidth;
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
