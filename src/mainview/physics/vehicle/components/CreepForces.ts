import type { CreepSpec } from "../../../data/schema"
import { clamp } from "../../math"

export interface CreepInput {
  gear: number
  driven: boolean
  drivenCount: number
  throttle: number
  brake: number
  fwdSpeed: number
  /** Longitudinal patch speed of this wheel (m/s). */
  slipSpeed: number
  speedKmh: number
  engineFriction: number
  gearRatio: number
  efficiency: number
  wheelRadius: number
  /** Converter creep, the standstill hold and engine drag all need a running engine. */
  engineOn: boolean
}

/**
 * Engine braking off the throttle. Creep itself is not modelled here: it
 * emerges from the clutch / converter drag at the governed idle rpm.
 */
export class CreepForces {
  constructor(private readonly p: CreepSpec) {}

  /** Force on one wheel along its heading (N). */
  force(i: CreepInput): number {
    if (!i.engineOn) return 0
    const p = this.p
    let f = 0
    if (
      i.driven &&
      i.throttle < p.idleThrottle &&
      i.gear >= 1 &&
      Math.abs(i.slipSpeed) > p.coastMinSlipSpeed
    ) {
      const lockup = clamp(
        (i.speedKmh - p.coastLockupStartKmh) / p.coastLockupRangeKmh,
        0,
        1,
      )
      const coast =
        (i.engineFriction * i.gearRatio * i.efficiency * lockup * p.coastShare) /
        2 /
        i.wheelRadius
      f += clamp(-Math.sign(i.slipSpeed) * coast, -p.coastMax, p.coastMax)
    }
    return f
  }
}
