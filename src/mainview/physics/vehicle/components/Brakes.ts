import type { BrakesSpec, Wheels } from "../../../data/schema"
import { clamp } from "../../math"

export interface BrakeContext {
  wheelIndex: number
  omega: number
  dt: number
  front: boolean
  reverse: boolean
  brake: number
  handbrake: boolean
  steer: number
  throttle: number
  speedKmh: number
}

const HANDBRAKE_LOCK = 20
const HANDBRAKE_LOCK_FROM = 5
const HANDBRAKE_LOCK_SPAN = 10

export class Brakes {
  parking = true

  readonly temps: number[]

  constructor(
    private readonly p: BrakesSpec,
    private readonly wheels: Pick<Wheels, "brakeForce" | "handbrakeForce">,
    wheelCount: number,
  ) {
    this.temps = Array.from({ length: wheelCount }, () => p.fade?.ambientC ?? 0)
  }

  private fadeFactor(temp: number): number {
    const f = this.p.fade
    if (!f) return 1
    const k = clamp((temp - f.fadeStartC) / (f.fadeEndC - f.fadeStartC), 0, 1)
    return 1 - k * (1 - f.minFraction)
  }

  private heat(c: BrakeContext, service: number) {
    const f = this.p.fade
    if (!f) return
    const i = c.wheelIndex
    const cool =
      (f.coolBase + f.coolPerKmh * c.speedKmh) * (this.temps[i] - f.ambientC)
    this.temps[i] +=
      ((service * Math.abs(c.omega)) / f.heatCapacity - cool) * c.dt
  }

  maxTorque(front: boolean): number {
    return front ? this.wheels.brakeForce.front : this.wheels.brakeForce.rear
  }

  reset() {
    for (let i = 0; i < this.temps.length; i++)
      this.temps[i] = this.p.fade?.ambientC ?? 0
  }

  releaseOnThrottle(throttle: number) {
    if (throttle > this.p.parkingReleaseThrottle) this.parking = false
  }

  torque(c: BrakeContext): number {
    const p = this.p
    const max = c.front
      ? this.wheels.brakeForce.front
      : this.wheels.brakeForce.rear
    const lock = clamp(
      (c.speedKmh - HANDBRAKE_LOCK_FROM) / HANDBRAKE_LOCK_SPAN,
      0,
      1,
    )
    const hb =
      c.handbrake && !c.front
        ? this.wheels.handbrakeForce * (1 + (HANDBRAKE_LOCK - 1) * lock)
        : 0
    const service = c.brake * max * this.fadeFactor(this.temps[c.wheelIndex])
    this.heat(c, service)
    let base = service + hb
    if (this.parking) base = Math.max(base, p.parkingTorque)
    return base
  }
}
