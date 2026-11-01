export interface CircuitConfig {
  seed: number
  lengthM: number
  twistiness: number
  widthM: number
  gravelM: number
  runoffM: number
  barriers: boolean
  barrierHeightM: number
  kerbs: boolean
  startLine: boolean
  treesPer100m: number
  treeBandM: number
  treeScale: { min: number; max: number }
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = {
  seed: 1,
  lengthM: 4000,
  twistiness: 0.6,
  widthM: 14,
  gravelM: 8,
  runoffM: 22,
  barriers: true,
  barrierHeightM: 1.1,
  kerbs: true,
  startLine: true,
  treesPer100m: 14,
  treeBandM: 70,
  treeScale: { min: 0.8, max: 1.5 },
}

export const CIRCUIT_LIMITS = {
  lengthM: { min: 800, max: 20000 },
  widthM: { min: 8, max: 24 },
} as const

export function createCircuitConfig(
  overrides: Partial<CircuitConfig> = {},
): CircuitConfig {
  const c = { ...DEFAULT_CIRCUIT_CONFIG, ...overrides }
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))
  c.lengthM = clamp(c.lengthM, CIRCUIT_LIMITS.lengthM.min, CIRCUIT_LIMITS.lengthM.max)
  c.widthM = clamp(c.widthM, CIRCUIT_LIMITS.widthM.min, CIRCUIT_LIMITS.widthM.max)
  c.twistiness = clamp(c.twistiness, 0, 1)
  c.gravelM = clamp(c.gravelM, 0, 40)
  c.runoffM = clamp(c.runoffM, c.gravelM, 80)
  c.seed = Math.trunc(c.seed) | 0
  return c
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
