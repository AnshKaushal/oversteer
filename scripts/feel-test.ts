/**
 * Driving-feel acceptance checks, one car per run (CAR=<id>, or run-per-car).
 * These are the things a player notices: how the revs answer the pedal, a
 * handbrake slide that stops, a burnout, wheelspin, a donut and a powerslide.
 */
import {
  initPhysics,
  moveGroundBody,
  stepVehicleOnce,
} from "../src/mainview/physics/core/PhysicsSystem"
import { FIXED_DT } from "../src/mainview/data/world"
import { KMH_PER_MS } from "../src/mainview/data/units"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { curveLookup } from "../src/mainview/physics/math"
import { activeCar, makeRig } from "./lib/cars"

const RAPIER = await initPhysics()
const def = activeCar()
const P = def.physics
const E = P.engine
const HZ = Math.round(1 / FIXED_DT)
const R = P.wheels.radius
const YAW_90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }

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
  r.car.parkingBrake = false
  // the scenarios below were written for a car with its aids on; the real default is off (see 1c)
  r.car.tractionControlOn = true
  r.car.stabilityControlOn = true
  r.car.abs.enabled = true
  return r
}
type Rig = ReturnType<typeof fresh>
function run(
  r: Rig,
  inp: Partial<DriveInput>,
  secs: number,
  each?: (t: number) => void,
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
    each?.(i / HZ)
  }
}
const kmh = (r: Rig) =>
  Math.hypot(r.body.linvel().x, r.body.linvel().z) * KMH_PER_MS
/** Slip ratio of the driven rear wheels: how far they spin past ground speed. */
function rearSlip(r: Rig) {
  const om = r.car.getWheelOmegas()
  const v = Math.max(1, Math.abs(r.car.forwardSpeed))
  return (((om[2] + om[3]) / 2) * R - v) / v
}
function sideslipDeg(r: Rig) {
  const v = r.body.linvel()
  const q = r.body.rotation()
  const fx = 2 * (q.x * q.z + q.w * q.y),
    fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z),
    rz = 2 * (q.x * q.z - q.w * q.y)
  return (
    Math.abs(
      Math.atan2(
        v.x * rx + v.z * rz,
        Math.max(1, Math.abs(v.x * fx + v.z * fz)),
      ),
    ) *
    (180 / Math.PI)
  )
}
const lo = E.idleRPM,
  hi = E.redlineRPM

// 1. the revs answer the pedal at once, in auto and in manual, and do not sag
const flare = E.dynamics.launchFlareRPM
for (const auto of [true, false]) {
  const r = fresh()
  r.car.autoMode = auto
  if (!auto) r.car.gear = 1 as never
  let at = -1
  run(r, { throttle: 1 }, 2, (t) => {
    if (at < 0 && r.car.rpm >= lo + 0.8 * (flare - lo)) at = t
  })
  check(
    `${auto ? "auto" : "manual"}: full pedal from rest reaches 80% of the stall rpm in 1.5 s`,
    at >= 0 && at <= 1.5,
    `t=${at.toFixed(2)}s launch rpm ${flare}`,
  )
}
{
  const r = fresh()
  let worst = 0
  let peak = 0
  let gear = r.car.gear as number
  let changed = 0
  run(r, { throttle: 1 }, 4, (t) => {
    const g = r.car.gear as number
    if (g !== gear) {
      gear = g
      peak = 0
      changed = t
    }
    // the drop that follows an upshift is the shift, not a sag
    if (t - changed < 0.5) return
    peak = Math.max(peak, r.car.rpm)
    if (t > 1.5) worst = Math.max(worst, (peak - r.car.rpm) / peak)
  })
  check(
    "rpm does not sag by more than 25% inside a gear while accelerating",
    worst < 0.25,
    `worst sag ${(worst * 100).toFixed(0)}%`,
  )
}
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 1 as never
  let r1 = 0
  run(r, { throttle: 0.5 }, 0.8, () => {
    r1 = r.car.rpm
  })
  let r2 = 0
  const b = fresh()
  b.car.autoMode = false
  b.car.gear = 1 as never
  run(b, { throttle: 1 }, 0.8, () => {
    r2 = b.car.rpm
  })
  check(
    "rpm follows the pedal: half pedal revs less than full pedal",
    r1 < r2 - 300,
    `${r1.toFixed(0)} vs ${r2.toFixed(0)}`,
  )
}

// 1b. the managed launch (flare rpm and torque ramp) belongs to the safety aids:
// with traction and stability control off the driven wheels get raw power at once
{
  const wheelSpeed = (aids: boolean) => {
    const r = fresh()
    r.car.autoMode = false
    r.car.gear = 1 as never
    r.car.tractionControlOn = aids
    r.car.stabilityControlOn = aids
    run(r, { throttle: 1 }, 1)
    const om = r.car.getWheelOmegas()
    return { om: (om[2] + om[3]) / 2, rpm: r.car.rpm }
  }
  const on = wheelSpeed(true),
    off = wheelSpeed(false)
  check(
    "aids off: no managed launch ramp, rear wheels spin up about as fast or faster",
    off.om >= 0.6 * on.om,
    `off ${off.om.toFixed(1)} rad/s, on ${on.om.toFixed(1)} rad/s`,
  )
  check(
    "aids on: rpm reaches the launch flare (or the wheels pull it higher)",
    on.rpm >= 0.85 * flare,
    `${on.rpm.toFixed(0)} vs ${flare}`,
  )
}

// 1c. aids start off, and the driver can switch each one with its key
{
  const raw = makeRig(RAPIER, def)
  check(
    "a new car starts with traction and stability control off, ABS as the car specifies",
    !raw.car.tractionControlOn &&
      !raw.car.stabilityControlOn &&
      raw.car.abs.enabled === P.assists.absEnabled,
  )
  const r = fresh()
  const press = (k: string) =>
    stepVehicleOnce(r.world, () =>
      r.car.update(FIXED_DT, { ...idle, [k]: true } as DriveInput),
    )
  const absBefore = r.car.abs.enabled
  press("toggleTractionPressed")
  press("toggleStabilityPressed")
  press("toggleAbsPressed")
  check(
    "toggle keys switch traction, stability and ABS",
    !r.car.tractionControlOn &&
      !r.car.stabilityControlOn &&
      r.car.abs.enabled === !absBefore,
  )
  press("toggleSafetyPressed")
  check(
    "the safety key switches traction and stability control together",
    r.car.tractionControlOn && r.car.stabilityControlOn,
  )
  press("toggleSafetyPressed")
  check(
    "pressing it again switches both off",
    !r.car.tractionControlOn && !r.car.stabilityControlOn,
  )
  press("toggleStabilityPressed")
  check(
    "a second press switches stability control back on",
    r.car.stabilityControlOn,
  )
}

// 1d. a car held against an obstacle: with the aids off the engine loads against
// the wheels and the wheels spin up (revs climb past the stall), it does not sit at the launch rpm
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 1 as never
  r.car.tractionControlOn = false
  r.car.stabilityControlOn = false
  let peak = 0
  let wheel = 0
  run(r, { throttle: 1 }, 3, () => {
    r.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    peak = Math.max(peak, r.car.rpm)
    wheel = Math.max(wheel, Math.abs(r.car.getWheelOmegas()[2]))
  })
  check(
    "held against an obstacle, aids off: wheels spin up and revs climb past the stall",
    wheel * R > 3 && peak > 1.15 * flare,
    `peak ${peak.toFixed(0)} rpm vs stall ${flare}, wheel ${wheel.toFixed(0)} rad/s`,
  )
}

// 1e. the gearbox is always automatic (manual mode only picks the gear). Starting off in a gear
// that cannot pull the car from rest (wheel force at converter stall under stallMinAccel)
// labours and then kills the engine; a gear that can, goes. The ignition key still stops and
// restarts it
const stalledOf = (r: Rig) =>
  (r.car as unknown as { engine: { stalled: boolean } }).engine.stalled
{
  const T = P.transmission
  const mass = P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel)
  const pullAccel = (g: number) =>
    (E.maxTorqueNm *
      curveLookup(E.torqueCurve, E.dynamics.launchFlareRPM) *
      curveLookup(E.throttleMap, 1) *
      T.torqueConverter.stallMultiplication *
      T.gearRatios[g - 1] *
      T.finalDriveRatio *
      P.drivetrain.efficiency) /
    P.wheels.radius /
    mass
  const top = T.gearRatios.length
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = top as never
  run(r, { throttle: 1 }, E.dynamics.stallDelay + 1.5)
  const tooTall = pullAccel(top) < E.dynamics.stallMinAccel
  check(
    `manual mode in top gear from rest: engine ${tooTall ? "stalls" : "keeps running"}`,
    stalledOf(r) === tooTall,
    `pull ${pullAccel(top).toFixed(1)} m/s2 vs ${E.dynamics.stallMinAccel}, stalled=${stalledOf(r)}`,
  )
  const g2 = fresh()
  g2.car.autoMode = false
  g2.car.gear = 2 as never
  run(g2, { throttle: 1 }, 4)
  check(
    "manual mode in 2nd from rest on the throttle alone: car pulls away",
    g2.car.forwardSpeed > 2,
    `v=${g2.car.forwardSpeed.toFixed(1)} m/s`,
  )
  const ig = fresh()
  const press = (k: string) =>
    stepVehicleOnce(ig.world, () =>
      ig.car.update(FIXED_DT, { ...idle, [k]: true } as DriveInput),
    )
  press("toggleIgnitionPressed")
  run(ig, {}, 2)
  check(
    "the ignition key switches a running engine off and the revs die away",
    stalledOf(ig) && ig.car.rpm < 0.7 * E.idleRPM,
    `rpm ${ig.car.rpm.toFixed(0)}`,
  )
  press("toggleIgnitionPressed")
  run(ig, {}, 0.5)
  check(
    "tapping the ignition key only switches the ignition on, the engine stays off",
    stalledOf(ig),
  )
  run(ig, { crankHeld: true }, 4)
  run(ig, {}, 2)
  const back = !stalledOf(ig)
  check(
    "holding the starter restarts a switched-off engine and it idles",
    back && Math.abs(ig.car.rpm - E.idleRPM) < 0.15 * E.idleRPM,
    `rpm ${ig.car.rpm.toFixed(0)}`,
  )
  const a = fresh()
  a.car.autoMode = true
  run(a, { throttle: 1 }, 1.5)
  check(
    "automatic never stalls",
    !(a.car as unknown as { engine: { stalled: boolean } }).engine.stalled,
  )
}

// 1f. handbrake like BeamNG: a tap latches it and pulling away on the throttle lets a latched one go
{
  const r = fresh()
  const press = (k: string) =>
    stepVehicleOnce(r.world, () =>
      r.car.update(FIXED_DT, { ...idle, [k]: true } as DriveInput),
    )
  press("toggleHandbrakePressed")
  run(r, {}, 0.3)
  check("a tap latches the handbrake on", r.car.handbrakeLatched)
  press("toggleHandbrakePressed")
  check("a second tap releases it", !r.car.handbrakeLatched)
  press("toggleHandbrakePressed")
  run(r, { throttle: 1 }, 0.2)
  check(
    "pulling away on the throttle releases a latched handbrake",
    !r.car.handbrakeLatched,
  )
}

// 1g. with the engine off nothing pushes the car: no converter creep, no hold force
{
  const r = fresh()
  r.car.autoMode = true
  r.car.parkingBrake = false
  stepVehicleOnce(r.world, () =>
    r.car.update(FIXED_DT, {
      ...idle,
      toggleIgnitionPressed: true,
    } as DriveInput),
  )
  run(r, {}, 4)
  check(
    "engine off: the car does not creep",
    Math.abs(r.car.forwardSpeed) < 0.05,
    `v=${r.car.forwardSpeed.toFixed(3)} m/s`,
  )
}

// 1h. creep is not a force: it emerges from converter drag at governed idle rpm, in every gear
// (how far it gets follows the gearing and idle rpm in the car's data)
{
  const creepIn = (auto: boolean, gear: number) => {
    const r = fresh()
    r.car.autoMode = auto
    r.car.parkingBrake = false
    r.car.gear = gear as never
    run(r, {}, 6)
    return { v: r.car.forwardSpeed, rpm: r.car.rpm }
  }
  const a = creepIn(true, 1)
  check(
    "automatic in drive creeps forward on idle alone, rpm held near idle",
    a.v > 0.3 && Math.abs(a.rpm - E.idleRPM) < 0.3 * E.idleRPM,
    `v=${a.v.toFixed(2)} m/s rpm ${a.rpm.toFixed(0)}`,
  )
  const m1 = creepIn(false, 1)
  check(
    "manual mode in first creeps like drive",
    m1.v > 0.3,
    `v=${m1.v.toFixed(2)} m/s`,
  )
  const hi = creepIn(false, P.transmission.gearRatios.length)
  check(
    "manual mode in top gear on idle alone: engine holds idle",
    Math.abs(hi.rpm - E.idleRPM) < 0.3 * E.idleRPM,
    `rpm ${hi.rpm.toFixed(0)} v=${hi.v.toFixed(2)} m/s`,
  )
}

// 1i. self-aligning torque feeds steering feedback: quiet when straight, loaded in a turn, and
// the sign follows the turn direction
{
  const feedback = (steer: number) => {
    const r = fresh()
    r.car.gear = 3 as never
    r.body.setLinvel({ x: 0, y: 0, z: -15 }, true)
    run(r, {}, 0.5)
    let fb = 0
    for (let i = 0; i < 3 * HZ; i++) {
      stepVehicleOnce(r.world, () => {
        fb = r.car.update(FIXED_DT, {
          ...idle,
          steer,
          throttle: 0.3,
        } as DriveInput).steerFeedback
      })
      if (i % HZ === 0) {
        const p = r.body.translation()
        moveGroundBody(r.gb, p.x, p.z)
      }
    }
    return fb
  }
  const straight = feedback(0)
  const left = feedback(0.3)
  const right = feedback(-0.3)
  check(
    "steering feedback is quiet driving straight",
    Math.abs(straight) < 0.1,
    `${straight.toFixed(3)}`,
  )
  check(
    "steering feedback loads up in a turn",
    Math.abs(left) > 0.1 && Math.abs(left) <= 1,
    `${left.toFixed(3)}`,
  )
  check(
    "steering feedback flips with the turn direction",
    left * right < 0,
    `L ${left.toFixed(3)} R ${right.toFixed(3)}`,
  )
}

// 2. handbrake in a sideways slide, no throttle, stops the car
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 0 as never
  r.body.setRotation(YAW_90, true)
  r.body.setLinvel({ x: 60 / KMH_PER_MS, y: 0, z: 0 }, true)
  run(r, { handbrake: true }, 0.1)
  let stop = -1
  run(r, { handbrake: true }, 6, (t) => {
    if (stop < 0 && kmh(r) < 5) stop = t
  })
  check(
    "sideways at 60 km/h, handbrake and no throttle: stopped within 3.5 s",
    stop >= 0 && stop <= 3.5,
    `stop=${stop.toFixed(2)}s v=${kmh(r).toFixed(0)}km/h`,
  )
}
{
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 0 as never
  r.body.setRotation(YAW_90, true)
  r.body.setLinvel({ x: 25 / KMH_PER_MS, y: 0, z: 0 }, true)
  let stop = -1
  run(r, { handbrake: true }, 5, (t) => {
    if (stop < 0 && kmh(r) < 3) stop = t
  })
  check(
    "sideways at 25 km/h, handbrake: stopped within 2 s",
    stop >= 0 && stop <= 2,
    `stop=${stop.toFixed(2)}s`,
  )
}

// 3. burnout: handbrake and throttle at a standstill spins the rears, if the
// engine can out-pull the handbrake through first gear
const wheelTorque1 =
  (E.maxTorqueNm *
    P.transmission.gearRatios[0] *
    P.transmission.finalDriveRatio *
    P.drivetrain.efficiency) /
  2
const massAll = P.mass.chassis + 2 * P.mass.frontWheel + 2 * P.mass.rearWheel
const gripTorque = P.wheels.frictionMu * ((massAll * 9.81) / 4) * R
if (
  P.drivetrain.frontTorqueSplit < 1 &&
  wheelTorque1 > (P.wheels.handbrakeForce + gripTorque) * 1.5
) {
  const r = fresh()
  let peak = 0
  run(r, { throttle: 1, handbrake: true }, 2, () => {
    peak = Math.max(peak, rearSlip(r))
  })
  check(
    "burnout: rears spin well past ground speed",
    peak > 1,
    `slip ratio peak ${peak.toFixed(2)}`,
  )
}

// 4. wheelspin in 1st on a hard launch (rear or all wheel drive with real power)
if (P.drivetrain.frontTorqueSplit < 1) {
  const r = fresh()
  r.car.autoMode = false
  r.car.gear = 1 as never
  let peak = 0
  run(r, { throttle: 1 }, 2.5, () => {
    peak = Math.max(peak, rearSlip(r))
  })
  check(
    "wheelspin: a hard launch lights up the driven wheels at some point",
    peak > 0.1,
    `peak slip ${peak.toFixed(2)}`,
  )
}

// Thrust in 1st at peak torque, in g: below ~0.6 the car cannot out-pull its tires
const mass = P.mass.chassis + 2 * P.mass.frontWheel + 2 * P.mass.rearWheel
const thrust1 =
  (E.maxTorqueNm *
    P.transmission.gearRatios[0] *
    P.transmission.finalDriveRatio *
    P.drivetrain.efficiency) /
  R /
  mass /
  9.81
// Rear-biased drive only: an AWD car with a centre diff is meant to hold its line
const canSlide = P.drivetrain.frontTorqueSplit <= 0.1 && thrust1 >= 0.6
console.log(
  `info | 1st gear thrust at peak torque ${thrust1.toFixed(2)} g, slide checks ${canSlide ? "on" : "off"}`,
)

// 5. donut: with the aids off (the N key), roll in, flick the
// handbrake, and lock plus power keep it rotating
if (canSlide) {
  const r = fresh()
  r.car.tractionControlOn = false
  r.car.stabilityControlOn = false
  r.car.autoMode = false
  r.car.gear = 1 as never
  r.body.setLinvel({ x: 0, y: 0, z: -25 / KMH_PER_MS }, true)
  run(r, { throttle: 1, steer: 1 }, 0.4)
  run(r, { throttle: 1, steer: 1, handbrake: true }, 0.6)
  let spin = 0
  let beta = 0
  run(r, { throttle: 1, steer: 1 }, 4, () => {
    spin += Math.abs(r.body.angvel().y) / HZ
    beta = Math.max(beta, sideslipDeg(r))
  })
  check(
    "donut: the tail steps out past 40 degrees and the car keeps rotating (0.7 turn in 4 s)",
    spin >= 0.7 * 2 * Math.PI && beta >= 40,
    `turns=${(spin / (2 * Math.PI)).toFixed(2)} beta peak ${beta.toFixed(0)}deg`,
  )
}

// 6. powerslide: with the aids off, on throttle through a bend in 1st the tail steps out and holds
if (canSlide) {
  const r = fresh()
  r.car.tractionControlOn = false
  r.car.stabilityControlOn = false
  r.car.autoMode = false
  r.car.gear = 1 as never
  r.body.setLinvel({ x: 0, y: 0, z: -30 / KMH_PER_MS }, true)
  let peak = 0
  run(r, { throttle: 1, steer: 0.6 }, 3, (t) => {
    if (t > 0.5) peak = Math.max(peak, sideslipDeg(r))
  })
  check(
    "powerslide: full throttle with steering reaches 8 degrees of sideslip",
    peak >= 8,
    `beta peak ${peak.toFixed(1)}deg`,
  )
  check(
    "powerslide: the car is still driveable afterwards (not spun)",
    sideslipDeg(r) < 85,
    `beta=${sideslipDeg(r).toFixed(0)}deg`,
  )
}

// 7. driver aids: each one has to do the job a real one does
const cruise = (kmhTarget: number) => {
  const r = fresh()
  while (kmh(r) < kmhTarget) run(r, { throttle: 1 }, 0.25)
  return r
}
const heading = (r: Rig) => {
  let psi = 0
  return {
    add: () => {
      psi += r.body.angvel().y / HZ
    },
    get: () => psi,
  }
}
{
  // ABS: lets the car steer under full braking, where locked wheels plough straight on
  const turn = (abs: boolean) => {
    const r = cruise(120)
    r.car.stabilityControlOn = false
    r.car.abs.enabled = abs
    const h = heading(r)
    let lock = 0
    let n = 0
    const d = (r.car as any).solver.lastTireDiag
    run(r, { brake: 1, steer: 0.35 }, 1.5, () => {
      h.add()
      lock += Math.max(...d.map((q: any) => -q.sx))
      n++
    })
    return { yaw: Math.abs(h.get()), meanLock: lock / n }
  }
  const on = turn(true)
  const off = turn(false)
  check(
    "abs: the car steers at least as well as on locked wheels",
    on.yaw > off.yaw * 0.8,
    `${(on.yaw * 57.3).toFixed(0)} vs ${(off.yaw * 57.3).toFixed(0)} deg without`,
  )
  check(
    "abs: wheels are kept from locking",
    on.meanLock <= off.meanLock && on.meanLock < 0.5,
    `mean lock slip ${on.meanLock.toFixed(2)} vs ${off.meanLock.toFixed(2)}`,
  )
}
{
  // traction control: less wheelspin on a rolling full-throttle start in 2nd
  const spin = (tc: boolean) => {
    const r = cruise(25)
    r.car.stabilityControlOn = false
    r.car.tractionControlOn = tc
    r.car.autoMode = false
    r.car.gear = 2 as never
    let sum = 0
    let n = 0
    const d = (r.car as any).solver.lastTireDiag
    run(r, { throttle: 1 }, 3, () => {
      sum += Math.max(...d.map((q: any) => q.sx))
      n++
    })
    return sum / n
  }
  const off = spin(false)
  const on = spin(true)
  if (off > 0.25)
    check(
      "traction control: brakes and cuts power to hold wheelspin down",
      on < off * 0.7,
      `mean slip ${on.toFixed(2)} vs ${off.toFixed(2)} without`,
    )
}
{
  // stability control: a lift-off flick would spin the car, ESC brakes it back in line
  const flick = (esc: boolean) => {
    const r = cruise(110)
    r.car.stabilityControlOn = esc
    r.car.tractionControlOn = esc
    const h = heading(r)
    let peak = 0
    let lit = false
    run(r, { steer: 0.8, throttle: 1 }, 1.5, () => {
      h.add()
    })
    run(r, { steer: -0.9 }, 0.7, () => {
      h.add()
      peak = Math.max(peak, sideslipDeg(r))
      lit ||= (r.car as any).stability.intervening
    })
    run(r, {}, 2.8, () => {
      h.add()
      peak = Math.max(peak, sideslipDeg(r))
      lit ||= (r.car as any).stability.intervening
    })
    return { peak, turned: Math.abs(h.get()), lit }
  }
  const on = flick(true)
  const off = flick(false)
  if (off.peak > 30)
    check(
      "stability control: catches a snap oversteer",
      on.peak < off.peak * 0.5 && on.turned < off.turned,
      `beta peak ${on.peak.toFixed(0)} vs ${off.peak.toFixed(0)} deg, turned ${(on.turned * 57.3).toFixed(0)} vs ${(off.turned * 57.3).toFixed(0)}`,
    )
  if (off.peak > 30)
    check("stability control: its light comes on while it works", on.lit)
  check(
    "stability control: stays out of the way in a plain corner",
    (() => {
      const r = cruise(80)
      let worked = false
      run(r, { steer: 0.3, throttle: 0.3 }, 2.5, () => {
        worked ||= (r.car as any).stability.intervening
      })
      return !worked
    })(),
  )
}

console.log(
  fails === 0 ? "ALL FEEL CHECKS PASSED" : `${fails} FEEL CHECKS FAILED`,
)
process.exit(fails === 0 ? 0 : 1)
