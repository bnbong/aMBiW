// Best-effort cache warmer for the assets the GarageScene needs the moment it
// mounts: the BMW M4 GLB, the Draco decoder pair, and the audio loops. We only
// fetch into the HTTP cache here — the actual GLTFLoader/DRACOLoader work and
// AudioContext.decodeAudioData stays in CarModel/useAudioLoop, so we never
// fight or duplicate their pipelines. A failed fetch is logged and swallowed:
// the BootScreen's max wait still elapses and the scene's existing fallbacks
// (FallbackCar, local-light fallback, audio error banner) take over from there.

const MODEL_URL = "/assets/models/m4-competition.glb";
const DRACO_URLS = ["/draco/draco_decoder.js", "/draco/draco_decoder.wasm"];
const AUDIO_URLS = [
  "/assets/audio/engine_idle.mp3",
  "/assets/audio/indicator_loop.mp3",
  "/assets/audio/indicator_loop.ogg",
];

// drei v9.114.0 resolves preset "warehouse" to this exact URL via its
// CUBEMAP_ROOT constant. Hard-coding it here is a best-effort cache warm —
// if drei updates the commit hash on a future bump, the prefetch silently
// misses and the in-scene Suspense fallback (local lights) still keeps the
// car visible. Keep this URL in sync with HDR_ENVIRONMENT_PRESET in
// GarageScene.tsx if the preset is ever changed.
const HDR_PRESET_URL =
  "https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/empty_warehouse_01_1k.hdr";

export type PreloadOptions = {
  /** When false, skip the heavy 3D assets (audio-only mode). */
  includeScene: boolean;
};

async function warmOne(url: string): Promise<void> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) {
      console.warn(`[boot preload] ${url} -> HTTP ${res.status}`);
      return;
    }
    // Drain the body so Safari/Chrome actually commit the response to cache.
    await res.arrayBuffer();
  } catch (err) {
    console.warn(`[boot preload] ${url} failed`, err);
  }
}

export async function preloadCriticalAssets(
  options: PreloadOptions
): Promise<void> {
  const targets = options.includeScene
    ? [MODEL_URL, ...DRACO_URLS, HDR_PRESET_URL, ...AUDIO_URLS]
    : AUDIO_URLS;
  await Promise.allSettled(targets.map(warmOne));
}
