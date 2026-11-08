/**
 * Checks for the generated race circuit map: valid closed loops across seeds,
 * length, road model, surfaces, and a headless build of the world.
 *
 * Run: bun scripts/circuit-test.ts
 */
import * as THREE from "three"
import { createMap, listMaps } from "../src/mainview/maps"
import { createCircuitConfig } from "../src/mainview/maps/circuit/config"
import { Track } from "../src/mainview/maps/circuit/Track"
import { minClearance, minRadius } from "../src/mainview/maps/circuit/generate"

const ctx2d = {
  fillStyle: "",
  fillRect: () => {},
  strokeStyle: "",
  lineWidth: 0,
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
}
;(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
}

let fails = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) fails++
  console.log(
    `${ok ? "PASS" : "FAIL"} | ${label}${detail ? " — " + detail : ""}`,
  )
}

check(
  listMaps().some((m) => m.id === "highway"),
  "registry: highway is registered",
)
check(
  listMaps().some((m) => m.id === "circuit"),
  "registry: circuit is registered",
)

const lengths = [1500, 3000, 5000, 10000, 20000]
const twists = [0, 0.6, 1]
let bad = ""
let worstRadius = Infinity
let worstLenErr = 0
let worstClear = Infinity
let tracks = 0
for (const lengthM of lengths) {
  for (const twistiness of twists) {
    for (let seed = 1; seed <= 25; seed++) {
      const cfg = createCircuitConfig({ seed, lengthM, twistiness })
      const t = new Track(cfg)
      tracks++
      const r = minRadius(t.xs, t.zs)
      const clear = minClearance(t.xs, t.zs, t.lengthM, 200)
      worstRadius = Math.min(worstRadius, r)
      worstClear = Math.min(worstClear, clear)
      worstLenErr = Math.max(
        worstLenErr,
        Math.abs(t.lengthM - lengthM) / lengthM,
      )
      const gap = Math.hypot(t.xs[0] - t.xs[t.n - 1], t.zs[0] - t.zs[t.n - 1])
      if (r < 30 || gap > t.ds * 1.5 || !Number.isFinite(t.lengthM)) {
        bad = `seed ${seed} len ${lengthM} tw ${twistiness}: r=${r.toFixed(1)} gap=${gap.toFixed(2)}`
      }
    }
  }
}
check(
  bad === "",
  `generation: ${tracks} tracks are closed with turns >= 30 m radius`,
  bad || `tightest ${worstRadius.toFixed(1)} m`,
)
check(
  worstLenErr < 0.002,
  "generation: length matches the request",
  `worst error ${(worstLenErr * 100).toFixed(3)}%`,
)
check(
  worstClear > 50,
  "generation: no section runs close to another",
  `closest ${worstClear.toFixed(0)} m`,
)

{
  const a = new Track(createCircuitConfig({ seed: 42, lengthM: 5000 }))
  const b = new Track(createCircuitConfig({ seed: 42, lengthM: 5000 }))
  const c = new Track(createCircuitConfig({ seed: 43, lengthM: 5000 }))
  check(
    a.xs.every((v, i) => v === b.xs[i]),
    "determinism: same seed gives the same track",
  )
  check(
    !a.xs.every((v, i) => v === c.xs[i]),
    "determinism: another seed gives another track",
  )
}

{
  const t = new Track(createCircuitConfig({ seed: 7, lengthM: 6000 }))
  let worst = 0
  let worstS = 0
  for (let s = 0; s < t.lengthM; s += 13.7) {
    const p = t.at(s)
    const lat = ((s * 7) % 9) - 4.5
    const x = p.x - p.tz * lat
    const z = p.z + p.tx * lat
    const h = t.project(x, z)
    const d = Math.abs(h.s - s)
    worstS = Math.max(worstS, Math.min(d, t.lengthM - d))
    worst = Math.max(worst, Math.abs(h.lateral - lat))
  }
  check(
    worst < 0.05,
    "projection: lateral offset round-trips",
    `worst ${worst.toFixed(3)} m`,
  )
  check(
    worstS < 3,
    "projection: arc position round-trips",
    `worst ${worstS.toFixed(2)} m`,
  )
  const start = t.at(0)
  const back = t.at(t.lengthM)
  check(
    Math.hypot(start.x - back.x, start.z - back.z) < 1e-6,
    "at(): the loop wraps",
  )
}

const inst = createMap("circuit", { seed: 11, lengthM: 4000, widthM: 14 })
check(
  inst.linear === null && inst.circuit !== null,
  "instance: circuit has no linear road",
)
check(
  inst.map.features.races &&
    inst.map.features.multiplayer &&
    !inst.map.features.traffic &&
    !inst.map.features.airport,
  "instance: races + multiplayer on, traffic and airport off",
)
{
  const pose = inst.road.spawnPose(-12, 0)
  const progress = inst.circuit!.progressAt(pose.x, pose.z)
  check(
    Math.abs(progress - (inst.circuit!.lengthM - 12)) < 1.5,
    "spawn: 12 m behind the line",
    `progress ${progress.toFixed(1)} of ${inst.circuit!.lengthM.toFixed(0)}`,
  )
  const fwd = { x: -Math.sin(pose.yaw), z: -Math.cos(pose.yaw) }
  const ahead = inst.road.spawnPose(-10, 0)
  const dir = { x: ahead.x - pose.x, z: ahead.z - pose.z }
  check(
    fwd.x * dir.x + fwd.z * dir.z > 1.9,
    "spawn: the car faces the direction of travel",
  )
  const near = inst.road.nearestPose(pose.x + 3, pose.z + 3)
  check(
    Math.hypot(near.x - pose.x, near.z - pose.z) < 6,
    "reset: nearest pose lands on the centre line",
  )
}

const scene = new THREE.Scene()
const world = inst.world
await world.init(scene, "/")
world.setTimeOfDay("day")
world.setVegetation(100)
const start = inst.road.spawnPose(0, 0)
world.update(0, new THREE.Vector3(start.x, 0.7, start.z), 1)
check(
  world.surfaceAt(start.x, start.z) === "asphalt",
  "surface: the centre line is asphalt",
)
{
  const h = inst.road.spawnPose(0, 0)
  const nrm = { x: Math.cos(h.yaw), z: -Math.sin(h.yaw) }
  const at = (d: number) => world.surfaceAt(h.x + nrm.x * d, h.z + nrm.z * d)
  check(at(6.5) === "asphalt", "surface: the kerb is asphalt")
  check(at(12) === "gravel", "surface: run-off is gravel")
  check(at(40) === "grass", "surface: beyond the run-off is grass")
}
let trees = 0
scene.traverse((o) => {
  if ((o as THREE.InstancedMesh).isInstancedMesh)
    trees += (o as THREE.InstancedMesh).count
})
check(trees > 300, "vegetation: trees are planted", `${trees} at 100%`)
world.setVegetation(0)
let none = 0
scene.traverse((o) => {
  if ((o as THREE.InstancedMesh).isInstancedMesh)
    none += (o as THREE.InstancedMesh).count
})
check(none === 0, "vegetation: 0% removes every tree")
world.setVegetation(50)
let half = 0
scene.traverse((o) => {
  if ((o as THREE.InstancedMesh).isInstancedMesh)
    half += (o as THREE.InstancedMesh).count
})
check(
  Math.abs(half / trees - 0.5) < 0.05,
  "vegetation: 50% keeps about half",
  `${half}/${trees}`,
)

{
  const noBarriers = createMap("circuit", {
    seed: 11,
    barriers: false,
    treesPer100m: 0,
  })
  const sc = new THREE.Scene()
  await noBarriers.world.init(sc, "/")
  let meshes = 0
  sc.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes++
  })
  check(meshes > 0, "options: a world builds without barriers or trees")
}

{
  const m = createMap("circuit", { seed: 5, lengthM: 3000 })
  const L = m.circuit!.lengthM
  const tr = m.circuit!.progressTracker()
  const first = m.road.spawnPose(-12, 0)
  const p0 = tr(first.x, first.z)
  check(
    Math.abs(p0 + 12) < 1.5,
    "progress: grid spot starts behind the line",
    String(p0),
  )
  let last = p0
  let mono = true
  for (let s = -12; s < L * 2.05; s += 15) {
    const pz = m.road.spawnPose(s, 0)
    const v = tr(pz.x, pz.z)
    if (v < last - 1e-6) mono = false
    last = v
  }
  check(
    mono && Math.abs(last - L * 2.05) < 30,
    "progress: accumulates across laps",
    `${last} vs ${L * 2.05}`,
  )
  check(typeof m.rivalDriver === "function", "circuit: provides a rival driver")
  check(
    m.map.gapM!(120, 100) === 20 && m.map.gapM!(100, 120) === -20,
    "circuit: signed race gap",
  )
}

{
  // Hills must never sit on the track.
  const { world, track } = (() => {
    const inst = createMap("circuit", { seed: 77, lengthM: 4000 })
    return { world: inst.world as any, track: null as any }
  })()
  const sc = new THREE.Scene()
  await world.init(sc, "/")
  const t = (world as any).track
  let worst = Infinity
  for (const h of (world as any).hills) {
    const hx = h.mesh.position.x
    const hz = h.mesh.position.z
    for (let i = 0; i < t.xs.length; i++) {
      const d = Math.hypot(t.xs[i] - hx, t.zs[i] - hz) - h.radius
      if (d < worst) worst = d
    }
  }
  check(
    (world as any).hills.length > 0 &&
      worst > t.config.widthM / 2 + t.config.runoffM,
    "hills: clear of the track",
    String(worst),
  )
  void track
}

{
  const hw = createMap("highway")
  check(
    hw.linear !== null && hw.circuit === null,
    "highway: unchanged linear road",
  )
  const pose = hw.road.spawnPose(500, 0)
  check(Math.abs(pose.z + 500) < 1e-9, "highway: spawn pose follows z = -s")
}

console.log(fails ? `\n${fails} FAILED` : "\nALL CIRCUIT CHECKS PASSED")
process.exit(fails ? 1 : 0)
