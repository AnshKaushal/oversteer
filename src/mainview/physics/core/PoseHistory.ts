import * as THREE from "three"
import { WORLD } from "../../data/world"

/**
 * Previous and current physics pose of one body. The renderer draws
 * `lerp/slerp(prev, curr, alpha)` so motion stays smooth at any refresh
 * rate, whatever the fixed physics rate is.
 */
export class PoseHistory {
  readonly prevPos = new THREE.Vector3()
  readonly currPos = new THREE.Vector3()
  readonly prevRot = new THREE.Quaternion()
  readonly currRot = new THREE.Quaternion()
  private prevComp: number[] = []
  private currComp: number[] = []
  private primed = false

  /** True once at least one pose has been captured. */
  get ready(): boolean {
    return this.primed
  }

  /** Call once after every physics step. */
  capture(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; w: number },
    compressions?: readonly number[],
  ) {
    if (!this.primed) {
      this.currPos.set(pos.x, pos.y, pos.z)
      this.currRot.set(rot.x, rot.y, rot.z, rot.w)
      this.snap()
      this.primed = true
      this.storeComp(compressions)
      this.prevComp = this.currComp.slice()
      return
    }
    this.prevPos.copy(this.currPos)
    this.prevRot.copy(this.currRot)
    this.prevComp = this.currComp
    this.currPos.set(pos.x, pos.y, pos.z)
    this.currRot.set(rot.x, rot.y, rot.z, rot.w)
    this.currComp = []
    this.storeComp(compressions)
    // A teleport (reset, respawn) must not be smeared across a frame.
    if (this.prevPos.distanceTo(this.currPos) > WORLD.teleportDistance) {
      this.snap()
      this.prevComp = this.currComp.slice()
    }
  }

  /** Make prev equal curr (no blending until the next capture). */
  snap() {
    this.prevPos.copy(this.currPos)
    this.prevRot.copy(this.currRot)
  }

  blendPos(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevPos, this.currPos, alpha)
  }

  blendRot(alpha: number, out: THREE.Quaternion): THREE.Quaternion {
    return out.slerpQuaternions(this.prevRot, this.currRot, alpha)
  }

  blendCompressions(alpha: number, out: number[]): number[] {
    out.length = this.currComp.length
    for (let i = 0; i < this.currComp.length; i++) {
      const p = this.prevComp[i] ?? this.currComp[i]
      out[i] = p + (this.currComp[i] - p) * alpha
    }
    return out
  }

  private storeComp(c?: readonly number[]) {
    this.currComp.length = 0
    if (c) for (let i = 0; i < c.length; i++) this.currComp.push(c[i])
  }
}
