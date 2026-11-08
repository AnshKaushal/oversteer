import type { AbsSpec } from "../../../data/schema"
import { clamp } from "../../math"

export class Abs {
  private readonly pressure: number[]

  constructor(
    private readonly p: AbsSpec,
    public enabled: boolean,
    wheelCount: number,
  ) {
    this.pressure = Array.from({ length: wheelCount }, () => 1)
  }

  reset() {
    this.pressure.fill(1)
  }

  get active(): boolean {
    return this.enabled && this.pressure.some((p) => p < 1)
  }

  pressureAt(wheel: number): number {
    return this.pressure[wheel]
  }

  modulate(
    wheel: number,
    base: number,
    brakeInput: number,
    wheelSpeed: number,
    groundSpeed: number,
    dt: number,
  ): number {
    const p = this.p
    if (
      !this.enabled ||
      !(brakeInput > p.brakeMin) ||
      !(Math.abs(groundSpeed) > p.minSpeed)
    ) {
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
