import * as THREE from "three"
import type { DriveInput } from "../../systems/InputManager"
import type { Vehicle } from "../../physics/vehicle/Vehicle"
import {
  ZERO_EDGES,
  type AIProfile,
  type RaceDriver,
  type TrafficEntry,
} from "../../systems/AIDriver"
import type { Track } from "./Track"

const _q = new THREE.Quaternion()
const _f = new THREE.Vector3()

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

function wrapPi(a: number) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

const SCAN_M = 240
const SCAN_STEP = 8
const DECEL = 13

/**
 * Racing driver for a closed circuit. Follows the centreline with pure pursuit,
 * plans corner speeds from the track curvature, and steers around slower cars.
 */
export class CircuitDriver implements RaceDriver {
  private steer = 0
  private throttle = 0
  private brake = 0
  private wobble = 0
  private lane: number

  readonly recovering = false

  constructor(
    readonly profile: AIProfile,
    private readonly track: Track,
  ) {
    this.lane = profile.laneBias
  }

  /** Slowest speed (m/s) we may carry now so every corner ahead is makeable. */
  private cornerSpeed(s: number, aLat: number): number {
    const t = this.track
    let v = 120
    for (let d = 0; d <= SCAN_M; d += SCAN_STEP) {
      const i = Math.floor(t.wrap(s + d) / t.ds) % t.n
      const k = Math.max(
        Math.abs(t.kappa[i]),
        Math.abs(t.kappa[(i + 1) % t.n]),
        Math.abs(t.kappa[(i + t.n - 1) % t.n]),
      )
      if (k < 1e-5) continue
      const vc = Math.sqrt(aLat / k)
      v = Math.min(v, Math.sqrt(vc * vc + 2 * DECEL * d))
    }
    return v
  }

  drive(car: Vehicle, traffic: TrafficEntry[], dt: number): DriveInput {
    const t = this.track
    const body = car.body
    const p = body.translation()
    const speed = Math.max(0, car.forwardSpeed)
    const r = body.rotation()
    _q.set(r.x, r.y, r.z, r.w)
    _f.set(0, 0, -1).applyQuaternion(_q)
    const heading = Math.atan2(_f.x, -_f.z)

    const hit = t.project(p.x, p.z)
    const s = hit.s
    const lateral = hit.lateral
    const half = t.config.widthM / 2
    const ag = this.profile.aggression

    // Other cars: slide away from anything slow dead ahead.
    let want = this.profile.laneBias
    let capSpeed = 200
    const fx = _f.x
    const fz = _f.z
    for (const o of traffic) {
      if (o.body === body) continue
      const dx = o.x - p.x
      const dz = o.z - p.z
      const fwd = dx * fx + dz * fz
      if (fwd < 1 || fwd > 34) continue
      const side = dx * -fz + dz * fx
      if (Math.abs(side) > 2.3) continue
      const lv = o.body.linvel()
      const ov = Math.hypot(lv.x, lv.z)
      const room = half - 2
      const toRight = Math.abs(lateral + 2.6 - room) < Math.abs(lateral - 2.6 + room)
      want = clamp(lateral + (side >= 0 ? -1 : 1) * 3, -room, room)
      if (toRight && side >= 0 && lateral + 2.6 > room) want = lateral - 3
      if (fwd < 14 && speed > ov + 2) capSpeed = Math.min(capSpeed, ov + 3)
      if (fwd < 6) capSpeed = Math.min(capSpeed, Math.max(0, ov - 4))
    }
    this.lane += clamp(want - this.lane, -3.5 * dt, 3.5 * dt)
    const room = half - 1.8
    const lane = clamp(this.lane, -room, room)

    const look = clamp(9 + speed * 0.5, 11, 55)
    const tp = t.at(s + look)
    const tx = tp.x - tp.tz * lane
    const tz = tp.z + tp.tx * lane
    const desired = Math.atan2(tx - p.x, -(tz - p.z))
    this.wobble += dt * (1.7 + (this.profile.seed % 1))
    const err =
      wrapPi(desired - heading) +
      Math.sin(this.wobble + this.profile.seed) * 0.01

    const steerTarget = clamp(-err / 0.4, -1, 1)
    const rate = 1 / Math.max(0.05, this.profile.reaction)
    this.steer += clamp(steerTarget - this.steer, -rate * dt, rate * dt)

    const aLat = 10 + ag * 6.5
    let vTarget = this.cornerSpeed(s, aLat)
    vTarget = Math.min(vTarget, capSpeed)
    if (Math.abs(hit.dist) > half + 1.5) vTarget = Math.min(vTarget, 16)
    if (Math.abs(err) > 0.55) vTarget = Math.min(vTarget, 14)

    let thr = 1
    let brk = 0
    const over = speed - vTarget
    if (over > 0.8) {
      thr = 0
      brk = clamp(over / 7, 0.15, 1)
    } else if (over > -2) {
      thr = 0.35
    }
    // Don't pile on throttle while turned in hard.
    thr = Math.min(thr, 1 - Math.abs(this.steer) * 0.45)

    this.throttle += clamp(thr - this.throttle, -6 * dt, 6 * dt)
    this.brake += clamp(brk - this.brake, -8 * dt, 8 * dt)
    return {
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      handbrake: false,
      ...ZERO_EDGES,
    }
  }
}
