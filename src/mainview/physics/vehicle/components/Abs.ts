import type { AbsSpec } from "../../../data/schema"
import { clamp } from "../../math"

/**
 * Anti-lock braking. Each wheel's brake pressure is modulated in a closed loop
 * on its own lock slip: released while the wheel is past the target, held while
 * it recovers, and rebuilt once it is back near the grip peak.
 */
export class Abs {
  /** Share of the requested brake pressure each wheel gets, 0..1. */
  private readonly pressure: number[]

  constructor(
    private readonly p: AbsSpec,
    /** Starts from the car's spec; the driver can switch it at runtime. */
    public enabled: boolean,
    wheelCount: number,
  ) {
    this.pressure = Array.from({ length: wheelCount }, () => 1)
  }

  reset() {
    this.pressure.fill(1)
  }

  /** Some wheel is having its brake pressure cut. */
  get active(): boolean {
    return this.enabled && this.pressure.some((p) => p < 1)
  }

  /** Brake pressure fraction currently let through at one wheel (1 = untouched). */
  pressureAt(wheel: number): number {
    return this.pressure[wheel]
  }

  /**
   * @param wheelSpeed wheel rim speed along the wheel heading (m/s)
   * @param groundSpeed patch speed along the same heading (m/s)
   */
  modulate(
    wheel: number,
    base: number,
    brakeInput: number,
    wheelSpeed: number,
    groundSpeed: number,
    dt: number,
  ): number {
    const p = this.p
    if (!this.enabled || !(brakeInput > p.brakeMin) || !(Math.abs(groundSpeed) > p.minSpeed)) {
      this.pressure[wheel] = 1
      return base
    }
    const lock = clamp(1 - wheelSpeed / groundSpeed, 0, 1)
    let pr = this.pressure[wheel]
    if (lock > p.slipTarget) pr -= p.releaseRate * dt
    else if (lock < p.slipTarget * p.reapplyFraction) pr += p.applyRate * dt
    this.pressure[wheel] = clamp(pr, 0, 1)
    return base * this.pressure[wheel]
  }
}
