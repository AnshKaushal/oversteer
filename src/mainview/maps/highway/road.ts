import type { LinearRoad } from "../types"

export function roadCenterX(s: number): number {
  return Math.sin(s * 0.004) * 60 + Math.sin(s * 0.0013 + 1.7) * 120
}
export function roadYaw(s: number): number {
  const dx = (roadCenterX(s + 4) - roadCenterX(s - 4)) / 8
  return Math.atan2(dx, 1)
}

export function roadDirYaw(s: number): number {
  return -roadYaw(s)
}

const ARC_STEP = 5
export const ROAD_PERIOD = (2 * Math.PI * 40) / 0.004
let arcTable: Float64Array | null = null
let periodArc = 0

function roadSlope(s: number): number {
  return (roadCenterX(s + 2) - roadCenterX(s - 2)) / 4
}

function buildArcTable(): Float64Array {
  const n = Math.ceil(ROAD_PERIOD / ARC_STEP) + 2
  const t = new Float64Array(n)
  let acc = 0
  for (let i = 1; i < n; i++) {
    const sMid = (i - 0.5) * ARC_STEP
    const fp = roadSlope(sMid)
    acc += Math.sqrt(1 + fp * fp) * ARC_STEP
    t[i] = acc
  }
  periodArc = roadArcLength0(ROAD_PERIOD, t)
  return t
}

function roadArcLength0(c: number, tab: Float64Array): number {
  const f = c / ARC_STEP
  const i = Math.floor(f)
  const t = f - i
  return tab[i] + (tab[i + 1] - tab[i]) * t
}

export function roadArcLength(s: number): number {
  if (!arcTable) arcTable = buildArcTable()
  const k = Math.floor(s / ROAD_PERIOD)
  return k * periodArc + roadArcLength0(s - k * ROAD_PERIOD, arcTable)
}

export function roadGapM(a: number, b: number): number {
  return roadArcLength(a) - roadArcLength(b)
}

export const highwayRoad: LinearRoad = {
  spawnPose(s, lateral) {
    const y = roadYaw(s)
    return {
      x: roadCenterX(s) + Math.cos(y) * lateral,
      z: -s + Math.sin(y) * lateral,
      yaw: roadDirYaw(s),
    }
  },
  nearestPose(_x, z) {
    const s = -z
    return { x: roadCenterX(s), z, yaw: roadDirYaw(s) }
  },
  centerX: roadCenterX,
  yaw: roadYaw,
  dirYaw: roadDirYaw,
  arcLength: roadArcLength,
  gapM: roadGapM,
}
