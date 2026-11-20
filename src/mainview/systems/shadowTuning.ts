// Shared sun-shadow tuning for every map. The PCF filter radius is measured
// in shadow-map texels, so crispness depends on texel size (frustum / map
// resolution) and the radius together: keep both small near the car.
export interface ShadowTuning {
  size: number
  half: number
  radius: number
  texel: number
  normalBias: number
  /** How far the shadow area is pushed along the view direction (m). */
  ahead: number
}

export function shadowTuning(pct: number): ShadowTuning {
  const q = Math.min(100, Math.max(25, pct)) / 100
  const size = Math.max(1024, Math.round((4096 * q) / 256) * 256)
  // Smaller frustum at lower quality keeps near shadows usable on weak GPUs
  // without a fatter filter; at 100% it is ~2.4 cm per texel.
  const half = 40 + 10 * q
  const texel = (2 * half) / size
  return {
    size,
    half,
    radius: 1 + (1 - q) * 1.5,
    texel,
    ahead: half * 0.35,
    normalBias: Math.min(0.06, Math.max(0.01, texel * 1.5)),
  }
}
