import { useSyncExternalStore } from "react"
import type { CarSpec } from "./schema"

export interface Tuning {
  gearing: number
  springs: number
  rearBias: number
  downforce: number
  gripBias: number
}

export const STOCK_TUNING: Tuning = {
  gearing: 1,
  springs: 1,
  rearBias: 1,
  downforce: 1,
  gripBias: 1,
}

export const TUNING_LIMITS: Record<keyof Tuning, [number, number]> = {
  gearing: [0.85, 1.15],
  springs: [0.75, 1.3],
  rearBias: [0.6, 1.6],
  downforce: [0.5, 1.8],
  gripBias: [0.95, 1.05],
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
