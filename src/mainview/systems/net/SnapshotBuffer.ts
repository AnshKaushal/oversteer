export interface SnapshotIn {
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  vx: number
  vy: number
  vz: number
  wx?: number
  wy?: number
  wz?: number
}

export interface Snapshot extends SnapshotIn {
  arrivalMs: number
  seq: number
}

export interface InterpTarget {
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  vx: number
  vy: number
  vz: number
}

export type InterpMode = "empty" | "hold" | "interp" | "extrap"

import { NET } from "../../data/net"

export const INTERP_DELAY_MS = NET.interp.minDelayMs
export const EXTRAP_MAX_MS = NET.interp.extrapMaxMs
export const SNAPSHOT_CAP = NET.interp.snapshotCap

export function newInterpTarget(): InterpTarget {
  return {
    x: 0,
    y: 0.72,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 0,
    vy: 0,
    vz: 0,
  }
}

function copySnap(s: Snapshot, out: InterpTarget): void {
  out.x = s.x
  out.y = s.y
  out.z = s.z
  out.qx = s.qx
  out.qy = s.qy
  out.qz = s.qz
  out.qw = s.qw
  out.vx = s.vx
  out.vy = s.vy
  out.vz = s.vz
}

export function slerpQuat(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  t: number,
  out: { x: number; y: number; z: number; w: number },
): void {
  let dot = ax * bx + ay * by + az * bz + aw * bw
  let cx = bx
  let cy = by
  let cz = bz
  let cw = bw
  if (dot < 0) {
    dot = -dot
    cx = -cx
    cy = -cy
    cz = -cz
    cw = -cw
  }
  const DOT_THRESHOLD = 0.9995
  if (dot > DOT_THRESHOLD) {
    out.x = ax + t * (cx - ax)
    out.y = ay + t * (cy - ay)
    out.z = az + t * (cz - az)
    out.w = aw + t * (cw - aw)
  } else {
    const theta0 = Math.acos(dot)
    const sin0 = Math.sin(theta0)
    const s0 = Math.sin((1 - t) * theta0) / sin0
    const s1 = Math.sin(t * theta0) / sin0
    out.x = ax * s0 + cx * s1
    out.y = ay * s0 + cy * s1
    out.z = az * s0 + cz * s1
    out.w = aw * s0 + cw * s1
  }
  const n2 = out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w
  if (!(n2 > 1e-12)) {
    out.x = 0
    out.y = 0
    out.z = 0
    out.w = 1
    return
  }
  const inv = 1 / Math.sqrt(n2)
  out.x *= inv
  out.y *= inv
  out.z *= inv
  out.w *= inv
}

export interface SampleStats {
  mode: InterpMode
  extrapMs: number
}

const _q = { x: 0, y: 0, z: 0, w: 1 }

export class SnapshotBuffer {
  private snaps: Snapshot[] = []
  underruns = 0

  get size(): number {
    return this.snaps.length
  }

  append(s: SnapshotIn, arrivalMs: number, seq: number): void {
    this.snaps.push({
      x: s.x,
      y: s.y,
      z: s.z,
      qx: s.qx,
      qy: s.qy,
      qz: s.qz,
      qw: s.qw,
      vx: s.vx,
      vy: s.vy,
      vz: s.vz,
      wx: s.wx ?? 0,
      wy: s.wy ?? 0,
      wz: s.wz ?? 0,
      arrivalMs,
      seq,
    })
    let i = this.snaps.length - 1
    while (i > 0 && this.snaps[i - 1].arrivalMs > this.snaps[i].arrivalMs) {
      const t = this.snaps[i]
      this.snaps[i] = this.snaps[i - 1]
      this.snaps[i - 1] = t
      i--
    }
    if (this.snaps.length > SNAPSHOT_CAP) {
      this.snaps.splice(0, this.snaps.length - SNAPSHOT_CAP)
    }
  }

  latest(): Snapshot | null {
    return this.snaps.length > 0 ? this.snaps[this.snaps.length - 1] : null
  }

  reset(): void {
    this.snaps.length = 0
  }

  sampleInto(
    out: InterpTarget,
    renderTimeMs: number,
    stats?: SampleStats,
  ): InterpMode {
    const n = this.snaps.length
    if (n === 0) {
      if (stats) {
        stats.mode = "empty"
        stats.extrapMs = 0
      }
      this.underruns++
      return "empty"
    }
    const newest = this.snaps[n - 1]
    if (renderTimeMs <= this.snaps[0].arrivalMs) {
      copySnap(this.snaps[0], out)
      if (n > 1) this.underruns++
      if (stats) {
        stats.mode = "hold"
        stats.extrapMs = 0
      }
      return "hold"
    }
    if (renderTimeMs >= newest.arrivalMs) {
      const overMs = Math.max(
        0,
        Math.min(EXTRAP_MAX_MS, renderTimeMs - newest.arrivalMs),
      )
      const dt = overMs / 1000
      const reach = dt - (dt * dt) / (2 * (EXTRAP_MAX_MS / 1000))
      out.x = newest.x + newest.vx * reach
      out.y = newest.y + newest.vy * reach
      out.z = newest.z + newest.vz * reach
      const wx = newest.wx ?? 0
      const wy = newest.wy ?? 0
      const wz = newest.wz ?? 0
      const wm = Math.hypot(wx, wy, wz)
      if (wm > 1e-4) {
        const half = (wm * reach) / 2
        const k = Math.sin(half) / wm
        const dx = wx * k
        const dy = wy * k
        const dz = wz * k
        const dw = Math.cos(half)
        out.qx =
          dw * newest.qx + dx * newest.qw + dy * newest.qz - dz * newest.qy
        out.qy =
          dw * newest.qy - dx * newest.qz + dy * newest.qw + dz * newest.qx
        out.qz =
          dw * newest.qz + dx * newest.qy - dy * newest.qx + dz * newest.qw
        out.qw =
          dw * newest.qw - dx * newest.qx - dy * newest.qy - dz * newest.qz
      } else {
        out.qx = newest.qx
        out.qy = newest.qy
        out.qz = newest.qz
        out.qw = newest.qw
      }
      out.vx = newest.vx
      out.vy = newest.vy
      out.vz = newest.vz
      if (stats) {
        stats.mode = "extrap"
        stats.extrapMs = overMs
      }
      return "extrap"
    }
    let i = n - 1
    while (i > 0 && this.snaps[i].arrivalMs > renderTimeMs) i--
    const a = this.snaps[i]
    const b = this.snaps[i + 1]
    const span = b.arrivalMs - a.arrivalMs
    const t = span > 0 ? (renderTimeMs - a.arrivalMs) / span : 1
    const tc = t < 0 ? 0 : t > 1 ? 1 : t
    const h = span / 1000
    const t2 = tc * tc
    const t3 = t2 * tc
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + tc
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    out.x = h00 * a.x + h10 * h * a.vx + h01 * b.x + h11 * h * b.vx
    out.y = h00 * a.y + h10 * h * a.vy + h01 * b.y + h11 * h * b.vy
    out.z = h00 * a.z + h10 * h * a.vz + h01 * b.z + h11 * h * b.vz
    slerpQuat(a.qx, a.qy, a.qz, a.qw, b.qx, b.qy, b.qz, b.qw, tc, _q)
    out.qx = _q.x
    out.qy = _q.y
    out.qz = _q.z
    out.qw = _q.w
    out.vx = a.vx + (b.vx - a.vx) * tc
    out.vy = a.vy + (b.vy - a.vy) * tc
    out.vz = a.vz + (b.vz - a.vz) * tc
    if (stats) {
      stats.mode = "interp"
      stats.extrapMs = 0
    }
    return "interp"
  }
}
