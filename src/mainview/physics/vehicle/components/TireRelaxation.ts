import type { ContactSpec } from "../../../data/schema"

/** Contact patch deflection of one wheel (m), along and across the wheel. */
export interface PatchDeflection {
  ux: number
  uy: number
}

/**
 * Stretched-string contact patch. The patch deflects with the slip speed and
 * relaxes as the wheel rolls over its relaxation length, so slip builds up
 * over the distance rolled. Unlike a slip ratio divided by ground speed it
 * stays finite and stable at a standstill, which is why no speed floor is
 * needed in the slip definition.
 */
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

  /**
   * Advances one wheel. `slipSpeedX` is wheel surface speed minus ground speed
   * along the wheel, `slipSpeedY` the sideways ground speed, `rollSpeed` the
   * ground speed along the wheel. Returns slip ratio and slip-angle tangent.
   */
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
