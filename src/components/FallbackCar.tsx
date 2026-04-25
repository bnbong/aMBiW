import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DEFAULT_LIGHTING, type LightingSettings } from "../config/lighting";

type CarLightingSettings = LightingSettings["car"];

type FallbackCarProps = {
  engineOn: boolean;
  indicatorOn: boolean;
  indicatorStartedAt: number | null;
  rotationSpeed: number;
  carLighting: CarLightingSettings;
};

const DEFAULT_HEADLIGHT_EMISSIVE = new THREE.Color(
  DEFAULT_LIGHTING.car.runningColor
);
const INDICATOR_FIRST_CLICK_OFFSET = 0.307;
const INDICATOR_CLICK_PERIOD = 0.32;

// A blocky proxy coupe for when the GLB asset is missing or fails to load.
// Keeps the scene visibly populated so the page never appears "broken".
export function FallbackCar({
  engineOn,
  indicatorOn,
  indicatorStartedAt,
  rotationSpeed,
  carLighting,
}: FallbackCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headlightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const targetIntensityRef = useRef(0);
  const currentIntensityRef = useRef(0);

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x09090b),
        metalness: 0.85,
        roughness: 0.32,
        clearcoat: 1.0,
        clearcoatRoughness: 0.18,
      }),
    []
  );
  const headlightColor = useMemo(
    () => new THREE.Color(carLighting.runningColor),
    [carLighting.runningColor]
  );
  const indicatorColor = useMemo(
    () => new THREE.Color(carLighting.indicatorColor),
    [carLighting.indicatorColor]
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed * dt;
    }

    targetIntensityRef.current = engineOn
      ? carLighting.runningIntensityOn * 0.44
      : carLighting.runningIntensityOff * 0.15;
    const base = THREE.MathUtils.damp(
      currentIntensityRef.current,
      targetIntensityRef.current,
      4.0,
      dt
    );
    currentIntensityRef.current = base;

    let pulse = 0;
    if (indicatorOn && indicatorStartedAt !== null) {
      const elapsed = (performance.now() - indicatorStartedAt) / 1000;
      const phase =
        ((elapsed - INDICATOR_FIRST_CLICK_OFFSET) % INDICATOR_CLICK_PERIOD +
          INDICATOR_CLICK_PERIOD) %
        INDICATOR_CLICK_PERIOD;
      pulse = Math.pow(1 - phase / INDICATOR_CLICK_PERIOD, 4) * 1.8;
    }

    if (headlightMatRef.current) {
      headlightMatRef.current.color.copy(headlightColor).multiplyScalar(0.18);
      headlightMatRef.current.emissive.copy(
        pulse > 0.01 ? indicatorColor : headlightColor
      );
      headlightMatRef.current.emissiveIntensity = Math.max(
        base,
        pulse + base * 0.45
      );
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.4, 0]}>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} material={bodyMaterial}>
        <boxGeometry args={[4.2, 0.9, 1.7]} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0.1, 1.18, 0]} material={bodyMaterial}>
        <boxGeometry args={[2.4, 0.55, 1.55]} />
      </mesh>
      {/* Front fascia headlight strip */}
      <mesh position={[2.1, 0.65, 0]}>
        <boxGeometry args={[0.05, 0.18, 1.45]} />
        <meshStandardMaterial
          ref={headlightMatRef}
          color={new THREE.Color(0x140404)}
          emissive={DEFAULT_HEADLIGHT_EMISSIVE}
          emissiveIntensity={0}
          metalness={0.1}
          roughness={0.35}
        />
      </mesh>
      {/* Wheels */}
      {[
        [-1.4, 0.1, 0.85],
        [-1.4, 0.1, -0.85],
        [1.4, 0.1, 0.85],
        [1.4, 0.1, -0.85],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.32, 24]} />
          <meshStandardMaterial color={0x101013} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}
