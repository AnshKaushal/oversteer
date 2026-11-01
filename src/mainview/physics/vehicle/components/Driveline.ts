import type { Drivetrain } from "../../../data/schema"

export interface DriveInput {
  dt: number
  gear: number
  gearRatio: number
  engineTorque: number
  converterMultiplier: number
  throttle: number
  speedKmh: number
  launchArmed: boolean
  launching: boolean
  clutchDumping: boolean
  rawPower: boolean
}

export interface DriveOutput {
  total: number
  dir: 1 | -1
  feed: number
}

export class Driveline {
  prevThrottle = 0
  drivenOmega = 0
  private feedT = Infinity
  private prevLaunching = false

  constructor(private readonly p: Drivetrain) {}

  get split(): number {
    return this.p.frontTorqueSplit
  }
  get rearDriven(): boolean {
    return this.p.frontTorqueSplit < 1
  }
  get frontDriven(): boolean {
    return this.p.frontTorqueSplit > 0
  }
  get drivenCount(): number {
    return (this.rearDriven ? 2 : 0) + (this.frontDriven ? 2 : 0)
  }

  isDriven(front: boolean): boolean {
    return front ? this.frontDriven : this.rearDriven
  }

  prepare(i: DriveInput): DriveOutput {
    const p = this.p
    let total = 0
    let dir: 1 | -1 = 1
    let feed = 1
    if (i.gear !== 0) {
      dir = i.gear === -1 ? -1 : 1
      total = i.engineTorque * i.gearRatio * p.efficiency * i.converterMultiplier * dir
      if (i.launchArmed) total = 0
      if (
        i.throttle > p.feedThrottle &&
        this.prevThrottle <= p.feedThrottle &&
        i.speedKmh < p.feedSpeedKmh &&
        i.gear === 1
      ) {
        this.feedT = 0
      }
      if (i.launching && !this.prevLaunching) this.feedT = 0
      this.feedT += i.dt
      this.prevThrottle = i.throttle
      this.prevLaunching = i.launching
      if (dir > 0 && i.gear === 1 && i.throttle > p.feedHoldThrottle && !i.rawPower) {
        feed =
          i.launching || i.clutchDumping
            ? 1.0
            : Math.min(1, p.feedBase + (p.feedRamp * this.feedT) / p.feedTime)
      }
    }
    return { total, dir, feed }
  }

  wheelTorque(
    front: boolean,
    d: DriveOutput,
    gear: number,
    frontShare: number,
  ): number {
    if (!this.isDriven(front) || gear === 0) return 0
    const t = front
      ? (d.total * frontShare) / 2
      : (d.total * (1 - frontShare)) / 2
    return t * d.feed
  }

  reset() {
    this.prevThrottle = 0
    this.feedT = Infinity
    this.prevLaunching = false
    this.drivenOmega = 0
  }
}
