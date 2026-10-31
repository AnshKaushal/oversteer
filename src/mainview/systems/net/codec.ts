import { NET } from "../../data/net"

/**
 * Binary car state. 72 bytes, little endian:
 *   0 u8 magic  1 u8 flags  2 u32 seq  6 u32 sender ms  10 u32 session
 *   14 f32 x y z  26 u32 quat (2 bit index of the largest, three 10 bit)
 *   30 i16 v xyz  36 i16 w xyz  42 i16 steer  44 i16 speed  46 u16 rpm
 *   48 i8 gear  49 u8 throttle  50 u8 brake  51 f32 progress
 *   55 i16 wheel omega x4 (rad/s)  63 i16 suspension compression x4 (m)
 *   71 u8 tyre smoke level
 */
export const STATE_BYTES = 72
const MAGIC = 0xa0 | (NET.protocolVersion & 0x0f)
const SQRT1_2 = Math.SQRT1_2
const V_SCALE = 32767 / NET.limits.velComp
const W_SCALE = 32767 / NET.limits.angVelComp
const STEER_SCALE = 32767 / NET.limits.steer
const SPEED_SCALE = 10
const WHEEL_SCALE = 32767 / NET.limits.wheelOmega
const COMP_SCALE = 4000

export interface WireState {
  seq: number
  /** Sender simulation time, ms. */
  t: number
  /** Session hash. */
  sess: number
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
  wx: number
  wy: number
  wz: number
  steer: number
  speed: number
  rpm: number
  gear: number
  throttle: number
  brake: number
  drift: boolean
  smoke: boolean
  handbrake: boolean
  progress: number
  /** Wheel spin (rad/s), in wheel order. */
  wheelOmega: [number, number, number, number]
  /** Suspension compression (m). */
  compression: [number, number, number, number]
  /** Tyre smoke strength, 0 to 1. */
  smokeLevel: number
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v

/** FNV-1a over a string. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0")
}

function packQuat(x: number, y: number, z: number, w: number): number {
  const q = [x, y, z, w]
  let big = 0
  for (let i = 1; i < 4; i++) if (Math.abs(q[i]) > Math.abs(q[big])) big = i
  const sign = q[big] < 0 ? -1 : 1
  let bits = big
  let shift = 2
  for (let i = 0; i < 4; i++) {
    if (i === big) continue
    const v = clamp(q[i] * sign, -SQRT1_2, SQRT1_2)
    const n = Math.round(((v / SQRT1_2) * 0.5 + 0.5) * 1023)
    bits |= n << shift
    shift += 10
  }
  return bits >>> 0
}

function unpackQuat(bits: number, out: number[]): void {
  const big = bits & 3
  let shift = 2
  let sum = 0
  for (let i = 0; i < 4; i++) {
    if (i === big) continue
    const n = (bits >>> shift) & 1023
    const v = ((n / 1023 - 0.5) * 2) * SQRT1_2
    out[i] = v
    sum += v * v
    shift += 10
  }
  out[big] = Math.sqrt(Math.max(0, 1 - sum))
}

export function encodeState(s: WireState, buf?: ArrayBuffer): Uint8Array {
  const ab = buf ?? new ArrayBuffer(STATE_BYTES)
  const dv = new DataView(ab)
  dv.setUint8(0, MAGIC)
  dv.setUint8(1, (s.drift ? 1 : 0) | (s.smoke ? 2 : 0) | (s.handbrake ? 4 : 0))
  dv.setUint32(2, s.seq >>> 0, true)
  dv.setUint32(6, Math.max(0, Math.round(s.t)) >>> 0, true)
  dv.setUint32(10, s.sess >>> 0, true)
  dv.setFloat32(14, s.x, true)
  dv.setFloat32(18, s.y, true)
  dv.setFloat32(22, s.z, true)
  dv.setUint32(26, packQuat(s.qx, s.qy, s.qz, s.qw), true)
  const v = (o: number, val: number, k: number) =>
    dv.setInt16(o, Math.round(clamp(val * k, -32767, 32767)), true)
  v(30, s.vx, V_SCALE)
  v(32, s.vy, V_SCALE)
  v(34, s.vz, V_SCALE)
  v(36, s.wx, W_SCALE)
  v(38, s.wy, W_SCALE)
  v(40, s.wz, W_SCALE)
  v(42, s.steer, STEER_SCALE)
  v(44, s.speed, SPEED_SCALE)
  dv.setUint16(46, clamp(Math.round(s.rpm), 0, 65535), true)
  dv.setInt8(48, clamp(Math.round(s.gear), -128, 127))
  dv.setUint8(49, Math.round(clamp(s.throttle, 0, 1) * 255))
  dv.setUint8(50, Math.round(clamp(s.brake, 0, 1) * 255))
  dv.setFloat32(51, s.progress, true)
  for (let k = 0; k < 4; k++) {
    v(55 + k * 2, s.wheelOmega[k], WHEEL_SCALE)
    v(63 + k * 2, s.compression[k], COMP_SCALE)
  }
  dv.setUint8(71, Math.round(clamp(s.smokeLevel, 0, 1) * 255))
  return new Uint8Array(ab)
}

export type DecodeResult =
  { ok: true; state: WireState } | { ok: false; reason: string }

const _q = [0, 0, 0, 1]

export function decodeState(data: ArrayBuffer | ArrayBufferView): DecodeResult {
  const u8 =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (u8.byteLength !== STATE_BYTES) return { ok: false, reason: "bad-length" }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  if (dv.getUint8(0) !== MAGIC) return { ok: false, reason: "proto-mismatch" }
  const flags = dv.getUint8(1)
  unpackQuat(dv.getUint32(26, true), _q)
  const i = (o: number, k: number) => dv.getInt16(o, true) / k
  return {
    ok: true,
    state: {
      seq: dv.getUint32(2, true),
      t: dv.getUint32(6, true),
      sess: dv.getUint32(10, true),
      x: dv.getFloat32(14, true),
      y: dv.getFloat32(18, true),
      z: dv.getFloat32(22, true),
      qx: _q[0],
      qy: _q[1],
      qz: _q[2],
      qw: _q[3],
      vx: i(30, V_SCALE),
      vy: i(32, V_SCALE),
      vz: i(34, V_SCALE),
      wx: i(36, W_SCALE),
      wy: i(38, W_SCALE),
      wz: i(40, W_SCALE),
      steer: i(42, STEER_SCALE),
      speed: i(44, SPEED_SCALE),
      rpm: dv.getUint16(46, true),
      gear: dv.getInt8(48),
      throttle: dv.getUint8(49) / 255,
      brake: dv.getUint8(50) / 255,
      drift: (flags & 1) !== 0,
      smoke: (flags & 2) !== 0,
      handbrake: (flags & 4) !== 0,
      progress: dv.getFloat32(51, true),
      wheelOmega: [0, 1, 2, 3].map((k) => i(55 + k * 2, WHEEL_SCALE)) as WireState["wheelOmega"],
      smokeLevel: dv.getUint8(71) / 255,
      compression: [0, 1, 2, 3].map((k) => i(63 + k * 2, COMP_SCALE)) as WireState["compression"],
    },
  }
}

/** Stable JSON with sorted keys, for hashing car data. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null"
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .filter((k) => typeof o[k] !== "function" && o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`
}

/** Hash of a car's physics data; peers with a different value run different physics. */
export function specHash(spec: unknown): string {
  return hex32(fnv1a(canonicalJson(spec)))
}
