/**
 * Golden master for every registry car. Measures headless, deterministic
 * behaviour and compares it with scripts/golden-baseline.json.
 *   bun scripts/golden-master.ts            compare (exit 1 on drift)
 *   bun scripts/golden-master.ts --record   rewrite the baseline
 * Metrics: 0-100 km/h, top speed, 100-0 km/h braking distance, skidpad
 * lateral g, steady yaw gain at 50 km/h, and a 10-point trajectory under
 * fixed throttle and steer. Tolerances: metrics 2 %, trajectory 0.3 m.
 */
import { initPhysics, moveGroundBody, FIXED_DT, stepVehicleOnce } from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { CARS, makeRig } from "./lib/cars"

const METRIC_TOL = 0.02
const TRAJ_TOL_M = 0.3
const BASELINE = new URL("./golden-baseline.json", import.meta.url).pathname
const RAPIER = await initPhysics()

const idle = {
  throttle: 0, brake: 0, steer: 0, handbrake: false,
  upshiftPressed: false, downshiftPressed: false, toggleModePressed: false,
  toggleLaunchPressed: false, toggleParkPressed: false, resetPressed: false,
  toggleCameraPressed: false, startPressed: false, escapePressed: false,
} as DriveInput

type Rig = ReturnType<typeof makeRig>
const HZ = Math.round(1 / FIXED_DT)

function advance(r: Rig, inp: DriveInput, steps: number, each?: (i: number) => boolean | void) {
  for (let i = 0; i < steps; i++) {
    stepVehicleOnce(r.world, () => r.car.update(FIXED_DT, inp))
    if (i % 60 === 0) {
      const p = r.body.translation()
      moveGroundBody(r.gb, p.x, p.z)
    }
    if (each && each(i) === true) return i + 1
  }
  return steps
}
const speedKmh = (r: Rig) => Math.abs(r.car.forwardSpeed) * 3.6
const fresh = (def: (typeof CARS)[number]) => {
  const r = makeRig(RAPIER, def)
  advance(r, idle, HZ) // settle
  r.car.parkingBrake = false
  return r
}
/** Put the car at speed v (m/s) heading -Z with matching wheel spin. */
function launchAt(r: Rig, v: number) {
  r.body.setLinvel({ x: 0, y: 0, z: -v }, true)
  advance(r, idle, HZ / 2)
}

function measure(def: (typeof CARS)[number]) {
  const out: Record<string, number> = {}

  // 0-100 and top speed (plateau, 3 s chunks)
  {
    const r = fresh(def)
    const W = { ...idle, throttle: 1 }
    let t100 = -1, top = 0, elapsed = 0
    for (let chunk = 0; chunk < 30; chunk++) {
      const before = top
      advance(r, W, 3 * HZ, (i) => {
        const v = speedKmh(r)
        if (v > top) top = v
        if (t100 < 0 && v >= 100) t100 = chunk * 3 + i / HZ
      })
      elapsed += 3
      if (top - before < 1.5 && top > 36) break
    }
    out.t0to100 = t100
    out.topKmh = top
  }

  // 100-0 braking distance
  {
    const r = fresh(def)
    r.car.gear = 3 as any
    launchAt(r, 100 / 3.6)
    const z0 = r.body.translation().z
    advance(r, { ...idle, brake: 1 }, 20 * HZ, () => speedKmh(r) < 0.5)
    out.brake100to0m = Math.abs(r.body.translation().z - z0)
  }

  // skidpad: full lock at 60 km/h, throttle trimmed by a simple P loop
  {
    const r = fresh(def)
    r.car.gear = 3 as any
    launchAt(r, 60 / 3.6)
    let gMax = 0
    const target = 60
    advance(r, { ...idle, steer: 1, throttle: 0.4 }, 6 * HZ, (i) => {
      if (i > 3 * HZ) {
        const g = (Math.abs(r.car.forwardSpeed) * Math.abs(r.body.angvel().y)) / 9.81
        if (g > gMax) gMax = g
      }
    })
    out.skidpadG = gMax
    void target
  }

  // steady yaw gain at 50 km/h: yaw rate per unit steer, light throttle
  {
    const r = fresh(def)
    r.car.gear = 3 as any
    launchAt(r, 50 / 3.6)
    advance(r, { ...idle, steer: 0.2, throttle: 0.25 }, 4 * HZ)
    out.yawGain50 = Math.abs(r.body.angvel().y) / 0.2
  }

  // trajectory under fixed throttle + steer, 10 samples over 5 s
  const traj: [number, number][] = []
  {
    const r = fresh(def)
    const inp = { ...idle, throttle: 0.5, steer: 0.3 }
    for (let k = 0; k < 10; k++) {
      advance(r, inp, HZ / 2)
      const p = r.body.translation()
      traj.push([+p.x.toFixed(3), +p.z.toFixed(3)])
    }
  }
  return { metrics: out, traj }
}

const results: Record<string, { metrics: Record<string, number>; traj: [number, number][] }> = {}
for (const def of CARS) {
  results[def.id] = measure(def)
  console.log(def.id, JSON.stringify(results[def.id].metrics))
}

if (process.argv.includes("--record")) {
  await Bun.write(BASELINE, JSON.stringify({ hz: HZ, cars: results }, null, 2) + "\n")
  console.log("baseline written: " + BASELINE)
  process.exit(0)
}

if (!(await Bun.file(BASELINE).exists())) {
  console.log("no baseline; run with --record")
  process.exit(1)
}
const base = await Bun.file(BASELINE).json()
let drift = 0
for (const [id, cur] of Object.entries(results)) {
  const b = base.cars[id]
  if (!b) { console.log(`DRIFT | ${id} | not in baseline`); drift++; continue }
  for (const [k, v] of Object.entries(cur.metrics)) {
    const ref = b.metrics[k]
    const rel = Math.abs(v - ref) / Math.max(Math.abs(ref), 1e-9)
    if (!(rel <= METRIC_TOL)) {
      drift++
      console.log(`DRIFT | ${id} | ${k} | ${ref.toFixed(3)} -> ${v.toFixed(3)} (${(rel * 100).toFixed(1)}%)`)
    }
  }
  cur.traj.forEach(([x, z], i) => {
    const d = Math.hypot(x - b.traj[i][0], z - b.traj[i][1])
    if (!(d <= TRAJ_TOL_M)) {
      drift++
      console.log(`DRIFT | ${id} | traj[${i}] | ${d.toFixed(3)} m`)
    }
  })
}
console.log(drift ? `\n${drift} drift(s) from golden baseline` : "\nGolden master matches")
process.exit(drift ? 1 : 0)
