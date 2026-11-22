import {
  BASE_PRESETS,
  RAIN_LOOK,
  STORM_LOOK,
  TIME_OF_DAY_PRESETS,
  gradePreset,
  lerpPreset,
  composeMode,
  phaseOf,
  weatherOf,
  type DayPhase,
  type SkyWeather,
  type TimeOfDayMode,
  type TimeOfDayPreset,
} from "../../constants/timeOfDay"
import { conditions } from "../../physics/core/Conditions"
import type { WeatherId } from "../../data/surfaces"
import type { AppSettings } from "../settings"

export type WeatherFrequency = "calm" | "normal" | "wild"

export interface SkyConfig {
  timeLive: boolean
  weatherLive: boolean
  fixed: TimeOfDayMode
  minutesPerSecond: number
  frequency: WeatherFrequency
}

export interface SkyState {
  hour: number
  phase: DayPhase
  preset: TimeOfDayPreset
  cloud: number
  rain: number
  storm: number
  wetness: number
  surface: WeatherId
  lamps: boolean
  daylight: number
  smokeLight: number
  weatherLabel: string
}

type Regime = "clear" | "partly" | "overcast" | "drizzle" | "rain" | "heavy" | "storm"

interface RegimeSpec {
  cloud: number
  rain: number
  storm: number
  min: number
  max: number
  next: [Regime, number][]
  label: string
}

const REGIMES: Record<Regime, RegimeSpec> = {
  clear: {
    cloud: 0.04, rain: 0, storm: 0, min: 120, max: 420, label: "Clear",
    next: [["partly", 0.55], ["overcast", 0.15], ["drizzle", 0.1], ["rain", 0.1], ["storm", 0.1]],
  },
  partly: {
    cloud: 0.32, rain: 0, storm: 0, min: 80, max: 300, label: "Partly cloudy",
    next: [["clear", 0.35], ["overcast", 0.3], ["drizzle", 0.12], ["rain", 0.13], ["storm", 0.1]],
  },
  overcast: {
    cloud: 0.68, rain: 0, storm: 0, min: 60, max: 180, label: "Overcast",
    next: [["partly", 0.25], ["clear", 0.1], ["drizzle", 0.25], ["rain", 0.25], ["storm", 0.15]],
  },
  drizzle: {
    cloud: 0.8, rain: 0.22, storm: 0, min: 60, max: 150, label: "Drizzle",
    next: [["overcast", 0.3], ["rain", 0.3], ["partly", 0.2], ["clear", 0.1], ["heavy", 0.1]],
  },
  rain: {
    cloud: 0.92, rain: 0.55, storm: 0, min: 90, max: 240, label: "Rain",
    next: [["drizzle", 0.25], ["heavy", 0.25], ["overcast", 0.25], ["storm", 0.15], ["partly", 0.1]],
  },
  heavy: {
    cloud: 1, rain: 0.85, storm: 0, min: 60, max: 150, label: "Heavy rain",
    next: [["rain", 0.35], ["storm", 0.3], ["drizzle", 0.15], ["overcast", 0.2]],
  },
  storm: {
    cloud: 1, rain: 1, storm: 1, min: 60, max: 150, label: "Thunderstorm",
    next: [["heavy", 0.3], ["rain", 0.4], ["drizzle", 0.15], ["overcast", 0.15]],
  },
}

const REGIME_IDS = Object.keys(REGIMES) as Regime[]
const START_WEIGHTS: [Regime, number][] = [
  ["clear", 0.4], ["partly", 0.25], ["overcast", 0.12],
  ["drizzle", 0.08], ["rain", 0.1], ["storm", 0.05],
]

const FREQ_WET: Record<WeatherFrequency, number> = {
  calm: 0.4,
  normal: 1,
  wild: 2.2,
}

const FIXED_HOUR: Record<DayPhase, number> = {
  sunrise: 6.5,
  day: 12,
  evening: 18.75,
  night: 23,
}

const KEYS: { h: number; p: DayPhase }[] = [
  { h: 0, p: "night" },
  { h: 4.5, p: "night" },
  { h: 6.5, p: "sunrise" },
  { h: 9.5, p: "day" },
  { h: 15, p: "day" },
  { h: 18.75, p: "evening" },
  { h: 21.5, p: "night" },
  { h: 24, p: "night" },
]

const SUN_RISE = 5.75
const SUN_SET = 19.75

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function slew(cur: number, target: number, up: number, down: number, dt: number) {
  const r = target > cur ? up : down
  const d = target - cur
  const step = r * dt
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function phaseAtHour(h: number): DayPhase {
  if (h >= 20.5 || h < 5.5) return "night"
  if (h < 8) return "sunrise"
  if (h < 17.5) return "day"
  return "evening"
}

export function clearPresetAt(hour: number): TimeOfDayPreset {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = smooth(0, 1, (h - a.h) / (b.h - a.h))
  const base = lerpPreset(BASE_PRESETS[a.p], BASE_PRESETS[b.p], t)

  const sunUp = h >= SUN_RISE && h < SUN_SET
  const arcLen = sunUp ? SUN_SET - SUN_RISE : 24 - (SUN_SET - SUN_RISE)
  const arcT = sunUp
    ? (h - SUN_RISE) / arcLen
    : (((h - SUN_SET + 24) % 24)) / arcLen
  const ang = arcT * Math.PI
  const edge = Math.min(arcT, 1 - arcT) * arcLen
  const fade = 0.08 + 0.92 * smooth(0, 0.8, edge)
  const lift = -14
  const peak = sunUp ? 170 : 150
  const pos = {
    x: -Math.cos(ang) * 230,
    y: lift + Math.sin(ang) * (peak - lift),
    z: (sunUp ? 20 : -60) + Math.sin(ang) * 40,
  }
  return {
    ...base,
    sunPosition: pos,
    sunIntensity: base.sunIntensity * fade,
    moon: !sunUp,
    sunColor: base.sunColor,
    starAlpha:
      0.95 * (1 - smooth(5.0, 6.8, h) + smooth(18.8, 20.6, h)),
  }
}

function clampStars(p: TimeOfDayPreset): TimeOfDayPreset {
  return { ...p, starAlpha: Math.min(0.95, Math.max(0, p.starAlpha)) }
}

export function skyPresetAt(
  hour: number,
  cloud: number,
  storm: number,
): TimeOfDayPreset {
  let p = clampStars(clearPresetAt(hour))
  if (cloud > 0.001) {
    const rainP = gradePreset(p, RAIN_LOOK)
    p = lerpPreset(p, rainP, Math.min(1, cloud))
  }
  if (storm > 0.001) {
    const stormP = gradePreset(p, STORM_LOOK)
    p = lerpPreset(p, stormP, Math.min(1, storm))
  }
  p.starAlpha *= 1 - Math.min(1, cloud * 1.2)
  return p
}

export function daylightAt(hour: number, cloud: number, rain: number, storm: number) {
  const e = Math.sin((Math.PI * (hour - 6)) / 12)
  const sun = smooth(0.02, 0.3, Math.max(0, e))
  return sun * Math.max(0, 1 - 0.55 * cloud - 0.3 * rain - 0.2 * storm)
}

const DEFAULT_CONFIG: SkyConfig = {
  timeLive: true,
  weatherLive: true,
  fixed: "day",
  minutesPerSecond: 1,
  frequency: "normal",
}

export class SkyClock {
  cfg: SkyConfig = { ...DEFAULT_CONFIG }
  minutes = 8 * 60
  private rand: () => number
  private regime: Regime = "clear"
  private regimeLeft = 120
  private cloud = 0.04
  private rainBase = 0
  private storm = 0
  private wet = 0
  private lamps = false
  private t = 0
  private shown: TimeOfDayPreset | null = null
  private fixedFrom: TimeOfDayPreset | null = null
  private fixedTo: TimeOfDayPreset | null = null
  private fixedT = 1
  private phases = [0, 0, 0, 0].map((_, i) => i * 1.7)
  state: SkyState

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.rand = mulberry32(seed)
    this.regime = this.pick(START_WEIGHTS)
    this.regimeLeft = this.duration(this.regime)
    const r = REGIMES[this.regime]
    this.cloud = r.cloud
    this.rainBase = r.rain
    this.storm = r.storm
    this.phases = this.phases.map(() => this.rand() * 6.28)
    this.wet = this.rainBase > 0 ? 0.8 * this.rainBase : 0
    this.state = this.compute()
  }

  get hour() {
    return this.minutes / 60
  }

  configure(patch: Partial<SkyConfig>) {
    this.cfg = { ...this.cfg, ...patch }
    this.state = this.compute()
    this.publish()
  }

  setHour(h: number) {
    this.minutes = ((((h * 60) % 1440) + 1440) % 1440)
    this.state = this.compute()
    this.publish()
  }

  skipHours(h: number) {
    this.setHour(this.hour + h)
  }

  forceRegime(r: Regime) {
    this.regime = r
    this.regimeLeft = this.duration(r)
  }

  regimeName(): Regime {
    return this.regime
  }

  private pick(w: [Regime, number][], bias?: (r: Regime) => number): Regime {
    let tot = 0
    const ws = w.map(([r, x]) => {
      const v = x * (bias ? bias(r) : 1)
      tot += v
      return v
    })
    let x = this.rand() * tot
    for (let i = 0; i < w.length; i++) {
      x -= ws[i]
      if (x <= 0) return w[i][0]
    }
    return w[w.length - 1][0]
  }

  private duration(r: Regime): number {
    const s = REGIMES[r]
    const d = s.min + this.rand() * (s.max - s.min)
    const wet = r === "clear" || r === "partly" ? 1 / FREQ_WET[this.cfg.frequency] : 1
    return d * wet
  }

  private nextRegime() {
    const h = this.hour
    const afternoon = Math.exp(-(((h - 16) / 3.5) ** 2))
    const f = FREQ_WET[this.cfg.frequency]
    const bias = (r: Regime) => {
      if (r === "storm") return (1 + 0.9 * afternoon) * f
      if (r === "rain" || r === "heavy" || r === "drizzle") return f
      return 1
    }
    this.regime = this.pick(REGIMES[this.regime].next, bias)
    this.regimeLeft = this.duration(this.regime)
  }

  private forcedTarget(): { cloud: number; rain: number; storm: number } | null {
    if (this.cfg.weatherLive) return null
    const w: SkyWeather = weatherOf(this.cfg.fixed)
    if (w === "clear") return { cloud: 0, rain: 0, storm: 0 }
    if (w === "rain") return { cloud: 0.92, rain: 0.55, storm: 0 }
    return { cloud: 1, rain: 1, storm: 1 }
  }

  update(dt: number): SkyState {
    dt = Math.min(dt, 0.25)
    this.t += dt
    if (this.cfg.timeLive) {
      this.minutes = (this.minutes + dt * this.cfg.minutesPerSecond) % 1440
    }
    if (this.fixedT < 1) this.fixedT = Math.min(1, this.fixedT + dt / 9)
    const forced = this.forcedTarget()
    if (!forced) {
      this.regimeLeft -= dt
      if (this.regimeLeft <= 0) this.nextRegime()
    }
    const tgt = forced ?? REGIMES[this.regime]
    this.cloud = slew(this.cloud, tgt.cloud, 1 / 50, 1 / 70, dt)
    const rainTarget = this.cloud > tgt.cloud * 0.5 || tgt.rain === 0 ? tgt.rain : 0
    this.rainBase = slew(this.rainBase, rainTarget, 1 / 28, 1 / 45, dt)
    this.storm = slew(this.storm, tgt.storm, 1 / 22, 1 / 40, dt)

    const gust =
      this.rainBase > 0
        ? 0.1 *
          (Math.sin(this.t * 0.11 + this.phases[0]) * 0.6 +
            Math.sin(this.t * 0.043 + this.phases[1]) * 0.4)
        : 0
    const rain = this.rainBase < 0.02 ? 0 : Math.min(1, this.rainBase * (1 + gust))

    if (rain > 0.02) {
      this.wet = slew(this.wet, Math.min(1, 0.35 + rain * 0.8), rain / 18, 0, dt)
    } else {
      this.wet = slew(this.wet, 0, 0, (1 - this.cloud * 0.5) / 150, dt)
    }

    this.state = this.compute(rain)
    this.publish()
    return this.state
  }

  private compute(rainOverride?: number): SkyState {
    const rain = rainOverride ?? Math.min(1, this.rainBase)
    const fixedPhase = phaseOf(this.cfg.fixed)
    const hour = this.cfg.timeLive ? this.hour : FIXED_HOUR[fixedPhase]
    const bothFixed = !this.cfg.timeLive && !this.cfg.weatherLive
    let preset: TimeOfDayPreset
    const fixedTarget = TIME_OF_DAY_PRESETS[this.cfg.fixed]
    if (bothFixed) {
      if (fixedTarget !== this.fixedTo) {
        this.fixedTo = fixedTarget
        this.fixedFrom = this.shown
        this.fixedT = this.shown ? 0 : 1
      }
      preset = this.fixedFrom
        ? lerpPreset(this.fixedFrom, fixedTarget, smooth(0, 1, this.fixedT))
        : fixedTarget
      if (this.fixedT >= 1) this.fixedFrom = null
    } else {
      this.fixedTo = null
      preset = skyPresetAt(hour, this.cloud, this.storm)
    }
    this.shown = preset
    const daylight = daylightAt(hour, this.cloud, rain, this.storm)
    if (this.lamps ? daylight > 0.5 : daylight < 0.38) this.lamps = !this.lamps
    if (bothFixed) this.lamps = fixedTarget.isLowLight
    const wetPreset =
      preset === fixedTarget
        ? preset
        : bothFixed
          ? {
              ...preset,
              lightning: fixedTarget.lightning,
              isLowLight: this.lamps,
              weather: fixedTarget.weather,
            }
          : {
            ...preset,
            rain,
            lightning: this.storm > 0.35,
            isLowLight: this.lamps,
            weather: this.surfaceOf(),
          }
    const light =
      (0.2 + 0.8 * smooth(0, 1, daylight / 0.9)) * (1 - 0.25 * this.cloud)
    return {
      hour,
      phase: this.cfg.timeLive ? phaseAtHour(hour) : fixedPhase,
      preset: wetPreset,
      cloud: this.cloud,
      rain: wetPreset.rain,
      storm: this.storm,
      wetness: this.wet,
      surface: wetPreset.weather,
      lamps: this.lamps,
      daylight,
      smokeLight: Math.min(1, light),
      weatherLabel: this.label(),
    }
  }

  private surfaceOf(): WeatherId {
    if (this.wet < 0.12) return "dry"
    if (this.wet < 0.4) return "damp"
    if (this.wet >= 0.75 && this.storm > 0.4) return "storm"
    return "wet"
  }

  private label(): string {
    if (!this.cfg.weatherLive) {
      const w = weatherOf(this.cfg.fixed)
      return w === "clear" ? "Clear" : w === "rain" ? "Rain" : "Thunderstorm"
    }
    return REGIMES[this.regime].label
  }

  private publish() {
    conditions.weather = this.state.surface
    conditions.timeOfDay = this.state.phase
    conditions.lowLight = this.state.lamps
    conditions.stormHazards = this.state.preset.lightning
  }
}

export const skyClock = new SkyClock()

export function fixedHourFor(phase: DayPhase): number {
  return FIXED_HOUR[phase]
}

export function formatClock(hour: number): string {
  const m = Math.floor(hour * 60) % 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export { REGIME_IDS, composeMode }

export function configureSky(settings: AppSettings, mode: TimeOfDayMode) {
  skyClock.configure({
    timeLive: settings.timeLive !== false,
    weatherLive: settings.weatherLive !== false,
    fixed: mode,
    minutesPerSecond: Math.max(0, settings.clockSpeed ?? 1),
    frequency: settings.weatherFrequency ?? "normal",
  })
}

const CLOCK_KEY = "oversteer_clock"

export function saveClock() {
  try {
    localStorage.setItem(CLOCK_KEY, String(skyClock.minutes))
  } catch {}
}

export function restoreClock() {
  try {
    const v = Number(localStorage.getItem(CLOCK_KEY))
    if (Number.isFinite(v) && v > 0) skyClock.setHour(v / 60)
  } catch {}
}
