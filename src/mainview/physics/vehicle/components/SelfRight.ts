import type { SelfRightSpec } from "../../../data/schema"

/** Roll torque that lets the driver rock a flipped, slow car back upright. */
export class SelfRight {
  constructor(private readonly p: SelfRightSpec) {}

  /**
   * Torque magnitude about the car's forward axis, 0 when not applicable.
   * `rollRate` is angular speed about that axis.
   */
  torque(
    upY: number,
    speed: number,
    verticalSpeed: number,
    rollRate: number,
    throttle: number,
    brake: number,
    steer: number,
  ): number {
    const p = this.p
    if (!(upY < p.maxUpY && speed < p.maxSpeed)) return 0
    if (!(verticalSpeed > p.minVerticalSpeed)) return 0
    if (!(Math.abs(rollRate) < p.maxRollRate)) return 0
    return (throttle - brake) * p.throttleTorque - steer * p.steerTorque
  }
}
