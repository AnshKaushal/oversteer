/**
 * Dyno: what a car's data says, and what the running car delivers.
 *
 *   CAR=<id> bun scripts/dyno.ts [--csv]
 *
 * 1. Engine sheet: crank torque and power from the spec every 500 rpm, peaks
 *    and the dash scale check.
 * 2. Full-throttle pull on flat ground in automatic: 0-100, 0-200, top speed,
 *    shift points, and the wheel power implied by the acceleration
 *    (mass * a * v plus drag and rolling loss) against the crank power at the
 *    same rpm, which is the drivetrain loss the car really shows.
 *
 * The numbers are for judging a new car's data against its real figures; no
 * pass/fail here. `--csv` prints the pull as rows for a spreadsheet.
 */
import {
  initPhysics,
  moveGroundBody,
  stepVehicleOnce,
} from "../src/mainview/physics/core/PhysicsSystem"
import { FIXED_DT } from "../src/mainview/data/world"
import { curveLookup } from "../src/mainview/physics/math"
import { enginePeaks } from "../src/mainview/physics/vehicle/components/Engine"
import { WATT_PER_HP } from "../src/mainview/data/units"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { activeCar, makeRig } from "./lib/cars"

const RAPIER = await initPhysics()
const def = activeCar()
const P = def.physics
const E = P.engine
const csv = process.argv.includes("--csv")
const RAD_PER_RPM = (2 * Math.PI) / 60
const HP_PER_KW = 1000 / WATT_PER_HP

console.log(`\n${def.name} (${def.id})`)

// ---- 1. engine sheet ----
const peaks = enginePeaks(E)
console.log("\nEngine (crank, from data)")
console.log("  rpm    Nm     kW     hp")
for (
  let rpm = Math.ceil(E.idleRPM / 500) * 500;
  rpm <= E.redlineRPM;
  rpm += 500
) {
  const nm = E.maxTorqueNm * curveLookup(E.torqueCurve, rpm)
  const kw = (nm * rpm * RAD_PER_RPM) / 1000
  console.log(
    `  ${String(rpm).padStart(5)} ${nm.toFixed(0).padStart(5)} ${kw.toFixed(0).padStart(6)} ${(kw * HP_PER_KW).toFixed(0).padStart(6)}`,
  )
}
console.log(
  `  peak ${peaks.torqueNm.toFixed(0)} Nm @ ${peaks.torqueRPM} rpm, ${peaks.powerHP.toFixed(0)} hp @ ${peaks.powerRPM} rpm (${(peaks.powerHP / HP_PER_KW).toFixed(0)} kW)`,
)
console.log(
  `  mass ${P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel)} kg, ${((peaks.powerHP * 1000) / (P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel))).toFixed(0)} hp/t`,
)
console.log(
  `  dash: ${def.dash.maxRpm} rpm / ${def.dash.maxKmh} km/h, redline ${E.redlineRPM}, limiter ${E.revLimiterRPM}`,
)

// ---- 2. full-throttle pull ----
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

const r = makeRig(RAPIER, def)
r.car.update(FIXED_DT, idle)
r.world.step()
r.car.parkingBrake = false

const mass = P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel)
const A = P.aero
const G = 9.81
let t = 0
let t100 = 0
let t200 = 0
let top = 0
let lastGear = 0
let maxGear = 0
let prevV = 0
let thr = 0
const shifts: string[] = []
const rows: string[] = ["t,kmh,rpm,gear,wheel_kw,crank_kw"]
const lossSamples: number[] = []
const rpmAtGear: Record<number, number> = {}
const maxSteps = 120 * 120
for (let i = 0; i < maxSteps; i++) {
  thr += Math.min(1 - thr, 3.2 / 120)
  let tel: ReturnType<typeof r.car.update> | null = null
  stepVehicleOnce(r.world, () => {
    tel = r.car.update(FIXED_DT, { ...idle, throttle: thr })
  })
  if (i % 60 === 0) {
    const p = r.body.translation()
    moveGroundBody(r.gb, p.x, p.z)
  }
  t += FIXED_DT
  const v = r.car.forwardSpeed
  const kmh = v * 3.6
  const T = tel as unknown as { rpm: number; gear: number }
  if (T.gear > maxGear && lastGear > 0) {
    shifts.push(
      `${lastGear}>${T.gear} at ${kmh.toFixed(0)} km/h, ${Math.round(rpmAtGear[lastGear] ?? T.rpm)} rpm`,
    )
  }
  if (T.gear > 0) rpmAtGear[T.gear] = T.rpm
  lastGear = T.gear
  if (T.gear > maxGear) maxGear = T.gear
  if (!t100 && kmh >= 100) t100 = t
  if (!t200 && kmh >= 200) t200 = t
  if (kmh > top) top = kmh
  const a = (v - prevV) / FIXED_DT
  prevV = v
  if (i % 12 === 0 && thr >= 1 && T.gear > 0 && v > 5 && a > 0) {
    // force the wheels delivered: inertia plus drag plus rolling (downforce adds rolling load)
    const drag = 0.5 * A.airDensity * A.dragCoefficient * A.frontalArea * v * v
    const roll = P.wheels.rollingResist * mass * G
    const wheelKw = ((mass * a + drag + roll) * v) / 1000
    const crankKw =
      (E.maxTorqueNm *
        curveLookup(E.torqueCurve, T.rpm) *
        T.rpm *
        RAD_PER_RPM) /
      1000
    if (crankKw > 0) lossSamples.push(1 - wheelKw / crankKw)
    rows.push(
      `${t.toFixed(2)},${kmh.toFixed(1)},${Math.round(T.rpm)},${T.gear},${wheelKw.toFixed(0)},${crankKw.toFixed(0)}`,
    )
  }
  if (t > 12 && kmh < top - 1 && thr >= 1 && a < 0.05 && kmh > 50) break
}

console.log("\nFull-throttle pull (automatic, flat)")
console.log(
  `  0-100 km/h  ${t100 ? t100.toFixed(2) + " s" : "not reached"}   (data says ${def.tested.zeroToHundredS} s)`,
)
console.log(`  0-200 km/h  ${t200 ? t200.toFixed(2) + " s" : "not reached"}`)
console.log(
  `  top speed   ${top.toFixed(0)} km/h   (data says ${def.tested.topSpeedKmh} km/h)`,
)
if (shifts.length) console.log(`  shifts      ${shifts.join("; ")}`)
if (lossSamples.length) {
  const mid = lossSamples.slice().sort((a, b) => a - b)[
    Math.floor(lossSamples.length / 2)
  ]
  console.log(
    `  drivetrain loss implied by the pull: ${(mid * 100).toFixed(0)}% median (data efficiency ${(P.drivetrain.efficiency * 100).toFixed(0)}%; clutch slip, tyre slip and converter add to it)`,
  )
}
if (csv) console.log("\n" + rows.join("\n"))
