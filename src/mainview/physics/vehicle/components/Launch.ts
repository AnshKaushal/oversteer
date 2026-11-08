import type { LaunchSpec } from "../../../data/schema"
import { SECONDS_PER_MINUTE, TWO_PI } from "../../../data/units"

export class Launch {
  enabled = true
  armed = false
  launching = false
  dumpTimer = 0
  private timer = 0

  constructor(
    private readonly p: LaunchSpec,
    readonly targetRpm: number,
  ) {}

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

  bogDrop(): number {
    const p = this.p
    const elapsed = p.holdTime - this.timer
    if (elapsed >= p.bogDuration) return 0
    return Math.sin((elapsed / p.bogDuration) * Math.PI) * p.bogDepth
  }

  wobble(simTime: number): number {
    return Math.sin(simTime * this.p.wobbleFrequency) * this.p.wobbleAmplitude
  }

  startDump(prevRpm: number, idleRpm: number, firstRatio: number) {
    const p = this.p
    this.dumpTimer = p.dumpTime
    const bite = Math.min(p.dumpBiteMax, prevRpm * p.dumpBiteFraction)
    const rpm = Math.max(prevRpm - bite, idleRpm * p.dumpMinRpmFactor)
    const spinOmega = ((rpm / SECONDS_PER_MINUTE) * TWO_PI) / firstRatio
    return { rpm, wheelOmega: spinOmega * p.dumpSpinFraction }
  }

  dumpTriggers(
    prevGear: number,
    gear: number,
    prevRpm: number,
    idleRpm: number,
  ) {
    return (
      prevGear === 0 &&
      gear === 1 &&
      prevRpm > idleRpm * this.p.dumpTriggerRpmFactor
    )
  }

  reset() {
    this.armed = false
    this.launching = false
    this.dumpTimer = 0
    this.timer = 0
  }
}
