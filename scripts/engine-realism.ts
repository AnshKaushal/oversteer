/**
 * Engine realism checks, one car per run (CAR=<id>, or via run-per-car).
 * Each check compares a measured behaviour with a physical range, so a bad
 * car spec or a bad engine model shows up here rather than in play.
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
const HZ = Math.round(1 / FIXED_DT)
const RAD_PER_RPM = (2 * Math.PI) / 60

let fails = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fails++
  console.log(
    `${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`,
  )
}

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

function fresh() {
  const r = makeRig(RAPIER, def)
  r.car.update(FIXED_DT, idle)
  r.world.step()
  return r
}
type Rig = ReturnType<typeof fresh>
function run(
  r: Rig,
  inp: Partial<DriveInput>,
  secs: number,
  each?: (i: number) => void,
) {
  const n = Math.round(secs * HZ)
  for (let i = 0; i < n; i++) {
    stepVehicleOnce(r.world, () =>
      r.car.update(FIXED_DT, { ...idle, ...inp } as DriveInput),
    )
    if (i % HZ === 0) {
      const p = r.body.translation()
      moveGroundBody(r.gb, p.x, p.z)
    }
    each?.(i)
  }
}

// ---- 1. the derived peaks are plausible --------------------------------------
{
  const pk = enginePeaks(E)
  check(
    "peak power sits between 60% of redline and redline",
    pk.powerRPM >= E.redlineRPM * 0.6 && pk.powerRPM <= E.redlineRPM,
    `${pk.powerHP.toFixed(0)}hp @ ${pk.powerRPM}, redline ${E.redlineRPM}`,
  )
  check(
    "peak torque comes at or before peak power",
    pk.torqueRPM <= pk.powerRPM,
    `torque @ ${pk.torqueRPM}, power @ ${pk.powerRPM}`,
  )
  check(
    "peak torque equals maxTorqueNm",
    Math.abs(pk.torqueNm / E.maxTorqueNm - 1) < 0.02,
    `${pk.torqueNm.toFixed(0)} vs ${E.maxTorqueNm}`,
  )
  check(
    "peak power is physically plausible (<= 1500 hp)",
    pk.powerHP <= 1500,
    `${pk.powerHP.toFixed(0)}hp`,
  )
  const mass = P.mass.chassis + 2 * P.mass.frontWheel + 2 * P.mass.rearWheel
  check(
    "power to weight is plausible (<= 1.8 hp/kg)",
    pk.powerHP / mass <= 1.8,
    `${(pk.powerHP / mass).toFixed(2)} hp/kg`,
  )
  check(
    "rev limiter is at or above the redline",
    E.revLimiterRPM >= E.redlineRPM,
  )
}

// ---- 2. idle is stable -------------------------------------------------------
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 0 as never
  let lo = Infinity,
    hi = 0
  run(r, {}, 6, (i) => {
    if (i > 2 * HZ) {
      lo = Math.min(lo, r.car.rpm)
      hi = Math.max(hi, r.car.rpm)
    }
  })
  check(
    "idle holds within +-10% of idleRPM",
    lo > E.idleRPM * 0.9 && hi < E.idleRPM * 1.1,
    `${lo.toFixed(0)}..${hi.toFixed(0)} idle ${E.idleRPM}`,
  )
}

// ---- 3. free revving takes believable time ----------------------------------
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 0 as never
  let t = -1
  run(r, { throttle: 1 }, 6, (i) => {
    if (t < 0 && r.car.rpm >= E.redlineRPM * 0.6) t = i / HZ
  })
  const lo = 0.05,
    hi = 2.0
  check(
    "neutral rev from idle to 60% redline takes 0.05-2 s",
    t >= lo && t <= hi,
    `t=${t.toFixed(2)}s`,
  )
}

// ---- 4. the limiter holds ----------------------------------------------------
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 1 as never
  let peak = 0
  run(r, { throttle: 1 }, 8, (i) => {
    peak = Math.max(peak, r.car.rpm)
    void i
  })
  check(
    "rpm never exceeds the rev limiter",
    peak <= E.revLimiterRPM + 1,
    `peak ${peak.toFixed(0)} limiter ${E.revLimiterRPM}`,
  )
}

// ---- 5. engine braking in top gear is believable ------------------------------
{
  const r = fresh()
  r.car.autoMode = false
  const top = P.transmission.gearRatios.length
  r.car.gear = top as never
  r.body.setLinvel({ x: 0, y: 0, z: -100 / 3.6 }, true)
  r.car.parkingBrake = false
  run(r, { throttle: 0.5 }, 1)
  const v0 = Math.abs(r.car.forwardSpeed)
  run(r, {}, 2)
  const g = (v0 - Math.abs(r.car.forwardSpeed)) / 2 / 9.81
  check(
    "lift-off decel at ~100 km/h in top gear is 0.02-0.25 g",
    g >= 0.02 && g <= 0.25,
    `${g.toFixed(3)}g`,
  )
}

// ---- 6. turbo spool ----------------------------------------------------------
{
  const r = fresh()
  r.car.autoMode = false
  // in neutral so a quick launch cannot hit the limiter before the turbo has spooled
  r.car.gear = 0 as never
  r.car.parkingBrake = false
  let t = -1
  const engine = (
    r.car as unknown as { engine: { boost: number; turbocharged: boolean } }
  ).engine
  run(r, { throttle: 1 }, 6, (i) => {
    if (t < 0 && engine.boost > 0.9) t = i / HZ
  })
  if (E.turbo)
    check(
      "turbo reaches 90% boost in 0.4-3.5 s",
      t >= 0.4 && t <= 3.5,
      `t=${t.toFixed(2)}s`,
    )
  else check("naturally aspirated engine reports no boost", engine.boost === 0)
}

// ---- 7. a full-throttle pull through the gears is clean -----------------------
{
  const r = fresh()
  r.car.autoMode = true
  let last = r.car.gear as number
  let ups = 0,
    downs = 0,
    over = 0
  run(r, { throttle: 1 }, 25, () => {
    const g = r.car.gear as number
    if (g > last) ups++
    else if (g < last && g >= 1) downs++
    last = g
    if (r.car.rpm > E.revLimiterRPM + 1) over++
  })
  check("full-throttle pull upshifts at least twice", ups >= 2, `ups=${ups}`)
  check(
    "full-throttle pull does not hunt (<= 1 downshift)",
    downs <= 1,
    `downs=${downs}`,
  )
  check("full-throttle pull never passes the limiter", over === 0)
}

// ---- 8. acceleration is consistent with the engine ---------------------------
{
  // Power-limited bound: v from energy, using the curve peak and drivetrain
  // efficiency. 0-100 cannot beat it, and a car far slower than 3x it is
  // a traction or gearing error rather than an engine one.
  let hp = 0
  for (let rpm = E.idleRPM; rpm <= E.redlineRPM; rpm += 25)
    hp = Math.max(
      hp,
      (E.maxTorqueNm * curveLookup(E.torqueCurve, rpm) * rpm * RAD_PER_RPM) /
        WATT_PER_HP,
    )
  const mass = P.mass.chassis + 2 * P.mass.frontWheel + 2 * P.mass.rearWheel
  const v = 100 / 3.6
  const floor =
    (0.5 * mass * v * v) / (hp * WATT_PER_HP * P.drivetrain.efficiency)
  const r = fresh()
  let t = -1
  run(r, { throttle: 1 }, 20, (i) => {
    if (t < 0 && Math.abs(r.car.forwardSpeed) * 3.6 >= 100) t = i / HZ
  })
  check(
    "0-100 is not faster than the power limit",
    t >= floor * 0.98,
    `t=${t.toFixed(2)}s floor=${floor.toFixed(2)}s (${hp.toFixed(0)}hp, ${mass.toFixed(0)}kg)`,
  )
  // traction bound: even at 1.5 g of grip the car needs this long
  const grip = v / (1.5 * 9.81)
  check(
    "0-100 is not faster than a 1.5 g traction limit",
    t >= grip * 0.98,
    `t=${t.toFixed(2)}s grip floor=${grip.toFixed(2)}s`,
  )
  check("0-100 completes", t > 0)
}

console.log(
  fails === 0 ? "ALL ENGINE CHECKS PASSED" : `${fails} ENGINE CHECKS FAILED`,
)
process.exit(fails === 0 ? 0 : 1)
