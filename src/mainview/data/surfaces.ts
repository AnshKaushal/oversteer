export type SurfaceId = "asphalt" | "grass" | "dirt" | "gravel" | "sand"
export type WeatherId = "dry" | "damp" | "wet" | "storm"

export interface SurfaceSpec {
  grip: number
  rolling: number
  wetSensitivity: number
}

export const SURFACES: Record<SurfaceId, SurfaceSpec> = {
  asphalt: { grip: 1, rolling: 1, wetSensitivity: 1 },
  grass: { grip: 0.9, rolling: 4, wetSensitivity: 0.5 },
  dirt: { grip: 0.7, rolling: 3, wetSensitivity: 0.9 },
  gravel: { grip: 0.6, rolling: 5, wetSensitivity: 0.4 },
  sand: { grip: 0.5, rolling: 8, wetSensitivity: 0.2 },
}

export const DEFAULT_SURFACE: SurfaceId = "asphalt"

export const WEATHER_GRIP: Record<WeatherId, number> = {
  dry: 1,
  damp: 0.85,
  wet: 0.65,
  storm: 0.55,
}

export const WEATHER_WETNESS: Record<WeatherId, number> = {
  dry: 0,
  damp: 0.3,
  wet: 0.65,
  storm: 0.85,
}

export const DEFAULT_WEATHER: WeatherId = "dry"

export const TIME_OF_DAY_GRIP: Record<string, number> = {
  sunrise: 0.97,
  day: 1,
  evening: 1,
  night: 0.96,
}

export function surfaceGrip(surface: SurfaceId, weather: WeatherId): number {
  const s = SURFACES[surface]
  return s.grip * (1 - (1 - WEATHER_GRIP[weather]) * s.wetSensitivity)
}
