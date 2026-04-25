import { memo } from "react";

export type BootScreenProps = {
  /** False once the boot sequence is finished — flips opacity for fade-out. */
  visible: boolean;
};

// Pre-canvas "ignition" overlay. Pure CSS so it never opens a WebGL context or
// drives a render loop, which keeps the laptop cool until GarageScene mounts.
export const BootScreen = memo(function BootScreen({ visible }: BootScreenProps) {
  return (
    <div
      className="boot-screen"
      data-visible={visible ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-label="Garage ignition sequence in progress"
    >
      <div className="boot-glow" aria-hidden="true" />
      <div className="boot-stack">
        <div className="boot-logo">aMBiW</div>
        <div className="boot-tag">Ambient · 차멍</div>
        <div className="boot-progress" aria-hidden="true">
          <span className="boot-progress-track" />
          <span className="boot-progress-pulse" />
        </div>
        <div className="boot-status">
          <span className="boot-dot" aria-hidden="true" />
          <span className="boot-status-text">IGNITION SEQUENCE</span>
        </div>
        <div className="boot-subtext">SYSTEM WARMING</div>
      </div>
    </div>
  );
});
