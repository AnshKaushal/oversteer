import type { Assists } from "../../../data/schema"
import { clamp, lerp } from "../../math"

export interface TractionInput {
  handbrake: boolean
  launching: boolean
  launchArmed: boolean
  clutchDumping: boolean
  slipRatioAvg: number
}

/**
 * Two actions on spinning driven wheels, whatever the steering or body angle is,
 * so a slide is the driver's to hold: `factor` cuts engine torque on the average
 * slip, `brakeFraction` brakes the one wheel that spins, which also moves torque
 * across an open differential.
 */
export class TractionControl {
  constructor(
    private readonly gain: Assists["tractionControl"],
    private readonly p: Assists["traction"],
  ) {}

  factor(i: TractionInput): number {
    const p = this.p
    const gain =
      (i.handbrake ? 0 : this.gain) *
      (i.launching
        ? p.gainLaunching
        : i.launchArmed
          ? 0
          : i.clutchDumping
            ? p.gainDumping
            : 1)
    if (!(i.slipRatioAvg > p.slipStart)) return 1
    const cut = clamp((i.slipRatioAvg - p.slipStart) / p.slipRange, 0, 1)
    const maxCut = i.launching
      ? p.maxCutLaunching
      : i.clutchDumping
        ? p.maxCutDumping
        : p.maxCutNormal
    return lerp(1, 1 - Math.min(maxCut, gain * p.gainMultiplier), cut)
  }

  get brakeDriveShare(): number {
    return this.p.brakeDriveShare
  }

  /** Share of the axle's brake torque to put on one driven wheel (0..1). */
  brakeFraction(wheelSpeed: number, groundSpeed: number, direction: 1 | -1): number {
    const p = this.p
    const slip = (direction * (wheelSpeed - groundSpeed)) / Math.max(Math.abs(groundSpeed), p.slipSpeedFloor)
    if (!(slip > p.brakeSlipStart)) return 0
    return Math.min(p.brakeMaxFraction, p.brakeGain * (slip - p.brakeSlipStart))
  }
}
