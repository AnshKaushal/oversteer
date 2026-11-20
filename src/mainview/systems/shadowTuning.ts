export interface ShadowTuning {
  size: number
  half: number
  radius: number
  texel: number
  normalBias: number
  ahead: number
}

export function shadowTuning(pct: number): ShadowTuning {
  const q = Math.min(100, Math.max(25, pct)) / 100
  const size = Math.max(1024, Math.round((4096 * q) / 256) * 256)
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
