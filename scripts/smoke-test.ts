import * as RAPIER_ from "@dimforge/rapier3d-compat"
import { Vehicle } from "../src/mainview/physics/vehicle/Vehicle"
import {
  createChassisBody,
  initPhysics,
  moveGroundBody,
  FIXED_DT,
  stepVehicleOnce,
} from "../src/mainview/physics/core/PhysicsSystem"
import { activeCar, makeRig } from "./lib/cars"
import type { DriveInput } from "../src/mainview/systems/InputManager"

const RAPIER = await initPhysics()
const { world, gb, body, car } = makeRig(RAPIER, activeCar())
car.tractionControlOn = true
car.stabilityControlOn = true
car.abs.enabled = true

const gearNo = (n: number) => Math.min(n, car.P.transmission.gearRatios.length)

const TX = car.P.transmission
const LIMITER = car.P.engine.revLimiterRPM
const IDLE_RPM = car.P.engine.idleRPM
const msAt = (gear: number, rpm: number) =>
  (((rpm * 2 * Math.PI) / 60) * car.P.wheels.radius) /
  (TX.gearRatios[gear - 1] * TX.finalDriveRatio)

const idle: DriveInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  upshiftPressed: false,
  downshiftPressed: false,
  toggleModePressed: false,
  toggleLaunchPressed: false,
  resetPressed: false,
  toggleCameraPressed: false,
  startPressed: false,
  escapePressed: false,
}
const W = { ...idle, throttle: 1 }
const S = { ...idle, brake: 1 }

const step = (inp: DriveInput, n: number) => {
  let inner: any = null
  for (let i = 0; i < n; i++) {
    inner = stepVehicleOnce(world, () => car.update(FIXED_DT, inp))
    if (i % 60 === 0) {
      const p = body.translation()
      moveGroundBody(gb, p.x, p.z)
    }
  }
  return inner
}

let t: any = null

let fails = 0
const check = (name: string, cond: boolean, extra = "") => {
  console.log(
    (cond ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""),
  )
  if (!cond) fails++
}

check("parking brake engaged at spawn", car.parkingBrake === true)
step(idle, 120)
check(
  "suspension settles",
  body.translation().y > 0.6 && body.translation().y < 0.85,
  "y=" + body.translation().y.toFixed(3),
)
check("parking brake holds at idle until throttle", car.parkingBrake === true)
car.parkingBrake = false
for (let i = 0; i < 2 * 120; i++) {
  t = car.update(FIXED_DT, idle)
  world.step()
}
check(
  "creep strolls car forward",
  t.speedKmh > 0.5,
  "v=" + t.speedKmh.toFixed(2),
)
car.parkingBrake = true
car.update(FIXED_DT, W)
world.step()
check("throttle releases parking brake", car.parkingBrake === false)
for (let i = 0; i < 8 * 120; i++) {
  t = car.update(FIXED_DT, idle)
  world.step()
}
check(
  "idle creep cruises slowly",
  Math.abs(t.speedKmh) > 2 && Math.abs(t.speedKmh) < 15,
  `v=${t.speedKmh.toFixed(1)} rpm=${t.rpm}`,
)

body.setLinvel({ x: 0, y: 0, z: 0 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setTranslation({ x: 0, y: 0.72, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
moveGroundBody(gb, 0, 0)
car.gear = 1 as any
const WS = { ...idle, throttle: 1, brake: 1 }
for (let i = 0; i < 2 * 120; i++) {
  t = car.update(FIXED_DT, WS)
  world.step()
}
check("W+S arms launch control", t.launchArmed === true, `rpm=${t.rpm}`)
check(
  "launch rpm pinned at the car's launch rpm",
  Math.abs(t.rpm - TX.launchControlRPM) < 600,
  "rpm=" + t.rpm,
)
check(
  "launch staging: zero movement (clutch open)",
  Math.abs(t.speedKmh) < 0.3,
  "v=" + t.speedKmh.toFixed(2),
)
for (let i = 0; i < 3 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
}
check(
  "launch fires on brake release",
  t.launching === true || Math.abs(t.speedKmh) > 30,
  `v=${t.speedKmh.toFixed(1)}`,
)
body.setLinvel({ x: 0, y: 0, z: 0 }, true)
body.setTranslation({ x: 0, y: 0.72, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
moveGroundBody(gb, 0, 0)

let t100 = -1
for (let i = 0; i < 14 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
  if (t100 < 0 && Math.abs(t.speedKmh) >= 100) t100 = i / 120
}
check(
  "0-100km/h under 7s",
  t100 > 0 && t100 < 7,
  "t100=" + t100.toFixed(2) + "s",
)
for (let i = 0; i < 30 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
check(
  "top speed > 270km/h",
  Math.abs(t.speedKmh) > 270,
  "vmax=" + Math.abs(t.speedKmh).toFixed(0) + " gear=" + t.gearLabel,
)
const vBefore = Math.abs(t.speedKmh)
let stopped = false
for (let i = 0; i < 10 * 120 && !stopped; i++) {
  t = car.update(FIXED_DT, S)
  world.step()
  stopped = Math.abs(t.speedKmh) < 0.5
}
check(
  "brakes slow the car",
  Math.abs(t.speedKmh) < vBefore * 0.2,
  "v=" + t.speedKmh.toFixed(2),
)
check(
  "S never reverses in D",
  t.speedKmh >= -0.05,
  "v=" + t.speedKmh.toFixed(3),
)
const rq = body.rotation()
const upY = 1 - 2 * (rq.x * rq.x + rq.z * rq.z)
check(
  "car stays upright after 300km/h braking",
  upY > 0.5,
  "upY=" + upY.toFixed(2),
)
car.update(FIXED_DT, { ...idle, toggleModePressed: true })
world.step()
for (let i = 0; i < 10; i++) {
  car.update(FIXED_DT, { ...idle, downshiftPressed: true })
  for (let j = 0; j < 15; j++) {
    car.update(FIXED_DT, idle)
    world.step()
  }
  world.step()
}
console.log("gear after downs from 1:", car.gear)
for (let i = 0; i < 3 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
}
check("reverse works in R via W", t.speedKmh < -2, "v=" + t.speedKmh.toFixed(1))
const vRev = t.speedKmh
for (let i = 0; i < 2 * 120; i++) {
  t = car.update(FIXED_DT, S)
  world.step()
}
check(
  "S brakes in R",
  Math.abs(t.speedKmh) < Math.abs(vRev),
  "v=" + t.speedKmh.toFixed(1),
)
car.gear = 2 as any
body.setLinvel({ x: 0, y: 0, z: -22 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
for (let i = 0; i < 150; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: 1 })
  world.step()
}
const sideslip = () => {
  const v = body.linvel()
  const q = body.rotation()
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z)
  const rz = 2 * (q.x * q.y - q.w * q.z)
  const spd = Math.hypot(v.x, v.z)
  return spd > 1 ? Math.abs((v.x * rx + v.z * rz) / spd) : 0
}
const betaHeld = sideslip()
let tRecover = -1
for (let i = 0; i < 240; i++) {
  car.update(FIXED_DT, { ...idle, steer: -0.3 })
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
  if (tRecover < 0 && sideslip() < 0.05) tRecover = i / 120
}
check(
  "lift-off re-attaches grip quickly",
  betaHeld > 0.2 && tRecover > 0 && tRecover < 1.5,
  `slide=${betaHeld.toFixed(2)} recovered=${tRecover.toFixed(2)}s`,
)

car.gear = 3 as any
body.setLinvel({ x: 0, y: 0, z: -16.7 }, true)
const overRevGear = Math.max(2, gearNo(5))
car.gear = overRevGear as any
body.setLinvel({ x: 0, y: 0, z: -msAt(overRevGear - 1, 1.1 * LIMITER) }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
for (let i = 0; i < 30; i++) {
  car.update(FIXED_DT, idle)
  world.step()
}
car.update(FIXED_DT, { ...idle, downshiftPressed: true })
world.step()
check(
  "downshift into over-rev refused",
  car.gear === overRevGear,
  "gear=" + car.gear,
)
body.setLinvel({ x: 0, y: 0, z: -msAt(overRevGear - 1, 0.6 * LIMITER) }, true)
for (let i = 0; i < 30; i++) {
  car.update(FIXED_DT, idle)
  world.step()
}
car.update(FIXED_DT, { ...idle, downshiftPressed: true })
world.step()
check(
  "downshift allowed when safe",
  car.gear === overRevGear - 1,
  "gear=" + car.gear,
)
body.setLinvel({ x: 0, y: 0, z: -16.7 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
car.gear = 3 as any
const steerInp = { ...idle, steer: 0.5 }
for (let i = 0; i < 3 * 120; i++) {
  t = car.update(FIXED_DT, steerInp)
  world.step()
}
check(
  "car turns (yaw changes)",
  Math.abs(body.translation().x) > 3,
  "x=" + body.translation().x.toFixed(1),
)
body.setLinvel({ x: 0, y: 0, z: 0 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setTranslation({ x: 0, y: 0.72, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
moveGroundBody(gb, 0, 0)
car.gear = 1 as any
for (let i = 0; i < 1.5 * 120; i++) {
  car.update(FIXED_DT, W)
  world.step()
}
let spin = 0
const donutInp = { ...idle, throttle: 1, steer: 1, handbrake: true }
for (let i = 0; i < 7 * 120; i++) {
  t = car.update(FIXED_DT, donutInp)
  world.step()
  const av = body.angvel()
  spin += Math.abs(av.y) / 120
  if (i % 120 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
{
  const qd = body.rotation()
  check(
    "donuts possible (sustained rotation)",
    spin > 8,
    "total yaw=" + spin.toFixed(1) + "rad",
  )
  check(
    "donut stays rubber-side down",
    1 - 2 * (qd.x * qd.x + qd.z * qd.z) > 0.3,
    "",
  )
}
body.setLinvel({ x: 0, y: 0, z: 0 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setTranslation({ x: 0, y: 0.72, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
moveGroundBody(gb, 0, 0)
car.gear = 1 as any
const burnoutInp = { ...idle, throttle: 1, handbrake: true }
for (let i = 0; i < 3 * 120; i++) {
  t = car.update(FIXED_DT, burnoutInp)
  world.step()
}
check(
  "burnout spins rears (TC off on handbrake)",
  t.slipRatio > 0.3 && Math.abs(t.speedKmh) < 30,
  `slip=${t.slipRatio.toFixed(2)} v=${t.speedKmh.toFixed(1)}`,
)
car.gear = 1 as any
body.setLinvel({ x: 0, y: 0, z: 0 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setTranslation({ x: 0, y: 0.72, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
moveGroundBody(gb, 0, 0)
let v6 = 0,
  v8 = 0,
  rpmMax = 0
for (let i = 0; i < 8 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
  rpmMax = Math.max(rpmMax, t.rpm)
  if (i === 6 * 120) v6 = Math.abs(t.speedKmh)
  if (i === 8 * 120 - 1) v8 = Math.abs(t.speedKmh)
}
check("rev limiter caps rpm", rpmMax <= LIMITER + 50, "rpmMax=" + rpmMax)
check(
  "speed plateaus on limiter (no runaway)",
  v8 - v6 < 8 && v8 < msAt(1, LIMITER) * 3.6 + 3,
  `v6=${v6.toFixed(1)} v8=${v8.toFixed(1)}`,
)
car.gear = gearNo(8) as any
car.rpm = 2600
body.setLinvel({ x: 0, y: 0, z: -41.7 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
for (let i = 0; i < 120; i++) {
  car.update(FIXED_DT, idle)
  world.step()
}
const vCoast0 = Math.abs(car.update(FIXED_DT, idle).speedKmh)
for (let i = 0; i < 5 * 120; i++) {
  t = car.update(FIXED_DT, idle)
  world.step()
}
check(
  "coasts freely (no phantom braking)",
  vCoast0 - Math.abs(t.speedKmh) < 30,
  `lost=${(vCoast0 - Math.abs(t.speedKmh)).toFixed(1)}kmh over 5s`,
)
car.gear = 0 as any
body.setLinvel({ x: 0, y: 0, z: 0 }, true)
for (let i = 0; i < 2 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
}
for (let i = 0; i < 1 * 120; i++) {
  t = car.update(FIXED_DT, idle)
  world.step()
}
check(
  "neutral rpm falls slowly (flywheel inertia)",
  t.rpm > 2 * IDLE_RPM,
  "rpm=" + t.rpm,
)
car.update(FIXED_DT, { ...idle, toggleModePressed: true })
world.step()
car.gear = gearNo(8) as any
car.rpm = 2600
const vPull0 = msAt(gearNo(8), 0.45 * LIMITER) * 3.6
body.setLinvel({ x: 0, y: 0, z: -vPull0 / 3.6 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
for (let i = 0; i < 3 * 120; i++) {
  t = car.update(FIXED_DT, W)
  world.step()
}
check(
  "top gear full throttle pulls hard (kickdown allowed)",
  Math.abs(t.speedKmh) > vPull0 + 10,
  `gear=${t.gearLabel} v=${Math.abs(t.speedKmh).toFixed(0)}`,
)
for (let i = 0; i < 10 * 120; i++) {
  t = car.update(FIXED_DT, Math.abs(t.speedKmh) > 0.5 ? S : idle)
  world.step()
}
check("auto returns to 1st after stopping", t.gear === 1, "gear=" + t.gearLabel)

const sideSlip = () => {
  const v = body.linvel()
  const q = body.rotation()
  const fx = 2 * (q.x * q.z + q.w * q.y),
    fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z),
    rz = 2 * (q.x * q.z - q.w * q.y)
  const lat = v.x * rx + v.z * rz,
    lon = Math.abs(v.x * fx + v.z * fz)
  return Math.atan2(lat, Math.max(1, lon))
}
body.setLinvel({ x: 0, y: 0, z: -70 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
car.gear = gearNo(8) as any
car.rpm = 6000
let steerPeak = 0,
  yawPeak = 0
for (let i = 0; i < 5 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: 1 })
  world.step()
  steerPeak = Math.max(steerPeak, Math.abs(car.steerAngle))
  yawPeak = Math.max(yawPeak, Math.abs(body.angvel().y))
}
check(
  "full lock still meaningful at 250km/h",
  steerPeak > 0.04,
  `steer=${(steerPeak * 57.3).toFixed(2)}deg`,
)
check(
  "power-on turn generates real yaw",
  yawPeak > 0.1,
  `yaw=${yawPeak.toFixed(3)}rad/s`,
)
for (let i = 0; i < 1.5 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: -1 })
  world.step()
}

car.reset(new (await import("three")).Vector3(0, 0.72, 0), 0)
car.autoMode = true
for (let i = 0; i < 14 * 120; i++) {
  car.update(FIXED_DT, W)
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
for (let i = 0; i < 3.5 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: 1 })
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
const betaSlide = sideSlip()
const yawSlide = body.angvel().y
const vSlide = Math.abs(car.forwardSpeed) * 3.6
check(
  "grip survives full throttle at speed",
  Math.abs(betaSlide) < 0.09,
  `v=${vSlide.toFixed(0)}km/h beta=${(betaSlide * 57.3).toFixed(1)}deg`,
)
for (let i = 0; i < 1.6 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: -1 })
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
const betaOut = sideSlip()
const yawOut = body.angvel().y
check(
  "countersteer flips the car the other way (250km/h)",
  yawSlide > 0 && yawOut < 0,
  `yaw ${yawSlide.toFixed(2)} -> ${yawOut.toFixed(2)} rad/s, beta ${(betaSlide * 57.3).toFixed(1)} -> ${(betaOut * 57.3).toFixed(1)}deg`,
)

body.setLinvel({ x: 0, y: 0, z: -25 }, true)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
car.gear = 4 as any
car.autoMode = false
car.rpm = 5000
car.update(FIXED_DT, idle)
world.step()
for (let i = 0; i < 1.2 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: 1, handbrake: true })
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
const yawDonut = body.angvel().y
const betaDonut = Math.abs(sideSlip())
for (let i = 0; i < 2.0 * 120; i++) {
  car.update(FIXED_DT, { ...idle, throttle: 1, steer: -1 })
  world.step()
  if (i % 60 === 0) {
    const p = body.translation()
    moveGroundBody(gb, p.x, p.z)
  }
}
const yawDonutOut = body.angvel().y
check(
  "donut is entered",
  yawDonut > 1.5,
  `yaw=${yawDonut.toFixed(2)}rad/s beta=${(betaDonut * 57.3).toFixed(0)}deg`,
)
check(
  "countersteer flips the car the other way (low speed donut)",
  yawDonut > 0 && yawDonutOut < 0,
  `yaw ${yawDonut.toFixed(2)} -> ${yawDonutOut.toFixed(2)} rad/s`,
)

console.log(fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECKS FAILED")
process.exit(fails === 0 ? 0 : 1)
