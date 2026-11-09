import type { Engine as EngineSpec } from "../../../data/schema"
import { clamp, curveLookup, smoothstep } from "../../math"
import { SECONDS_PER_MINUTE, TWO_PI, WATT_PER_HP } from "../../../data/units"
import { Turbo } from "./Turbo"

const RPM_PER_RADS = SECONDS_PER_MINUTE / TWO_PI
const CYCLIC_VARIATION = 0.06
const WIDE_OPEN = 0.98

export interface RpmInput {
  dt: number
  simTime: number
  gear: number
  throttle: number
  fwdSpeed: number
  shifting: boolean
  flareRpm: number
  coupledRpm: number
  launchArmed: boolean
  launching: boolean
  launchBog: number
  launchRpm: number
  launchWobble: number
  clutchDumping: boolean
  kickdownTimer: number
  airborne: boolean
  canSlip: boolean
}

export class Engine {
  rpm: number
  limiterCut = false
  slipping = false
  stalled = false
  private starterT = 0
  private starting = false
  ignition = true
  sinceCatch = 99
  private crankWobble = 0
  onLimiter = false
  private jitter = 0
  private seed = 0x9e3779b9
  clutchCapacity = Infinity
  governorTorque = 0
  private readonly turbo: Turbo | null

  constructor(private readonly p: EngineSpec) {
    this.rpm = p.idleRPM
    this.turbo = p.turbo ? new Turbo(p.turbo) : null
  }

  get boost(): number {
    return this.turbo ? this.turbo.boost : 0
  }

  get turbocharged(): boolean {
    return this.turbo !== null
  }

  frictionTorque(): number {
    return this.p.frictionTorqueBase + this.rpm * this.p.frictionTorqueRPMFactor
  }

  private freeRevRise(throttle: number, dt: number): number {
    const p = this.p
    const net =
      p.maxTorqueNm *
        curveLookup(p.torqueCurve, this.rpm) *
        curveLookup(p.throttleMap, throttle) *
        (this.turbo ? this.turbo.torqueFactor() : 1) -
      this.frictionTorque()
    return Math.max(
      0,
      (net / p.engineInertia) * dt * (SECONDS_PER_MINUTE / TWO_PI),
    )
  }

  stepRpm(c: RpmInput) {
    const p = this.p
    const d = p.dynamics
    const idle = p.idleRPM
    this.governorTorque = 0
    this.sinceCatch += c.dt
    if (this.stalled) {
      this.stepStalled(c)
      return
    }
    if (c.gear === 0) {
      const wideOpen = curveLookup(p.throttleMap, c.throttle) >= WIDE_OPEN
      const target = wideOpen
        ? p.revLimiterRPM * 1.02
        : idle + c.throttle * (p.redlineRPM - idle) * d.neutralRevFraction
      if (target > this.rpm) {
        const want = (target - this.rpm) * Math.min(1, c.dt * d.neutralRiseRate)
        this.rpm += Math.min(want, this.freeRevRise(c.throttle, c.dt))
      } else {
        const excess = Math.max(0, this.rpm - idle)
        const decay =
          d.neutralDecayBase +
          d.neutralDecayExtra * Math.min(1, excess / d.neutralDecayRefRpm)
        const open = curveLookup(p.throttleMap, c.throttle)
        const loss =
          this.frictionTorque() +
          (1 - open) * (p.engineBrakeBase + this.rpm * p.engineBrakeRPMFactor)
        const coast =
          (loss / p.engineInertia) * c.dt * (SECONDS_PER_MINUTE / TWO_PI)
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
      } else if (
        c.shifting ||
        c.kickdownTimer > 0 ||
        (c.throttle > d.airborneThrottle && c.airborne)
      ) {
        target = Math.max(idle * d.idleFloorFraction, c.coupledRpm)
      } else {
        clutched = true
      }
      if (clutched) {
        this.stepClutch(c)
        this.stepJitter(c)
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
    this.stepJitter(c)
    this.finish(c)
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0
    return (this.seed >>> 0) / 4294967296
  }

  private gauss(): number {
    return (this.random() + this.random() + this.random() - 1.5) * 2
  }

  private stepJitter(c: RpmInput) {
    const free = c.gear === 0 || Math.abs(c.fwdSpeed) < 0.8
    const p = this.p
    let next = 0
    if (free && !this.limiterCut) {
      const cyl = Math.max(1, p.config.cylinders)
      const sigma =
        ((CYCLIC_VARIATION / Math.sqrt(cyl)) *
          this.frictionTorque() *
          RPM_PER_RADS) /
        p.engineInertia
      const settle = p.dynamics.neutralRiseRate * 0.25
      const lowRev = Math.min(1, p.idleRPM / Math.max(this.rpm, 1))
      next =
        this.jitter * Math.exp(-settle * c.dt) +
        sigma * lowRev * Math.sqrt(c.dt) * this.gauss()
    } else {
      next = this.jitter * Math.exp(-c.dt * 12)
    }
    this.rpm += next - this.jitter
    this.jitter = next
  }

  private stepStalled(c: RpmInput) {
    const p = this.p
    this.slipping = true
    this.clutchCapacity = 0
    if (this.starting && this.ignition) {
      this.starterT += c.dt
      if (this.starterT >= this.crankDuration) {
        this.stalled = false
        this.starting = false
        this.starterT = 0
        this.sinceCatch = 0
        this.rpm = p.idleRPM * 2
        return
      }
      this.crankWobble += c.dt * 38
      const ramp = Math.min(1, this.starterT / 0.25)
      const cyl =
        1 +
        0.28 * Math.sin(this.crankWobble) +
        0.12 * Math.sin(this.crankWobble * 2.3)
      const target = 230 * ramp * cyl
      this.rpm += (target - this.rpm) * Math.min(1, c.dt * 14)
      this.limiterCut = false
      this.turbo?.step(c.dt, 0, this.rpm)
      return
    }
    this.rpm *= Math.exp(-c.dt * p.dynamics.neutralDecayBase)
    this.limiterCut = false
    this.turbo?.step(c.dt, 0, this.rpm)
  }

  stall() {
    this.stalled = true
    this.starting = false
  }

  fullPedalTorque(rpm: number): number {
    const p = this.p
    return (
      p.maxTorqueNm *
      curveLookup(p.torqueCurve, rpm) *
      curveLookup(p.throttleMap, 1)
    )
  }

  get cranking(): boolean {
    return this.stalled && this.starting && this.ignition
  }

  get crankTime(): number {
    return this.starterT
  }

  get crankDuration(): number {
    return this.p.dynamics.restartTime + 0.6
  }

  tapIgnition() {
    if (!this.stalled) {
      this.stalled = true
      this.ignition = false
      this.starting = false
      this.starterT = 0
    } else {
      this.ignition = !this.ignition
      this.starting = false
      this.starterT = 0
    }
  }

  holdCrank(held: boolean) {
    if (held) {
      if (!this.stalled || this.starting) return
      this.ignition = true
      this.starting = true
      this.starterT = 0
    } else if (this.starting) {
      this.starting = false
      this.starterT = 0
    }
  }

  private finish(c: RpmInput) {
    if (c.launchArmed && this.rpm > c.launchRpm) {
      this.rpm = c.launchRpm + c.launchWobble
    }
    this.applyLimiter()
    this.turbo?.step(c.dt, c.throttle, this.rpm)
  }

  private stepClutch(c: RpmInput) {
    const p = this.p
    const rad = TWO_PI / SECONDS_PER_MINUTE
    const w = this.rpm * rad
    const wIn = c.coupledRpm * rad
    const floor = p.idleRPM * p.dynamics.idleFloorFraction
    if (w <= wIn || !c.canSlip) {
      this.lock(c, floor)
      return
    }
    const wf = Math.max(c.flareRpm, p.idleRPM) * rad
    const fullAtFlare =
      p.maxTorqueNm *
      curveLookup(p.torqueCurve, wf / rad) *
      curveLookup(p.throttleMap, 1)
    const pump = (fullAtFlare / (wf * wf)) * w * w
    const idleW = p.idleRPM * rad
    const lockGain =
      (p.dynamics.clutchHoldMargin * p.maxTorqueNm) /
      ((fullAtFlare / (wf * wf)) * idleW * idleW)
    const grip = clamp(
      (wIn / w - p.dynamics.clutchLockStart) / (1 - p.dynamics.clutchLockStart),
      0,
      1,
    )
    const cap = pump * (1 + lockGain * smoothstep(grip))
    const sag = clamp((p.idleRPM - this.rpm) / (p.idleRPM - floor), 0, 1)
    this.governorTorque = Math.min(
      cap,
      p.dynamics.idleHoldFraction * p.maxTorqueNm * sag,
    )
    const te = Math.max(
      this.torque(c.throttle, c.gear, false),
      this.governorTorque,
    )
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
    this.rpm +=
      (follow - this.rpm) * Math.min(1, c.dt * this.p.dynamics.rateNormal)
    this.slipping = false
    this.clutchCapacity = Infinity
  }

  private applyLimiter() {
    const p = this.p
    const lim = p.revLimiterRPM
    const hyst = p.dynamics.limiterHysteresis
    if (this.rpm >= lim) this.onLimiter = true
    else if (this.rpm < lim - hyst) this.onLimiter = false
    if (this.rpm >= lim) this.limiterCut = true
    else if (this.rpm < lim - hyst) this.limiterCut = false
    if (this.rpm > lim) this.rpm = lim
  }

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
    this.onLimiter = false
    this.jitter = 0
    this.slipping = false
    this.stalled = false
    this.ignition = true
    this.starting = false
    this.starterT = 0
    this.sinceCatch = 99
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

export function enginePeaks(
  p: Pick<EngineSpec, "idleRPM" | "redlineRPM" | "maxTorqueNm" | "torqueCurve">,
): EnginePeaks {
  const out: EnginePeaks = {
    powerHP: 0,
    powerRPM: p.idleRPM,
    torqueNm: 0,
    torqueRPM: p.idleRPM,
  }
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
