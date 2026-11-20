import * as THREE from "three"
import {
  initPhysics,
  createWorld,
  createChassisBody,
} from "../src/mainview/physics/core/PhysicsSystem"
import {
  SnapshotBuffer,
  slerpQuat,
  newInterpTarget,
  INTERP_DELAY_MS,
  EXTRAP_MAX_MS,
  SNAPSHOT_CAP,
} from "../src/mainview/systems/net/SnapshotBuffer"
import { validateStatePacket } from "../src/mainview/systems/net/stateProtocol"
import { PeerSessionTracker } from "../src/mainview/systems/net/stateProtocol"
import { getNetDiagSnapshot } from "../src/mainview/systems/net/NetDiagnostics"
import { RemoteCar } from "../src/mainview/systems/net/RemoteCar"
import { MultiplayerManager } from "../src/mainview/systems/net/MultiplayerManager"
import { getCar } from "../src/mainview/data/cars"

const TEST_CAR = getCar("bmw-m3")
const TEST_REMOTE_OPTS = {
  modelFile: TEST_CAR.modelFile,
  physics: TEST_CAR.physics,
  startPlaced: true,
}

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
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

function snap(
  x: number,
  arrivalMs: number,
  seq: number,
  over: Record<string, number> = {},
) {
  return {
    x,
    y: 0.72,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    ...over,
  }
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(10, 100, 1), 100, 1)
  const out = newInterpTarget()
  const stats = { mode: "interp" as const, extrapMs: 0 }
  const mode = b.sampleInto(out, 50, stats)
  check("1 halfway x=5", mode === "interp" && approx(out.x, 5), {
    mode,
    x: out.x,
  })
  check("1 extrapMs 0", stats.extrapMs === 0)
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(10, 100, 1), 100, 1)
  b.append(snap(30, 200, 2), 200, 2)
  const out = newInterpTarget()
  const m1 = b.sampleInto(out, 100)
  check("2 exact middle", m1 === "interp" && approx(out.x, 10), {
    m1,
    x: out.x,
  })
  const stats = { mode: "extrap" as const, extrapMs: -1 }
  const m2 = b.sampleInto(out, 200, stats)
  check("2 exact newest", approx(out.x, 30) && stats.extrapMs === 0, {
    m2,
    x: out.x,
    stats,
  })
}

{
  const s45 = Math.SQRT1_2
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(0, 100, 1, { qx: 0, qy: s45, qz: 0, qw: s45 }), 100, 1)
  const out = newInterpTarget()
  b.sampleInto(out, 50)
  const e = { y: Math.sin(Math.PI / 8), w: Math.cos(Math.PI / 8) }
  check(
    "3 slerp halfway",
    approx(out.qy, e.y, 1e-5) && approx(out.qw, e.w, 1e-5),
    out,
  )
  const n = Math.hypot(out.qx, out.qy, out.qz, out.qw)
  check("3 slerp unit", approx(n, 1), n)
  const o = { x: 0, y: 0, z: 0, w: 1 }
  slerpQuat(0, 0, 0, 1, 0, 0, 0, -1, 0.5, o)
  check(
    "3 antipodal no-flip",
    approx(o.w, 1) && approx(o.x, 0) && approx(o.y, 0) && approx(o.z, 0),
    o,
  )
}

{
  const o = { x: 9, y: 9, z: 9, w: 9 }
  slerpQuat(0, 0, 0, 0, 0, 0, 0, 0, 0.5, o)
  const finite = [o.x, o.y, o.z, o.w].every(Number.isFinite)
  check(
    "4 degenerate -> identity, finite",
    finite && o.x === 0 && o.y === 0 && o.z === 0 && o.w === 1,
    o,
  )
}

{
  const b = new SnapshotBuffer()
  b.append(snap(7, 500, 0, { vx: 3 }), 500, 0)
  const out = newInterpTarget()
  const mode = b.sampleInto(out, 400)
  check("5 priming hold", mode === "hold" && out.x === 7, { mode, x: out.x })
  const stats = { mode: "extrap" as const, extrapMs: -1 }
  const m2 = b.sampleInto(out, 500, stats)
  check("5 fresh single ~hold", approx(out.x, 7) && stats.extrapMs === 0, {
    m2,
    x: out.x,
    stats,
  })
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0, { vx: 10 }), 0, 0)
  const out = newInterpTarget()
  const stats = { mode: "extrap" as const, extrapMs: 0 }
  const mode = b.sampleInto(out, 1000, stats)
  check(
    "6 clamped",
    mode === "extrap" &&
      approx(out.x, (10 * EXTRAP_MAX_MS) / 2000) &&
      stats.extrapMs === EXTRAP_MAX_MS,
    { mode, out, stats },
  )
}

{
  const b = new SnapshotBuffer()
  for (let i = 0; i < 100; i++) b.append(snap(i, i * 33, i), i * 33, i)
  check("7 hard cap", b.size === SNAPSHOT_CAP, b.size)
  check("7 newest retained", b.latest()?.seq === 99, b.latest())
  const b2 = new SnapshotBuffer()
  for (let i = 0; i < 10; i++) b2.append(snap(i, 1000, i), 1000, i)
  const out = newInterpTarget()
  b2.sampleInto(out, 1000 + INTERP_DELAY_MS)
  const finite = [out.x, out.y, out.z, out.qx, out.qy, out.qz, out.qw].every(
    Number.isFinite,
  )
  check("7 burst finite", finite && b2.size === 10, out)
}

{
  const tr = new PeerSessionTracker()
  const b = new SnapshotBuffer()
  const accept = (seq: number, x: number) => {
    const d = tr.evaluate("p", "s", seq)
    if (d === "accept-initial" || d === "accept")
      b.append(snap(x, seq * 33, seq), seq * 33, seq)
    return d
  }
  accept(0, 0)
  accept(1, 10)
  const d = accept(0, 500)
  check("8 stale rejected", d !== "accept-initial" && d !== "accept", d)
  check("8 buffer untouched", b.size === 2 && b.latest()?.x === 10, {
    size: b.size,
    latest: b.latest(),
  })
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(10, 33, 1), 33, 1)
  b.reset()
  b.append(snap(500, 1000, 0), 1000, 0)
  const out = newInterpTarget()
  const mode = b.sampleInto(out, 2000)
  check(
    "9 new session alone",
    b.size === 1 && approx(out.x, 500) && mode === "extrap",
    { size: b.size, x: out.x, mode },
  )
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(1, 33, 1), 33, 1)
  b.reset()
  b.append(snap(900, 200, 2), 200, 2)
  const out = newInterpTarget()
  b.sampleInto(out, 250)
  check(
    "10 no blend across teleport",
    out.x >= 900 - 30 && out.x <= 900 + 30,
    out.x,
  )
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0, { vx: 10 }), 0, 0)
  const o1 = newInterpTarget()
  const o2 = newInterpTarget()
  b.sampleInto(o1, 10_000)
  b.sampleInto(o2, 60_000)
  check(
    "11 frozen target",
    approx(o1.x, (10 * EXTRAP_MAX_MS) / 2000) && approx(o2.x, o1.x),
    {
      o1: o1.x,
      o2: o2.x,
    },
  )
}

{
  const b = new SnapshotBuffer()
  b.append(snap(0, 0, 0), 0, 0)
  b.append(snap(1, 10, 1), 10, 1)
  b.append(snap(9, 90, 2), 90, 2)
  b.append(snap(10, 95, 3), 95, 3)
  const out = newInterpTarget()
  b.sampleInto(out, 92.5)
  check("12 burst bracket", approx(out.x, 9.5), out.x)
  b.sampleInto(out, 50)
  check("12 gap bracket", approx(out.x, 5), out.x)
}

{
  const mk = (t: number) =>
    validateStatePacket({
      id: "p",
      t,
      seq: 1,
      sess: "s",
      x: 5,
      y: 0.72,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      steer: 0,
      speed: 0,
      rpm: 800,
      gear: 1,
      drift: false,
      smoke: false,
      progress: 0,
    })
  const a = mk(1)
  const z = mk(9e12)
  check("13 alien t validates", a.ok === true && z.ok === true)
  if (a.ok && z.ok) {
    const b1 = new SnapshotBuffer()
    const b2 = new SnapshotBuffer()
    b1.append(a.state, 1000, 1)
    b2.append(z.state, 1000, 1)
    const o1 = newInterpTarget()
    const o2 = newInterpTarget()
    b1.sampleInto(o1, 2000)
    b2.sampleInto(o2, 2000)
    check("13 identical output", JSON.stringify(o1) === JSON.stringify(o2), {
      o1,
      o2,
    })
  }
}

{
  const R = await initPhysics()
  const world = createWorld()
  const scene = new THREE.Scene()
  const groundBody = world.createRigidBody(R.RigidBodyDesc.fixed())
  world.createCollider(
    R.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0),
    groundBody,
  )
  const local = createChassisBody(world, 0, 0.72, 0, TEST_CAR.physics)
  const remote = new RemoteCar(
    "rp",
    "r",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  remote.colliderBody?.setTranslation({ x: 20, y: 0.72, z: -50 }, true)
  for (let i = 0; i < 60; i++) world.step()
  const t0 = local.translation()
  const rb0 = remote.colliderBody?.translation()
  remote.drive(1 / 120)
  world.step()
  const t1 = local.translation()
  const rb1 = remote.colliderBody?.translation()
  check(
    "14 idle drive moves nothing",
    Math.abs(t1.x - t0.x) < 0.01 &&
      Math.abs(t1.z - t0.z) < 0.01 &&
      Math.abs(t1.y - t0.y) < 0.02 &&
      !!rb0 &&
      !!rb1 &&
      Math.abs(rb1.x - rb0.x) < 0.01 &&
      Math.abs(rb1.z - rb0.z) < 0.01,
    { t0, t1, rb0, rb1 },
  )
  const base = performance.now()
  for (let i = 0; i < 5; i++) {
    const r = validateStatePacket({
      id: "rp",
      t: 0,
      seq: i,
      sess: "s",
      x: 20 + i,
      y: 0.72,
      z: -50,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      steer: 0,
      speed: 0,
      rpm: 800,
      gear: 1,
      drift: false,
      smoke: false,
      progress: i,
    })
    if (r.ok) remote.onPacket(r.state, base + i * 33)
  }
  for (let i = 0; i < 10; i++) {
    remote.drive(1 / 120)
    world.step()
  }
  const t2 = local.translation()
  check(
    "14 local untouched by remote interp",
    Math.abs(t2.x - t0.x) < 0.02 && Math.abs(t2.z - t0.z) < 0.02,
    { t0, t2 },
  )
  remote.dispose(scene, world)
  world.free()
}

{
  const R = await initPhysics()
  const world = createWorld()
  const scene = new THREE.Scene()
  const mgr = new MultiplayerManager("tester", 0xffffff)
  mgr.attachScene(scene, "./", world, R)
  const H = (m: unknown) =>
    (
      mgr as unknown as { handleStatePacket(p: unknown, id: string): void }
    ).handleStatePacket(m, "qp")
  const E = (m: unknown) =>
    (
      mgr as unknown as { handleNetworkEvent(p: unknown, id: string): void }
    ).handleNetworkEvent(m, "qp")
  const buf = () => getNetDiagSnapshot().peers["qp"]?.bufSize ?? -1
  const car = () =>
    (mgr as unknown as { remoteCars: Map<string, RemoteCar> }).remoteCars.get(
      "qp",
    )
  const pkt = (sess: string, seq: number, x: number) => ({
    id: "qp",
    t: 0,
    seq,
    sess,
    x,
    y: 0.72,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    steer: 0,
    speed: 0,
    rpm: 800,
    gear: 1,
    drift: false,
    smoke: false,
    progress: 0,
  })
  H(pkt("A", 0, 0))
  H(pkt("A", 1, 10))
  car()?.drive(1 / 120)
  const before = buf()
  E({
    type: "HELLO",
    senderId: "qp",
    t: Date.now(),
    payload: { name: "q", color: 1, session: "B", proto: 2 },
  })
  H(pkt("B", 0, 500))
  car()?.drive(1 / 120)
  const snapd = getNetDiagSnapshot().peers["qp"]
  check("I buffer reset on session start", before === 2 && buf() === 1, {
    before,
    after: buf(),
  })
  check("I reset counted", (snapd?.interpResets ?? 0) >= 1, snapd)
  check(
    "I interp active",
    snapd?.interpMode === "hold" ||
      snapd?.interpMode === "interp" ||
      snapd?.interpMode === "extrap",
    snapd?.interpMode,
  )
  mgr.leave()
  world.free()
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
