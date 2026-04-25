export type Vec3 = [number, number, number];

export type DirectionalLightSettings = {
  color: string;
  intensity: number;
  position: Vec3;
};

export type LightingSettings = {
  toneMappingExposure: number;
  backgroundColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  floorColor: string;
  shadowOpacity: number;
  ambient: {
    color: string;
    intensity: number;
  };
  hemisphere: {
    skyColor: string;
    groundColor: string;
    intensity: number;
    position: Vec3;
  };
  keyLight: DirectionalLightSettings;
  rimLight: DirectionalLightSettings;
  fillLight: DirectionalLightSettings;
  car: {
    runningColor: string;
    indicatorColor: string;
    runningIntensityOff: number;
    runningIntensityOn: number;
  };
};

export const DEFAULT_LIGHTING: LightingSettings = {
  toneMappingExposure: 1.08,
  backgroundColor: "#040406",
  fogColor: "#040406",
  fogNear: 8,
  fogFar: 20,
  floorColor: "#050506",
  shadowOpacity: 0.76,
  ambient: {
    color: "#070405",
    intensity: 0.045,
  },
  hemisphere: {
    skyColor: "#242326",
    groundColor: "#020204",
    intensity: 0.16,
    position: [0, 2.6, 0],
  },
  keyLight: {
    color: "#6d6b70",
    intensity: 0.34,
    position: [0, 5.4, 2.2],
  },
  rimLight: {
    color: "#4c4b52",
    intensity: 0.58,
    position: [-6.2, 2.8, 1.4],
  },
  fillLight: {
    color: "#263044",
    intensity: 0.14,
    position: [6.2, 2.1, 1.0],
  },
  car: {
    runningColor: "#ff1608",
    indicatorColor: "#ff7a18",
    runningIntensityOff: 0.1,
    runningIntensityOn: 3.0,
  },
};
