import type { CrashSpec } from "../../../data/schema"
import { clamp } from "../../math"

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface ImpactResult {
  /** Replacement velocities when the hit would have launched or spun the car too hard. */
  linvel?: Vec3Like
  angvel?: Vec3Like
}

/**
 * Crash handling on a rigid body with no damage model. A sudden velocity change between two steps while
 * the body touches something is a hit: the car keeps its stopping power but cannot be thrown upward or spun past the data limits, and
 * its tyres lose grip for a while, recovering over `gripRecovery`.
 */
export class Impact {
  /** Tyre grip scale, 1 when undisturbed. */
  gripScale = 1
  private lost = 0
  private prevLin: Vec3Like | null = null
  private prevAng: Vec3Like | null = null

  constructor(private readonly p: CrashSpec) {}

  /** Called at the start of a step with the velocities the physics step produced. */
  update(dt: number, lin: Vec3Like, ang: Vec3Like, touching: () => boolean): ImpactResult {
    const p = this.p
    this.lost = Math.max(0, this.lost - (p.gripLoss / p.gripRecovery) * dt)
    this.gripScale = 1 - this.lost
    const prev = this.prevLin
    const out: ImpactResult = {}
    if (prev && this.prevAng) {
      const dv = Math.hypot(lin.x - prev.x, lin.y - prev.y, lin.z - prev.z)
      // only a body in contact can have been hit; a teleport or a set velocity is not a crash
      if (dv > p.detectDeltaV && touching()) {
        const severity = clamp((dv - p.detectDeltaV) / p.severeDeltaV, 0, 1)
        this.lost = Math.max(this.lost, p.gripLoss * severity)
        this.gripScale = 1 - this.lost
        if (lin.y - prev.y > p.maxLaunchSpeed) {
          out.linvel = { x: lin.x, y: prev.y + p.maxLaunchSpeed, z: lin.z }
        }
        const lim = (a: number, b: number) => clamp(a, -Math.max(Math.abs(b), p.maxSpin), Math.max(Math.abs(b), p.maxSpin))
        const a2 = { x: lim(ang.x, this.prevAng.x), y: lim(ang.y, this.prevAng.y), z: lim(ang.z, this.prevAng.z) }
        if (a2.x !== ang.x || a2.y !== ang.y || a2.z !== ang.z) out.angvel = a2
      }
    }
    return out
  }

  /** Called at the end of a step with the velocities the car leaves it with. */
  record(lin: Vec3Like, ang: Vec3Like) {
    this.prevLin = { x: lin.x, y: lin.y, z: lin.z }
    this.prevAng = { x: ang.x, y: ang.y, z: ang.z }
  }

  reset() {
    this.lost = 0
    this.gripScale = 1
    this.prevLin = null
    this.prevAng = null
  }
}
