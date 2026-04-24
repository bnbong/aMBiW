import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  OrbitControls,
  AdaptiveDpr,
  PerformanceMonitor,
} from "@react-three/drei";
import * as THREE from "three";
import { CarModel } from "./CarModel";
import { FallbackCar } from "./FallbackCar";

type GarageSceneProps = {
  modelUrl: string;
  engineOn: boolean;
  indicatorOn: boolean;
  indicatorStartedAt: number | null;
  rotationSpeed: number;
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

// Reframe the camera based on viewport aspect. Wide viewports get a centered,
// eye-level front view; portrait/narrow viewports pull back and use a slightly
// wider FOV so the whole car silhouette stays inside the frame.
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
      // portrait / narrow
      camera.position.set(3.4, 1.05, 7.6);
      camera.fov = 44;
    } else if (aspect < 1.4) {
      // squareish / tablet
      camera.position.set(4.4, 1.0, 6.2);
      camera.fov = 40;
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

const ORBIT_TARGET_Y = 0.18;

export function GarageScene({
  modelUrl,
  engineOn,
  indicatorOn,
  indicatorStartedAt,
  rotationSpeed,
  onModelStatus,
  onModelError,
}: GarageSceneProps) {
  const [dpr, setDpr] = useState<[number, number]>([1, 1.5]);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (useFallback) onModelStatus("error");
  }, [onModelStatus, useFallback]);

  return (
    <Canvas
      shadows={false}
      dpr={dpr}
      camera={{ position: [0, 0.36, 4.35], fov: 24 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.7;
        gl.setClearColor(new THREE.Color(0x040406), 1);
        scene.fog = new THREE.Fog(0x040406, 8, 20);
      }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr([1, 1])}
        onIncline={() => setDpr([1, 1.5])}
      />
      <AdaptiveDpr pixelated={false} />
      <ResponsiveCamera controlsTargetY={ORBIT_TARGET_Y} />

      <color attach="background" args={[0x040406]} />

      <ambientLight intensity={0.08} color={0x445566} />
      <directionalLight position={[0, 6, 1]} intensity={0.35} color={0xffffff} />
      <directionalLight
        position={[-6, 3, -4]}
        intensity={0.55}
        color={0x6c84c0}
      />
      <directionalLight
        position={[6, 1.6, -1]}
        intensity={0.28}
        color={0xffb088}
      />

      <Suspense fallback={null}>
        <Environment preset="warehouse" environmentIntensity={0.18} />
      </Suspense>

      <Suspense
        fallback={
          <FallbackCar
            engineOn={engineOn}
            indicatorOn={indicatorOn}
            indicatorStartedAt={indicatorStartedAt}
            rotationSpeed={rotationSpeed}
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
            />
          }
        >
          {useFallback ? (
            <FallbackCar
              engineOn={engineOn}
              indicatorOn={indicatorOn}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
            />
          ) : (
            <CarModel
              url={modelUrl}
              engineOn={engineOn}
              indicatorOn={indicatorOn}
              indicatorStartedAt={indicatorStartedAt}
              rotationSpeed={rotationSpeed}
              onLoaded={() => onModelStatus("ready")}
            />
          )}
        </ModelErrorBoundary>
      </Suspense>

      <ContactShadows
        position={[0, -0.46, 0]}
        opacity={0.7}
        scale={14}
        blur={2.6}
        far={5}
        color={0x000000}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.461, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color={0x070708} metalness={0.55} roughness={0.55} />
      </mesh>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        zoomSpeed={0.5}
        minDistance={3.4}
        maxDistance={11}
        minPolarAngle={Math.PI * 0.34}
        maxPolarAngle={Math.PI * 0.5}
        target={[0, ORBIT_TARGET_Y, 0]}
        makeDefault
      />
    </Canvas>
  );
}
