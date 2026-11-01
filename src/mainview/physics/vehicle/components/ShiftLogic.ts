import type { Engine, ShiftLogicSpec, Transmission } from "../../../data/schema"
import { curveLookup, lerp } from "../../math"

/**
 * Upshift rpm per gear, from where the next gear delivers at least as much
 * wheel torque as the current one. Index 0 is 1st. Gears never shift above
 * `ceiling`, and the top gear always gets the ceiling.
 */
export function optimalUpshiftRpms(
  engine: Pick<Engine, "idleRPM" | "torqueCurve">,
  ratios: readonly number[],
  ceiling: number,
  stepRpm: number,
): number[] {
  return ratios.map((ratio, g) => {
    if (g === ratios.length - 1) return ceiling
    const next = ratios[g + 1]
    for (let rpm = engine.idleRPM; rpm < ceiling; rpm += stepRpm) {
      const now = curveLookup(engine.torqueCurve, rpm) * ratio
      const after = curveLookup(engine.torqueCurve, (rpm * next) / ratio) * next
      if (after >= now) return rpm
    }
    return ceiling
  })
}

export interface ShiftInput {
  dt: number
  gear: number
  gearCount: number
  rpm: number
  throttle: number
  /** Quadratic driver aggression, 0..1. */
  aggressionCoef: number
  speedKmh: number
  autoMode: boolean
  shifting: boolean
  changeDelayActive: boolean
  launchArmed: boolean
  limiterCut: boolean
  /** TC or stability control is cutting torque right now. */
  assistCutting: boolean
  slipRatioAvg: number
  lateralVelocity: number
  /** Rpm the driven wheels would impose in a given forward gear. */
  predictedRpm: (gear: number) => number
}

/**
 * Automatic gear selection. Shift points come from the engine's idle and
 * redline and the driver's aggression; returns how many gears to change
 * (0 for none). Executing the shift is the gearbox's job.
 */
export class ShiftLogic {
  /** Seconds left of a kickdown wind-up, 0 if none. */
  kickdownTimer = 0
  private kickdownTarget: number | null = null
  private lastGear = 0
  private sinceUpshift = Infinity
  /** Seconds rpm has stayed over the upshift point in the current gear. */
  private overRevTime = 0
  /** Computed upshift rpm per gear, used when the car gives no override. */
  readonly optimal: number[]

  constructor(
    private readonly p: ShiftLogicSpec,
    private readonly engine: Pick<Engine, "idleRPM" | "redlineRPM" | "torqueCurve">,
    private readonly autoUpshiftRpm: Transmission["autoUpshiftRPM"],
    gearRatios: readonly number[],
  ) {
    this.optimal = optimalUpshiftRpms(
      engine,
      gearRatios,
      engine.redlineRPM - p.upMargin,
      p.optimalScanStepRpm,
    )
  }

  /** Upshift rpm that forces a shift in this gear. */
  private upLimit(gear: number): number {
    const redline = this.engine.redlineRPM
    const pick = this.autoUpshiftRpm ?? this.optimal[Math.max(0, gear - 1)]
    return Math.min(pick, redline - this.p.upMargin)
  }

  /** Throttle lifted or braking: drop any pending kickdown. */
  cancelIfRelaxed(throttle: number, brake: number) {
    if (throttle < this.p.cancelThrottle || brake > this.p.cancelBrake) {
      this.kickdownTimer = 0
      this.kickdownTarget = null
    }
  }

  decide(i: ShiftInput): number {
    const p = this.p
    const idle = this.engine.idleRPM
    const redline = this.engine.redlineRPM
    this.sinceUpshift = i.gear > this.lastGear && this.lastGear > 0 ? 0 : this.sinceUpshift + i.dt
    this.lastGear = i.gear
    const highUp = this.upLimit(i.gear)
    const lowUp = Math.round(idle + (highUp - idle) * p.lowUpFraction)
    const lowDown = Math.max(
      Math.round(idle * p.lowDownIdleFactor),
      idle + p.lowDownIdleAdd,
    )
    const highDown = Math.round(lowDown + (highUp - lowDown) * p.highDownFraction)
    const upRpm = lerp(lowUp, highUp, i.aggressionCoef)
    const downRpm = Math.min(
      lerp(lowDown, highDown, i.aggressionCoef),
      upRpm / p.hysteresis,
    )

    const slipping = i.slipRatioAvg > p.slipLimit
    const heavySlide = Math.abs(i.lateralVelocity) > p.slideLimit
    const antiStall =
      i.gear > 1 && (i.rpm < idle * p.antiStallRpmFactor || i.speedKmh < p.antiStallKmh)

    if (
      !(i.autoMode && !i.shifting && (!i.changeDelayActive || antiStall) && i.gear >= 1)
    )
      return 0

    if (antiStall) return 1 - i.gear

    // Revs flare past the shift point in 1st under wheelspin; make the box wait
    // so the engine hits the limiter and stutters before 2nd goes in.
    // In any gear, keep holding while the wheels are spinning, up to a cap so a
    // burnout or slide cannot pin the box forever; shift once grip returns.
    // TC/ESC keep slip high and pull revs back under the shift point, so the
    // slip hold would never release; leave shifting to the assists then.
    const hold = slipping && !i.assistCutting
      ? (p.slipShiftHoldMax ?? 1)
      : i.gear === 1
        ? (p.firstGearHold ?? 0.45)
        : 0
    // decay rather than reset: assists dip rpm under the point for a frame
    this.overRevTime = i.rpm > upRpm ? this.overRevTime + i.dt : Math.max(0, this.overRevTime - i.dt)

    if (
      i.rpm > upRpm &&
      i.gear < i.gearCount &&
      !i.launchArmed &&
      i.speedKmh > p.upshiftMinKmh
    ) {
      if (this.overRevTime < hold) return 0
      const forced = i.rpm >= highUp || i.limiterCut
      return (!slipping || forced) && !heavySlide ? 1 : 0
    }

    if (
      i.gear > 1 &&
      this.sinceUpshift >= p.kickdownAfterUpshift &&
      i.rpm < upRpm - p.kickdownRpmMargin &&
      ((i.throttle > p.kickdownThrottleAggressive &&
        i.aggressionCoef > p.kickdownAggression) ||
        i.throttle > p.kickdownThrottleFull)
    ) {
      return this.kickdown(i, idle, redline)
    }

    if (i.rpm < downRpm && i.gear > 1) {
      let target = i.gear - 1
      for (let g = i.gear - 1; g >= 1; g--) {
        const pred = i.predictedRpm(g)
        if (pred < upRpm - p.downPreferredMargin) {
          if (pred >= downRpm + p.downPreferredLow) {
            target = g
            break
          }
          target = g
        }
      }
      return target < i.gear ? target - i.gear : 0
    }
    return 0
  }

  /** Scan up from 1st for the lowest gear that does not over-rev. */
  private kickdown(i: ShiftInput, idle: number, redline: number): number {
    const p = this.p
    const headroom = Math.max(
      p.kickdownHeadroomMin,
      (redline - idle) * p.kickdownHeadroomFraction,
    )
    const maxSafe = redline - headroom
    let found: number | null = null
    for (let g = 1; g < i.gear; g++) {
      const pred = i.predictedRpm(g)
      if (pred < maxSafe && pred >= idle * p.kickdownMinRpmFactor) {
        found = g
        break
      }
    }
    if (found !== null && found < i.gear) {
      if (this.kickdownTimer <= 0 && this.kickdownTarget === null) {
        this.kickdownTarget = found
        this.kickdownTimer = p.kickdownDelay
      }
      this.kickdownTarget = found
      this.kickdownTimer -= i.dt
      if (this.kickdownTimer <= 0) {
        this.kickdownTarget = null
        this.kickdownTimer = 0
        return found - i.gear
      }
      return 0
    }
    this.kickdownTarget = null
    this.kickdownTimer = 0
    return 0
  }

  reset() {
    this.lastGear = 0
    this.sinceUpshift = Infinity
    this.overRevTime = 0
    this.kickdownTimer = 0
    this.kickdownTarget = null
  }
}
