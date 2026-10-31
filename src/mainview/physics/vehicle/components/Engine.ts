import type { Engine as EngineSpec } from "../../../data/schema"
import { clamp, curveLookup, smoothstep } from "../../math"
import { SECONDS_PER_MINUTE, TWO_PI, WATT_PER_HP } from "../../../data/units"
import { Turbo } from "./Turbo"

export interface RpmInput {
  dt: number
  simTime: number
  gear: number
  throttle: number
  fwdSpeed: number
  /** Gear change in progress: the clutch is open and no torque flows. */
  shifting: boolean
  /** Rpm where the clutch or converter capacity equals full-pedal torque (its stall speed). */
  flareRpm: number
  /** Rpm the driven wheels impose in the current gear. */
  coupledRpm: number
  launchArmed: boolean
  launching: boolean
  /** Rpm bog while the clutch bites at launch. */
  launchBog: number
  /** Engine speed held while launch control is armed. */
  launchRpm: number
  /** Wobble added while armed and held at the target. */
  launchWobble: number
  clutchDumping: boolean
  /** Seconds left of a kickdown wind-up, 0 if none. */
  kickdownTimer: number
  airborne: boolean
}

/** Engine speed and torque: rpm model, limiter, torque curve, friction. */
export class Engine {
  rpm: number
  limiterCut = false
  /** True while the clutch or converter slips: engine speed above what the wheels impose. */
  slipping = false
  /** Engine has died: no torque until the starter brings it back. */
  stalled = false
  private starterT = 0
  private starting = false
  /** Most torque (Nm) the clutch or converter can pass now; Infinity when locked. */
  clutchCapacity = Infinity
  /** Torque (Nm) the idle governor adds to hold idle against clutch or converter drag. */
  governorTorque = 0
  private readonly turbo: Turbo | null

  constructor(private readonly p: EngineSpec) {
    this.rpm = p.idleRPM
    this.turbo = p.turbo ? new Turbo(p.turbo) : null
  }

  /** Turbo boost 0..1, or 0 on a naturally aspirated engine. */
  get boost(): number {
    return this.turbo ? this.turbo.boost : 0
  }

  get turbocharged(): boolean {
    return this.turbo !== null
  }

  frictionTorque(): number {
    return this.p.frictionTorqueBase + this.rpm * this.p.frictionTorqueRPMFactor
  }

  /** Most rpm the engine can gain in dt with no load: torque over inertia. */
  private freeRevRise(throttle: number, dt: number): number {
    const p = this.p
    const net =
      p.maxTorqueNm *
        curveLookup(p.torqueCurve, this.rpm) *
        curveLookup(p.throttleMap, throttle) *
        (this.turbo ? this.turbo.torqueFactor() : 1) -
      this.frictionTorque()
    return Math.max(0, (net / p.engineInertia) * dt * (SECONDS_PER_MINUTE / TWO_PI))
  }

  /** Advances rpm toward what the clutch, launch and throttle demand. */
  stepRpm(c: RpmInput) {
    const p = this.p
    const d = p.dynamics
    const idle = p.idleRPM
    this.governorTorque = 0
    if (this.stalled) {
      this.stepStalled(c)
      return
    }
    if (c.gear === 0) {
      const target = idle + c.throttle * (p.redlineRPM - idle) * d.neutralRevFraction
      if (target > this.rpm) {
        const want = (target - this.rpm) * Math.min(1, c.dt * d.neutralRiseRate)
        this.rpm += Math.min(want, this.freeRevRise(c.throttle, c.dt))
      } else {
        const excess = Math.max(0, this.rpm - idle)
        const decay =
          d.neutralDecayBase +
          d.neutralDecayExtra * Math.min(1, excess / d.neutralDecayRefRpm)
        // Revs coast down on friction and pumping losses over inertia; the exponential only
        // sets the soft landing at idle.
        const open = curveLookup(p.throttleMap, c.throttle)
        const loss = this.frictionTorque() + (1 - open) * (p.engineBrakeBase + this.rpm * p.engineBrakeRPMFactor)
        const coast = (loss / p.engineInertia) * c.dt * (SECONDS_PER_MINUTE / TWO_PI)
        const soft = excess * (1 - Math.exp(-decay * c.dt))
        this.rpm -= Math.min(coast, soft)
      }
    } else {
      let target = 0
      let clutched = false
      if (c.launchArmed) {
        target = c.launchRpm
      } else if (c.launching) {
        target = Math.max(c.launchRpm - c.launchBog, c.coupledRpm)
      } else if (c.clutchDumping) {
        target = Math.max(
          this.rpm,
          c.coupledRpm,
          idle + c.throttle * (p.redlineRPM - idle) * d.dumpRevFraction,
        )
      } else if (c.shifting || c.kickdownTimer > 0 || (c.throttle > d.airborneThrottle && c.airborne)) {
        target = Math.max(idle * d.idleFloorFraction, c.coupledRpm)
      } else {
        clutched = true
      }
      if (clutched) {
        this.stepClutch(c)
        this.finish(c)
        return
      }
      this.slipping = false
      this.clutchCapacity = Infinity
      if (c.throttle > d.airborneThrottle && c.gear >= 1 && c.airborne) {
        target = Math.max(target, p.revLimiterRPM - d.airborneMarginRpm)
      }
      if (c.kickdownTimer > 0) {
        const progress = clamp(1 - c.kickdownTimer / d.kickSurgeDuration, 0, 1)
        target += d.kickSurgeBase + progress * d.kickSurgeRamp
      }
      const rate = c.launching
        ? d.rateLaunch
        : c.clutchDumping
          ? d.rateDump
          : c.kickdownTimer > 0
            ? d.rateKickdown
            : d.rateNormal
      this.rpm += (target - this.rpm) * Math.min(1, c.dt * rate)
    }
    this.finish(c)
  }

  /** Dead engine: revs fall away until the driver cranks it (the ignition key). */
  private stepStalled(c: RpmInput) {
    const p = this.p
    this.slipping = true
    this.clutchCapacity = 0
    if (this.starting) this.starterT += c.dt
    if (this.starting && this.starterT >= p.dynamics.restartTime) {
      this.stalled = false
      this.starting = false
      this.starterT = 0
      this.rpm = p.idleRPM
      return
    }
    this.rpm *= Math.exp(-c.dt * p.dynamics.neutralDecayBase)
    this.limiterCut = false
    this.turbo?.step(c.dt, 0, this.rpm)
  }

  /** Engine dies (ground it to a stop); the ignition key brings it back. */
  stall() {
    this.stalled = true
    this.starting = false
  }

  /** Crank torque (Nm) at full pedal at a given rpm, before gearing. */
  fullPedalTorque(rpm: number): number {
    const p = this.p
    return p.maxTorqueNm * curveLookup(p.torqueCurve, rpm) * curveLookup(p.throttleMap, 1)
  }

  /** Ignition key: cranks a dead engine, or switches a running one off. */
  toggleIgnition() {
    if (this.stalled) {
      this.starting = !this.starting
      this.starterT = 0
    } else {
      this.stalled = true
      this.starting = false
    }
  }

  private finish(c: RpmInput) {
    if (c.launchArmed && this.rpm > c.launchRpm) {
      this.rpm = c.launchRpm + c.launchWobble
    }
    this.applyLimiter()
    this.turbo?.step(c.dt, c.throttle, this.rpm)
  }

  /**
   * Torque balance across a slipping clutch or converter. Capacity grows with
   * the square of engine speed (a converter's pump), scaled so it equals
   * full-pedal torque at the flare rpm. The engine gains speed by what it makes
   * beyond that capacity and locks to the wheels when they catch up.
   */
  private stepClutch(c: RpmInput) {
    const p = this.p
    const rad = TWO_PI / SECONDS_PER_MINUTE
    const w = this.rpm * rad
    const wIn = c.coupledRpm * rad
    const floor = p.idleRPM * p.dynamics.idleFloorFraction
    if (w <= wIn) {
      this.lock(c, floor)
      return
    }
    const wf = Math.max(c.flareRpm, p.idleRPM) * rad
    const fullAtFlare = p.maxTorqueNm * curveLookup(p.torqueCurve, wf / rad) * curveLookup(p.throttleMap, 1)
    const pump = (fullAtFlare / (wf * wf)) * w * w
    // Grip builds as the wheels approach engine speed, up to a locked clutch's hold
    const idleW = p.idleRPM * rad
    const lockGain = (p.dynamics.clutchHoldMargin * p.maxTorqueNm) / ((fullAtFlare / (wf * wf)) * idleW * idleW)
    const grip = clamp((wIn / w - p.dynamics.clutchLockStart) / (1 - p.dynamics.clutchLockStart), 0, 1)
    const cap = pump * (1 + lockGain * smoothstep(grip))
    // Idle governor: ramps in as the engine sags from idle toward its floor, so a closed
    // converter (or a slipping clutch in first) settles where drag meets the governor.
    const sag = clamp((p.idleRPM - this.rpm) / (p.idleRPM - floor), 0, 1)
    this.governorTorque = Math.min(cap, p.dynamics.idleHoldFraction * p.maxTorqueNm * sag)
    const te = Math.max(this.torque(c.throttle, c.gear, false), this.governorTorque)
    const next = w + ((te - cap) / p.engineInertia) * c.dt
    if (next <= wIn) {
      this.lock(c, floor)
      return
    }
    this.rpm = Math.max(next / rad, floor)
    this.slipping = true
    this.clutchCapacity = cap
  }

  private lock(c: RpmInput, floor: number) {
    const follow = Math.max(c.coupledRpm, floor)
    this.rpm += (follow - this.rpm) * Math.min(1, c.dt * this.p.dynamics.rateNormal)
    this.slipping = false
    this.clutchCapacity = Infinity
  }

  private applyLimiter() {
    const lim = this.p.revLimiterRPM
    if (this.rpm >= lim) this.limiterCut = true
    else if (this.rpm < lim - this.p.dynamics.limiterHysteresis) this.limiterCut = false
    if (this.rpm > lim) this.rpm = lim
  }

  /** Crank torque (Nm) before traction control, converter and gearing. */
  torque(throttle: number, gear: number, shifting: boolean): number {
    const p = this.p
    if (this.stalled) return 0
    const open = curveLookup(p.throttleMap, throttle)
    let t = p.maxTorqueNm * curveLookup(p.torqueCurve, this.rpm) * open
    t -= (1 - open) * (p.engineBrakeBase + this.rpm * p.engineBrakeRPMFactor)
    if (this.turbo) t *= this.turbo.torqueFactor()
    t -= this.frictionTorque() * p.dynamics.frictionShare
    if (gear === 0) t = 0
    if (shifting) t *= p.dynamics.shiftCutFraction
    if (this.limiterCut) t = 0
    return t
  }

  /** Rpm after a shift: what the wheels impose, kept inside idle..ceiling. */
  settleAfterShift(coupledRpm: number) {
    if (this.stalled) return
    this.rpm = clamp(
      coupledRpm,
      this.p.idleRPM,
      this.p.redlineRPM - this.p.dynamics.afterShiftCeilingMargin,
    )
  }

  reset() {
    this.rpm = this.p.idleRPM
    this.limiterCut = false
    this.slipping = false
    this.stalled = false
    this.starting = false
    this.starterT = 0
    this.clutchCapacity = Infinity
    this.turbo?.reset()
  }
}

export interface EnginePeaks {
  powerHP: number
  powerRPM: number
  torqueNm: number
  torqueRPM: number
}

/** Peak power and torque, read off the torque curve between idle and redline. */
export function enginePeaks(p: Pick<EngineSpec, "idleRPM" | "redlineRPM" | "maxTorqueNm" | "torqueCurve">): EnginePeaks {
  const out: EnginePeaks = { powerHP: 0, powerRPM: p.idleRPM, torqueNm: 0, torqueRPM: p.idleRPM }
  for (let rpm = p.idleRPM; rpm <= p.redlineRPM; rpm++) {
    const nm = p.maxTorqueNm * curveLookup(p.torqueCurve, rpm)
    const hp = (nm * rpm * (TWO_PI / SECONDS_PER_MINUTE)) / WATT_PER_HP
    if (hp > out.powerHP) {
      out.powerHP = hp
      out.powerRPM = rpm
    }
    if (nm > out.torqueNm) {
      out.torqueNm = nm
      out.torqueRPM = rpm
    }
  }
  return out
}
