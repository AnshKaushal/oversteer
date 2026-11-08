import type { CenterDiffSpec } from "../../../data/schema"
import { clamp } from "../../math"

export class CenterDiff {
  share: number

  constructor(
    private readonly p: CenterDiffSpec | undefined,
    private readonly baseShare: number,
  ) {
    this.share = baseShare
  }

  step(dt: number, omegaFront: number, omegaRear: number): number {
    const p = this.p
    if (!p) return this.baseShare
    const target = clamp(
      this.baseShare +
        p.lockStiffness * (Math.abs(omegaRear) - Math.abs(omegaFront)),
      p.minFrontShare,
      p.maxFrontShare,
    )
    this.share =
      p.type === "active"
        ? this.share + (target - this.share) * Math.min(1, dt * p.responseRate)
        : target
    return this.share
  }

  reset() {
    this.share = this.baseShare
  }
}
