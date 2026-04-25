import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useEnvironment,
} from "@react-three/drei";
import * as THREE from "three";
import { CarModel } from "./CarModel";
import { FallbackCar } from "./FallbackCar";
import type { LightingSettings } from "../config/lighting";

type GarageSceneProps = {
  modelUrl: string;
  engineOn: boolean;
  indicatorOn: boolean;
  indicatorStartedAt: number | null;
  rotationSpeed: number;
  lighting: LightingSettings;
  onModelStatus: (status: "loading" | "ready" | "error") => void;
  onModelError?: (detail: string) => void;
};

class ModelErrorBoundary extends Component<
  {
    onError: (err: unknown) => void;
    children: ReactNode;
    fallback: ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.warn("CarModel failed to load, using fallback:", err);
    this.props.onError(err);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

class EnvironmentErrorBoundary extends Component<
  {
    onError: (err: unknown) => void;
    children: ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.warn("HDR environment failed to load, using local lights:", err);
    this.props.onError(err);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function formatLoadError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || err.name;
    return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err).slice(0, 220);
  } catch {
    return String(err);
  }
}

// Reframe the camera based on viewport aspect. Keep every breakpoint on the
// same centered, eye-level front axis; narrow screens use a wider FOV so the
// car remains a dramatic close-up instead of shrinking into the distance.
function ResponsiveCamera({
  controlsTargetY,
}: {
  controlsTargetY: number;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (aspect < 0.85) {
      // portrait / narrow: keep the desktop front-view mood, but compensate
      // for the narrow viewport with a wider lens instead of pulling away.
      camera.position.set(0, 0.32, 4.35);
      camera.fov = 54;
    } else if (aspect < 1.4) {
      // squareish / tablet
      camera.position.set(0, 0.34, 4.35);
      camera.fov = 32;
    } else {
      // desktop wide: horizontal front view, close enough to nearly fill frame.
      camera.position.set(0, 0.36, 4.35);
      camera.fov = 24;
    }
    camera.lookAt(0, controlsTargetY, 0);
    camera.updateProjectionMatrix();
  }, [camera, controlsTargetY, size.height, size.width]);
  return null;
}

function SceneRendererSettings({
  lighting,
}: {
  lighting: LightingSettings;
}) {
  const { gl, scene } = useThree();

  useEffect(() => {
    gl.toneMappingExposure = lighting.toneMappingExposure;
    gl.setClearColor(new THREE.Color(lighting.backgroundColor), 1);
    scene.fog = new THREE.Fog(
      new THREE.Color(lighting.fogColor),
      lighting.fogNear,
      lighting.fogFar
    );
  }, [
    gl,
    lighting.backgroundColor,
    lighting.fogColor,
    lighting.fogFar,
    lighting.fogNear,
    lighting.toneMappingExposure,
    scene,
  ]);

  return null;
}

const ORBIT_TARGET_Y = 0.18;
const ORBIT_POLAR_ANGLE = Math.PI * 0.49;
const HDR_ENVIRONMENT_PRESET = "warehouse";
const HDR_ENVIRONMENT_INTENSITY = 0.62;
const HDR_LOAD_TIMEOUT_MS = 7000;

function HdrEnvironment({ onReady }: { onReady: () => void }) {
  const map = useEnvironment({ preset: HDR_ENVIRONMENT_PRESET });

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <Environment
      map={map}
      background={false}
      environmentIntensity={HDR_ENVIRONMENT_INTENSITY}
    />
  );
}

export function GarageScene({
  modelUrl,
  engineOn,
  indicatorOn,
  indicatorStartedAt,
  rotationSpeed,
  lighting,
  onModelStatus,
  onModelError,
}: GarageSceneProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [environmentMode, setEnvironmentMode] = useState<
    "hdr-loading" | "hdr-ready" | "local"
  >("hdr-loading");

  useEffect(() => {
    if (useFallback) onModelStatus("error");
  }, [onModelStatus, useFallback]);

  useEffect(() => {
    if (environmentMode !== "hdr-loading") return;
    const timeout = window.setTimeout(() => {
      setEnvironmentMode((current) =>
        current === "hdr-loading" ? "local" : current
      );
    }, HDR_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [environmentMode]);

  // Used in two places: as the Suspense fallback while HDR is fetching (so
  // the car body is never an unlit silhouette during the load gap), and as
  // the permanent fallback when HDR fails or times out. Memoized so toggling
  // environmentMode doesn't churn the lights and re-allocate every frame.
  const localLights = useMemo(
    () => (
      <>
        <ambientLight
          intensity={lighting.ambient.intensity}
          color={lighting.ambient.color}
        />
        <hemisphereLight
          color={lighting.hemisphere.skyColor}
          groundColor={lighting.hemisphere.groundColor}
          intensity={lighting.hemisphere.intensity}
          position={lighting.hemisphere.position}
        />
        <directionalLight
          position={lighting.keyLight.position}
          intensity={lighting.keyLight.intensity}
          color={lighting.keyLight.color}
        />
        <directionalLight
          position={lighting.rimLight.position}
          intensity={lighting.rimLight.intensity}
          color={lighting.rimLight.color}
        />
        <directionalLight
          position={lighting.fillLight.position}
          intensity={lighting.fillLight.intensity}
          color={lighting.fillLight.color}
        />
      </>
    ),
    [lighting]
  );

  return (
    <Canvas
      shadows={false}
      dpr={[1, 1]}
      camera={{ position: [0, 0.36, 4.35], fov: 24 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = lighting.toneMappingExposure;
        gl.setClearColor(new THREE.Color(lighting.backgroundColor), 1);
        scene.fog = new THREE.Fog(
          new THREE.Color(lighting.fogColor),
          lighting.fogNear,
          lighting.fogFar
        );
      }}
    >
      <SceneRendererSettings lighting={lighting} />
      <ResponsiveCamera controlsTargetY={ORBIT_TARGET_Y} />

      <color attach="background" args={[lighting.backgroundColor]} />

      {environmentMode === "local" ? (
        localLights
      ) : (
        <Suspense fallback={localLights}>
          <EnvironmentErrorBoundary onError={() => setEnvironmentMode("local")}>
            <HdrEnvironment
              onReady={() => setEnvironmentMode("hdr-ready")}
            />
          </EnvironmentErrorBoundary>
        </Suspense>
      )}

      <Suspense
        fallback={
          <FallbackCar
            engineOn={engineOn}
            indicatorOn={indicatorOn}
            indicatorStartedAt={indicatorStartedAt}
            rotationSpeed={rotationSpeed}
            carLighting={lighting.car}
          />
        }
      >
        <ModelErrorBoundary
          onError={(err) => {
            setUseFallback(true);
            onModelError?.(formatLoadError(err));
          }}
          fallback={
            <FallbackCar
              engineOn={engineOn}
              indicatorOn={indicatorOn}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
              carLighting={lighting.car}
            />
          }
        >
          {useFallback ? (
            <FallbackCar
              engineOn={engineOn}
              indicatorOn={indicatorOn}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
              carLighting={lighting.car}
            />
          ) : (
            <CarModel
              url={modelUrl}
              engineOn={engineOn}
              indicatorOn={indicatorOn}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
              carLighting={lighting.car}
              onLoaded={() => onModelStatus("ready")}
            />
          )}
        </ModelErrorBoundary>
      </Suspense>

      <ContactShadows
        position={[0, -0.46, 0]}
        opacity={lighting.shadowOpacity}
        scale={14}
        blur={2.6}
        far={5}
        frames={1}
        color={0x000000}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.461, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshBasicMaterial color={lighting.floorColor} />
      </mesh>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minDistance={3.4}
        maxDistance={11}
        minPolarAngle={ORBIT_POLAR_ANGLE}
        maxPolarAngle={ORBIT_POLAR_ANGLE}
        target={[0, ORBIT_TARGET_Y, 0]}
        makeDefault
      />
    </Canvas>
  );
}
