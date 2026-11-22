import type { WeatherId } from "../data/surfaces"

export type DayPhase = "sunrise" | "day" | "evening" | "night"
export type SkyWeather = "clear" | "rain" | "storm"
export type TimeOfDayMode = DayPhase | `${DayPhase}-rain` | `${DayPhase}-storm`

export const DAY_PHASES: readonly DayPhase[] = [
  "sunrise",
  "day",
  "evening",
  "night",
] as const
export const SKY_WEATHERS: readonly SkyWeather[] = [
  "clear",
  "rain",
  "storm",
] as const

export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  sunrise: "Sunrise",
  day: "Day",
  evening: "Evening",
  night: "Night",
}
export const SKY_WEATHER_LABELS: Record<SkyWeather, string> = {
  clear: "Clear",
  rain: "Rain",
  storm: "Storm",
}

export function composeMode(phase: DayPhase, weather: SkyWeather): TimeOfDayMode {
  return weather === "clear" ? phase : `${phase}-${weather}`
}

export function phaseOf(mode: TimeOfDayMode): DayPhase {
  return mode.split("-")[0] as DayPhase
}

export function weatherOf(mode: TimeOfDayMode): SkyWeather {
  const w = mode.split("-")[1]
  return w === "rain" || w === "storm" ? w : "clear"
}

export function normalizeMode(raw: unknown): TimeOfDayMode {
  if (raw === "rainy") return "day-rain"
  if (raw === "stormy") return "day-storm"
  return typeof raw === "string" && raw in TIME_OF_DAY_PRESETS
    ? (raw as TimeOfDayMode)
    : "day"
}

export function modeLabel(mode: TimeOfDayMode): string {
  const w = weatherOf(mode)
  const base = DAY_PHASE_LABELS[phaseOf(mode)]
  return w === "clear" ? base : `${base} · ${SKY_WEATHER_LABELS[w]}`
}

export const TIME_OF_DAY_MODES: readonly TimeOfDayMode[] = DAY_PHASES.flatMap(
  (p) => SKY_WEATHERS.map((w) => composeMode(p, w)),
)

export interface TimeOfDayPreset {
  id: TimeOfDayMode
  name: string
  skyColor: number
  horizonColor: number
  fogColor: number
  fogNear: number
  fogFar: number
  sunColor: number
  sunIntensity: number
  sunPosition: { x: number; y: number; z: number }
  hemiSkyColor: number
  hemiGroundColor: number
  hemiIntensity: number
  groundColor: number
  isLowLight: boolean
  rain: number
  lightning: boolean
  weather: WeatherId
  starAlpha: number
  moon: boolean
}

export const BASE_PRESETS: Record<DayPhase, TimeOfDayPreset> = {
  sunrise: {
    id: "sunrise",
    name: "Sunrise",
    skyColor: 0x6a7ba6,
    horizonColor: 0xf7a062,
    fogColor: 0xe8a070,
    fogNear: 70,
    fogFar: 1000,
    sunColor: 0xffaa5e,
    sunIntensity: 3.2,
    sunPosition: { x: -220, y: 55, z: -100 },
    hemiSkyColor: 0xa9bfd8,
    hemiGroundColor: 0x7a5a3a,
    hemiIntensity: 1.7,
    groundColor: 0x3e5229,
    isLowLight: false,
    rain: 0,
    lightning: false,
    weather: "dry",
    starAlpha: 0.95,
    moon: false,
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
    rain: 0,
    lightning: false,
    weather: "dry",
    starAlpha: 0,
    moon: false,
  },
  evening: {
    id: "evening",
    name: "Evening",
    skyColor: 0x3a3a8c,
    horizonColor: 0xc4546e,
    fogColor: 0x5e3d78,
    fogNear: 70,
    fogFar: 750,
    sunColor: 0xf06236,
    sunIntensity: 2.8,
    sunPosition: { x: 220, y: 35, z: 120 },
    hemiSkyColor: 0x7a6a9a,
    hemiGroundColor: 0x4a3a30,
    hemiIntensity: 1.7,
    groundColor: 0x2c3b22,
    isLowLight: true,
    rain: 0,
    lightning: false,
    weather: "dry",
    starAlpha: 0.95,
    moon: false,
  },
  night: {
    id: "night",
    name: "Night",
    skyColor: 0x060913,
    horizonColor: 0x0a1020,
    fogColor: 0x080c18,
    fogNear: 40,
    fogFar: 600,
    sunColor: 0x9bb8e8,
    sunIntensity: 1.6,
    sunPosition: { x: -100, y: 160, z: -80 },
    hemiSkyColor: 0x2c4570,
    hemiGroundColor: 0x1c2a36,
    hemiIntensity: 1.3,
    groundColor: 0x162215,
    isLowLight: true,
    rain: 0,
    lightning: false,
    weather: "dry",
    starAlpha: 0.95,
    moon: true,
  },
}

const WEATHER_LOOK: Record<
  Exclude<SkyWeather, "clear">,
  {
    desat: number
    dim: number
    sun: number
    hemi: number
    fogNear: number
    fogFar: number
    rain: number
    lightning: boolean
    weather: WeatherId
  }
> = {
  rain: {
    desat: 0.65,
    dim: 0.68,
    sun: 0.35,
    hemi: 0.9,
    fogNear: 0.65,
    fogFar: 0.55,
    rain: 0.55,
    lightning: false,
    weather: "wet",
  },
  storm: {
    desat: 0.8,
    dim: 0.5,
    sun: 0.2,
    hemi: 0.8,
    fogNear: 0.45,
    fogFar: 0.42,
    rain: 1,
    lightning: true,
    weather: "storm",
  },
}

function grade(hex: number, desat: number, dim: number): number {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const l = 0.299 * r + 0.587 * g + 0.114 * b
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round((c + (l - c) * desat) * dim)))
  return (mix(r) << 16) | (mix(g) << 8) | mix(b)
}

export type WeatherLook = (typeof WEATHER_LOOK)[keyof typeof WEATHER_LOOK]
export const RAIN_LOOK = WEATHER_LOOK.rain
export const STORM_LOOK = WEATHER_LOOK.storm

export function gradePreset(
  base: TimeOfDayPreset,
  k: WeatherLook,
): TimeOfDayPreset {
  const g = (c: number) => grade(c, k.desat, k.dim)
  return {
    ...base,
    skyColor: g(base.skyColor),
    horizonColor: g(base.horizonColor),
    fogColor: g(base.fogColor),
    fogNear: Math.round(base.fogNear * k.fogNear),
    fogFar: Math.round(base.fogFar * k.fogFar),
    sunColor: grade(base.sunColor, k.desat, 0.9),
    sunIntensity: base.sunIntensity * k.sun,
    hemiSkyColor: g(base.hemiSkyColor),
    hemiGroundColor: g(base.hemiGroundColor),
    hemiIntensity: base.hemiIntensity * k.hemi,
    groundColor: g(base.groundColor),
    isLowLight: true,
    rain: k.rain,
    lightning: k.lightning,
    weather: k.weather,
  }
}

export function lerpHex(a: number, b: number, t: number): number {
  const ch = (sh: number) => {
    const x = (a >> sh) & 255
    const y = (b >> sh) & 255
    return Math.round(x + (y - x) * t)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function lerpPreset(
  a: TimeOfDayPreset,
  b: TimeOfDayPreset,
  t: number,
): TimeOfDayPreset {
  if (t <= 0) return a
  if (t >= 1) return b
  const n = (x: number, y: number) => x + (y - x) * t
  const h = (x: number, y: number) => lerpHex(x, y, t)
  const hi = t < 0.5 ? a : b
  return {
    ...hi,
    skyColor: h(a.skyColor, b.skyColor),
    horizonColor: h(a.horizonColor, b.horizonColor),
    fogColor: h(a.fogColor, b.fogColor),
    fogNear: n(a.fogNear, b.fogNear),
    fogFar: n(a.fogFar, b.fogFar),
    sunColor: h(a.sunColor, b.sunColor),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    sunPosition: {
      x: n(a.sunPosition.x, b.sunPosition.x),
      y: n(a.sunPosition.y, b.sunPosition.y),
      z: n(a.sunPosition.z, b.sunPosition.z),
    },
    hemiSkyColor: h(a.hemiSkyColor, b.hemiSkyColor),
    hemiGroundColor: h(a.hemiGroundColor, b.hemiGroundColor),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    groundColor: h(a.groundColor, b.groundColor),
    rain: n(a.rain, b.rain),
    starAlpha: n(a.starAlpha, b.starAlpha),
  }
}

function build(phase: DayPhase, weather: SkyWeather): TimeOfDayPreset {
  const base = BASE_PRESETS[phase]
  const id = composeMode(phase, weather)
  if (weather === "clear") return { ...base, id }
  const k = WEATHER_LOOK[weather]
  const g = (c: number) => grade(c, k.desat, k.dim)
  return {
    ...base,
    id,
    skyColor: g(base.skyColor),
    horizonColor: g(base.horizonColor),
    fogColor: g(base.fogColor),
    fogNear: Math.round(base.fogNear * k.fogNear),
    fogFar: Math.round(base.fogFar * k.fogFar),
    sunColor: grade(base.sunColor, k.desat, 0.9),
    sunIntensity: base.sunIntensity * k.sun,
    hemiSkyColor: g(base.hemiSkyColor),
    hemiGroundColor: g(base.hemiGroundColor),
    hemiIntensity: base.hemiIntensity * k.hemi,
    groundColor: g(base.groundColor),
    isLowLight: true,
    rain: k.rain,
    lightning: k.lightning,
    weather: k.weather,
  }
}

export const TIME_OF_DAY_PRESETS = Object.fromEntries(
  TIME_OF_DAY_MODES.map((m) => [m, build(phaseOf(m), weatherOf(m))]),
) as Record<TimeOfDayMode, TimeOfDayPreset>

export function lampsOn(mode: TimeOfDayMode): boolean {
  return phaseOf(mode) !== "day" || weatherOf(mode) !== "clear"
}

export function isLowLight(mode: TimeOfDayMode): boolean {
  return TIME_OF_DAY_PRESETS[mode]?.isLowLight ?? false
}

const WEATHER_SEVERITY: readonly WeatherId[] = ["dry", "damp", "wet", "storm"]

export function effectiveWeather(
  chosen: WeatherId,
  mode: TimeOfDayMode,
): WeatherId {
  const sky = TIME_OF_DAY_PRESETS[mode]?.weather ?? "dry"
  return WEATHER_SEVERITY.indexOf(sky) > WEATHER_SEVERITY.indexOf(chosen)
    ? sky
    : chosen
}
