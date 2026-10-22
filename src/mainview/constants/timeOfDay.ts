export type TimeOfDayMode = "sunrise" | "day" | "evening" | "night"

export const TIME_OF_DAY_MODES: readonly TimeOfDayMode[] = [
  "sunrise",
  "day",
  "evening",
  "night",
] as const

export const TIME_OF_DAY_LABELS: Record<TimeOfDayMode, string> = {
  sunrise: "Sunrise",
  day: "Day",
  evening: "Evening",
  night: "Night",
}

export interface TimeOfDayPreset {
  id: TimeOfDayMode
  name: string
  /** Sky background color */
  skyColor: number
  /** Horizon / distant blend color */
  horizonColor: number
  /** Fog tint */
  fogColor: number
  /** Distance where fog begins */
  fogNear: number
  /** Distance where fog fully saturates */
  fogFar: number
  /** Directional sun / moon color */
  sunColor: number
  /** Sun / moon light intensity */
  sunIntensity: number
  /** Sun / moon position relative to the camera/car */
  sunPosition: { x: number; y: number; z: number }
  /** Hemisphere ambient sky color */
  hemiSkyColor: number
  /** Hemisphere ambient ground bounce color */
  hemiGroundColor: number
  /** Hemisphere light intensity */
  hemiIntensity: number
  /** Terrain ground plane base color */
  groundColor: number
  /** Whether headlights should be automatically active */
  isLowLight: boolean
}

export const TIME_OF_DAY_PRESETS: Record<TimeOfDayMode, TimeOfDayPreset> = {
  sunrise: {
    id: "sunrise",
    name: "Sunrise",
    skyColor: 0x3d648c,
    horizonColor: 0xf5a56d,
    fogColor: 0xe89e6e,
    fogNear: 70,
    fogFar: 850,
    sunColor: 0xffaa5e,
    sunIntensity: 2.1,
    sunPosition: { x: -220, y: 55, z: -100 },
    hemiSkyColor: 0x8ea8c4,
    hemiGroundColor: 0x4a3622,
    hemiIntensity: 0.75,
    groundColor: 0x3e5229,
    isLowLight: false,
  },
  day: {
    id: "day",
    name: "Day",
    skyColor: 0x7bb6ec,
    horizonColor: 0xd8e8f8,
    fogColor: 0x87ceeb,
    fogNear: 100,
    fogFar: 900,
    sunColor: 0xfffaee,
    sunIntensity: 2.2,
    sunPosition: { x: 120, y: 180, z: 60 },
    hemiSkyColor: 0xbdd7ff,
    hemiGroundColor: 0x3d5a2a,
    hemiIntensity: 0.9,
    groundColor: 0x44602f,
    isLowLight: false,
  },
  evening: {
    id: "evening",
    name: "Evening",
    skyColor: 0x241d3b,
    horizonColor: 0xcc5231,
    fogColor: 0x643647,
    fogNear: 50,
    fogFar: 600,
    sunColor: 0xf06236,
    sunIntensity: 1.0,
    sunPosition: { x: 220, y: 35, z: 120 },
    hemiSkyColor: 0x503b60,
    hemiGroundColor: 0x241c18,
    hemiIntensity: 0.45,
    groundColor: 0x2c3b22,
    isLowLight: true,
  },
  night: {
    id: "night",
    name: "Night",
    skyColor: 0x060913,
    horizonColor: 0x0a1020,
    fogColor: 0x080c18,
    fogNear: 25,
    fogFar: 460,
    sunColor: 0x829ec8,
    sunIntensity: 0.35,
    sunPosition: { x: -100, y: 160, z: -80 },
    hemiSkyColor: 0x162238,
    hemiGroundColor: 0x090e12,
    hemiIntensity: 0.22,
    groundColor: 0x162215,
    isLowLight: true,
  },
}

/**
 * Returns true if the selected time of day is low-light (evening / night)
 * where real-world vehicles turn their headlights on.
 */
export function isLowLight(mode: TimeOfDayMode): boolean {
  return TIME_OF_DAY_PRESETS[mode]?.isLowLight ?? false
}
