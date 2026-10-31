/**
 * P7 tests: binary codec, clock sync with adaptive delay, Hermite interpolation,
 * extrapolation fade, spec hash and version gate.
 *
 * Run: `bun scripts/net-codec-test.ts` (exit 1 on any failure).
 */
import { NET } from "../src/mainview/data/net"
import {
  STATE_BYTES,
  decodeState,
  encodeState,
  specHash,
  type WireState,
} from "../src/mainview/systems/net/codec"
import { NetClock } from "../src/mainview/systems/net/NetClock"
import {
  SnapshotBuffer,
  newInterpTarget,
} from "../src/mainview/systems/net/SnapshotBuffer"
import { validateStatePacket } from "../src/mainview/systems/net/stateProtocol"
import { getCar } from "../src/mainview/data/cars"

let failures = 0
let passes = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passes++
    console.log(`ok - ${name}`)
  } else {
    failures++
    console.error(`FAIL - ${name}`, extra ?? "")
  }
}

const base: WireState = {
  seq: 123456,
  t: 987654,
  sess: 0xdeadbeef,
  x: 1234.5,
  y: 0.72,
  z: -987.25,
  qx: 0.1,
  qy: 0.7,
  qz: -0.3,
  qw: Math.sqrt(0.41),
  vx: 40.5,
  vy: -0.3,
  vz: -61.2,
  wx: 0.5,
  wy: -2.2,
  wz: 0.1,
  steer: -0.35,
  speed: 227.3,
  rpm: 14850,
  gear: 6,
  throttle: 0.82,
  brake: 0.1,
  drift: true,
  smoke: false,
  handbrake: true,
  progress: 4321.5,
  wheelOmega: [210.5, -3.2, 0, 212.9],
  compression: [0.031, 0.054, -0.002, 0.07],
  smokeLevel: 0.6,
}

// ---- codec ----
{
  const bytes = encodeState(base)
  check("size is small", bytes.length === STATE_BYTES && STATE_BYTES <= 80, bytes.length)
  const json = JSON.stringify(base).length
  check("under a fifth of JSON", bytes.length * 5 < json, `${bytes.length} vs ${json}`)
  const d = decodeState(bytes)
  check("decodes", d.ok)
  if (d.ok) {
    const s = d.state
    check("exact fields", s.seq === base.seq && s.t === base.t && s.sess === base.sess && s.gear === 6 && s.rpm === 14850 && s.drift && !s.smoke && s.handbrake)
    check("position exact to float32", Math.abs(s.x - base.x) < 1e-3 && Math.abs(s.z - base.z) < 1e-3)
    check("velocity within 1 cm/s", Math.abs(s.vx - base.vx) < 0.01 && Math.abs(s.vz - base.vz) < 0.01)
    check("angvel within 2 mrad/s", Math.abs(s.wy - base.wy) < 0.002)
    check("steer, speed, inputs", Math.abs(s.steer - base.steer) < 1e-3 && Math.abs(s.speed - base.speed) < 0.06 && Math.abs(s.throttle - base.throttle) < 0.003)
    const dot = Math.abs(s.qx * base.qx + s.qy * base.qy + s.qz * base.qz + s.qw * base.qw)
    const err = 2 * Math.acos(Math.min(1, dot)) * (180 / Math.PI)
    check("rotation within 0.3 degrees", err < 0.3, err)
    check("wheel spin and travel survive", s.wheelOmega.every((w, k) => Math.abs(w - base.wheelOmega[k]) < 0.03) && s.compression.every((c, k) => Math.abs(c - base.compression[k]) < 0.0003), s)
    check("smoke level survives", Math.abs(s.smokeLevel - 0.6) < 0.003, s.smokeLevel)
    const norm = Math.hypot(s.qx, s.qy, s.qz, s.qw)
    check("rotation unit length", Math.abs(norm - 1) < 1e-6, norm)
    const v = validateStatePacket({ ...s, id: "p", sess: "x" })
    check("passes the validator, F1 rpm included", v.ok, v)
  }
  // rotation sweep: every largest-component case, both signs
  let worst = 0
  for (let i = 0; i < 2000; i++) {
    const r = () => Math.random() * 2 - 1
    let qx = r(), qy = r(), qz = r(), qw = r()
    const n = Math.hypot(qx, qy, qz, qw)
    qx /= n; qy /= n; qz /= n; qw /= n
    const dd = decodeState(encodeState({ ...base, qx, qy, qz, qw }))
    if (!dd.ok) continue
    const dot = Math.abs(dd.state.qx * qx + dd.state.qy * qy + dd.state.qz * qz + dd.state.qw * qw)
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, dot)) * (180 / Math.PI))
  }
  check("random rotations stay within 0.3 degrees", worst < 0.3, worst)
  check("short buffer rejected", !decodeState(new Uint8Array(10)).ok)
  const old = encodeState(base)
  old[0] = 0xa0 | ((NET.protocolVersion + 1) & 15)
  const m = decodeState(old)
  check("other protocol version rejected", !m.ok && m.reason === "proto-mismatch")
  check("seq wraps as u32", (() => { const q = decodeState(encodeState({ ...base, seq: 2 ** 32 + 5 })); return q.ok && q.state.seq === 5 })())
}

// ---- clock ----
{
  // sender clock runs 5 s behind ours; link has 30 ms base, bursty jitter
  const c = new NetClock()
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const iv = 1000 / NET.sendHz
  let senderT = 1000
  for (let i = 0; i < 600; i++) {
    senderT += iv
    const jitter = rnd() < 0.1 ? rnd() * 40 : rnd() * 4
    c.observe(senderT, i, senderT + 5000 + 30 + jitter)
  }
  check("offset finds the fastest delivery", Math.abs(c.offsetMs - 5030) < 3, c.offsetMs)
  check("timeline places packets by send time", Math.abs(c.toLocal(senderT) - (senderT + 5030)) < 3)
  const calmDelay = c.delayMs
  check("delay within bounds", calmDelay >= NET.interp.minDelayMs && calmDelay <= NET.interp.maxDelayMs, calmDelay)

  // a clean link settles lower than a jittery, lossy one
  const clean = new NetClock()
  const rough = new NetClock()
  let t2 = 0
  for (let i = 0; i < 900; i++) {
    t2 += iv
    clean.observe(t2, i, t2 + 20 + rnd())
    if (rnd() < 0.9) rough.observe(t2, i, t2 + 20 + rnd() * 60)
  }
  check("rough link gets more delay", rough.delayMs > clean.delayMs + 10, `${rough.delayMs} vs ${clean.delayMs}`)
  check("loss and jitter measured", rough.lossRate > 0.01 && rough.jitterMs > 5, `${rough.lossRate} ${rough.jitterMs}`)
  check("clean link sits near the floor", clean.delayMs < NET.interp.minDelayMs + 20, clean.delayMs)

  // a pause restarts the timeline instead of poisoning it
  const p = new NetClock()
  p.observe(1000, 0, 5000)
  p.observe(1016, 1, 5016)
  const restarted = p.observe(1016 + NET.clock.resyncGapMs + 50, 2, 99999)
  check("sender clock gap resyncs", restarted)
  const back = new NetClock()
  back.observe(5000, 0, 6000)
  check("sender clock stepping back resyncs", back.observe(5000 - NET.clock.resyncGapMs - 10, 1, 6016))
}

// ---- interpolation ----
{
  // car doing 20 m/s on a curve through known points: Hermite should track the true curve
  const buf = new SnapshotBuffer()
  const R = 50
  const w = 20 / R
  const at = (ms: number) => {
    const a = (ms / 1000) * w
    return { x: R * Math.sin(a), y: 0, z: R * (1 - Math.cos(a)), vx: 20 * Math.cos(a), vy: 0, vz: 20 * Math.sin(a) }
  }
  for (let ms = 0; ms <= 1000; ms += 100) {
    const p = at(ms)
    buf.append({ ...p, qx: 0, qy: 0, qz: 0, qw: 1 }, ms, ms)
  }
  const out = newInterpTarget()
  let hermite = 0
  let linear = 0
  for (let ms = 5; ms < 1000; ms += 10) {
    buf.sampleInto(out, ms)
    const tr = at(ms)
    hermite = Math.max(hermite, Math.hypot(out.x - tr.x, out.z - tr.z))
    const i = Math.floor(ms / 100)
    const a = at(i * 100)
    const b = at(i * 100 + 100)
    const f = (ms - i * 100) / 100
    linear = Math.max(linear, Math.hypot(a.x + (b.x - a.x) * f - tr.x, a.z + (b.z - a.z) * f - tr.z))
  }
  check("Hermite follows a curve far tighter than linear", hermite < linear / 10, `${hermite} vs ${linear}`)
  buf.sampleInto(out, 300)
  check("passes through a snapshot exactly", Math.abs(out.x - at(300).x) < 1e-9)
  // continuous across a snapshot boundary
  const before = newInterpTarget(), after = newInterpTarget()
  buf.sampleInto(before, 399.99)
  buf.sampleInto(after, 400.01)
  check("continuous across snapshots", Math.hypot(before.x - after.x, before.z - after.z) < 0.01)

  // out of order arrival lands in time order
  const o = new SnapshotBuffer()
  o.append({ x: 20, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 }, 200, 2)
  o.append({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 }, 100, 1)
  o.sampleInto(out, 150)
  check("late packet sorted into place", Math.abs(out.x - 10) < 1e-6, out.x)

  // extrapolation: bounded, fades, and follows spin
  const e = new SnapshotBuffer()
  e.append({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 30, vy: 0, vz: 0, wx: 0, wy: 2, wz: 0 }, 0, 0)
  e.sampleInto(out, 1000)
  const max = NET.interp.extrapMaxMs / 1000
  check("extrapolation stops at the cap", Math.abs(out.x - 30 * max / 2) < 1e-6, out.x)
  e.sampleInto(out, 40)
  check("extrapolation spins with the body", Math.abs(2 * Math.asin(out.qy) - 2 * 0.04 * (1 - 0.04 / (2 * max))) < 1e-3, out.qy)
}

// ---- end to end: jittery link, sender-time timeline against arrival timing ----
{
  let seed = 99
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const iv = 1000 / NET.sendHz
  const truth = (ms: number) => 25 * (ms / 1000) // 25 m/s straight
  type Pkt = { t: number; arrive: number; bytes: Uint8Array }
  const pkts: Pkt[] = []
  for (let i = 0; i < 600; i++) {
    const t = i * iv
    const jitter = rnd() < 0.15 ? 10 + rnd() * 50 : rnd() * 6
    pkts.push({
      t,
      arrive: t + 40 + jitter,
      bytes: encodeState({ ...base, seq: i, t, x: truth(t), y: 0, z: 0, vx: 25, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }),
    })
  }
  pkts.sort((a, b) => a.arrive - b.arrive)
  const run = (useSenderTime: boolean) => {
    const buf = new SnapshotBuffer()
    const clock = new NetClock()
    const out = newInterpTarget()
    let k = 0
    let worst = 0
    let stepMax = 0
    let prev = NaN
    for (let now = 500; now < 9500; now += 1000 / 120) {
      while (k < pkts.length && pkts[k].arrive <= now) {
        const d = decodeState(pkts[k].bytes)
        if (d.ok) {
          clock.observe(d.state.t, d.state.seq, pkts[k].arrive)
          buf.append(d.state, useSenderTime ? clock.toLocal(d.state.t) : pkts[k].arrive, d.state.seq)
        }
        k++
      }
      const delay = useSenderTime ? clock.delayMs : NET.interp.minDelayMs
      buf.sampleInto(out, now - delay)
      // what the car shows against where the sender was at that same instant
      const shown = out.x
      if (!Number.isNaN(prev) && now > 2500) stepMax = Math.max(stepMax, Math.abs(shown - prev - 25 / 120))
      prev = shown
      const want = truth(now - (useSenderTime ? clock.delayMs + 40 : NET.interp.minDelayMs + 40 + 3))
      worst = Math.max(worst, Math.abs(shown - want))
    }
    return { worst, stepMax }
  }
  const arr = run(false)
  const snd = run(true)
  check("sender-time timeline moves smoothly under jitter", snd.stepMax < arr.stepMax / 3, `${snd.stepMax} vs ${arr.stepMax}`)
  console.log(`  per-frame deviation from steady motion: ${(snd.stepMax * 100).toFixed(2)} cm (sender time) vs ${(arr.stepMax * 100).toFixed(2)} cm (arrival time)`)
}

// ---- spec hash ----
{
  const a = getCar("bmw-m3").physics
  const b = JSON.parse(JSON.stringify(a))
  check("hash stable across copies", specHash(a) === specHash(b))
  const k = Object.fromEntries(Object.entries(b).reverse())
  check("hash ignores key order", specHash(k) === specHash(a))
  b.mass = (b.mass ?? 1000) + 1
  check("hash sees a data change", specHash(a) !== specHash(b))
  check("cars differ", specHash(getCar("bmw-m3").physics) !== specHash(getCar("f1-car").physics))
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
