import type { ContactSpec } from "../../../data/schema"

export interface PatchDeflection {
  ux: number
  uy: number
}

export class TireRelaxation {
  readonly patch: PatchDeflection[]

  constructor(
    wheelCount: number,
    private readonly p: ContactSpec,
    private readonly relaxationLength: number,
    private readonly maxSlip: number,
  ) {
    this.patch = Array.from({ length: wheelCount }, () => ({ ux: 0, uy: 0 }))
  }

  step(wi: number, dt: number, slipSpeedX: number, slipSpeedY: number, rollSpeed: number) {
    const d = this.patch[wi]
    const L = this.relaxationLength
    const rate = (Math.abs(rollSpeed) + this.p.relaxationSpeedFloor) / L
    const limit = L * this.maxSlip
    const damp = 1 + dt * rate
    d.ux = Math.max(-limit, Math.min(limit, (d.ux + dt * slipSpeedX) / damp))
    d.uy = Math.max(-limit, Math.min(limit, (d.uy + dt * slipSpeedY) / damp))
    return { slipRatio: d.ux / L, slipTan: d.uy / L }
  }

  zero(wi: number) {
    this.patch[wi].ux = 0
    this.patch[wi].uy = 0
  }

  reset() {
    for (let i = 0; i < this.patch.length; i++) this.zero(i)
  }
}
