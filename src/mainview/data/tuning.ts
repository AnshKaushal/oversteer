import { useSyncExternalStore } from "react"
import type { CarSpec } from "./schema"

export interface Tuning {
  gearing: number
  springs: number
  rearBias: number
  downforce: number
  gripBias: number
  /** Engine output (ECU / boost map). */
  power: number
  /** Rear-diff lock: power and coast lock rate, preload. */
  diffLock: number
  /** Damper rate on top of the spring-linked damping. */
  damping: number
  /** Overall brake force. */
  brakeForce: number
  /** >1 shifts braking forward, <1 rearward. */
  brakeBias: number
  /** Steering lock. */
  steerAngle: number
  /** Camber/toe: 1 = stock, each 0.1 = ALIGN_DEG/10 degrees of change. */
  camberFront: number
  camberRear: number
  toeFront: number
  toeRear: number
  /** Drift assist: <1 lets drifts run wider and longer, >1 corrects sooner. */
  driftAssist: number
}

/** Degrees of alignment change per 1.0 of slider offset. */
export const ALIGN_DEG = { camber: 3, toe: 0.4 }

export const STOCK_TUNING: Tuning = {
  gearing: 1,
  springs: 1,
  rearBias: 1,
  downforce: 1,
  gripBias: 1,
  power: 1,
  diffLock: 1,
  damping: 1,
  brakeForce: 1,
  brakeBias: 1,
  steerAngle: 1,
  camberFront: 1,
  camberRear: 1,
  toeFront: 1,
  toeRear: 1,
  driftAssist: 1,
}

export const TUNING_LIMITS: Record<keyof Tuning, [number, number]> = {
  gearing: [0.85, 1.15],
  springs: [0.75, 1.3],
  rearBias: [0.6, 1.6],
  downforce: [0.5, 1.8],
  gripBias: [0.95, 1.05],
  power: [0.7, 1.3],
  diffLock: [0.2, 2],
  damping: [0.6, 1.7],
  brakeForce: [0.6, 1.3],
  brakeBias: [0.8, 1.2],
  steerAngle: [0.85, 1.2],
  camberFront: [0.5, 1.5],
  camberRear: [0.5, 1.5],
  toeFront: [0.5, 1.5],
  toeRear: [0.5, 1.5],
  driftAssist: [0.4, 1.2],
}

const KEY = "oversteer_tuning"

function clampTuning(t: Partial<Tuning>): Tuning {
  const out = { ...STOCK_TUNING }
  for (const k of Object.keys(STOCK_TUNING) as (keyof Tuning)[]) {
    const v = Number(t[k])
    if (Number.isFinite(v))
      out[k] = Math.min(TUNING_LIMITS[k][1], Math.max(TUNING_LIMITS[k][0], v))
  }
  return out
}

export function loadTuning(carId: string): Tuning {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    return clampTuning(all?.[carId] ?? {})
  } catch {
    return { ...STOCK_TUNING }
  }
}

export function saveTuning(carId: string, t: Tuning) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    all[carId] = t
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
  subs.forEach((f) => f())
}

const subs = new Set<() => void>()
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))
const snaps = new Map<string, { key: string; t: Tuning }>()
function snapshot(carId: string): Tuning {
  const t = loadTuning(carId)
  const key = JSON.stringify(t)
  let c = snaps.get(carId)
  if (!c || c.key !== key) snaps.set(carId, (c = { key, t }))
  return c.t
}
/** The saved tuning for a car; every board using it updates together. */
export const useTuning = (carId: string) =>
  useSyncExternalStore(subscribe, () => snapshot(carId))

export function applyTuning(car: CarSpec, tuning: Tuning): CarSpec {
  const t = clampTuning(tuning)
  if (Object.keys(t).every((k) => t[k as keyof Tuning] === 1)) return car
  const c = structuredClone(car)
  const p = c.physics
  p.transmission.finalDriveRatio *= t.gearing
  const s = p.wheels.suspension
  for (const a of [s.front, s.rear]) {
    a.springRate *= t.springs
    a.bumpDamping *= Math.sqrt(t.springs)
    a.reboundDamping *= Math.sqrt(t.springs)
  }
  s.antiRollBarRear *= t.rearBias
  s.antiRollBarFront /= Math.sqrt(t.rearBias)
  p.aero.downforceAt100kmh *= t.downforce
  p.aero.dragCoefficient *= 1 + (t.downforce - 1) * 0.15
  p.wheels.frictionMu *= t.gripBias
  for (const a of [s.front, s.rear]) {
    a.bumpDamping *= t.damping
    a.reboundDamping *= t.damping
  }
  p.engine.maxTorqueNm *= t.power
  const d = p.differential
  if (d.type === "lsd") {
    d.lsdAccelLock = Math.min(1, d.lsdAccelLock * t.diffLock)
    d.lsdDecelLock = Math.min(1, d.lsdDecelLock * t.diffLock)
    d.preloadTorque *= t.diffLock
  }
  const bf = p.wheels.brakeForce
  const bias = Math.sqrt(t.brakeBias)
  bf.front *= t.brakeForce * bias
  bf.rear *= t.brakeForce / bias
  p.wheels.steering.maxAngle *= t.steerAngle
  const bs = p.assists.bodyStability
  bs.driftDeadzoneScale = 1 + (1 - t.driftAssist) * 1.4
  bs.driftAuthorityScale = t.driftAssist
  const al = p.wheels.alignment
  al.front.camberDeg += (t.camberFront - 1) * ALIGN_DEG.camber
  al.rear.camberDeg += (t.camberRear - 1) * ALIGN_DEG.camber
  al.front.toeDeg += (t.toeFront - 1) * ALIGN_DEG.toe
  al.rear.toeDeg += (t.toeRear - 1) * ALIGN_DEG.toe
  return c
}

export interface GearPoint {
  gear: number
  kmhAtRedline: number
}

export function gearSpeeds(car: CarSpec, t: Tuning): GearPoint[] {
  const p = car.physics
  const fd = p.transmission.finalDriveRatio * t.gearing
  return p.transmission.gearRatios.map((r, i) => ({
    gear: i + 1,
    kmhAtRedline:
      ((p.engine.redlineRPM * 2 * Math.PI) / 60) *
      (p.wheels.radius / (r * fd)) *
      3.6,
  }))
}

export function powerCurve(
  car: CarSpec,
): { rpm: number; nm: number; kw: number }[] {
  const e = car.physics.engine
  return e.torqueCurve
    .filter(([rpm]) => rpm <= e.redlineRPM)
    .map(([rpm, f]) => {
      const nm = f * e.maxTorqueNm
      return { rpm, nm, kw: (nm * rpm) / 9549 }
    })
}
