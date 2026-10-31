import type { LimitsSpec } from "../../../data/schema"

/** Safety clamps on linear and angular speed. Return a scale (1 = no-op). */
export class VelocityLimiter {
  constructor(private readonly p: LimitsSpec) {}

  linearScale(vx: number, vy: number, vz: number): number {
    const sq = vx * vx + vy * vy + vz * vz
    const max = this.p.maxSpeed
    return sq > max * max ? max / Math.sqrt(sq) : 1
  }

  angularScale(wx: number, wy: number, wz: number): number {
    const sq = wx * wx + wy * wy + wz * wz
    const max = this.p.maxAngularSpeed
    return sq > max * max ? max / Math.sqrt(sq) : 1
  }
}
