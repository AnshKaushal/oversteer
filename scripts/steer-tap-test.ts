/**
 * A short steering tap at cruise: the car should lean into a gentle turn and
 * settle, not snap into a slide. Emulates the keyboard ramp (4.5/s in, 7/s out).
 * Run with CAR=<id>.
 */
import {
  initPhysics,
  moveGroundBody,
} from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"

const RAPIER = await initPhysics()
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false } as DriveInput
const DEG = 180 / Math.PI
const HZ = 120

function betaOf(body: any): number {
  const v = body.linvel()
  const q = body.rotation()
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z)
  const rz = 2 * (q.x * q.z - q.w * q.y)
  return (
    Math.atan2(v.x * rx + v.z * rz, Math.max(1, Math.abs(v.x * fx + v.z * fz))) *
    DEG
  )
}

for (const [gear, kmh, thr] of [
  [2, 40, 1],
  [2, 60, 1],
  [3, 60, 1],
  [3, 80, 1],
  [3, 100, 1],
  [4, 100, 1],
  [4, 130, 1],
  [5, 150, 1],
  [5, 180, 1],
]) {
  for (const tap of [0.15, 0.3]) {
    const s = makeRig(RAPIER, activeCar())
    s.body.setLinvel({ x: 0, y: 0, z: -kmh / 3.6 }, true)
    s.car.gear = gear
    s.car.rpm = 4500
    s.car.autoMode = false
    s.car.update(1 / HZ, idle)
    s.world.step()
    let steer = 0
    let maxBeta = 0
    let maxYaw = 0
    let peakSteer = 0
    for (let i = 0; i < 14 * HZ; i++) {
      const t = i / HZ
      const target = t > 1 && t < 1 + tap ? 1 : 0
      const rate = target ? 4.5 : 7
      steer += Math.sign(target - steer) * Math.min(Math.abs(target - steer), rate / HZ)
      peakSteer = Math.max(peakSteer, steer)
      s.car.update(1 / HZ, { ...idle, throttle: thr, steer } as DriveInput)
      s.world.step()
      if (i % 60 === 0) {
        const p = s.body.translation()
        moveGroundBody(s.gb, p.x, p.z)
      }
      maxBeta = Math.max(maxBeta, Math.abs(betaOf(s.body)))
      maxYaw = Math.max(maxYaw, Math.abs(s.body.angvel().y))
    }
    const end = Math.abs(betaOf(s.body))
    console.log(
      `g${gear} ${kmh}km/h thr${thr} tap${tap}s peakSteer ${peakSteer.toFixed(2)} | maxBeta ${maxBeta.toFixed(1)}° maxYaw ${(maxYaw * DEG).toFixed(0)}°/s endBeta ${end.toFixed(1)}°`,
    )
  }
}
