import type { AppSettings } from "./settings";

export type QualityPreset = "low" | "medium" | "high" | "ultra";
export const QUALITY_PRESETS: QualityPreset[] = [
  "low",
  "medium",
  "high",
  "ultra",
];

export type EffectKey = "bloom" | "ambientOcclusion" | "wetReflections"

export interface EffectOption {
  key: EffectKey
  label: string
  hint: string
  def: number
}

export const EFFECT_OPTIONS: EffectOption[] = [
  {
    key: "bloom",
    label: "Bloom & light glow",
    hint: "Glow around headlights, tail lights and bright highlights",
    def: 0,
  },
  {
    key: "ambientOcclusion",
    label: "Ambient occlusion",
    hint: "Soft contact shading in corners and under objects",
    def: 0,
  },
  {
    key: "wetReflections",
    label: "Wet road reflections",
    hint: "Reflection detail in puddles when it rains",
    def: 40,
  },
]

type Bundle = Pick<
  AppSettings,
  | "renderScale"
  | "upscaler"
  | "upscaleMode"
  | "shadows"
  | "shadowQuality"
  | "vegetation"
  | "drawDistance"
  | "fog"
  | "streetLights"
  | EffectKey
>;

const BUNDLES: Record<QualityPreset, Bundle> = {
  low: {
    renderScale: 60,
    upscaler: true,
    upscaleMode: "spatial",
    shadows: false,
    shadowQuality: 25,
    vegetation: 25,
    drawDistance: 40,
    fog: "heavy",
    streetLights: false,
    bloom: 0,
    ambientOcclusion: 0,
    wetReflections: 0,
  },
  medium: {
    renderScale: 80,
    upscaler: true,
    upscaleMode: "spatial",
    shadows: true,
    shadowQuality: 50,
    vegetation: 60,
    drawDistance: 70,
    fog: "normal",
    streetLights: true,
    bloom: 25,
    ambientOcclusion: 0,
    wetReflections: 25,
  },
  high: {
    renderScale: 90,
    upscaler: true,
    upscaleMode: "temporal",
    shadows: true,
    shadowQuality: 75,
    vegetation: 100,
    drawDistance: 100,
    fog: "normal",
    streetLights: true,
    bloom: 35,
    ambientOcclusion: 30,
    wetReflections: 40,
  },
  ultra: {
    renderScale: 85,
    upscaler: true,
    upscaleMode: "temporal",
    shadows: true,
    shadowQuality: 100,
    vegetation: 100,
    drawDistance: 100,
    fog: "light",
    streetLights: true,
    bloom: 45,
    ambientOcclusion: 55,
    wetReflections: 70,
  },
};

export function autoCeiling(p: QualityPreset | undefined): number {
  if (p === "low") return 60
  if (p === "ultra") return BUNDLES.ultra.renderScale
  return 100
}

export function applyPreset(s: AppSettings, p: QualityPreset): AppSettings {
  return { ...s, ...BUNDLES[p], qualityPreset: p };
}

type StepKey = "ambientOcclusion" | "shadowQuality" | "vegetation"

export type AutoState = Pick<AppSettings, "renderScale" | StepKey>

const STEPS: { key: StepKey; low: number; def: number }[] = [
  { key: "ambientOcclusion", low: 0, def: 0 },
  { key: "shadowQuality", low: 50, def: 100 },
  { key: "vegetation", low: 60, def: 100 },
]

export interface AutoSample {
  cpuMs: number
  gpuMs: number | null
  frameMs: number
  now: number
}

const WINDOW_MS = 1000
const DOWN_FRAC = 0.93
const UP_FRAC = 0.7
const SCALE_STEP = 3
const SETTLE_MS = 2000
const UP_HOLD_MS = 5000

export class AutoQuality {
  private costs: number[] = []
  private windowStart = 0
  private lastChange = 0
  private headroom = 0
  private overAtFloor = 0
  private stage = 0
  private base: Partial<Record<StepKey, number>> = {}
  static readonly MIN_SCALE = 50

  push(m: AutoSample) {
    if (m.frameMs <= 0 || m.frameMs > 250) return
    const cost = m.gpuMs !== null ? Math.max(m.cpuMs, m.gpuMs) : m.frameMs
    this.costs.push(cost)
  }

  tick(
    m: AutoSample,
    s: AutoState,
    ceiling: number,
    capMs = 0,
  ): Partial<AutoState> | null {
    this.push(m)
    if (!this.windowStart) this.windowStart = m.now
    if (m.now - this.windowStart < WINDOW_MS) return null
    this.windowStart = m.now
    const n = this.costs.length
    if (n < 20) {
      this.costs.length = 0
      return null
    }
    this.costs.sort((a, b) => a - b)
    const p90 = this.costs[Math.min(n - 1, Math.floor(n * 0.9))]
    this.costs.length = 0
    if (m.now - this.lastChange < SETTLE_MS) return null

    const hasGpu = m.gpuMs !== null
    const budget = capMs ? Math.min(capMs, 1000 / 60) : 1000 / 60
    const over = p90 > budget * DOWN_FRAC * (hasGpu ? 1 : 1.12)
    const under = hasGpu ? p90 < budget * UP_FRAC : p90 < budget * 1.04

    if (over) {
      this.headroom = 0
      if (s.renderScale > AutoQuality.MIN_SCALE) {
        this.lastChange = m.now
        return {
          renderScale: Math.max(AutoQuality.MIN_SCALE, s.renderScale - SCALE_STEP),
        }
      }
      if (++this.overAtFloor < 3) return null
      this.overAtFloor = 0
      while (this.stage < STEPS.length) {
        const st = STEPS[this.stage++]
        const cur = s[st.key] ?? st.def
        if (cur > st.low) {
          this.base[st.key] = cur
          this.lastChange = m.now
          return { [st.key]: st.low } as Partial<AutoState>
        }
      }
      return null
    }
    this.overAtFloor = 0
    if (!under) {
      this.headroom = 0
      return null
    }
    this.headroom += WINDOW_MS
    if (this.headroom < (hasGpu ? UP_HOLD_MS : UP_HOLD_MS * 2)) return null
    this.headroom = 0
    while (this.stage > 0) {
      const st = STEPS[--this.stage]
      const b = this.base[st.key]
      if (b !== undefined) {
        delete this.base[st.key]
        this.lastChange = m.now
        return { [st.key]: b } as Partial<AutoState>
      }
    }
    if (s.renderScale < ceiling) {
      this.lastChange = m.now
      return { renderScale: Math.min(ceiling, s.renderScale + SCALE_STEP) }
    }
    return null
  }
}
