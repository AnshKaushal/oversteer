import type { ShiftLogicSpec } from "../../../data/schema"
import { clamp } from "../../math"

export class Aggression {
  value = 0
  private decisionThrottle = 0
  private holdTimer = 0

  constructor(private readonly p: ShiftLogicSpec) {}

  step(dt: number, throttle: number, brake: number, prevThrottle: number) {
    const p = this.p
    const rate = throttle > this.decisionThrottle ? p.decisionRateUp : p.decisionRateDown
    this.decisionThrottle += (throttle - this.decisionThrottle) * Math.min(1, dt * rate)

    const throttleRate = (throttle - prevThrottle) / Math.max(dt, p.minDt)
    const tipIn = throttleRate > p.tipInRate ? p.tipInBonus : 0
    const brakeBonus = brake > p.brakeBonusThreshold ? p.brakeBonus : 0
    const raw = clamp(this.decisionThrottle + tipIn + brakeBonus, 0, 1)

    if (raw >= this.value) {
      this.value += (raw - this.value) * Math.min(1, dt * p.aggressionRise)
      this.holdTimer = p.aggressionHold
    } else if (this.holdTimer > 0) {
      this.holdTimer -= dt
    } else {
      this.value += (raw - this.value) * Math.min(1, dt * p.aggressionDecay)
    }
    this.value = clamp(this.value, 0, 1)
    return this.value * this.value
  }

  reset() {
    this.value = 0
    this.holdTimer = 0
    this.decisionThrottle = 0
  }
}
