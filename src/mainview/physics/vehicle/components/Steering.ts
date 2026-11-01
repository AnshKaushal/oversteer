import type { Wheels } from "../../../data/schema"
import { clamp } from "../../math"

export class Steering {
  angle = 0

  constructor(
    private readonly p: Wheels["steering"],
    private readonly wheelbase: number,
    private readonly trackWidth: number,
  ) {}

  wheelAngle(front: boolean, left: boolean, centre: number): number {
    if (!front || centre === 0) return 0
    const t = Math.tan(Math.abs(centre))
    const half = this.trackWidth / 2
    const inside = Math.atan((this.wheelbase * t) / (this.wheelbase - half * t))
    const outside = Math.atan((this.wheelbase * t) / (this.wheelbase + half * t))
    const insideWheel = left === centre > 0
    const ideal = insideWheel ? inside : outside
    const angle = Math.abs(centre) + this.p.ackermannFactor * (ideal - Math.abs(centre))
    return Math.sign(centre) * angle
  }

  step(dt: number, steerInput: number, speedKmh: number, fwdSpeed: number) {
    const S = this.p
    const factor =
      1 /
      (1 +
        Math.pow(speedKmh / S.speedFalloffKmh, 2) *
          S.speedSensitivity *
          S.falloffGain)
    const gripCap = Math.atan(
      (this.wheelbase * S.gripCapAccel) /
        Math.max(S.gripCapMinSpeedSq, fwdSpeed * fwdSpeed),
    )
    const cap = Math.max(gripCap, S.minAngleAtSpeed)
    const target = clamp(steerInput * S.maxAngle * factor, -cap, cap)
    this.angle += clamp(
      target - this.angle,
      -S.ratePerSec * dt,
      S.ratePerSec * dt,
    )
  }

  reset() {
    this.angle = 0
  }
}
