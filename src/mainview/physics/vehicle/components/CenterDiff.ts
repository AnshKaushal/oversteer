import type { CenterDiffSpec } from "../../../data/schema"
import { clamp } from "../../math"

/**
 * Sets the front share of drive torque on an AWD car from front and rear axle
 * speed. Without a spec the split stays at the car's fixed `frontTorqueSplit`.
 * Torque is biased toward the slower axle, as a viscous coupling or active
 * clutch does; an active unit reaches its target through an actuator lag.
 */
export class CenterDiff {
  /** Front share used last step, for telemetry. */
  share: number

  constructor(
    private readonly p: CenterDiffSpec | undefined,
    private readonly baseShare: number,
  ) {
    this.share = baseShare
  }

  /** Front torque share 0..1 for the current axle speeds. */
  step(dt: number, omegaFront: number, omegaRear: number): number {
    const p = this.p
    if (!p) return this.baseShare
    const target = clamp(
      this.baseShare + p.lockStiffness * (Math.abs(omegaRear) - Math.abs(omegaFront)),
      p.minFrontShare,
      p.maxFrontShare,
    )
    this.share =
      p.type === "active" ? this.share + (target - this.share) * Math.min(1, dt * p.responseRate) : target
    return this.share
  }

  reset() {
    this.share = this.baseShare
  }
}
