import type { Differential as DiffSpec } from "../../../data/schema"
import { clamp } from "../../math"

export class Differential {
  lastTransfer = 0

  constructor(private readonly p: DiffSpec) {}

  private cap(axleTorque: number): number {
    const p = this.p
    if (p.type === "locked") return Math.abs(axleTorque)
    const ratio = axleTorque >= 0 ? p.lsdAccelLock : p.lsdDecelLock
    return p.preloadTorque + ratio * Math.abs(axleTorque)
  }

  split(axleTorque: number, omegaL: number, omegaR: number): [number, number] {
    const half = axleTorque / 2
    if (this.p.type === "open") {
      this.lastTransfer = 0
      return [half, half]
    }
    const cap = this.cap(axleTorque)
    const want = this.p.lockStiffness * (omegaL - omegaR)
    const t = clamp(want, -cap, cap)
    this.lastTransfer = t
    return [half - t / 2, half + t / 2]
  }

  reset() {
    this.lastTransfer = 0
  }
}
