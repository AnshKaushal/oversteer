/**
 * Steady-state and transient handling per car, from the spec alone.
 *   bun scripts/handling-report.ts [car-id ...]
 * Skidpad sweep at 60 km/h (steady cornering, throttle holds speed): understeer
 * gradient in deg/g from road-wheel angle against lateral g. Step steer at
 * 80 km/h: yaw-rate rise time to 90 % and overshoot.
 */
import {
  initPhysics,
  moveGroundBody,
  FIXED_DT,
  stepVehicleOnce,
} from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { CARS, makeRig } from "./lib/cars"

const RAPIER = await initPhysics()
const HZ = Math.round(1 / FIXED_DT)
const G = 9.81
const idle = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  upshiftPressed: false,
  downshiftPressed: false,
  toggleModePressed: false,
  toggleLaunchPressed: false,
  toggleParkPressed: false,
  resetPressed: false,
  toggleCameraPressed: false,
  startPressed: false,
  escapePressed: false,
} as DriveInput
type Rig = ReturnType<typeof makeRig>

function advance(
  r: Rig,
  inp: DriveInput | (() => DriveInput),
  steps: number,
  each?: (i: number) => void,
) {
  for (let i = 0; i < steps; i++) {
    const u = typeof inp === "function" ? inp() : inp
    stepVehicleOnce(r.world, () => r.car.update(FIXED_DT, u))
    if (i % 60 === 0) {
      const p = r.body.translation()
      moveGroundBody(r.gb, p.x, p.z)
    }
    each?.(i)
  }
}
function fresh(def: (typeof CARS)[number], kmh: number) {
  const r = makeRig(RAPIER, def)
  advance(r, idle, HZ)
  r.car.parkingBrake = false
  r.car.gear = 3 as never
  r.body.setLinvel({ x: 0, y: 0, z: -kmh / 3.6 }, true)
  advance(r, idle, HZ / 2)
  return r
}
/** Throttle that holds the target speed. */
const hold = (r: Rig, kmh: number, steer: number) => (): DriveInput => {
  const err = kmh / 3.6 - Math.abs(r.car.forwardSpeed)
  return {
    ...idle,
    steer,
    throttle: Math.min(1, Math.max(0, 0.3 + err * 0.3)),
    brake: err < -2 ? 0.2 : 0,
  }
}

function skidpad(def: (typeof CARS)[number]) {
  const wheelbase = wheelbaseOf(def)
  const pts: { ay: number; delta: number }[] = []
  for (const s of [0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.4]) {
    const r = fresh(def, 60)
    advance(r, hold(r, 60, s), 5 * HZ)
    let ay = 0,
      yaw = 0,
      delta = 0,
      n = 0
    advance(r, hold(r, 60, s), HZ, () => {
      ay += (Math.abs(r.car.forwardSpeed) * Math.abs(r.body.angvel().y)) / G
      yaw += Math.abs(r.body.angvel().y)
      delta += Math.abs(r.car.steerAngle)
      n++
    })
    pts.push({
      ay: ay / n,
      delta: delta / n - (wheelbase * yaw) / n / Math.abs(r.car.forwardSpeed),
    })
  }
  const lin = pts.filter((p) => p.ay < 0.5)
  let slope = NaN
  if (lin.length >= 2) {
    const a = lin[0],
      b = lin[lin.length - 1]
    slope = ((b.delta - a.delta) * (180 / Math.PI)) / (b.ay - a.ay)
  }
  return { slope, maxG: Math.max(...pts.map((p) => p.ay)) }
}

function wheelbaseOf(def: (typeof CARS)[number]) {
  const zs = def.wheels.map((w) => w.z)
  return Math.max(...zs) - Math.min(...zs)
}

function stepSteer(def: (typeof CARS)[number]) {
  const r = fresh(def, 80)
  advance(r, hold(r, 80, 0), HZ)
  const trace: number[] = []
  advance(r, hold(r, 80, 0.15), 3 * HZ, () =>
    trace.push(Math.abs(r.body.angvel().y)),
  )
  const ss = trace.slice(-HZ).reduce((a, b) => a + b, 0) / HZ
  const peak = Math.max(...trace)
  const rise = trace.findIndex((y) => y >= 0.9 * ss) / HZ
  return { rise, overshoot: ss > 0 ? (peak - ss) / ss : 0 }
}

const ids = process.argv.slice(2)
console.log(
  "car".padEnd(18),
  "US grad deg/g".padStart(14),
  "max g".padStart(7),
  "rise 90% s".padStart(11),
  "overshoot".padStart(10),
)
for (const def of CARS.filter((c) => ids.length === 0 || ids.includes(c.id))) {
  const s = skidpad(def)
  const t = stepSteer(def)
  console.log(
    def.id.padEnd(18),
    s.slope.toFixed(2).padStart(14),
    s.maxG.toFixed(2).padStart(7),
    t.rise.toFixed(2).padStart(11),
    `${(t.overshoot * 100).toFixed(0)}%`.padStart(10),
  )
}
