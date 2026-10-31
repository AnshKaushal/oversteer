import type { TurboSpec } from "../../../data/schema"
import { clamp, curveLookup } from "../../math"

/**
 * Turbocharger lag. The car's torque curve is the fully spooled torque; this
 * holds how far the turbo is from that and returns the torque multiplier.
 */
export class Turbo {
  /** Boost state, 0 (no boost) to 1 (the full-boost torque curve). */
  boost = 0

  constructor(private readonly p: TurboSpec) {}

  step(dt: number, throttle: number, rpm: number) {
    const target =
      throttle > this.p.minThrottle ? throttle * curveLookup(this.p.boostCurve, rpm) : 0
    const rate = target > this.boost ? this.p.spoolUpRate : this.p.spoolDownRate
    this.boost += (target - this.boost) * Math.min(1, dt * rate)
    this.boost = clamp(this.boost, 0, 1)
  }

  /** Fraction of the full-boost torque available right now. */
  torqueFactor(): number {
    return 1 - this.p.boostTorqueShare * (1 - this.boost)
  }

  reset() {
    this.boost = 0
  }
}
