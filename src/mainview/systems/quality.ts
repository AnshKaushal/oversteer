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
  static readonly UP_MS = 1000 / 90

  tick(
    frameMs: number,
    scale: number,
    ceiling: number,
    capMs = 0,
  ): number | null {
    if (frameMs <= 0) return null
    // With a frame cap every frame takes >= capMs, so "fast" can't be judged
    // by an absolute frame time: judge against the cap itself.
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
    if (this.slow >= 4 && scale > AutoQuality.MIN_SCALE) {
      this.slow = 0
      return Math.max(AutoQuality.MIN_SCALE, scale - 5)
    }
    if (this.fast >= upNeeded && scale < ceiling) {
      this.fast = 0
      return Math.min(ceiling, scale + 5)
    }
    return null
  }
}
