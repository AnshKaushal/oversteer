import type { AutoDirectionSpec } from "../../../data/schema"
import type { GearAccess } from "../types"

export interface DirectionInput {
  dt: number
  fwdSpeed: number
  /** Pedals as the driver pressed them, before any swap or injection. */
  throttle: number
  brake: number
  handbrake: boolean
}

/**
 * Automatic direction changes at a standstill: hold brake in 1st to go
 * 1 -> N -> R, hold throttle in R to go R -> N -> 1, and a pedal in N picks
 * the matching gear.
 */
export class DirectionShift {
  private reverseHold = 0
  private reversePending = false
  private reverseTimer = 0
  private forwardHold = 0
  private forwardPending = false
  private forwardTimer = 0

  constructor(private readonly p: AutoDirectionSpec) {}

  step(g: GearAccess, i: DirectionInput) {
    const p = this.p
    const standstill = Math.abs(i.fwdSpeed) < p.standstillSpeed
    const brakeOn = i.brake > p.brakePress && !i.handbrake
    const throttleOn = i.throttle > p.throttlePress

    // 1 -> N -> R
    if (standstill && g.gear === 1 && brakeOn && i.throttle < p.pedalRelease) {
      this.reverseHold += i.dt
      if (this.reverseHold > p.holdTime && g.shiftTimer <= 0 && !this.reversePending) {
        g.gear = 0
        g.shiftTimer = 0
        this.reverseHold = 0
        this.reversePending = true
        this.reverseTimer = p.neutralTime
      }
    } else if (!this.reversePending) {
      this.reverseHold = 0
    }
    if (this.reversePending) {
      if (g.gear === 0) {
        if (throttleOn) {
          g.gear = 1
          this.reversePending = false
          this.reverseTimer = 0
        } else if (brakeOn) {
          this.reverseTimer -= i.dt
          if (this.reverseTimer <= 0 && g.shiftTimer <= 0) {
            g.gear = -1
            this.reversePending = false
            this.reverseTimer = 0
          }
        } else {
          this.reversePending = false
          this.reverseTimer = 0
        }
      } else {
        this.reversePending = false
        this.reverseTimer = 0
      }
    }

    // R -> N -> 1
    if (
      Math.abs(i.fwdSpeed) < p.reverseExitSpeed &&
      g.gear === -1 &&
      throttleOn &&
      i.brake < p.pedalRelease
    ) {
      this.forwardHold += i.dt
      if (this.forwardHold > p.holdTime && g.shiftTimer <= 0 && !this.forwardPending) {
        g.gear = 0
        g.shiftTimer = 0
        this.forwardHold = 0
        this.forwardPending = true
        this.forwardTimer = p.neutralTime
      }
    } else if (!this.forwardPending) {
      this.forwardHold = 0
    }
    if (this.forwardPending) {
      if (g.gear === 0) {
        if (brakeOn) {
          g.gear = -1
          this.forwardPending = false
          this.forwardTimer = 0
        } else if (throttleOn) {
          this.forwardTimer -= i.dt
          if (this.forwardTimer <= 0 && g.shiftTimer <= 0) {
            g.gear = 1
            this.forwardPending = false
            this.forwardTimer = 0
          }
        } else {
          this.forwardPending = false
          this.forwardTimer = 0
        }
      } else {
        this.forwardPending = false
        this.forwardTimer = 0
      }
    }

    // Neutral: a pedal picks the matching gear.
    if (g.gear === 0 && !this.reversePending && !this.forwardPending) {
      if (brakeOn && i.throttle < p.pedalRelease) g.gear = -1
      else if (throttleOn && i.brake < p.pedalRelease) g.gear = 1
    }
  }

  reset() {
    this.reverseHold = 0
    this.reversePending = false
    this.reverseTimer = 0
    this.forwardHold = 0
    this.forwardPending = false
    this.forwardTimer = 0
  }
}
