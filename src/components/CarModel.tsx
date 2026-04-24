import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

type CarModelProps = {
  url: string;
  engineOn: boolean;
  indicatorOn: boolean;
  indicatorStartedAt: number | null;
  rotationSpeed: number;
  onLoaded?: () => void;
};

// Deep automotive lamp red. Keep it close to the stock rear lamps rather than
// a neon UI red so it sits naturally on the black body.
const RUNNING_LIGHT_COLOR = new THREE.Color(0xa40012);
const INDICATOR_LIGHT_COLOR = new THREE.Color(0xff7a18);

// Engine-state intensities for the running lights (front + rear). Never goes
// fully to 0 when the engine is "off" so the parked car still reads as a
// dark-but-alive shape, the way a real garaged car shows its standlight.
const RUNNING_INTENSITY_OFF = 0.32;
const RUNNING_INTENSITY_ON = 3.2;
const RUNNING_DAMP_RATE = 3.5;
const INDICATOR_FLASH_PERIOD = 0.84;
const INDICATOR_DUTY = 0.55;
const INDICATOR_DAMP_RATE = 18;
const FRONT_INDICATOR_WORLD_X_MIN = 0.95;

// Path is a const so we can swap to a self-hosted decoder later without
// hunting through component code.
export const DRACO_DECODER_PATH = "/draco/";

// The Sketchfab "BMW M4 Competition" model groups meshes under predictable
// node prefixes ("Body", "headlight", "glsslight", "tail", "tailpiece",
// "Frontlogo"). Each mesh name also embeds the source material id (e.g.
// `glsslight_Material #161_0`), which lets us pick exactly the light-emitting
// sub-meshes instead of repainting the housing/lens. If the GLB is replaced,
// rewrite the mapping below to match the new asset.
type MeshClass =
  | "body"
  | "head_lens"        // headlight projector lens — keep stock (don't paint red)
  | "head_glass"       // clear cover over the headlight cluster
  | "front_emissive"   // DRL strip LED — brightest core
  | "front_indicator"  // visible front lamp section used for amber pulse
  | "front_diffuser"   // strip cover/glass — keep neutral
  | "front_housing"    // back of the strip — faintest spill, running-only
  | "rear_main"        // bright rear lamp — running red
  | "rear_aux"         // dim rear sub-lamp — running red only
  | "rear_indicator"   // actual rear indicator bar, amber only while blinking
  | "logo"
  | "wheel"
  | "trim";

function extractMaterialNum(meshName: string): number | null {
  const m = meshName.match(/material[\s_]*#?[\s_]*(\d+)/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

function classifyMesh(name: string): MeshClass {
  const lower = name.toLowerCase();
  const matNum = extractMaterialNum(lower);

  if (lower.startsWith("body_")) return "body";
  if (lower.startsWith("headglass")) return "head_glass";
  if (lower.startsWith("headlight_")) {
    // #701/#707/#708 are the red running-light emitters. #706 and headglass
    // are the lens/cover surfaces and must stay neutral.
    if (matNum === 701 || matNum === 707 || matNum === 708)
      return "front_emissive";
    return "head_lens";
  }

  if (lower.startsWith("glsslight")) {
    // Material #161 is the LED itself (brightest). #718 is the
    // semi-transparent diffuser cover. #716/#717 are housing back/sides — we
    // give them a faint spill so the entire strip reads as one glowing piece
    // instead of a hot pinpoint floating in the dark headlight bowl.
    if (matNum === 161) return "front_emissive";
    if (matNum === 718) return "front_diffuser";
    if (matNum === 716 || matNum === 717) return "front_housing";
    return "trim";
  }

  if (lower.startsWith("tailpiece")) {
    if (matNum === 701) return "rear_indicator";
    if (matNum === 739) return "rear_main";
    if (matNum === 740) return "rear_aux";
    return "trim";
  }
  if (lower.startsWith("tailglass")) return "trim";
  if (lower.startsWith("tail")) return "trim";

  if (lower.startsWith("frontlogo") || lower.includes("logo")) return "logo";
  if (
    lower.startsWith("tire") ||
    lower.startsWith("rim_") ||
    lower.startsWith("brake disc") ||
    lower.startsWith("brake_") ||
    lower === "brake"
  )
    return "wheel";

  return "trim";
}

function isHeadlightEmitter(name: string): boolean {
  const lower = name.toLowerCase();
  const matNum = extractMaterialNum(lower);
  return lower.startsWith("glsslight") && matNum === 161;
}

function copyMeshTransform(source: THREE.Mesh, target: THREE.Mesh): void {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.matrix.copy(source.matrix);
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;
  target.frustumCulled = source.frustumCulled;
  target.renderOrder = source.renderOrder;
}

function splitGeometryByWorldX(
  mesh: THREE.Mesh,
  minAbsWorldX: number
): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  if (!position) return null;

  const index = geometry.index;
  const attributes = Object.entries(geometry.attributes);
  const outerValues = new Map<string, number[]>();
  const innerValues = new Map<string, number[]>();
  for (const [name] of attributes) {
    outerValues.set(name, []);
    innerValues.set(name, []);
  }

  const triangle = index
    ? (face: number, vertex: number) => index.getX(face + vertex)
    : (face: number, vertex: number) => face + vertex;
  const triangleCount = index ? index.count : position.count;
  const worldVertex = new THREE.Vector3();
  const worldCenter = new THREE.Vector3();

  for (let face = 0; face < triangleCount; face += 3) {
    worldCenter.set(0, 0, 0);
    for (let vertex = 0; vertex < 3; vertex++) {
      const sourceIndex = triangle(face, vertex);
      worldVertex.fromBufferAttribute(position, sourceIndex);
      worldVertex.applyMatrix4(mesh.matrixWorld);
      worldCenter.add(worldVertex);
    }
    worldCenter.multiplyScalar(1 / 3);

    const targetValues =
      Math.abs(worldCenter.x) >= minAbsWorldX ? outerValues : innerValues;
    for (let vertex = 0; vertex < 3; vertex++) {
      const sourceIndex = triangle(face, vertex);
      for (const [name, attribute] of attributes) {
        const values = targetValues.get(name);
        if (!values) continue;
        for (let item = 0; item < attribute.itemSize; item++) {
          values.push(attribute.getComponent(sourceIndex, item));
        }
      }
    }
  }

  const outerPosition = outerValues.get("position");
  const innerPosition = innerValues.get("position");
  if (!outerPosition?.length || !innerPosition?.length) return null;

  const createGeometry = (valuesByName: Map<string, number[]>) => {
    const next = new THREE.BufferGeometry();
    for (const [name, attribute] of attributes) {
      const values = valuesByName.get(name);
      if (!values?.length) continue;
      next.setAttribute(
        name,
        new THREE.BufferAttribute(
          new Float32Array(values),
          attribute.itemSize,
          attribute.normalized
        )
      );
    }
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return next;
  };

  return {
    outer: createGeometry(outerValues),
    inner: createGeometry(innerValues),
  };
}

interface LightTarget {
  mat: THREE.MeshStandardMaterial;
  intensityScale: number;
}

interface IndicatorTarget {
  mat: THREE.MeshStandardMaterial;
  intensityScale: number;
  alsoRunning: boolean;
  offColor: THREE.Color;
}

interface MaterialSetup {
  lights: LightTarget[];
  indicators: IndicatorTarget[];
}

function setupGltfMaterials(root: THREE.Object3D): MaterialSetup {
  const lights: LightTarget[] = [];
  const indicators: IndicatorTarget[] = [];
  const pendingIndicatorMeshes: Array<{
    parent: THREE.Object3D;
    mesh: THREE.Mesh;
  }> = [];

  root.updateMatrixWorld(true);

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const cls = classifyMesh(mesh.name || "");
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((mat, idx) => {
      if (!mat) return;
      if (
        !(mat instanceof THREE.MeshStandardMaterial) &&
        !(mat instanceof THREE.MeshPhysicalMaterial)
      ) {
        return;
      }
      // Per-mesh material clone so two meshes that share a material in the
      // GLB don't end up cross-pollinating colors when we re-paint one.
      const cloned = mat.clone();
      if (Array.isArray(mesh.material)) mesh.material[idx] = cloned;
      else mesh.material = cloned;
      const m = cloned as THREE.MeshStandardMaterial;

      switch (cls) {
        case "body": {
          m.color = new THREE.Color(0x05050a);
          m.metalness = 0.92;
          m.roughness = 0.34;
          if (m instanceof THREE.MeshPhysicalMaterial) {
            m.clearcoat = 1.0;
            m.clearcoatRoughness = 0.16;
          }
          m.envMapIntensity = 0.45;
          m.emissive = new THREE.Color(0x000000);
          m.emissiveIntensity = 0;
          break;
        }
        case "head_lens": {
          // Preserve the stock lens/reflector. The red color belongs only to
          // the actual light strip, not to the glass or projector bowl.
          m.envMapIntensity = Math.max(m.envMapIntensity ?? 0, 0.55);
          break;
        }
        case "head_glass": {
          m.envMapIntensity = Math.max(m.envMapIntensity ?? 0, 0.55);
          break;
        }
        case "front_emissive": {
          // Repaint only the visible light emitters from white/blue stock to
          // deep automotive red. Lens/cover meshes are classified separately.
          const split = isHeadlightEmitter(mesh.name || "")
            ? splitGeometryByWorldX(mesh, FRONT_INDICATOR_WORLD_X_MIN)
            : null;
          m.map = null;
          m.emissiveMap = null;
          m.color = RUNNING_LIGHT_COLOR.clone().multiplyScalar(0.8);
          m.emissive = RUNNING_LIGHT_COLOR.clone();
          m.emissiveIntensity = RUNNING_INTENSITY_OFF;
          m.metalness = 0.02;
          m.roughness = 0.2;
          m.envMapIntensity = 0.08;
          m.toneMapped = false;
          if (split) {
            const originalGeometry = mesh.geometry;
            mesh.geometry = split.inner;
            originalGeometry.dispose();

            const indicatorMaterial = m.clone();
            indicatorMaterial.color = RUNNING_LIGHT_COLOR.clone().multiplyScalar(0.8);
            indicatorMaterial.emissive = RUNNING_LIGHT_COLOR.clone();
            indicatorMaterial.emissiveIntensity = RUNNING_INTENSITY_OFF;
            indicatorMaterial.toneMapped = false;

            const indicatorMesh = new THREE.Mesh(split.outer, indicatorMaterial);
            indicatorMesh.name = `${mesh.name}_outer_indicator`;
            copyMeshTransform(mesh, indicatorMesh);
            if (mesh.parent) {
              pendingIndicatorMeshes.push({
                parent: mesh.parent,
                mesh: indicatorMesh,
              });
            }

            lights.push({
              mat: indicatorMaterial,
              intensityScale: 2.4,
            });
            indicators.push({
              mat: indicatorMaterial,
              intensityScale: 4.8,
              alsoRunning: true,
              offColor: RUNNING_LIGHT_COLOR.clone().multiplyScalar(0.8),
            });
          }
          lights.push({
            mat: m,
            intensityScale: 2.4,
          });
          break;
        }
        case "front_indicator": {
          // Use the real lamp mesh for both the red running-light state and
          // the amber indicator pulse. This avoids any floating overlay.
          m.map = null;
          m.emissiveMap = null;
          m.color = RUNNING_LIGHT_COLOR.clone().multiplyScalar(0.8);
          m.emissive = RUNNING_LIGHT_COLOR.clone();
          m.emissiveIntensity = RUNNING_INTENSITY_OFF;
          m.metalness = 0.02;
          m.roughness = 0.2;
          m.envMapIntensity = 0.08;
          m.toneMapped = false;
          lights.push({
            mat: m,
            intensityScale: 2.2,
          });
          indicators.push({
            mat: m,
            intensityScale: 4.8,
            alsoRunning: true,
            offColor: RUNNING_LIGHT_COLOR.clone().multiplyScalar(0.8),
          });
          break;
        }
        case "front_diffuser": {
          // This is cover/glass around the strip. Keep it neutral so the
          // headlight doesn't look like it has red-tinted glass.
          m.envMapIntensity = Math.max(m.envMapIntensity ?? 0, 0.45);
          break;
        }
        case "front_housing": {
          if (m.color) m.color = m.color.clone().multiplyScalar(0.28);
          m.envMapIntensity = 0.16;
          break;
        }
        case "rear_main": {
          // Stock material is already red emissive — preserve color and drive
          // intensity from the engine state.
          m.color = m.color
            ? m.color.clone().multiplyScalar(0.7)
            : new THREE.Color(0x300004);
          m.emissive = RUNNING_LIGHT_COLOR.clone();
          m.emissiveIntensity = RUNNING_INTENSITY_OFF;
          m.metalness = 0.05;
          m.roughness = 0.32;
          m.envMapIntensity = 0.4;
          lights.push({
            mat: m,
            intensityScale: 1.0,
          });
          break;
        }
        case "rear_aux": {
          m.color = m.color
            ? m.color.clone().multiplyScalar(0.65)
            : new THREE.Color(0x1a0002);
          m.emissive = RUNNING_LIGHT_COLOR.clone();
          m.emissiveIntensity = RUNNING_INTENSITY_OFF * 0.6;
          m.metalness = 0.06;
          m.roughness = 0.4;
          m.envMapIntensity = 0.4;
          lights.push({
            mat: m,
            intensityScale: 0.6,
          });
          break;
        }
        case "rear_indicator": {
          m.map = null;
          m.emissiveMap = null;
          m.color = new THREE.Color(0x120600);
          m.emissive = new THREE.Color(0x000000);
          m.emissiveIntensity = 0;
          m.metalness = 0.04;
          m.roughness = 0.28;
          m.envMapIntensity = 0.18;
          m.toneMapped = false;
          indicators.push({
            mat: m,
            intensityScale: 4.2,
            alsoRunning: false,
            offColor: new THREE.Color(0x120600),
          });
          break;
        }
        case "logo": {
          m.color = new THREE.Color(0x040404);
          m.emissive = new THREE.Color(0x000000);
          m.emissiveIntensity = 0;
          m.metalness = 0.3;
          m.roughness = 0.85;
          m.envMapIntensity = 0.15;
          break;
        }
        case "wheel": {
          m.color = m.color
            ? m.color.clone().multiplyScalar(0.55)
            : new THREE.Color(0x0a0a0c);
          m.envMapIntensity = 0.4;
          break;
        }
        case "trim":
        default: {
          if (m.color) m.color = m.color.clone().multiplyScalar(0.5);
          // Suppress any pre-existing colored emissives (the GLB has white,
          // blue, and red emissive trims that fight our night-garage tone).
          if (m.emissive && m.emissiveIntensity > 0) {
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
          }
          m.envMapIntensity = 0.4;
          break;
        }
      }
      m.needsUpdate = true;
    });
  });

  for (const { parent, mesh } of pendingIndicatorMeshes) {
    parent.add(mesh);
  }
  root.updateMatrixWorld(true);

  return { lights, indicators };
}

function fitToFrame(
  object: THREE.Object3D,
  targetSize = 4.4
): { center: THREE.Vector3; scale: number; minY: number } {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  return { center, scale, minY: box.min.y };
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

export function CarModel({
  url,
  engineOn,
  indicatorOn,
  indicatorStartedAt,
  rotationSpeed,
  onLoaded,
}: CarModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const runningIntensityRef = useRef(RUNNING_INTENSITY_OFF);
  const indicatorVisibleRef = useRef(0);
  const loadedNotifiedRef = useRef(false);

  const gltf = useLoader(GLTFLoader, url, (loader) => {
    (loader as GLTFLoader).setDRACOLoader(dracoLoader);
  }) as GLTF;

  const { sceneToRender, lights, indicators, fit, baseY } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const setup = setupGltfMaterials(cloned);
    const fitInfo = fitToFrame(cloned, 4.4);
    return {
      sceneToRender: cloned,
      lights: setup.lights,
      indicators: setup.indicators,
      fit: fitInfo,
      baseY: fitInfo.minY * fitInfo.scale,
    };
  }, [gltf]);

  useEffect(() => {
    if (!loadedNotifiedRef.current) {
      loadedNotifiedRef.current = true;
      onLoaded?.();
    }
  }, [onLoaded]);

  useEffect(() => {
    const scene = sceneToRender;
    return () => {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose?.();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        mats.forEach((m) => {
          if (!m) return;
          (m as THREE.Material).dispose?.();
        });
      });
    };
  }, [sceneToRender]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed * dt;
    }

    const runningTarget = engineOn
      ? RUNNING_INTENSITY_ON
      : RUNNING_INTENSITY_OFF;
    runningIntensityRef.current = THREE.MathUtils.damp(
      runningIntensityRef.current,
      runningTarget,
      RUNNING_DAMP_RATE,
      dt
    );
    const runningIntensity = runningIntensityRef.current;

    let indicatorTarget = 0;
    if (indicatorOn) {
      const elapsed =
        indicatorStartedAt === null
          ? 0
          : (performance.now() - indicatorStartedAt) / 1000;
      const phase = (elapsed % INDICATOR_FLASH_PERIOD) / INDICATOR_FLASH_PERIOD;
      indicatorTarget = phase < INDICATOR_DUTY ? 1 : 0;
    }
    indicatorVisibleRef.current = THREE.MathUtils.damp(
      indicatorVisibleRef.current,
      indicatorTarget,
      INDICATOR_DAMP_RATE,
      dt
    );
    const indicatorVisible = indicatorVisibleRef.current;

    for (let i = 0; i < lights.length; i++) {
      const target = lights[i];
      target.mat.emissive.copy(RUNNING_LIGHT_COLOR);
      target.mat.emissiveIntensity = runningIntensity * target.intensityScale;
    }

    for (let i = 0; i < indicators.length; i++) {
      const target = indicators[i];
      if (indicatorVisible > 0.01) {
        target.mat.color.copy(INDICATOR_LIGHT_COLOR).multiplyScalar(0.85);
        target.mat.emissive.copy(INDICATOR_LIGHT_COLOR);
        target.mat.emissiveIntensity =
          indicatorVisible * target.intensityScale;
      } else if (!target.alsoRunning) {
        target.mat.color.copy(target.offColor);
        target.mat.emissive.set(0x000000);
        target.mat.emissiveIntensity = 0;
      }
    }

    if (innerRef.current) {
      innerRef.current.position.set(
        -fit.center.x * fit.scale,
        -baseY - 0.46,
        -fit.center.z * fit.scale
      );
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={innerRef} scale={fit.scale}>
        <primitive object={sceneToRender} />
      </group>
    </group>
  );
}
