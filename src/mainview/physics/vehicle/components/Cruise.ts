import type { CruiseSpec } from "../../../data/schema"
import { clamp } from "../../math"

export interface CruiseButtons {
  togglePressed: boolean
  setPressed: boolean
  upPressed: boolean
}

export interface CruiseState {
  speedKmh: number
  fwdSpeed: number
  gear: number
  brake: number
  handbrake: boolean
  parkingBrake: boolean
}

/**
 * Cruise control. Set locks a speed, brake/handbrake/park pause it, driver
 * throttle always wins, and a PI controller injects pedal input otherwise.
 */
export class Cruise {
  active = false
  targetKmh: number | null = null
  private trim = 0
  private pulling = false

  constructor(
    private readonly p: CruiseSpec,
    private readonly maxKmh: number,
  ) {}

  /** Buttons and automatic pausing. Runs before pedal injection. */
  handleButtons(b: CruiseButtons, s: CruiseState) {
    const p = this.p
    if (this.active) {
      if (
        s.brake > p.pauseBrake ||
        s.handbrake ||
        s.parkingBrake ||
        s.gear < 1 ||
        s.fwdSpeed < p.pauseReverseSpeed ||
        s.speedKmh < p.pauseMinKmh
      ) {
        this.active = false
      }
    }
    if (b.togglePressed) {
      if (this.active) this.active = false
      else if (this.targetKmh !== null) this.active = true
    }
    if (b.setPressed) {
      if (this.active && this.targetKmh !== null) {
        this.targetKmh = Math.max(p.minSetKmh, this.targetKmh - 1)
      } else if (!this.active && s.speedKmh >= p.minSetKmh) {
        this.targetKmh = Math.round(s.speedKmh)
        this.active = true
      }
    }
    if (b.upPressed) {
      if (this.active && this.targetKmh !== null) {
        this.targetKmh = Math.min(this.maxKmh, this.targetKmh + 1)
      } else if (
        !this.active &&
        this.targetKmh !== null &&
        s.speedKmh >= p.minSetKmh
      ) {
        this.active = true
      }
    }
  }

  /** Returns pedal values after cruise injection. */
  inject(
    dt: number,
    throttle: number,
    brake: number,
    speedKmh: number,
    gear: number,
  ): { throttle: number; brake: number } {
    const p = this.p
    if (this.active && this.targetKmh !== null && gear >= 1) {
      const err = this.targetKmh - speedKmh
      const overridden = throttle > p.overrideThrottle
      if (overridden) this.pulling = true
      if (!overridden && err >= p.resumeError) this.pulling = false
      if (!overridden) {
        const raw = err * p.throttleGain + this.trim
        const u = clamp(raw, 0, p.throttleMax)
        // Anti-windup: only integrate while the output can still move.
        if ((u < p.throttleMax || err < 0) && (u > 0 || err > 0)) {
          this.trim = clamp(this.trim + err * dt * p.trimGain, p.trimMin, p.trimMax)
        }
        const cruiseBrake =
          raw < p.brakeDeadband && !this.pulling
            ? clamp(-raw * p.brakeGain - p.brakeOffset, 0, p.brakeMax)
            : 0
        return {
          throttle: Math.max(throttle, u),
          brake: Math.max(brake, cruiseBrake),
        }
      }
    } else if (this.pulling || this.trim !== 0) {
      this.trim = 0
      this.pulling = false
    }
    return { throttle, brake }
  }

  reset() {
    this.active = false
    this.targetKmh = null
    this.trim = 0
    this.pulling = false
  }
}
