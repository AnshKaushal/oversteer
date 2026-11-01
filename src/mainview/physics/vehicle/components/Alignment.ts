import type { AlignmentSpec } from "../../../data/schema"
import { RAD_PER_DEG } from "../../../data/units"

export class Alignment {
  constructor(private readonly p: AlignmentSpec) {}

  toe(front: boolean, left: boolean): number {
    const toe = (front ? this.p.front : this.p.rear).toeDeg * RAD_PER_DEG
    return left ? -toe : toe
  }

  camber(front: boolean, left: boolean, compression: number): number {
    const a = front ? this.p.front : this.p.rear
    const outward = (a.camberDeg - this.p.camberGainDegPerM * compression) * RAD_PER_DEG
    return left ? outward : -outward
  }
}
