import type { ContactSpec, KinematicsSpec } from "../../../data/schema"

export class SlipTracker {
  slipRatioAvg = 0
  rearSlip = 0
  drifting = false
  private total = 0
  private sum = 0
  private count = 0

  constructor(
    private readonly c: ContactSpec,
    private readonly k: KinematicsSpec,
  ) {}

  begin() {
    this.total = 0
    this.sum = 0
    this.count = 0
  }

  addDriven(sx: number) {
    this.total += Math.abs(sx)
    this.sum += sx
    this.count++
  }

  end(dt: number, groundedWheels: number, lateralVelocity: number, speedKmh: number) {
    this.slipRatioAvg +=
      ((groundedWheels > 0 && this.count > 0 ? this.total / this.count : 0) - this.slipRatioAvg) *
      Math.min(1, dt * this.c.slipAverageRate)
    if (this.count > 0) this.rearSlip = this.sum / this.count
    this.drifting =
      Math.abs(lateralVelocity) > this.k.driftLateralSpeed &&
      speedKmh > this.k.driftMinKmh
  }

  reset() {
    this.slipRatioAvg = 0
    this.rearSlip = 0
    this.drifting = false
  }
}
