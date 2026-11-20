import * as THREE from "three"
import {
  initPhysics,
  createWorld,
  createChassisBody,
  FIXED_DT,
} from "../src/mainview/physics/core/PhysicsSystem"
import { validateStatePacket } from "../src/mainview/systems/net/stateProtocol"
import { getNetDiagSnapshot } from "../src/mainview/systems/net/NetDiagnostics"
import { RemoteCar } from "../src/mainview/systems/net/RemoteCar"
import { getCar } from "../src/mainview/data/cars"

const TEST_CAR = getCar("bmw-m3")
const TEST_REMOTE_OPTS = {
  modelFile: TEST_CAR.modelFile,
  physics: TEST_CAR.physics,
  startPlaced: true,
}

const GROUND_TOP = -0.05
const BOTTOM_OFF = 0.42
const REST_BOTTOM = 0.72 - BOTTOM_OFF
const PEN_TOL = 0.01

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

const R = await initPhysics()

function makeWorld(groundFriction = 1.0) {
  const world = createWorld()
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed())
  world.createCollider(
    R.ColliderDesc.cuboid(1000, 5, 1000)
      .setTranslation(0, -5.05, 0)
      .setFriction(groundFriction)
      .setRestitution(0),
    ground,
  )
  const scene = new THREE.Scene()
  return { world, scene }
}
function ghostCollider(car: RemoteCar): any {
  return (car as unknown as { collider: any }).collider
}
function feed(
  car: RemoteCar,
  seq: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  arr: number,
) {
  const r = validateStatePacket({
    id: "p",
    t: 0,
    seq,
    sess: "s",
    x,
    y,
    z,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx,
    vy,
    vz,
    steer: 0,
    speed: 0,
    rpm: 800,
    gear: 1,
    drift: false,
    smoke: false,
    progress: seq,
  })
  if (!r.ok) throw new Error("bad test packet")
  car.onPacket(r.state, arr)
}

interface StepRec {
  y: number
  bottom: number
  cmdVy: number
  vy: number
  speed: number
  support: boolean
  traffic: boolean
  mode: string
  impulse: number
}
function classify(
  world: any,
  col: any,
): { support: boolean; traffic: boolean; impulse: number; normals: string } {
  let support = false
  let traffic = false
  let impulse = 0
  const normals: string[] = []
  world.contactPairsWith(col, (other: any) => {
    world.contactPair(col, other, (m: any) => {
      if (m.numContacts() > 0) {
        let ny = 0
        try {
          const v = m.normal()
          ny = v.y
          normals.push(`n=${m.numContacts()} ny=${ny.toFixed(2)}`)
        } catch {
          normals.push("n=? ny=?")
        }
        if (Math.abs(ny) <= 0.7) {
          traffic = true
          const n = m.numSolverContacts()
          for (let i = 0; i < n; i++) impulse += Math.abs(m.contactImpulse(i))
        } else {
          support = true
        }
      }
    })
  })
  return { support, traffic, impulse, normals: normals.join(" | ") }
}

function summarize(label: string, trace: StepRec[]) {
  const ys = trace.map((s) => s.y)
  const bots = trace.map((s) => s.bottom)
  const minB = Math.min(...bots)
  const maxB = Math.max(...bots)
  const supSteps = trace.filter((s) => s.support).length
  const driveInSteps = trace.filter((s) => s.support && s.cmdVy < -0.5).length
  let reversals = 0
  let lastDir = 0
  let extremum = ys[0]
  for (let i = 1; i < ys.length; i++) {
    const d = Math.sign(ys[i] - ys[i - 1])
    if (d !== 0) {
      if (
        lastDir !== 0 &&
        d !== lastDir &&
        Math.abs(ys[i - 1] - extremum) > 0.05
      )
        reversals++
      if (d !== lastDir) {
        lastDir = d
        extremum = ys[i - 1]
      }
    }
  }
  const finite = trace.every((s) =>
    [s.y, s.vy, s.speed, s.cmdVy].every(Number.isFinite),
  )
  console.log(
    `${label}: steps=${trace.length} minBottom=${minB.toFixed(3)} maxBottom=${maxB.toFixed(3)} ` +
      `supportSteps=${supSteps} driveIntoSupport=${driveInSteps} yReversals>5cm=${reversals} finite=${finite}`,
  )
  return { minB, maxB, supSteps, driveInSteps, reversals, finite }
}

{
  console.log("--- T1a pillar ---")
  const { world, scene } = makeWorld(0.0)
  const striker = createChassisBody(world, 0, 0.72, 14, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t1a",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  const T = 10_000_000
  car.nowOverride = T
  feed(car, 0, 0, 0.72, 0, 0, 0, 0, T)
  striker.setLinvel({ x: 0, y: 0, z: -12 }, true)
  const trace: StepRec[] = []
  let contactAt = -1
  let ghostPeak = 0
  let strikerPostMin = Infinity
  for (let i = 0; i < 360; i++) {
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    if (i % 2 === 0) car.sampleContacts(T)
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    const c = classify(world, col)
    if (c.traffic && contactAt < 0) contactAt = i
    const gsp = Math.hypot(v.x, v.z)
    ghostPeak = Math.max(ghostPeak, gsp)
    if (contactAt >= 0 && i <= contactAt + 30) {
      const svv = striker.linvel()
      strikerPostMin = Math.min(strikerPostMin, Math.hypot(svv.x, svv.z))
    }
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: gsp,
      support: c.support,
      traffic: c.traffic,
      mode: getNetDiagSnapshot().peers["r-t1a"]?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  const s = summarize("T1a", trace)
  check("T1a contact occurs (no tunneling)", contactAt >= 0, contactAt)
  const sv = striker.linvel()
  const sSpeed = Math.hypot(sv.x, sv.z)
  console.log(
    `T1a: contact at step ${contactAt}, striker end speed=${sSpeed.toFixed(2)} m/s, ghost z=${car.colliderBody!.translation().z.toFixed(2)} m`,
  )
  check(
    "T1a striker survives impact window (>= 1.5 m/s)",
    strikerPostMin >= 1.5,
    strikerPostMin,
  )
  check(
    "T1a ghost receives momentum (peak >= 4 m/s)",
    ghostPeak >= 4,
    ghostPeak,
  )
  check(
    "T1a no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  check("T1a state stays finite", s.finite)
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T1b bulldoze + return ---")
  const { world, scene } = makeWorld()
  const striker = createChassisBody(world, 0, 0.72, 6, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t1b",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  const T = 11_000_000
  car.nowOverride = T
  feed(car, 0, 0, 0.72, 0, 0, 0, 0, T)
  const trace: StepRec[] = []
  const steprec = () => {
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    const c = classify(world, col)
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: Math.hypot(v.x, v.z),
      support: c.support,
      traffic: c.traffic,
      mode: getNetDiagSnapshot().peers["r-t1b"]?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  for (let i = 0; i < 240; i++) {
    striker.setLinvel({ x: 0, y: 0, z: -6 }, true)
    steprec()
    if (i % 2 === 0) car.sampleContacts(T)
  }
  const bulldozed = car.colliderBody!.translation().z
  let now = T
  let seq = 1
  let retCorrPeak = 0
  let retDvPeak = 0
  let errStart = -1
  let errEnd = -1
  for (let i = 0; i < 240; i++) {
    now += 1000 / 120
    car.nowOverride = now
    if (i % 30 === 0) feed(car, seq++, 0, 0.72, 0, 0, 0, 0, now)
    striker.setLinvel({ x: 0, y: 0, z: 8 }, true)
    steprec()
    const dd = getNetDiagSnapshot().peers["r-t1b"]
    if (i === 0) errStart = dd?.posErrM ?? -1
    if (i === 239) errEnd = dd?.posErrM ?? -1
    retDvPeak = Math.max(retDvPeak, dd?.corrDv ?? 0)
    if (i >= 100) retCorrPeak = Math.max(retCorrPeak, dd?.corrCmd ?? 0)
    if (i % 10 === 0) car.sampleContacts(now)
  }
  const s = summarize("T1b", trace)
  const ret = trace.slice(240)
  const returnPeak = Math.max(...ret.map((t) => t.speed))
  const snaps = getNetDiagSnapshot().peers["r-t1b"]?.snaps ?? -1
  console.log(
    `T1b: bulldozed to z=${bulldozed.toFixed(2)} m, return peak speed=${returnPeak.toFixed(2)} m/s (residual coast), return peak correction=${retCorrPeak.toFixed(2)} m/s, warps=${snaps}`,
  )
  check(
    "T1b bulldozing observed (ghost creeps while pushed)",
    bulldozed < -0.5,
    bulldozed,
  )
  check(
    "T1b return correction is gradual (peak cmd <= 3.5 m/s)",
    retCorrPeak <= 3.5,
    retCorrPeak,
  )
  check(
    "T1b return has no command jumps (dv <= 0.25 m/s/step)",
    retDvPeak <= 0.25,
    retDvPeak,
  )
  check(
    "T1b return converges (err shrinking)",
    errEnd >= 0 && errEnd < errStart,
    { errStart, errEnd },
  )
  check("T1b return uses no warp", snaps === 0, snaps)
  check(
    "T1b no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  check("T1b state stays finite", s.finite)
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T2 crest + recover ---")
  const { world, scene } = makeWorld()
  const wall = createChassisBody(world, 0, 0.72, -14, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t2",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  let now = 20_000_000
  let seq = 0
  let z = -6
  car.nowOverride = now
  const trace: StepRec[] = []
  const run = (steps: number, vy: number) => {
    for (let i = 0; i < steps; i++) {
      now += 1000 / 120
      car.nowOverride = now
      if (i % 4 === 0) {
        z -= 0.05
        feed(car, seq++, 0, 0.72, z, 0, vy, -6, now)
      }
      car.drive(FIXED_DT)
      const cmd = car.colliderBody!.linvel()
      world.step()
      if (i % 5 === 0) car.sampleContacts(now)
      const p = car.colliderBody!.translation()
      const v = car.colliderBody!.linvel()
      const c = classify(world, col)
      trace.push({
        y: p.y,
        bottom: p.y - BOTTOM_OFF,
        cmdVy: cmd.y,
        vy: v.y,
        speed: Math.hypot(v.x, v.z),
        support: c.support,
        traffic: c.traffic,
        mode: getNetDiagSnapshot().peers["r-t2"]?.corrMode ?? "?",
        impulse: c.impulse,
      })
    }
  }
  run(120, -1.5)
  run(240, 0)
  const s = summarize("T2", trace)
  const tail = trace.slice(-60)
  const tailMin = Math.min(...tail.map((t) => t.bottom))
  check(
    "T2 traffic contact occurs",
    trace.some((t) => t.traffic),
  )
  check(
    "T2 no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  check(
    "T2 recovers height after crest (tail bottom >= 0.20)",
    tailMin >= REST_BOTTOM - 0.1,
    tailMin,
  )
  check(
    "T2 no sustained drive-into-support (steps < 25%)",
    s.driveInSteps < trace.length * 0.25,
    s.driveInSteps,
  )
  check(
    "T2 no repeated vertical oscillation (<6 reversals)",
    s.reversals < 6,
    s.reversals,
  )
  void wall
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T3 side-swipe + bounce ---")
  const { world, scene } = makeWorld()
  const other = createChassisBody(world, 2.0, 0.72, -6, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t3",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  let now = 30_000_000
  let seq = 0
  let x = 2.0
  let z = 0
  let flip = false
  car.nowOverride = now
  const trace: StepRec[] = []
  let maxLat = 0
  for (let i = 0; i < 360; i++) {
    now += 1000 / 120
    car.nowOverride = now
    if (i % 2 === 0) {
      x -= 0.01
      z -= 0.165
      flip = !flip
      feed(car, seq++, x, 0.72, z, -0.5, flip ? 3 : -3, -10, now)
    }
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    if (i % 5 === 0) car.sampleContacts(now)
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    maxLat = Math.max(maxLat, Math.abs(p.x - (2.0 - 0.01 * Math.floor(i / 2))))
    const c = classify(world, col)
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: Math.hypot(v.x, v.z),
      support: c.support,
      traffic: c.traffic,
      mode: getNetDiagSnapshot().peers["r-t3"]?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  const s = summarize("T3", trace)
  const tail = trace.slice(-60)
  const tailMin = Math.min(...tail.map((t) => t.bottom))
  console.log(
    `T3: max lateral displacement from owner line = ${maxLat.toFixed(2)} m`,
  )
  check("T3 lateral knock stands (no snap-back to line)", maxLat > 0.3, maxLat)
  check(
    "T3 no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  check(
    "T3 height recovers after bounce (tail bottom >= 0.15)",
    tailMin >= REST_BOTTOM - 0.15,
    tailMin,
  )
  void other
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T4 recovery ---")
  const { world, scene } = makeWorld()
  const block = createChassisBody(world, 0, 0.72, -8, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t4",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  const T = 40_000_000
  car.nowOverride = T
  for (let i = 0; i < 10; i++)
    feed(car, i, 0, 0.72, -i * 0.3, 0, 0, -9, T + i * 33)
  car.nowOverride = T + 9 * 33 + 100
  for (
    let i = 0;
    i < 120 && !getNetDiagSnapshot().peers["r-t4"]?.inContact;
    i++
  ) {
    car.drive(FIXED_DT)
    world.step()
    car.sampleContacts(T + 9 * 33 + 100)
  }
  const bp = block.translation()
  block.setTranslation({ x: bp.x + 30, y: bp.y, z: bp.z }, true)
  block.setLinvel({ x: 0, y: 0, z: 0 }, true)
  let now = T + 9 * 33 + 100
  let seq = 10
  let z = -2.7
  const snapsBefore = getNetDiagSnapshot().peers["r-t4"]?.snaps ?? 0
  const trace: StepRec[] = []
  for (let i = 0; i < 200; i++) {
    now += 1000 / 120
    car.nowOverride = now
    if (i % 4 === 0) {
      z -= 0.3
      feed(car, seq++, 0, 0.72, z, 0, 0, -9, now)
    }
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    if (i % 10 === 0) car.sampleContacts(now)
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    const c = classify(world, col)
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: Math.hypot(v.x, v.z),
      support: c.support,
      traffic: c.traffic,
      mode: getNetDiagSnapshot().peers["r-t4"]?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  const s = summarize("T4", trace)
  const last = trace[trace.length - 1]
  check(
    "T4 reconverges (final err < 1.5 m)",
    Math.abs(last.y - 0.72) < 1.5 && last.speed < 15,
    last,
  )
  check(
    "T4 no warp during recovery",
    (getNetDiagSnapshot().peers["r-t4"]?.snaps ?? 0) === snapsBefore,
  )
  check(
    "T4 recovery never penetrates road",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T5 high-speed + normals ---")
  const { world, scene } = makeWorld()
  const parked = createChassisBody(world, 0, 0.72, 0, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t5",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  const T = 50_000_000
  car.nowOverride = T
  for (let i = 0; i < 40; i++)
    feed(car, i, 0, 0.72, 40 - i * 1.0, 0, 0, -30, T + i * 33)
  car.nowOverride = T + 39 * 33 + 100
  car.colliderBody!.setTranslation({ x: 0, y: 0.72, z: 12 }, true)
  const trace: StepRec[] = []
  let normLog = ""
  for (let i = 0; i < 240; i++) {
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    if (i % 2 === 0) car.sampleContacts(T + 39 * 33 + 100)
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    const c = classify(world, col)
    if (c.traffic && !normLog) normLog = c.normals
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: Math.hypot(v.x, v.z),
      support: c.support,
      traffic: c.traffic,
      mode: getNetDiagSnapshot().peers["r-t5"]?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  const s = summarize("T5", trace)
  console.log(
    `T5: first traffic normals: ${normLog || "(no traffic contact!)"}`,
  )
  check(
    "T5 traffic contact occurs (no tunneling past)",
    trace.some((t) => t.traffic),
    normLog,
  )
  check("T5 state stays finite at speed", s.finite)
  check(
    "T5 no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  void parked
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T6 support normals ---")
  const { world, scene } = makeWorld()
  for (let i = 0; i < 10; i++) world.step()
  const car = new RemoteCar(
    "r-t6",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  const T = 60_000_000
  car.nowOverride = T
  const pitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.17, 0, 0))
  {
    const r = validateStatePacket({
      id: "p",
      t: 0,
      seq: 0,
      sess: "s",
      x: 0,
      y: 0.72,
      z: 0,
      qx: pitch.x,
      qy: pitch.y,
      qz: pitch.z,
      qw: pitch.w,
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
    if (!r.ok) throw new Error("bad test packet")
    car.onPacket(r.state, T)
  }
  car.colliderBody!.setRotation(
    { x: pitch.x, y: pitch.y, z: pitch.z, w: pitch.w },
    true,
  )
  car.colliderBody!.setAngvel({ x: 0, y: 0, z: 0 }, true)
  for (let i = 0; i < 120; i++) {
    car.drive(FIXED_DT)
    world.step()
    if (i % 5 === 0) car.sampleContacts(T)
  }
  const recs: string[] = []
  let supFwd = false
  let supRev = false
  world.contactPairsWith(col, (other: any) => {
    world.contactPair(col, other, (m: any) => {
      if (m.numContacts() > 0) {
        const v1 = m.normal()
        supFwd = supFwd || Math.abs(v1.y) > 0.7
        recs.push(`fwd n=${m.numContacts()} ny=${v1.y.toFixed(2)}`)
      }
    })
    world.contactPair(other, col, (m2: any, flipped: boolean) => {
      if (m2.numContacts() > 0) {
        const v2 = m2.normal()
        supRev = supRev || Math.abs(v2.y) > 0.7
        recs.push(
          `rev flipped=${flipped} n=${m2.numContacts()} ny=${v2.y.toFixed(2)}`,
        )
      }
    })
  })
  console.log(`T6: normals: ${recs.join(" | ") || "(no contacts)"}`)
  const p = car.colliderBody!.translation()
  console.log(
    `T6: ghost y=${p.y.toFixed(3)} bottom~${(p.y - BOTTOM_OFF).toFixed(3)} (corners lower when pitched)`,
  )
  check("T6 support normals vertical in fwd ordering (|ny|>0.7)", supFwd, recs)
  check("T6 support normals vertical in rev ordering (|ny|>0.7)", supRev, recs)
  check("T6 state stays finite", [p.y].every(Number.isFinite))
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T7 pit-sustain, no warp ---")
  const { world, scene } = makeWorld()
  const striker = createChassisBody(world, 8, 0.72, -8, TEST_CAR.physics)
  for (let i = 0; i < 60; i++) world.step()
  const car = new RemoteCar(
    "r-t7",
    "t",
    0xffffff,
    scene,
    "./",
    world,
    R,
    TEST_REMOTE_OPTS,
  )
  const col = ghostCollider(car)
  let now = 70_000_000
  let seq = 0
  car.nowOverride = now
  let oz = 2
  const feedOwner = () => feed(car, seq++, 0, 0.72, oz, 0, 0, -10, now)
  for (let k = 0; k < 12; k++) {
    now += 33
    car.nowOverride = now
    oz -= 0.33
    feedOwner()
  }
  const snapsBefore = getNetDiagSnapshot().peers["r-t7"]?.snaps ?? 0
  let contactSeen = false
  let recoverSeen = false
  let maxLat = 0
  const trace: StepRec[] = []
  for (let i = 0; i < 900; i++) {
    now += 1000 / 120
    car.nowOverride = now
    if (i % 4 === 0) {
      oz -= (10 * (1000 / 120) * 4) / 1000
      feedOwner()
    }
    striker.setLinvel({ x: -12, y: 0, z: 0 }, true)
    car.drive(FIXED_DT)
    const cmd = car.colliderBody!.linvel()
    world.step()
    if (i % 2 === 0) car.sampleContacts(now)
    const p = car.colliderBody!.translation()
    const v = car.colliderBody!.linvel()
    const c = classify(world, col)
    const dg = getNetDiagSnapshot().peers["r-t7"]
    if (dg?.inContact) contactSeen = true
    if (dg?.corrMode === "recover") recoverSeen = true
    maxLat = Math.max(maxLat, Math.abs(p.x))
    trace.push({
      y: p.y,
      bottom: p.y - BOTTOM_OFF,
      cmdVy: cmd.y,
      vy: v.y,
      speed: Math.hypot(v.x, v.z),
      support: c.support,
      traffic: c.traffic,
      mode: dg?.corrMode ?? "?",
      impulse: c.impulse,
    })
  }
  const s = summarize("T7", trace)
  const snaps = (getNetDiagSnapshot().peers["r-t7"]?.snaps ?? 0) - snapsBefore
  const errEnd = getNetDiagSnapshot().peers["r-t7"]?.posErrM ?? 99
  const last = trace[trace.length - 1]
  console.log(
    `T7: max lateral=${maxLat.toFixed(2)} m warps=${snaps} final err=${errEnd.toFixed(2)} m`,
  )
  check("T7 contact occurs (no tunneling)", contactSeen)
  check("T7 recovery observed", recoverSeen)
  check("T7 knock stands laterally (>1 m, no pin)", maxLat > 1, maxLat)
  check("T7 no warp on explained divergence", snaps === 0, snaps)
  check("T7 reconverges (final err < 1.5 m)", errEnd < 1.5, errEnd)
  check("T7 final speed sane (<15 m/s)", last.speed < 15, last.speed)
  check(
    "T7 no deep ground penetration (bottom >= -0.06)",
    s.minB >= GROUND_TOP - PEN_TOL,
    s.minB,
  )
  check("T7 state stays finite", s.finite)
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T8 ghost appears near local car ---")
  const { world, scene } = makeWorld(1.0)
  const local = createChassisBody(world, 0, 0.72, 0, TEST_CAR.physics)
  for (let i = 0; i < 120; i++) world.step()
  const car = new RemoteCar("r-t8", "t", 0xffffff, scene, "./", world, R, {
    ...TEST_REMOTE_OPTS,
    startPlaced: false,
  })
  const T = 10_000_000
  car.nowOverride = T
  let peak = 0
  for (let i = 0; i < 240; i++) {
    if (i % 2 === 0) feed(car, i, 5, 0.72, 0, 0, 0, 0, T)
    car.drive(FIXED_DT)
    world.step()
    const v = local.linvel()
    peak = Math.max(peak, Math.hypot(v.x, v.z))
  }
  const gp = car.colliderBody!.translation()
  check("T8 ghost placed at its real position", Math.abs(gp.x - 5) < 0.3, gp.x)
  check("T8 parked car not shoved (<0.3 m/s)", peak < 0.3, peak)
  car.dispose(scene, world)
  world.free()
}

{
  console.log("--- T9 ghost appears inside local car ---")
  const { world, scene } = makeWorld(1.0)
  const local = createChassisBody(world, 0, 0.72, 0, TEST_CAR.physics)
  for (let i = 0; i < 120; i++) world.step()
  const car = new RemoteCar("r-t9", "t", 0xffffff, scene, "./", world, R, {
    ...TEST_REMOTE_OPTS,
    startPlaced: false,
  })
  const col = ghostCollider(car)
  const T = 10_000_000
  car.nowOverride = T
  let peak = 0
  let solidWhileOverlapped = false
  for (let i = 0; i < 480; i++) {
    const x = i < 240 ? 0.3 : 8
    if (i % 2 === 0) feed(car, i, x, 0.72, 0, 0, 0, 0, T)
    car.drive(FIXED_DT)
    world.step()
    if (i < 200 && col.collisionGroups() === 0xffffffff)
      solidWhileOverlapped = true
    const v = local.linvel()
    peak = Math.max(peak, Math.hypot(v.x, v.z))
  }
  check("T9 overlapping ghost is not solid", !solidWhileOverlapped)
  check(
    "T9 local car not shoved by an overlapping ghost (<0.3 m/s)",
    peak < 0.3,
    peak,
  )
  check(
    "T9 ghost turns solid once clear",
    col.collisionGroups() === 0xffffffff,
    col.collisionGroups(),
  )
  car.dispose(scene, world)
  world.free()
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
