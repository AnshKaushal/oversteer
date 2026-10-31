import type { LaunchSpec } from "../../../data/schema"
import { SECONDS_PER_MINUTE, TWO_PI } from "../../../data/units"

/**
 * Launch control and clutch dump state: armed on the line, launching until
 * the drivetrain catches up with the target rpm, plus the clutch-dump timer.
 */
export class Launch {
  enabled = true
  armed = false
  launching = false
  dumpTimer = 0
  private timer = 0

  constructor(
    private readonly p: LaunchSpec,
    /** Engine speed held while armed (rpm). */
    readonly targetRpm: number,
  ) {}

  /** Armed when stopped in 1st with throttle and brake both held. */
  arm(atStandstill: boolean, gear: number, throttle: number, brake: number) {
    this.armed =
      this.enabled &&
      atStandstill &&
      gear === 1 &&
      throttle > this.p.armThrottle &&
      brake > this.p.armBrake
  }

  step(dt: number, gear: number, throttle: number, coupledRpm: number) {
    const p = this.p
    if (this.armed) this.timer = p.holdTime
    else if (this.timer > 0) this.timer -= dt
    if (this.dumpTimer > 0) this.dumpTimer -= dt
    this.launching =
      !this.armed &&
      this.timer > 0 &&
      throttle > p.activeThrottle &&
      gear === 1 &&
      coupledRpm < this.targetRpm * p.syncFraction
  }

  get dumping(): boolean {
    return this.dumpTimer > 0
  }

  /** Brief rpm bog as the clutch bites, early in a launch. */
  bogDrop(): number {
    const p = this.p
    const elapsed = p.holdTime - this.timer
    if (elapsed >= p.bogDuration) return 0
    return Math.sin((elapsed / p.bogDuration) * Math.PI) * p.bogDepth
  }

  /** Wobble applied to rpm while armed and held at the target. */
  wobble(simTime: number): number {
    return Math.sin(simTime * this.p.wobbleFrequency) * this.p.wobbleAmplitude
  }

  /** Neutral-to-1st at high rpm. Returns rpm and wheel-spin to apply. */
  startDump(prevRpm: number, idleRpm: number, firstRatio: number) {
    const p = this.p
    this.dumpTimer = p.dumpTime
    const bite = Math.min(p.dumpBiteMax, prevRpm * p.dumpBiteFraction)
    const rpm = Math.max(prevRpm - bite, idleRpm * p.dumpMinRpmFactor)
    const spinOmega = ((rpm / SECONDS_PER_MINUTE) * TWO_PI) / firstRatio
    return { rpm, wheelOmega: spinOmega * p.dumpSpinFraction }
  }

  dumpTriggers(prevGear: number, gear: number, prevRpm: number, idleRpm: number) {
    return (
      prevGear === 0 && gear === 1 && prevRpm > idleRpm * this.p.dumpTriggerRpmFactor
    )
  }

  reset() {
    this.armed = false
    this.launching = false
    this.dumpTimer = 0
    this.timer = 0
  }
}
