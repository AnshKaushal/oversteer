export const RED_FROM_RPM = 6750
export const MAX_RPM = 8000
export const MAX_KMH = 340

export type Side = "left" | "right"
export type Kind = "speed" | "rpm"

export const S = 200
export const R_RIM = 190
export const R_PROG = 185
export const R_BAND = 185
export const R_TICK = 185
export const R_LABEL = 150
export const R_HUB = 135
export const START = 6
export const END = 84
export const N_BASE = R_HUB - 20
export const N_END = R_TICK - 2
export const NEEDLE_HALF_BASE = 7
export const NEEDLE_HALF_TIP = 0.6

export const SANS =
  'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'

export const BLUE = "#5fb4ff"
export const AMBER = "#ffb020"
export const RED = "#ff3b30"
export const OFF = "#3a4350"

export const ang = (frac: number) =>
  START + Math.max(0, Math.min(1, frac)) * (END - START)

export function pt(side: Side, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  const dx = r * Math.cos(a)
  return { x: side === "left" ? dx : S - dx, y: S - r * Math.sin(a) }
}

export function arc(side: Side, r: number, d0: number, d1: number) {
  const p0 = pt(side, r, d0)
  const p1 = pt(side, r, d1)
  const sweep = side === "left" ? 0 : 1
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 ${sweep} ${p1.x} ${p1.y}`
}

export function sector(side: Side, r: number) {
  const cx = side === "left" ? 0 : S
  const p0 = pt(side, r, 0)
  const p1 = pt(side, r, 90)
  const sweep = side === "left" ? 0 : 1
  return `M ${cx} ${S} L ${p0.x} ${p0.y} A ${r} ${r} 0 0 ${sweep} ${p1.x} ${p1.y} Z`
}

export const ease = (x: number) => x * x * (3 - 2 * x)
