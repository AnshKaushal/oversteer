import type { AppSettings } from "./settings"

export type QualityPreset = "low" | "medium" | "high" | "ultra"
export const QUALITY_PRESETS: QualityPreset[] = [
  "low",
  "medium",
  "high",
  "ultra",
]

type Bundle = Pick<
  AppSettings,
  | "renderScale"
  | "shadows"
  | "shadowQuality"
  | "vegetation"
  | "drawDistance"
  | "fog"
  | "streetLights"
>

const BUNDLES: Record<QualityPreset, Bundle> = {
  low: {
    renderScale: 60,
    shadows: false,
    shadowQuality: 25,
    vegetation: 25,
    drawDistance: 40,
    fog: "heavy",
    streetLights: false,
  },
  medium: {
    renderScale: 80,
    shadows: true,
    shadowQuality: 50,
    vegetation: 60,
    drawDistance: 70,
    fog: "normal",
    streetLights: true,
  },
  high: {
    renderScale: 100,
    shadows: true,
    shadowQuality: 75,
    vegetation: 100,
    drawDistance: 100,
    fog: "normal",
    streetLights: true,
  },
  ultra: {
    renderScale: 100,
    shadows: true,
    shadowQuality: 100,
    vegetation: 100,
    drawDistance: 100,
    fog: "light",
    streetLights: true,
  },
}

export function applyPreset(s: AppSettings, p: QualityPreset): AppSettings {
  return { ...s, ...BUNDLES[p], qualityPreset: p }
}

export class AutoQuality {
  private slow = 0
  private fast = 0
  static readonly MIN_SCALE = 50
  static readonly TARGET_MS = 1000 / 55
  static readonly UP_MS = 1000 / 100

  tick(frameMs: number, scale: number, ceiling: number): number | null {
    if (frameMs <= 0) return null
    if (frameMs > AutoQuality.TARGET_MS) {
      this.slow++
      this.fast = 0
    } else if (frameMs < AutoQuality.UP_MS) {
      this.fast++
      this.slow = 0
    } else {
      this.slow = this.fast = 0
    }
    if (this.slow >= 3 && scale > AutoQuality.MIN_SCALE) {
      this.slow = 0
      return Math.max(AutoQuality.MIN_SCALE, scale - 10)
    }
    if (this.fast >= 8 && scale < ceiling) {
      this.fast = 0
      return Math.min(ceiling, scale + 10)
    }
    return null
  }
}
