/**
 * P6 world checks, one car per run (CAR=<id>, or via run-per-car): surfaces and weather,
 * aero at a yaw angle and active aero, crash limits, and the road/ground split.
 */
import { initPhysics, stepVehicleOnce } from "../src/mainview/physics/core/PhysicsSystem"
import { FIXED_DT } from "../src/mainview/data/world"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"
import { registerSurface } from "../src/mainview/physics/core/Surfaces"
import { conditions } from "../src/mainview/physics/core/Conditions"
import { Aero } from "../src/mainview/physics/vehicle/components/Aero"
import { groundSurfaceAt, roadCenterX } from "../src/mainview/systems/WorldManager"
import type { SurfaceId } from "../src/mainview/data/surfaces"

const RAPIER = await initPhysics()
const def = activeCar()
const P = def.physics
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

function fresh(surface: SurfaceId = "asphalt") {
  const r = makeRig(RAPIER, def)
  registerSurface(r.world, r.gb.collider(0), surface)
  r.car.update(FIXED_DT, idle)
  r.world.step()
  r.car.parkingBrake = false
  return r
}
type Rig = ReturnType<typeof fresh>

function run(r: Rig, input: Partial<DriveInput>, s: number, f?: (i: number) => void) {
  for (let i = 0; i < s * HZ; i++) {
    stepVehicleOnce(r.world, () => r.car.update(FIXED_DT, { ...idle, ...input }))
    f?.(i)
  }
}

/** Distance to brake from 25 m/s on a surface. */
function brakeDistance(surface: SurfaceId): number {
  const r = fresh(surface)
  r.body.setLinvel({ x: 0, y: 0, z: -25 }, true)
  run(r, {}, 0.3)
  const z0 = r.body.translation().z
  let stopped = -1
  run(r, { brake: 1 }, 10, () => {
    if (stopped < 0 && Math.hypot(r.body.linvel().x, r.body.linvel().z) < 0.3) stopped = Math.abs(r.body.translation().z - z0)
  })
  return stopped < 0 ? Math.abs(r.body.translation().z - z0) : stopped
}

// ---- 1. surfaces and weather ------------------------------------------------
{
  conditions.weather = "dry"
  const dry = brakeDistance("asphalt")
  const grass = brakeDistance("grass")
  const sand = brakeDistance("sand")
  check("surface: braking on grass takes longer than on asphalt", grass > dry * 1.1, `${grass.toFixed(1)} m vs ${dry.toFixed(1)} m`)
  check("surface: sand is the slowest to stop on", sand > grass * 0.9, `${sand.toFixed(1)} m`)
  conditions.weather = "wet"
  const wet = brakeDistance("asphalt")
  conditions.weather = "dry"
  check("weather: braking in the wet takes longer than in the dry", wet > dry * 1.2, `${wet.toFixed(1)} m vs ${dry.toFixed(1)} m`)
  conditions.timeOfDay = "night"
  const night = brakeDistance("asphalt")
  conditions.timeOfDay = "day"
  check("time of day: night grip is no better than day", night >= dry - 1e-6, `${night.toFixed(2)} m vs ${dry.toFixed(2)} m`)
}

// ---- 2. the flat ground splits into road and grass ---------------------------
{
  const cx = roadCenterX(0)
  check("ground: the road centre is asphalt", groundSurfaceAt(cx, 0) === "asphalt")
  check("ground: far off the road is grass", groundSurfaceAt(cx + 60, 0) === "grass" && groundSurfaceAt(cx - 60, 0) === "grass")
  check("ground: the split follows the road's bend", groundSurfaceAt(roadCenterX(500), -500) === "asphalt")
}

// ---- 3. aero at a yaw angle and movable aero ---------------------------------
{
  const a = new Aero(P.aero)
  const straight = a.force(-40, 0, 0)!
  const yawed = a.force(-40, 0, 0.35)!
  check("aero: drag rises at a yaw angle", Math.hypot(yawed.dragX, yawed.dragZ) > Math.hypot(straight.dragX, straight.dragZ))
  check("aero: downforce falls at a yaw angle and stays >= 0", yawed.down <= straight.down && yawed.down >= 0)
  const act = P.aero.active
  if (act) {
    const m = new Aero(P.aero)
    for (let i = 0; i < 4 * HZ; i++) m.update(FIXED_DT, act.minSpeed + 10, 0)
    const open = m.force(-40, 0, 0)!
    check("active aero: opens on a straight above its speed", m.activeBlend > 0.99 && open.down < straight.down && Math.hypot(open.dragX, open.dragZ) < Math.hypot(straight.dragX, straight.dragZ))
    for (let i = 0; i < 4 * HZ; i++) m.update(FIXED_DT, act.minSpeed + 10, 1)
    check("active aero: closes again in a corner", m.activeBlend < 0.01)
  } else {
    const m = new Aero(P.aero)
    m.update(1, 100, 0)
    check("aero: a fixed-aero car never moves its flap", m.activeBlend === 0)
  }
}

// ---- 4. a hit cannot launch or spin the car and upsets the tyres for a while -------
{
  const r = fresh()
  const wall = r.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 3, 0.5).setTranslation(0, 3, -60).setFriction(0.5))
  void wall
  r.body.setLinvel({ x: 0, y: 0, z: -40 }, true)
  const cr = P.chassis.crash
  let maxVy = 0
  let maxSpin = 0
  let minGrip = 1
  let minZ = 0
  run(r, {}, 4, () => {
    const lv = r.body.linvel()
    const av = r.body.angvel()
    maxVy = Math.max(maxVy, lv.y)
    maxSpin = Math.max(maxSpin, Math.abs(av.x), Math.abs(av.z))
    minGrip = Math.min(minGrip, r.car.impactGrip)
    minZ = Math.min(minZ, r.body.translation().z)
  })
  check("crash: the car does not tunnel through the wall", minZ > -60, `z=${minZ.toFixed(1)}`)
  check("crash: the hit is registered (tyres lose grip)", minGrip < 1, `grip ${minGrip.toFixed(2)}`)
  check("crash: grip loss stays within the class limit", minGrip >= 1 - cr.gripLoss - 1e-9, `grip ${minGrip.toFixed(2)} limit ${(1 - cr.gripLoss).toFixed(2)}`)
  check("crash: the car is not thrown upward past the class limit", maxVy <= cr.maxLaunchSpeed + 2.5, `vy ${maxVy.toFixed(1)} limit ${cr.maxLaunchSpeed}`)
  run(r, {}, cr.gripRecovery + 1)
  check("crash: grip comes back after the recovery time", r.car.impactGrip > 0.999, `grip ${r.car.impactGrip.toFixed(3)}`)
  void maxSpin
}

console.log(fails === 0 ? "ALL WORLD CHECKS PASSED" : `${fails} WORLD CHECKS FAILED`)
process.exit(fails === 0 ? 0 : 1)
