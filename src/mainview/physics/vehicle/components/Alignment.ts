import type { AlignmentSpec } from "../../../data/schema"
import { RAD_PER_DEG } from "../../../data/units"

/**
 * Static toe and camber per axle, with camber changing as the suspension
 * compresses. Angles are in radians and use the car's frame: toe is signed
 * positive for a wheel pointing in, camber positive when the top leans left.
 */
export class Alignment {
  constructor(private readonly p: AlignmentSpec) {}

  /** Heading change of a wheel from toe (rad); positive turns the car's left. */
  toe(front: boolean, left: boolean): number {
    const toe = (front ? this.p.front : this.p.rear).toeDeg * RAD_PER_DEG
    return left ? -toe : toe
  }

  /** Camber of a wheel (rad, top leaning left positive) at a suspension compression (m). */
  camber(front: boolean, left: boolean, compression: number): number {
    const a = front ? this.p.front : this.p.rear
    // negative camber is the top leaning in: toward the right on a left wheel
    const outward = (a.camberDeg - this.p.camberGainDegPerM * compression) * RAD_PER_DEG
    return left ? outward : -outward
  }
}
