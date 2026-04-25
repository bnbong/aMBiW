import type { Dispatch, SetStateAction } from "react";
import type {
  DirectionalLightSettings,
  LightingSettings,
  Vec3,
} from "../config/lighting";

type LightingDebugPanelProps = {
  lighting: LightingSettings;
  onChange: Dispatch<SetStateAction<LightingSettings>>;
  onReset: () => void;
};

type NumberControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: NumberControlProps) {
  return (
    <label className="debug-control">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="debug-control debug-control-color">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <code>{value}</code>
    </label>
  );
}

function VectorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
}) {
  const update = (index: number, nextValue: number) => {
    const next: Vec3 = [...value] as Vec3;
    next[index] = nextValue;
    onChange(next);
  };

  return (
    <div className="debug-vector">
      <span>{label}</span>
      {(["x", "y", "z"] as const).map((axis, index) => (
        <label key={axis}>
          {axis}
          <input
            type="number"
            min={-10}
            max={10}
            step={0.1}
            value={value[index]}
            onChange={(event) => update(index, Number(event.target.value))}
          />
        </label>
      ))}
    </div>
  );
}

function DirectionalLightBlock({
  title,
  value,
  onChange,
}: {
  title: string;
  value: DirectionalLightSettings;
  onChange: (value: DirectionalLightSettings) => void;
}) {
  return (
    <fieldset className="debug-fieldset">
      <legend>{title}</legend>
      <ColorControl
        label="Color"
        value={value.color}
        onChange={(color) => onChange({ ...value, color })}
      />
      <NumberControl
        label="Intensity"
        value={value.intensity}
        min={0}
        max={3}
        step={0.01}
        onChange={(intensity) => onChange({ ...value, intensity })}
      />
      <VectorControl
        label="Position"
        value={value.position}
        onChange={(position) => onChange({ ...value, position })}
      />
    </fieldset>
  );
}

export function LightingDebugPanel({
  lighting,
  onChange,
  onReset,
}: LightingDebugPanelProps) {
  return (
    <aside className="lighting-debug" aria-label="Lighting debug controls">
      <div className="debug-header">
        <div>
          <strong>Lighting Debug</strong>
          <span>?debugLights=1</span>
        </div>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <details open>
        <summary>Scene</summary>
        <NumberControl
          label="Exposure"
          value={lighting.toneMappingExposure}
          min={0.1}
          max={12}
          step={0.1}
          onChange={(toneMappingExposure) =>
            onChange((current) => ({ ...current, toneMappingExposure }))
          }
        />
        <ColorControl
          label="Background"
          value={lighting.backgroundColor}
          onChange={(backgroundColor) =>
            onChange((current) => ({ ...current, backgroundColor }))
          }
        />
        <ColorControl
          label="Fog"
          value={lighting.fogColor}
          onChange={(fogColor) =>
            onChange((current) => ({ ...current, fogColor }))
          }
        />
        <NumberControl
          label="Fog near"
          value={lighting.fogNear}
          min={0}
          max={40}
          step={0.5}
          onChange={(fogNear) =>
            onChange((current) => ({ ...current, fogNear }))
          }
        />
        <NumberControl
          label="Fog far"
          value={lighting.fogFar}
          min={1}
          max={80}
          step={0.5}
          onChange={(fogFar) =>
            onChange((current) => ({ ...current, fogFar }))
          }
        />
        <ColorControl
          label="Floor"
          value={lighting.floorColor}
          onChange={(floorColor) =>
            onChange((current) => ({ ...current, floorColor }))
          }
        />
        <NumberControl
          label="Shadow"
          value={lighting.shadowOpacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(shadowOpacity) =>
            onChange((current) => ({ ...current, shadowOpacity }))
          }
        />
      </details>

      <details open>
        <summary>Ambient</summary>
        <ColorControl
          label="Ambient"
          value={lighting.ambient.color}
          onChange={(color) =>
            onChange((current) => ({
              ...current,
              ambient: { ...current.ambient, color },
            }))
          }
        />
        <NumberControl
          label="Intensity"
          value={lighting.ambient.intensity}
          min={0}
          max={2}
          step={0.01}
          onChange={(intensity) =>
            onChange((current) => ({
              ...current,
              ambient: { ...current.ambient, intensity },
            }))
          }
        />
        <ColorControl
          label="Hemi sky"
          value={lighting.hemisphere.skyColor}
          onChange={(skyColor) =>
            onChange((current) => ({
              ...current,
              hemisphere: { ...current.hemisphere, skyColor },
            }))
          }
        />
        <ColorControl
          label="Hemi ground"
          value={lighting.hemisphere.groundColor}
          onChange={(groundColor) =>
            onChange((current) => ({
              ...current,
              hemisphere: { ...current.hemisphere, groundColor },
            }))
          }
        />
        <NumberControl
          label="Hemi intensity"
          value={lighting.hemisphere.intensity}
          min={0}
          max={2}
          step={0.01}
          onChange={(intensity) =>
            onChange((current) => ({
              ...current,
              hemisphere: { ...current.hemisphere, intensity },
            }))
          }
        />
        <VectorControl
          label="Hemi position"
          value={lighting.hemisphere.position}
          onChange={(position) =>
            onChange((current) => ({
              ...current,
              hemisphere: { ...current.hemisphere, position },
            }))
          }
        />
      </details>

      <details open>
        <summary>External lights</summary>
        <DirectionalLightBlock
          title="Key"
          value={lighting.keyLight}
          onChange={(keyLight) =>
            onChange((current) => ({ ...current, keyLight }))
          }
        />
        <DirectionalLightBlock
          title="Red rim"
          value={lighting.rimLight}
          onChange={(rimLight) =>
            onChange((current) => ({ ...current, rimLight }))
          }
        />
        <DirectionalLightBlock
          title="Cool fill"
          value={lighting.fillLight}
          onChange={(fillLight) =>
            onChange((current) => ({ ...current, fillLight }))
          }
        />
      </details>

      <details open>
        <summary>Car LEDs</summary>
        <ColorControl
          label="Running"
          value={lighting.car.runningColor}
          onChange={(runningColor) =>
            onChange((current) => ({
              ...current,
              car: { ...current.car, runningColor },
            }))
          }
        />
        <ColorControl
          label="Indicator"
          value={lighting.car.indicatorColor}
          onChange={(indicatorColor) =>
            onChange((current) => ({
              ...current,
              car: { ...current.car, indicatorColor },
            }))
          }
        />
        <NumberControl
          label="Off intensity"
          value={lighting.car.runningIntensityOff}
          min={0}
          max={3}
          step={0.01}
          onChange={(runningIntensityOff) =>
            onChange((current) => ({
              ...current,
              car: { ...current.car, runningIntensityOff },
            }))
          }
        />
        <NumberControl
          label="On intensity"
          value={lighting.car.runningIntensityOn}
          min={0}
          max={8}
          step={0.05}
          onChange={(runningIntensityOn) =>
            onChange((current) => ({
              ...current,
              car: { ...current.car, runningIntensityOn },
            }))
          }
        />
      </details>
    </aside>
  );
}
