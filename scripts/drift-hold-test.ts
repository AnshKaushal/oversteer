import { Vehicle } from "../src/mainview/physics/vehicle/Vehicle"
import {
  initPhysics,
  moveGroundBody,
} from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"

void Vehicle
const RAPIER = await initPhysics()
const idle = {
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
} as DriveInput

const HZ = 120
const TARGET = 28 // deg
const DEG = 180 / Math.PI

function betaOf(body: any): number {
  const v = body.linvel()
  const q = body.rotation()
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z)
  const rz = 2 * (q.x * q.z - q.w * q.y)
  // positive = nose points left of travel (car yawing right, tail out left)
  return Math.atan2(
    v.x * rx + v.z * rz,
    Math.max(1, Math.abs(v.x * fx + v.z * fz)),
  )
}

type Result = {
  gear: number
  v0: number
  held: number
  maxBeta: number
  minSpeed: number
  spun: boolean
}

function trial(gear: number, v0: number, dir: 1 | -1): Result {
  const s = makeRig(RAPIER, activeCar())
  s.body.setLinvel({ x: 0, y: 0, z: -v0 }, true)
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  s.car.gear = gear
  s.car.rpm = 5500
  s.car.autoMode = false
  s.car.update(1 / HZ, idle)
  s.world.step()

  const total = 8
  let held = 0
  let maxBeta = 0
  let minSpeed = 1e9
  let spun = false
  for (let i = 0; i < total * HZ; i++) {
    const t = i / HZ
    const b = betaOf(s.body) * dir * DEG // positive when drifting in `dir`
    let inp: DriveInput
    if (t < 0.6) {
      // flick: turn in, brief handbrake mid-way
      inp = {
        ...idle,
        throttle: 1,
        steer: dir * 1,
        handbrake: t > 0.25 && t < 0.45,
      }
    } else {
      // hold: steer against slip to target beta, throttle modulates beta
      const throttle = Math.max(0.35, Math.min(1, 0.7 + (TARGET - b) / 30))
      const steer = dir * Math.max(-1, Math.min(1, -(b - 8) / 40))
      inp = { ...idle, throttle, steer }
    }
    s.car.update(1 / HZ, inp)
    s.world.step()
    if (i % 60 === 0) {
      const p = s.body.translation()
      moveGroundBody(s.gb, p.x, p.z)
    }
    if (t >= 0.8) {
      const sp = Math.hypot(s.body.linvel().x, s.body.linvel().z) * 3.6
      minSpeed = Math.min(minSpeed, sp)
      maxBeta = Math.max(maxBeta, Math.abs(b))
      if (b > 12 && b < 55 && sp > 25) held += 1 / HZ
      if (Math.abs(b) > 80) spun = true
    }
  }
  return { gear, v0, held, maxBeta, minSpeed, spun }
}

console.log("gear v0(m/s) dir | held(s of 7.2) maxBeta minKmh spun")
let sum = 0
let n = 0
for (const gear of [2, 3, 4]) {
  for (const v0 of [18, 24, 30]) {
    for (const dir of [1, -1] as const) {
      const r = trial(gear, v0, dir)
      sum += r.held
      n++
      console.log(
        `${gear}    ${String(v0).padEnd(7)} ${dir > 0 ? "R" : "L"}   | ` +
          `${r.held.toFixed(1).padStart(5)}  ${r.maxBeta.toFixed(0).padStart(5)}° ` +
          `${r.minSpeed.toFixed(0).padStart(5)} ${r.spun ? "SPUN" : ""}`,
      )
    }
  }
}
console.log(`\nmean held: ${(sum / n).toFixed(2)}s of 7.2s`)
