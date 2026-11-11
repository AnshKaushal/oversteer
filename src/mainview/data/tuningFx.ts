import { Engine } from "../physics/vehicle/components/Engine"
import type { CarSpec } from "./schema"
import { applyTuning, type Tuning } from "./tuning"

const G = 9.81
const RPM_TO_RAD = (2 * Math.PI) / 60

export interface PerfEstimate {
  /** 0-100 km/h in seconds (null if the car never gets there). */
  zeroTo100: number | null
  topKmh: number
}

/**
 * Straight-line estimate from the engine map, the (tuned) gear ratios, drag,
 * downforce and a traction cap. It is not the full physics sim, but it moves
 * with the same inputs, so it shows which way a tuning change pushes the car.
 */
export function estimatePerformance(car: CarSpec): PerfEstimate {
  const p = car.physics
  const eng = new Engine(p.engine)
  const tr = p.transmission
  const m = p.mass.chassis + 2 * (p.mass.frontWheel + p.mass.rearWheel)
  const R = p.wheels.radius
  const eff = Math.min(1, Math.max(0.5, p.drivetrain.efficiency || 0.9))
  const a = p.aero
  const crr = p.wheels.rollingResist < 0.1 ? p.wheels.rollingResist : 0.012
  // Under power the rear axle carries more of the weight.
  const split = p.drivetrain.frontTorqueSplit
  const share = split * 0.5 + (1 - split) * 0.62
  let v = 0.5
  let t = 0
  let gear = 1
  let t100: number | null = null
  let shiftLeft = 0
  const dt = 0.01
  while (t < 90) {
    const rpmOf = (g: number) =>
      ((v / R) * tr.gearRatios[g - 1] * tr.finalDriveRatio) / RPM_TO_RAD
    const down = a.downforceAt100kmh * Math.pow(v / (100 / 3.6), 2) + m * G
    const traction = p.wheels.frictionMu * down * share
    // Take the highest gear that still delivers (nearly) the best usable
    // force; being traction-limited makes taller gears just as good.
    const forces: number[] = []
    let maxF = -1
    for (let g = 1; g <= tr.gearRatios.length; g++) {
      const rpm = Math.max(p.engine.idleRPM * 1.4, rpmOf(g))
      if (rpm > p.engine.redlineRPM) {
        forces.push(-1)
        continue
      }
      const f = Math.min(
        (eng.fullPedalTorque(rpm) *
          tr.gearRatios[g - 1] *
          tr.finalDriveRatio *
          eff) /
          R,
        traction,
      )
      forces.push(f)
      maxF = Math.max(maxF, f)
    }
    if (maxF < 0) break
    let best = gear
    for (let g = tr.gearRatios.length; g >= 1; g--) {
      if (forces[g - 1] >= maxF * 0.97) {
        best = g
        break
      }
    }
    // Never downshift unless the current gear is out of revs.
    if (best !== gear && (best > gear || forces[gear - 1] < 0)) {
      gear = best
      shiftLeft = tr.shiftTimeAuto
    }
    const rpm = Math.max(p.engine.idleRPM * 1.4, rpmOf(gear))
    let drive = Math.min(
      (eng.fullPedalTorque(rpm) *
        tr.gearRatios[gear - 1] *
        tr.finalDriveRatio *
        eff) /
        R,
      traction,
    )
    const shifting = shiftLeft > 0
    if (shifting) {
      drive = 0
      shiftLeft -= dt
    }
    const drag = 0.5 * a.airDensity * a.dragCoefficient * a.frontalArea * v * v
    const acc = (drive - drag - crr * m * G) / m
    if (acc < 0.02 && !shifting && v > 5) break
    v += acc * dt
    t += dt
    if (t100 === null && v >= 100 / 3.6) t100 = t
  }
  return { zeroTo100: t100, topKmh: v * 3.6 }
}

const stockCache = new Map<string, PerfEstimate>()
function stockPerf(car: CarSpec): PerfEstimate {
  let e = stockCache.get(car.id)
  if (!e) stockCache.set(car.id, (e = estimatePerformance(car)))
  return e
}

export interface TunedStats {
  zeroTo100: number
  topKmh: number
}

/**
 * The car's listed 0-100 and top speed, moved by how much the tuning changes
 * the straight-line estimate. At stock tuning this is exactly the listed
 * figure, so the spec board and the tuning board always agree.
 */
export function tunedStats(car: CarSpec, t: Tuning): TunedStats {
  const base = stockPerf(car)
  const listed = {
    zeroTo100: car.tested.zeroToHundredS,
    topKmh: car.tested.topSpeedKmh,
  }
  if (Object.values(t).every((v) => Math.abs(v - 1) < 1e-6)) return listed
  const tuned = estimatePerformance(applyTuning(car, t))
  const z =
    base.zeroTo100 && tuned.zeroTo100 ? tuned.zeroTo100 / base.zeroTo100 : 1
  return {
    zeroTo100: listed.zeroTo100 * z,
    topKmh: listed.topKmh * (tuned.topKmh / base.topKmh),
  }
}

export interface TuneEffects extends TunedStats {
  stockZeroTo100: number
  stockTopKmh: number
  /** Percent change against stock. */
  gripPct: number
  /** -1 (planted) .. +1 (loose rear). */
  balance: number
}

export function tuneEffects(car: CarSpec, t: Tuning): TuneEffects {
  const tuned = tunedStats(car, t)
  return {
    ...tuned,
    stockZeroTo100: car.tested.zeroToHundredS,
    stockTopKmh: car.tested.topSpeedKmh,
    gripPct: (t.gripBias - 1 + (t.downforce - 1) * 0.05) * 100,
    balance: Math.max(-1, Math.min(1, (t.rearBias - 1) / 0.6)),
  }
}

export const TUNE_PRESETS: { id: string; label: string; t: Tuning }[] = [
  {
    id: "stock",
    label: "Stock",
    t: { gearing: 1, springs: 1, rearBias: 1, downforce: 1, gripBias: 1 },
  },
  {
    id: "grip",
    label: "Grip",
    t: {
      gearing: 1.05,
      springs: 1.15,
      rearBias: 0.8,
      downforce: 1.5,
      gripBias: 1.03,
    },
  },
  {
    id: "drift",
    label: "Drift",
    t: {
      gearing: 1.08,
      springs: 0.9,
      rearBias: 1.45,
      downforce: 0.7,
      gripBias: 0.97,
    },
  },
  {
    id: "speed",
    label: "Top speed",
    t: {
      gearing: 0.88,
      springs: 1.1,
      rearBias: 1,
      downforce: 0.55,
      gripBias: 1,
    },
  },
]
