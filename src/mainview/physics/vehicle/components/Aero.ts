import type { Aero as AeroSpec } from "../../../data/schema"
import { clamp } from "../../math"

export interface AeroForce {
  /** Drag impulse direction * magnitude per second, horizontal plane. */
  dragX: number
  dragZ: number
  /** Downforce, N, positive pushes the car down. */
  down: number
}

/** Quadratic drag and downforce from horizontal speed, worse at a yaw angle, with optional movable aero. */
export class Aero {
  /** 0 closed .. 1 fully open. */
  private open = 0

  constructor(private readonly p: AeroSpec) {}

  get activeBlend(): number {
    return this.open
  }

  /** Moves the flap: open on a straight above its speed, closed otherwise. */
  update(dt: number, speed: number, steerAbs: number) {
    const a = this.p.active
    if (!a) return
    const want = speed > a.minSpeed && steerAbs < a.maxSteer ? 1 : 0
    this.open += clamp(want - this.open, -a.blendRate * dt, a.blendRate * dt)
  }

  /**
   * Returns null below `minSpeed`. `vx`/`vz` are world horizontal velocity, `yaw` the angle (rad)
   * between the car's heading and its travel.
   */
  force(vx: number, vz: number, yaw = 0): AeroForce | null {
    const v = Math.hypot(vx, vz)
    if (!(v > this.p.minSpeed)) return null
    const p = this.p
    const side = Math.sin(yaw) ** 2
    const a = p.active
    const dragScale = a ? 1 + (a.dragScale - 1) * this.open : 1
    const downScale = a ? 1 + (a.downforceScale - 1) * this.open : 1
    const dragF =
      0.5 * p.airDensity * p.dragCoefficient * p.frontalArea * v * v * (1 + p.yawDragGain * side) * dragScale
    const down =
      (p.downforceAt100kmh / Math.pow(p.downforceRefSpeed, 2)) *
      v *
      v *
      Math.max(0, 1 - p.yawDownforceLoss * side) *
      downScale
    return { dragX: (-vx / v) * dragF, dragZ: (-vz / v) * dragF, down }
  }
}
