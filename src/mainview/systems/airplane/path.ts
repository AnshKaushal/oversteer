import { roadCenterX, roadYaw } from "../WorldManager"
import {
  TARGET_SPAN,
  PASS_LENGTH,
  TAKEOFF_START_D,
  LANDING_START_D,
  TAKEOFF_ROLL,
  TAKEOFF_LIFTOFF_D,
  TAKEOFF_ACCEL,
  TAKEOFF_GRADIENT,
  TAKEOFF_EASE,
  CRUISE_ALT,
  SUN_SHADOW_X,
  SUN_SHADOW_Z,
  DEG,
  LANDING_TOUCH_D,
  LANDING_HILL_MARGIN,
  LANDING_SLOPE,
  LANDING_FLARE,
  LANDING_TOUCH_SPEED,
  LANDING_DECEL,
} from "./constants"
import { FlybyMode, TerrainAt, FlightPath, Profile } from "./types"

export function profileFor(
  mode: FlybyMode,
  _u: number,
  rolled = 0,
  d = 0,
): Profile {
  if (mode === "takeoff") {
    const roll = Math.max(0, d - TAKEOFF_START_D)
    const x = d - TAKEOFF_LIFTOFF_D
    const liftSpeed = Math.sqrt(9 + 2 * TAKEOFF_ACCEL * TAKEOFF_ROLL)
    const t = Math.min(1, Math.max(0, x / TAKEOFF_EASE))
    const gain =
      x <= 0
        ? 0
        : x < TAKEOFF_EASE
          ? TAKEOFF_GRADIENT * TAKEOFF_EASE * (t * t * t - (t * t * t * t) / 2)
          : TAKEOFF_GRADIENT * (TAKEOFF_EASE / 2 + (x - TAKEOFF_EASE))
    const climb = Math.atan(TAKEOFF_GRADIENT * (t * t * (3 - 2 * t)))
    const r = Math.min(1, Math.max(0, (x + 90) / 90))
    const rotate = r * r * (3 - 2 * r)
    return {
      y: gain,
      speed:
        x <= 0
          ? Math.sqrt(9 + 2 * TAKEOFF_ACCEL * roll)
          : liftSpeed + 8 * Math.min(1, x / 700),
      pitch: 6 * DEG * rotate + climb * 0.8,
    }
  }
  if (mode === "landing") {
    const k = Math.min(1, Math.max(0, d / LANDING_TOUCH_D))
    const v0 = LANDING_TOUCH_SPEED
    const speed =
      rolled > 0
        ? Math.sqrt(Math.max(0, v0 * v0 - 2 * LANDING_DECEL * rolled))
        : 58 - (58 - v0) * k
    const r = Math.max(0, -rolled)
    const y =
      r >= LANDING_FLARE
        ? LANDING_SLOPE * (r - LANDING_FLARE / 2)
        : (LANDING_SLOPE * r * r) / (2 * LANDING_FLARE)
    return { y, speed, pitch: 0 }
  }
  return {
    y: CRUISE_ALT,
    speed: 56,
    pitch: 0,
  }
}

export function makePath(
  sCross: number,
  theta: number,
  side: 1 | -1,
  drift: 1 | -1,
  length = PASS_LENGTH,
): FlightPath {
  const yaw = roadYaw(sCross)
  const nx = Math.cos(yaw)
  const nz = Math.sin(yaw)
  const tx = Math.sin(yaw)
  const tz = -Math.cos(yaw)
  const sn = Math.sin(theta)
  const cs = Math.cos(theta)
  return {
    x: roadCenterX(sCross),
    z: -sCross,
    dx: side * (sn * nx + drift * cs * tx),
    dz: side * (sn * nz + drift * cs * tz),
    length,
    theta,
  }
}

export interface PassState {
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  speed: number
}

export function passState(
  mode: FlybyMode,
  traveled: number,
  path: FlightPath,
  age: number,
  speedFactor = 1,
  belly = 0,
): PassState {
  const u = Math.max(0, Math.min(1, traveled / path.length))
  const pr = profileFor(mode, u, traveled - LANDING_TOUCH_D, traveled)
  const along = traveled - path.length / 2
  const x = path.x + along * path.dx
  const z = path.z + along * path.dz

  const y =
    mode === "landing" || mode === "takeoff"
      ? belly + pr.y
      : pr.y + Math.sin(age * 0.9) * 0.5

  return {
    x,
    y,
    z,
    heading: Math.atan2(path.dx, path.dz),
    pitch: pr.pitch,
    speed: pr.speed * speedFactor,
  }
}

export interface ShadowState {
  x: number
  y: number
  z: number
  span: number
  length: number
  heading: number
  alpha: number
}

export function shadowState(
  st: PassState,
  terrainAt?: TerrainAt,
  span = TARGET_SPAN,
  slope = { x: SUN_SHADOW_X, z: SUN_SHADOW_Z },
): ShadowState {
  const h = Math.max(0, st.y)
  const x = st.x + h * slope.x
  const z = st.z + h * slope.z
  const ground = terrainAt ? terrainAt(x, z) : 0
  return {
    x,
    y: ground + 0.06,
    z,
    span: span * (1 + h * 0.012),
    length: span * 0.9 * (1 + h * 0.012),
    heading: st.heading,
    alpha: 0.5 / (1 + h * 0.03),
  }
}

export function pathBlocked(
  path: FlightPath,
  mode: FlybyMode,
  terrainAt: TerrainAt,
  span = TARGET_SPAN,
  clearance = 6,
  extra = 0,
): boolean {
  const total = path.length + extra
  const start = mode === "landing" ? LANDING_START_D : 0
  const reach = total - start
  const samples = Math.max(16, Math.round(reach / 15))
  const half = span / 2
  const px = -path.dz
  const pz = path.dx
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const d = start + u * reach
    const along = d - path.length / 2
    const x = path.x + along * path.dx
    const z = path.z + along * path.dz
    const y = profileFor(
      mode,
      Math.min(1, Math.max(0, d / path.length)),
      d - LANDING_TOUCH_D,
      d,
    ).y
    const limit =
      mode === "landing"
        ? Math.max(0.3, y - LANDING_HILL_MARGIN)
        : mode === "takeoff"
          ? Math.max(0.3, y - clearance)
          : y - clearance
    if (terrainAt(x, z) > limit) return true
    if (half > 0) {
      if (terrainAt(x + px * half, z + pz * half) > limit) return true
      if (terrainAt(x - px * half, z - pz * half) > limit) return true
    }
  }
  return false
}

export function pickCrossing(
  base: number,
  mode: FlybyMode,
  pathFor: (s: number) => FlightPath,
  terrainAt: TerrainAt,
  carS: number,
  minLead: number,
  span = TARGET_SPAN,
  clearance = 6,
  extra = 0,
  alsoBlocked?: (s: number) => boolean,
): number {
  const offsets = [
    0, 70, -70, 140, -140, 210, -210, 300, -300, 400, -400, 520, -520,
  ]
  for (const off of offsets) {
    const s = base + off
    const ahead = s - carS
    if (minLead >= 0 ? ahead < minLead : ahead > minLead) continue
    if (
      !pathBlocked(pathFor(s), mode, terrainAt, span, clearance, extra) &&
      !alsoBlocked?.(s)
    )
      return s
  }
  return -1
}
