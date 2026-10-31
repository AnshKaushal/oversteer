import type { Differential as DiffSpec } from "../../../data/schema"
import { clamp } from "../../math"

/** Splits one axle's torque between its left and right wheel. */
export class Differential {
  /** Torque moved to the slower wheel last step (Nm), for telemetry. */
  lastTransfer = 0

  constructor(private readonly p: DiffSpec) {}

  /** Transfer cap for this axle torque: how much the diff may bias. */
  private cap(axleTorque: number): number {
    const p = this.p
    if (p.type === "locked") return Math.abs(axleTorque)
    const ratio = axleTorque >= 0 ? p.lsdAccelLock : p.lsdDecelLock
    return p.preloadTorque + ratio * Math.abs(axleTorque)
  }

  /** Returns [left, right] torque for an axle torque and both wheel speeds. */
  split(axleTorque: number, omegaL: number, omegaR: number): [number, number] {
    const half = axleTorque / 2
    if (this.p.type === "open") {
      this.lastTransfer = 0
      return [half, half]
    }
    const cap = this.cap(axleTorque)
    const want = this.p.lockStiffness * (omegaL - omegaR)
    // positive: left is faster, so torque moves from left to right
    const t = clamp(want, -cap, cap)
    this.lastTransfer = t
    return [half - t / 2, half + t / 2]
  }

  reset() {
    this.lastTransfer = 0
  }
}
