import type { BrakesSpec, Wheels } from "../../../data/schema"
import { clamp } from "../../math"

export interface BrakeContext {
  /** Wheel index and spin, used for the heat model. */
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

/** Service, hand and parking brake torque per wheel (before ABS). */
export class Brakes {
  /** Electronic parking brake. Engaged at spawn. */
  parking = true

  /** Rotor temperature per wheel (deg C), only moves on cars with `fade`. */
  readonly temps: number[]

  constructor(
    private readonly p: BrakesSpec,
    private readonly wheels: Pick<Wheels, "brakeForce" | "handbrakeForce">,
    wheelCount: number,
  ) {
    this.temps = Array.from({ length: wheelCount }, () => p.fade?.ambientC ?? 0)
  }

  /** Brake torque left after heat: 1 when cool, `minFraction` when fully faded. */
  private fadeFactor(temp: number): number {
    const f = this.p.fade
    if (!f) return 1
    const k = clamp((temp - f.fadeStartC) / (f.fadeEndC - f.fadeStartC), 0, 1)
    return 1 - k * (1 - f.minFraction)
  }

  /** Heats the rotor by the work done and cools it toward ambient. */
  private heat(c: BrakeContext, service: number) {
    const f = this.p.fade
    if (!f) return
    const i = c.wheelIndex
    const cool = (f.coolBase + f.coolPerKmh * c.speedKmh) * (this.temps[i] - f.ambientC)
    this.temps[i] += ((service * Math.abs(c.omega)) / f.heatCapacity - cool) * c.dt
  }

  /** Service brake torque of a cool wheel on this axle (N m). */
  maxTorque(front: boolean): number {
    return front ? this.wheels.brakeForce.front : this.wheels.brakeForce.rear
  }

  reset() {
    for (let i = 0; i < this.temps.length; i++) this.temps[i] = this.p.fade?.ambientC ?? 0
  }

  /** Throttle past the release threshold lets the parking brake go. */
  releaseOnThrottle(throttle: number) {
    if (throttle > this.p.parkingReleaseThrottle) this.parking = false
  }

  torque(c: BrakeContext): number {
    const p = this.p
    const max = c.front
      ? this.wheels.brakeForce.front
      : this.wheels.brakeForce.rear
    let base: number
    if (c.reverse) {
      base = c.brake * max * this.fadeFactor(this.temps[c.wheelIndex])
      this.heat(c, base)
    } else {
      const hbLock = c.handbrake && !c.front
      const hb = hbLock ? this.wheels.handbrakeForce : 0
      const service = c.brake * max * this.fadeFactor(this.temps[c.wheelIndex])
      this.heat(c, service)
      base = service + hb
    }
    if (this.parking) base = Math.max(base, p.parkingTorque)
    return base
  }
}
