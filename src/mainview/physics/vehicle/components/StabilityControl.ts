import type { Assists } from "../../../data/schema"
import { RAD_PER_DEG } from "../../../data/units"
import { WORLD } from "../../../data/world"
import { clamp } from "../../math"

export interface StabilityInput {
  dt: number
  fwdSpeed: number
  groundedWheels: number
  handbrake: boolean
  steerAngle: number
  downforceAccel: number
  beta: number
  yawRate: number
  launchActive: boolean
}

export interface StabilityWheel {
  front: boolean
  left: boolean
}

export class StabilityControl {
  readonly pressure: number[]
  engineFactor = 1
  private readonly wheelbase: number
  private readonly gradient: number
  private readonly lateralLimit: number
  private readonly gripFraction: number
  private readonly frictionMu: number

  constructor(
    private readonly p: Assists["stability"],
    private readonly wheels: readonly StabilityWheel[],
    wheelbase: number,
    frictionMu: number,
  ) {
    this.pressure = wheels.map(() => 0)
    this.wheelbase = wheelbase
    this.gradient = (p.understeerDegPerG * RAD_PER_DEG) / WORLD.gravity
    this.gripFraction = p.gripFraction
    this.frictionMu = frictionMu
    this.lateralLimit = p.gripFraction * frictionMu * WORLD.gravity
  }

  gripScale(wheelSpeed: number, groundSpeed: number): number {
    const limit = this.p.wheelSlipLimit
    const lock = 1 - wheelSpeed / Math.max(groundSpeed, Number.EPSILON)
    return clamp(1 - (lock - limit) / limit, 0, 1)
  }

  get intervening(): boolean {
    return this.pressure.some((p) => p > this.p.indicateFraction)
  }

  reset() {
    this.pressure.fill(0)
    this.engineFactor = 1
  }

  referenceYaw(
    steerAngle: number,
    fwdSpeed: number,
    downforceAccel = 0,
  ): number {
    const r =
      (fwdSpeed * steerAngle) /
      (this.wheelbase + this.gradient * fwdSpeed * fwdSpeed)
    const limit =
      (this.lateralLimit +
        this.gripFraction * this.frictionMu * downforceAccel) /
      Math.max(Math.abs(fwdSpeed), Number.EPSILON)
    return clamp(r, -limit, limit)
  }

  step(i: StabilityInput) {
    const p = this.p
    const target = this.wheels.map(() => 0)
    const active =
      i.fwdSpeed > p.minSpeed &&
      i.groundedWheels >= p.minGroundedWheels &&
      !i.handbrake &&
      !i.launchActive
    if (active) {
      const ref = this.referenceYaw(i.steerAngle, i.fwdSpeed, i.downforceAccel)
      const yawErr = i.yawRate - ref
      const intent = clamp(Math.abs(ref) / p.yawDeadzone, 0, 1)
      const yawExcess =
        Math.sign(yawErr) *
        Math.max(0, Math.abs(yawErr) - p.yawDeadzone * intent)
      const betaExcess =
        Math.sign(i.beta) *
        Math.max(0, Math.abs(i.beta) - p.betaDeadzone * intent)
      const demand = -p.yawGain * yawExcess - p.betaGain * betaExcess
      if (demand !== 0) {
        const turn = Math.sign(Math.abs(ref) > p.yawDeadzone ? ref : i.yawRate)
        const oversteer = demand * turn < 0
        const left = demand > 0
        const amount = Math.min(
          p.maxBrakeFraction,
          Math.abs(demand) * (oversteer ? 1 : p.understeerScale),
        )
        this.wheels.forEach((w, wi) => {
          if (w.left === left && w.front === oversteer) target[wi] = amount
        })
      }
    }
    let peak = 0
    for (let wi = 0; wi < target.length; wi++) {
      const diff = target[wi] - this.pressure[wi]
      const step = (diff > 0 ? p.pressureRiseRate : p.pressureFallRate) * i.dt
      this.pressure[wi] += clamp(diff, -step, step)
      peak = Math.max(peak, this.pressure[wi])
    }
    this.engineFactor = 1 - Math.min(p.maxEngineCut, p.engineCutGain * peak)
  }
}
