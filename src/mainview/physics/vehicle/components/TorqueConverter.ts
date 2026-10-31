import type { Transmission } from "../../../data/schema"
import { clamp } from "../../math"

/** Torque multiplication that fades out as the converter locks up. */
export class TorqueConverter {
  constructor(private readonly p: Transmission["torqueConverter"]) {}

  multiplier(inGear: boolean, speedKmh: number): number {
    if (!inGear) return 1
    return (
      1 +
      (this.p.stallMultiplication - 1) *
        clamp(1 - speedKmh / this.p.lockupSpeedKmh, 0, 1)
    )
  }
}
