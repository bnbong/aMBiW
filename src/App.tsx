import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GarageScene } from "./components/GarageScene";
import { ControlBar } from "./components/ControlBar";
import { CreditsModal } from "./components/CreditsModal";
import { SceneErrorBoundary } from "./components/SceneErrorBoundary";
import { useAudioLoop } from "./hooks/useAudioLoop";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { detectWebGL } from "./utils/detectWebGL";

const MODEL_URL = "/assets/models/m4-competition.glb";
const ENGINE_AUDIO = "/assets/audio/engine_idle.mp3";
const INDICATOR_AUDIO_MP3 = "/assets/audio/indicator_loop.mp3";
const INDICATOR_AUDIO_OGG = "/assets/audio/indicator_loop.ogg";

// engine_idle.mp3 has trailing silence after ~14.52s and a short transient at
// the head. Loop only the steady idle section so the buffer doesn't tick
// silent gaps between iterations.
const ENGINE_LOOP_START = 6.0;
const ENGINE_LOOP_END = 14.4;

export default function App() {
  const reduced = useReducedMotion();
  const rotationSpeed = reduced ? 0.015 : 0.035; // rad/s, very slow

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
  const audioBannerTimerRef = useRef<number | null>(null);
  const creditsTriggerRef = useRef<HTMLButtonElement | null>(null);

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
        {webglOk ? (
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
              onModelStatus={setModelStatus}
              onModelError={setModelErrorDetail}
            />
          </SceneErrorBoundary>
        ) : (
          <div className="audio-only-backdrop" aria-hidden="true" />
        )}
      </div>

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
    </div>
  );
}
