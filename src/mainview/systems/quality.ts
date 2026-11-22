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

export class AutoQuality {
  private slow = 0
  private fast = 0
  private stage = 0
  private base: Partial<Record<StepKey, number>> = {}
  static readonly MIN_SCALE = 50
  static readonly TARGET_MS = 1000 / 55
  static readonly UP_MS = 1000 / 90

  tick(
    frameMs: number,
    s: AutoState,
    ceiling: number,
    capMs = 0,
  ): Partial<AutoState> | null {
    if (frameMs <= 0) return null
    const target = capMs
      ? Math.max(AutoQuality.TARGET_MS, capMs * 1.12)
      : AutoQuality.TARGET_MS
    const upMs = capMs ? capMs * 1.03 : AutoQuality.UP_MS
    const upNeeded = capMs ? 60 : 24
    if (frameMs > target) {
      this.slow++
      this.fast = 0
    } else if (frameMs < upMs) {
      this.fast++
      this.slow = 0
    } else {
      this.slow = this.fast = 0
    }
    if (this.slow >= 4) {
      this.slow = 0
      while (this.stage < STEPS.length) {
        const st = STEPS[this.stage++]
        const cur = s[st.key] ?? st.def
        if (cur > st.low) {
          this.base[st.key] = cur
          return { [st.key]: st.low } as Partial<AutoState>
        }
      }
      if (s.renderScale > AutoQuality.MIN_SCALE)
        return {
          renderScale: Math.max(AutoQuality.MIN_SCALE, s.renderScale - 5),
        }
      return null
    }
    if (this.fast >= upNeeded) {
      this.fast = 0
      if (s.renderScale < ceiling)
        return { renderScale: Math.min(ceiling, s.renderScale + 5) }
      while (this.stage > 0) {
        const st = STEPS[--this.stage]
        const b = this.base[st.key]
        if (b !== undefined) {
          delete this.base[st.key]
          return { [st.key]: b } as Partial<AutoState>
        }
      }
    }
    return null
  }
}
