/** What a wheel can be driving on, and what the weather does to grip. Both scale the tyre, never replace it. */
export type SurfaceId = "asphalt" | "grass" | "dirt" | "gravel" | "sand"
export type WeatherId = "dry" | "damp" | "wet" | "storm"

export interface SurfaceSpec {
  /** Multiplies the tyre's peak friction. */
  grip: number
  /** Multiplies the tyre's rolling resistance. */
  rolling: number
  /** How much of the weather's grip loss this surface takes (0 untouched, 1 fully). */
  wetSensitivity: number
}

export const SURFACES: Record<SurfaceId, SurfaceSpec> = {
  asphalt: { grip: 1, rolling: 1, wetSensitivity: 1 },
  grass: { grip: 0.55, rolling: 4, wetSensitivity: 0.8 },
  dirt: { grip: 0.7, rolling: 3, wetSensitivity: 0.9 },
  gravel: { grip: 0.6, rolling: 5, wetSensitivity: 0.4 },
  sand: { grip: 0.5, rolling: 8, wetSensitivity: 0.2 },
}

/** Surface a collider has unless it is registered otherwise. */
export const DEFAULT_SURFACE: SurfaceId = "asphalt"

/** Grip left in each weather on a surface that takes it in full. */
export const WEATHER_GRIP: Record<WeatherId, number> = {
  dry: 1,
  damp: 0.85,
  wet: 0.65,
  storm: 0.55,
}

export const DEFAULT_WEATHER: WeatherId = "dry"

/** Tyre grip by time of day: cool tarmac at dawn and night grips a little less. */
export const TIME_OF_DAY_GRIP: Record<string, number> = {
  sunrise: 0.97,
  day: 1,
  evening: 1,
  night: 0.96,
}

/** Tyre grip scale on a surface in the given weather. */
export function surfaceGrip(surface: SurfaceId, weather: WeatherId): number {
  const s = SURFACES[surface]
  return s.grip * (1 - (1 - WEATHER_GRIP[weather]) * s.wetSensitivity)
}
