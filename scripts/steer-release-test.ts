/**
 * Steering back to centre: after a hard steer at full throttle in gears 2-5,
 * centring the wheel must bring the car back in line instead of letting it
 * keep travelling sideways, even rear-wheel drive on power. Run with CAR=<id>.
 */
import {
  initPhysics,
  moveGroundBody,
} from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"

const RAPIER = await initPhysics()
const idle = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
} as DriveInput
const DEG = 180 / Math.PI
const HZ = 120
const MAX_END_BETA = 30

function betaOf(body: any): number {
  const v = body.linvel()
  const q = body.rotation()
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z)
  const rz = 2 * (q.x * q.z - q.w * q.y)
  return (
    Math.atan2(
      v.x * rx + v.z * rz,
      Math.max(1, Math.abs(v.x * fx + v.z * fz)),
    ) * DEG
  )
}

let failed = 0
for (const gear of [2, 3, 4, 5]) {
  for (const kmh of [50, 80, 110, 150]) {
    const s = makeRig(RAPIER, activeCar())
    s.body.setLinvel({ x: 0, y: 0, z: -kmh / 3.6 }, true)
    s.car.gear = gear
    s.car.rpm = 5000
    s.car.autoMode = false
    s.car.update(1 / HZ, idle)
    s.world.step()
    for (let i = 0; i < 6 * HZ; i++) {
      const t = i / HZ
      s.car.update(1 / HZ, { ...idle, throttle: 1, steer: t < 2 ? 0.5 : 0 })
      s.world.step()
      if (i % 60 === 0) {
        const p = s.body.translation()
        moveGroundBody(s.gb, p.x, p.z)
      }
    }
    const end = Math.abs(betaOf(s.body))
    const ok = end < MAX_END_BETA
    if (!ok) failed++
    console.log(
      `${ok ? "PASS" : "FAIL"} | gear ${gear} @ ${kmh} km/h straightens 4 s after centring | beta=${end.toFixed(1)}°`,
    )
  }
}
console.log(
  failed
    ? `${failed} STEER-RELEASE CHECKS FAILED`
    : "ALL STEER-RELEASE CHECKS PASSED",
)
process.exit(failed ? 1 : 0)
