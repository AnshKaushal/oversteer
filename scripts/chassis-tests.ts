/**
 * P5 chassis checks, one car per run (CAR=<id>, or via run-per-car): the
 * suspension, alignment, tire and steering models against what the car spec
 * says they should do.
 */
import { initPhysics, moveGroundBody, stepVehicleOnce } from "../src/mainview/physics/core/PhysicsSystem"
import { FIXED_DT, WORLD } from "../src/mainview/data/world"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"
import { Alignment } from "../src/mainview/physics/vehicle/components/Alignment"
import { Steering } from "../src/mainview/physics/vehicle/components/Steering"
import { TireModel, tireParamsFrom } from "../src/mainview/physics/vehicle/components/TireModel"
import { RAD_PER_DEG } from "../src/mainview/data/units"

const RAPIER = await initPhysics()
const def = activeCar()
const P = def.physics
const S = P.wheels.suspension
const HZ = Math.round(1 / FIXED_DT)

let fails = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`)
}

const idle = {
  throttle: 0, brake: 0, steer: 0, handbrake: false,
  upshiftPressed: false, downshiftPressed: false, toggleModePressed: false,
  toggleLaunchPressed: false, resetPressed: false, toggleCameraPressed: false,
  startPressed: false, escapePressed: false,
} as DriveInput

function fresh() {
  const r = makeRig(RAPIER, def)
  r.car.update(FIXED_DT, idle)
  r.world.step()
  return r
}
type Rig = ReturnType<typeof fresh>
function run(r: Rig, inp: Partial<DriveInput>, secs: number, each?: (t: number) => void) {
  const n = Math.round(secs * HZ)
  for (let i = 0; i < n; i++) {
    stepVehicleOnce(r.world, () => r.car.update(FIXED_DT, { ...idle, ...inp } as DriveInput))
    if (i % HZ === 0) {
      const p = r.body.translation()
      moveGroundBody(r.gb, p.x, p.z)
    }
    each?.(i / HZ)
  }
}

// ---- suspension -------------------------------------------------------------
{
  for (const ax of ["front", "rear"] as const)
    check(`suspension.${ax}: rebound damping is at least bump damping`, S[ax].reboundDamping >= S[ax].bumpDamping)
  const r = fresh()
  r.car.parkingBrake = true
  run(r, {}, 3)
  const st = (r.car as unknown as { suspension: { states: { compression: number; load: number; grounded: boolean }[] } }).suspension.states
  const total = st.reduce((s, w) => s + w.load, 0)
  check("static: every wheel is on the ground", st.every((w) => w.grounded))
  check("static: wheel loads add up to the sprung weight (+-3%)", Math.abs(total / (P.mass.chassis * WORLD.gravity) - 1) < 0.03, `${total.toFixed(0)} N vs ${(P.mass.chassis * WORLD.gravity).toFixed(0)} N`)
  const front = (st[0].compression + st[1].compression) / 2
  const rear = (st[2].compression + st[3].compression) / 2
  check("static: both axles sit inside the travel", front > 0 && rear > 0 && front < S.travel && rear < S.travel, `front ${front.toFixed(3)} rear ${rear.toFixed(3)} m, travel ${S.travel}`)
}

// ---- steering geometry -------------------------------------------------------
{
  const wb = 2.8, track = 1.6
  const st = new Steering(P.wheels.steering, wb, track)
  const centre = 0.3
  const inL = st.wheelAngle(true, true, centre), outR = st.wheelAngle(true, false, centre)
  check("ackermann: the inside wheel turns more than the outside wheel", inL > outR, `${(inL / RAD_PER_DEG).toFixed(2)} vs ${(outR / RAD_PER_DEG).toFixed(2)} deg`)
  check("ackermann: mirrored for the other direction", Math.abs(st.wheelAngle(true, false, -centre) + inL) < 1e-12 && Math.abs(st.wheelAngle(true, true, -centre) + outR) < 1e-12)
  check("ackermann: rear wheels do not steer", st.wheelAngle(false, true, centre) === 0)
  const half = track / 2
  const ideal = [Math.atan((wb * Math.tan(centre)) / (wb - half * Math.tan(centre))), Math.atan((wb * Math.tan(centre)) / (wb + half * Math.tan(centre)))]
  const k = P.wheels.steering.ackermannFactor
  check("ackermann: the car's factor blends parallel and ideal geometry", Math.abs(inL - (centre + k * (ideal[0] - centre))) < 1e-12)
  const zero = new Steering({ ...P.wheels.steering, ackermannFactor: 0 }, wb, track)
  check("ackermann: factor 0 is parallel steering", zero.wheelAngle(true, true, centre) === centre && zero.wheelAngle(true, false, centre) === centre)
}

// ---- alignment ---------------------------------------------------------------
{
  const al = new Alignment(P.wheels.alignment)
  const A = P.wheels.alignment
  check("alignment: toe-in points the left wheel right and the right wheel left", (A.front.toeDeg > 0) === (al.toe(true, true) < 0 && al.toe(true, false) > 0) || A.front.toeDeg === 0)
  check("alignment: static camber is mirrored side to side", Math.abs(al.camber(true, true, 0) + al.camber(true, false, 0)) < 1e-12)
  check("alignment: static camber matches the spec", Math.abs(Math.abs(al.camber(true, true, 0)) - Math.abs(A.front.camberDeg) * RAD_PER_DEG) < 1e-9)
  const outerBump = Math.abs(al.camber(false, true, 0.05))
  const leanIn = A.rear.camberDeg <= 0
  check("alignment: bump adds negative camber", !leanIn || outerBump >= Math.abs(al.camber(false, true, 0)))
  const tm = new TireModel(tireParamsFrom(P.wheels), P.wheels.radius)
  const roll = (camber: number) => tm.eval({ grounded: true, normalLoad: 4000, normal: { x: 0, y: 1, z: 0 }, patchVel: { x: 0, y: 0, z: -20 },
    wheelOmega: 20 / P.wheels.radius, slipRatio: 0, slipTan: 0, wheelHeading: { x: 0, y: 0, z: -1 }, bodyForward: { x: 0, y: 0, z: -1 }, camber })
  check("camber thrust: a straight-rolling upright tire has no side force", Math.abs(roll(0).fy) < 1e-6)
  check("camber thrust: leaning left pushes left, leaning right pushes right", roll(0.05).fy > 0 && roll(-0.05).fy < 0, `${roll(0.05).fy.toFixed(0)} N / ${roll(-0.05).fy.toFixed(0)} N`)
}

console.log(fails === 0 ? "ALL CHASSIS CHECKS PASSED" : `${fails} CHASSIS CHECKS FAILED`)
process.exit(fails === 0 ? 0 : 1)
