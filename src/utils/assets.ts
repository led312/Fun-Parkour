// Static asset URLs (images, pose model). By default assets are served
// locally from /public. Set VITE_ASSET_BASE at build time to serve them
// from a CDN/COS bucket instead, e.g.:
//   VITE_ASSET_BASE=https://<bucket>.cos.ap-hongkong.myqcloud.com
// The bucket must mirror the /public directory layout (/assets/..., /models/...)
// and allow cross-origin GET (the ONNX model is fetched by JS).
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? '').replace(/\/+$/, '');

export const assetUrl = (path: string): string => `${ASSET_BASE}${path}`;

// True when assets (and optionally the ORT wasm runtime) are served from a
// CDN/COS bucket instead of the local origin.
export const hasAssetBase = ASSET_BASE.length > 0;

// Warm up the connection to the asset host so the first image/model request
// skips DNS+TLS setup. All asset loads happen after JS boots anyway, so a
// runtime-injected hint is just as early as a static <link> would be.
if (hasAssetBase) {
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = ASSET_BASE;
  preconnect.crossOrigin = '';
  document.head.appendChild(preconnect);
}
