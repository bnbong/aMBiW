import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GarageScene } from "./components/GarageScene";
import { ControlBar } from "./components/ControlBar";
import { CreditsModal } from "./components/CreditsModal";
import { LightingDebugPanel } from "./components/LightingDebugPanel";
import { SceneErrorBoundary } from "./components/SceneErrorBoundary";
import { BootScreen } from "./components/BootScreen";
import { DEFAULT_LIGHTING, type LightingSettings } from "./config/lighting";
import { useAudioLoop } from "./hooks/useAudioLoop";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { detectWebGL } from "./utils/detectWebGL";
import { preloadCriticalAssets } from "./utils/preloadAssets";

const MODEL_URL = "/assets/models/m4-competition.glb";
const ENGINE_AUDIO = "/assets/audio/engine_idle.mp3";
const INDICATOR_AUDIO_MP3 = "/assets/audio/indicator_loop.mp3";
const INDICATOR_AUDIO_OGG = "/assets/audio/indicator_loop.ogg";

// engine_idle.mp3 has trailing silence after ~14.52s and a short transient at
// the head. Loop only the steady idle section so the buffer doesn't tick
// silent gaps between iterations.
const ENGINE_LOOP_START = 6.0;
const ENGINE_LOOP_END = 14.4;

// "booting"  → BootScreen at full opacity, GarageScene unmounted
// "fading"   → BootScreen fading to opacity 0, GarageScene still unmounted
// "ready"    → BootScreen unmounted, GarageScene mounted
type BootPhase = "booting" | "fading" | "ready";

const MIN_BOOT_MS = 3000;
const MAX_BOOT_MS = 7000;
const BOOT_FADE_MS = 600;

export default function App() {
  const reduced = useReducedMotion();
  const rotationSpeed = reduced ? 0.015 : 0.035; // rad/s, very slow
  const debugLights = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("debugLights") === "1";
  }, []);
  const [lighting, setLighting] = useState<LightingSettings>(DEFAULT_LIGHTING);

  const engine = useAudioLoop({
    src: ENGINE_AUDIO,
    volume: 0.5,
    fadeMs: 800,
    loopStartSec: ENGINE_LOOP_START,
    loopEndSec: ENGINE_LOOP_END,
  });
  const indicator = useAudioLoop({
    src: INDICATOR_AUDIO_MP3,
    fallbackSrc: INDICATOR_AUDIO_OGG,
    volume: 0.45,
    fadeMs: 250,
  });

  // Run the WebGL probe once, synchronously, before we ever ask React to
  // mount the 3D <Canvas>. On mobile Safari / low-end devices where the
  // context is handed back but calls like getShaderPrecisionFormat return
  // null (Three.js then crashes reading `.precision`), we skip the scene
  // entirely instead of letting the boundary eat a dead render loop.
  const webglStatus = useMemo(() => detectWebGL(), []);
  const webglOk = webglStatus.ok;

  const [creditsOpen, setCreditsOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<
    "loading" | "ready" | "error"
  >(webglOk ? "loading" : "error");
  const [modelErrorDetail, setModelErrorDetail] = useState<string | null>(
    webglOk ? null : `WebGL unavailable: ${webglStatus.reason}`
  );
  const [audioBanner, setAudioBanner] = useState<string | null>(null);
  const [indicatorStartedAt, setIndicatorStartedAt] = useState<number | null>(
    null
  );
  const [bootPhase, setBootPhase] = useState<BootPhase>("booting");
  const audioBannerTimerRef = useRef<number | null>(null);
  const creditsTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Drive the ignition sequence: keep the BootScreen up for at least
  // MIN_BOOT_MS, end it when preload completes (or MAX_BOOT_MS elapses, so a
  // slow CDN never traps the user on the splash). The fade-out is its own
  // micro-phase so GarageScene only mounts once the overlay is gone — that
  // keeps the GPU/audio idle through the splash, which matters on the laptop.
  useEffect(() => {
    let canceled = false;
    let preloadDone = false;
    let minElapsed = false;
    let resolved = false;
    let fadeTimer: number | null = null;

    const finish = () => {
      if (canceled || resolved) return;
      resolved = true;
      setBootPhase("fading");
      fadeTimer = window.setTimeout(() => {
        if (!canceled) setBootPhase("ready");
      }, BOOT_FADE_MS);
    };

    const tryFinish = () => {
      if (minElapsed && preloadDone) finish();
    };

    const minTimer = window.setTimeout(() => {
      minElapsed = true;
      tryFinish();
    }, MIN_BOOT_MS);

    const maxTimer = window.setTimeout(() => {
      // Hard cap: pretend everything's ready and let in-scene fallbacks
      // (FallbackCar, local-light fallback, audio error banner) handle the
      // pieces that never arrived.
      minElapsed = true;
      preloadDone = true;
      finish();
    }, MAX_BOOT_MS);

    preloadCriticalAssets({ includeScene: webglOk }).finally(() => {
      preloadDone = true;
      tryFinish();
    });

    return () => {
      canceled = true;
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    };
  }, [webglOk]);

  const showBoot = bootPhase !== "ready";
  const sceneMounted = bootPhase === "ready";

  const showAudioBanner = useCallback((msg: string) => {
    setAudioBanner(msg);
    if (audioBannerTimerRef.current !== null) {
      window.clearTimeout(audioBannerTimerRef.current);
    }
    audioBannerTimerRef.current = window.setTimeout(() => {
      setAudioBanner(null);
      audioBannerTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (audioBannerTimerRef.current !== null) {
        window.clearTimeout(audioBannerTimerRef.current);
      }
    };
  }, []);

  const handleEngineToggle = useCallback(async () => {
    if (engine.isPlaying) {
      engine.stop();
      // Stopping engine while indicator runs: keep indicator if user wants,
      // but the planning doc suggests stopping it together for coherence.
      if (indicator.isPlaying) {
        indicator.stop();
        setIndicatorStartedAt(null);
      }
      return;
    }
    const result = await engine.start();
    if (!result.ok) {
      showAudioBanner(result.error || "Engine sound failed to load.");
    }
  }, [engine, indicator, showAudioBanner]);

  const handleIndicatorToggle = useCallback(async () => {
    if (indicator.isPlaying) {
      indicator.stop();
      setIndicatorStartedAt(null);
      return;
    }
    if (!engine.isPlaying) {
      const engineResult = await engine.start();
      if (!engineResult.ok) {
        showAudioBanner(engineResult.error || "Engine sound failed to load.");
        return;
      }
    }
    const result = await indicator.start();
    if (!result.ok) {
      showAudioBanner(result.error || "Indicator sound failed to load.");
      return;
    }
    setIndicatorStartedAt(performance.now());
  }, [engine, indicator, showAudioBanner]);

  return (
    <div className="app-shell">
      <div className="canvas-host">
        {sceneMounted && webglOk && (
          <SceneErrorBoundary
            onError={(err) => {
              setModelStatus("error");
              setModelErrorDetail(`${err.name}: ${err.message}`);
            }}
          >
            <GarageScene
              modelUrl={MODEL_URL}
              engineOn={engine.isPlaying}
              indicatorOn={indicator.isPlaying}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
              lighting={lighting}
              onModelStatus={setModelStatus}
              onModelError={setModelErrorDetail}
            />
          </SceneErrorBoundary>
        )}
        {sceneMounted && !webglOk && (
          <div className="audio-only-backdrop" aria-hidden="true" />
        )}
      </div>

      {sceneMounted && (
        <>
          <div className="brand">
            aMBiW
            <span className="tag">Ambient · 차멍</span>
          </div>

          {audioBanner && <div className="notice">{audioBanner}</div>}
          {modelStatus === "error" && (
            <div className="notice" style={{ top: 60 }}>
              <div>
                {webglOk
                  ? "Car model unavailable — showing simplified preview."
                  : "3D scene disabled on this device — audio-only mode."}
              </div>
              {modelErrorDetail && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "10px",
                    opacity: 0.75,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    wordBreak: "break-word",
                  }}
                >
                  {modelErrorDetail}
                </div>
              )}
            </div>
          )}

          <ControlBar
            engineOn={engine.isPlaying}
            indicatorOn={indicator.isPlaying}
            onToggleEngine={handleEngineToggle}
            onToggleIndicator={handleIndicatorToggle}
          />

          <button
            type="button"
            className="credits-link"
            onClick={() => setCreditsOpen(true)}
            aria-label="Open credits and notice"
            ref={creditsTriggerRef}
          >
            Credits
          </button>

          <CreditsModal
            open={creditsOpen}
            onClose={() => setCreditsOpen(false)}
            returnFocusRef={creditsTriggerRef}
          />

          {debugLights && (
            <LightingDebugPanel
              lighting={lighting}
              onChange={setLighting}
              onReset={() => setLighting(DEFAULT_LIGHTING)}
            />
          )}
        </>
      )}

      {showBoot && <BootScreen visible={bootPhase === "booting"} />}
    </div>
  );
}
