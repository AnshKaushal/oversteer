export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function curveLookup(
  curve: readonly (readonly number[])[],
  x: number,
): number {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const [x0, y0] = curve[i - 1]
      const [x1, y1] = curve[i]
      return lerp(y0, y1, (x - x0) / (x1 === x0 ? 1 : x1 - x0))
    }
  }
  return 0
}

export function smoothstep(t: number): number {
  const rest = 1 - t
  return t * t * (1 + rest + rest)
}
