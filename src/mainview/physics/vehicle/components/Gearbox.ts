import type { ShiftLogicSpec, Transmission } from "../../../data/schema"
import { SECONDS_PER_MINUTE, TWO_PI } from "../../../data/units"
import { clamp } from "../../math"
import type { Gear } from "../types"

/**
 * Gear state, ratios and shift timing. Decides nothing: shift logic and
 * the driver ask it to change gear, and it enforces over-rev protection.
 */
export class Gearbox {
  gear: Gear = 1
  shiftTimer = 0
  private changeDelay = 0

  constructor(
    private readonly t: Transmission,
    private readonly l: ShiftLogicSpec,
    private readonly redlineRpm: number,
  ) {}

  get count(): number {
    return this.t.gearRatios.length
  }

  get shifting(): boolean {
    return this.shiftTimer > 0
  }

  get changeDelayActive(): boolean {
    return this.changeDelay > 0
  }

  get label(): string {
    return this.gear === -1 ? "R" : this.gear === 0 ? "N" : String(this.gear)
  }

  tick(dt: number) {
    if (this.shiftTimer > 0) this.shiftTimer -= dt
  }

  tickChangeDelay(dt: number) {
    this.changeDelay = Math.max(0, this.changeDelay - dt)
  }

  /** Overall ratio (gear * final drive) for a gear; 0 in neutral. */
  ratio(gear: number): number {
    if (gear > 0) return this.t.gearRatios[gear - 1] * this.t.finalDriveRatio
    if (gear === -1) return this.t.reverseRatio * this.t.finalDriveRatio
    return 0
  }

  /** Engine rpm the driven wheels would impose in a forward gear. */
  predictedRpm(gear: number, drivenOmega: number): number {
    if (gear <= 0) return 0
    return Math.abs((drivenOmega * this.ratio(gear) * SECONDS_PER_MINUTE) / TWO_PI)
  }

  /** Rpm coupled to the driven wheels in the current gear, unclamped. */
  coupledRpm(drivenOmega: number): number {
    return this.predictedRpm(this.gear, drivenOmega)
  }

  /**
   * Driver paddle/key shift. Returns the previous gear, or null if refused
   * (mid-shift, reverse while moving, over-rev on a downshift).
   */
  manualShift(dir: 1 | -1, fwdSpeed: number, drivenOmega: number): Gear | null {
    if (this.shiftTimer > 0) return null
    const order: Gear[] = [-1, 0]
    for (let g = 1; g <= this.count; g++) order.push(g as Gear)
    const i = order.indexOf(this.gear)
    const j = clamp(i + dir, 0, order.length - 1)
    if (j === i) return null
    const to = order[j]
    if (to === -1 && Math.abs(fwdSpeed) > this.l.manualReverseMaxSpeed) return null
    if (to >= 1 && this.gear === 0 && Math.abs(fwdSpeed) > this.l.manualNeutralMaxSpeed)
      return null
    if (
      to >= 1 &&
      dir < 0 &&
      this.predictedRpm(to, drivenOmega) > this.redlineRpm - this.l.overRevMargin
    )
      return null
    const prev = this.gear
    this.gear = to
    this.shiftTimer = this.t.shiftTimeManual
    this.changeDelay = this.l.changeDelay
    return prev
  }

  /** Automatic shift by `delta` gears. Returns true if the gear changed. */
  autoShift(delta: number, drivenOmega: number): boolean {
    const next = clamp(this.gear + delta, 1, this.count) as Gear
    if (next === this.gear) return false
    if (
      delta < 0 &&
      this.predictedRpm(next, drivenOmega) > this.redlineRpm - this.l.overRevMargin
    )
      return false
    this.gear = next
    this.shiftTimer = this.t.shiftTimeAuto
    this.changeDelay = Math.abs(delta) > 1 ? this.l.changeDelayMulti : this.l.changeDelay
    return true
  }

  reset() {
    this.gear = 1
    this.shiftTimer = 0
    this.changeDelay = 0
  }
}
