/**
 * Unit tests for each vehicle component on its own, built from a car's spec.
 * Run per car:  bun scripts/run-per-car.ts scripts/component-tests.ts
 */
import { activeCar } from "./lib/cars"
import {
  SURFACES,
  WEATHER_GRIP,
  surfaceGrip,
  type SurfaceId,
  type WeatherId,
} from "../src/mainview/data/surfaces"
import {
  TireModel,
  tireParamsFrom,
} from "../src/mainview/physics/vehicle/components/TireModel"
import { Impact } from "../src/mainview/physics/vehicle/components/Impact"
import { Abs } from "../src/mainview/physics/vehicle/components/Abs"
import { Aero } from "../src/mainview/physics/vehicle/components/Aero"
import { Aggression } from "../src/mainview/physics/vehicle/components/Aggression"
import { Brakes } from "../src/mainview/physics/vehicle/components/Brakes"
import { Cruise } from "../src/mainview/physics/vehicle/components/Cruise"
import { DirectionShift } from "../src/mainview/physics/vehicle/components/DirectionShift"
import { CenterDiff } from "../src/mainview/physics/vehicle/components/CenterDiff"
import { Differential } from "../src/mainview/physics/vehicle/components/Differential"
import { Driveline } from "../src/mainview/physics/vehicle/components/Driveline"
import {
  Engine,
  enginePeaks,
} from "../src/mainview/physics/vehicle/components/Engine"
import { Gearbox } from "../src/mainview/physics/vehicle/components/Gearbox"
import { Launch } from "../src/mainview/physics/vehicle/components/Launch"
import {
  ShiftLogic,
  type ShiftInput,
} from "../src/mainview/physics/vehicle/components/ShiftLogic"
import { Steering } from "../src/mainview/physics/vehicle/components/Steering"
import { TorqueConverter } from "../src/mainview/physics/vehicle/components/TorqueConverter"
import { StabilityControl } from "../src/mainview/physics/vehicle/components/StabilityControl"
import { TractionControl } from "../src/mainview/physics/vehicle/components/TractionControl"
import { TireRelaxation } from "../src/mainview/physics/vehicle/components/TireRelaxation"
import { VelocityLimiter } from "../src/mainview/physics/vehicle/components/VelocityLimiter"
import { curveLookup } from "../src/mainview/physics/math"

const car = activeCar()
const P = car.physics
let fails = 0
const check = (name: string, cond: boolean, extra = "") => {
  console.log(
    (cond ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""),
  )
  if (!cond) fails++
}
const near = (a: number, b: number, tol = 1e-6) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// ---- Engine ---------------------------------------------------------------
{
  const e = new Engine(P.engine)
  e.rpm = enginePeaks(P.engine).torqueRPM
  const t = e.torque(1, 1, false)
  // a turbo engine starts unspooled, so its curve torque is scaled by what is missing
  const spool = P.engine.turbo ? 1 - P.engine.turbo.boostTorqueShare : 1
  const expect =
    P.engine.maxTorqueNm * curveLookup(P.engine.torqueCurve, e.rpm) * spool -
    e.frictionTorque() * P.engine.dynamics.frictionShare
  check(
    "engine: full-throttle torque follows the curve minus friction",
    near(t, expect),
    `t=${t.toFixed(1)}`,
  )
  check("engine: no torque in neutral", e.torque(1, 0, false) === 0)
  check(
    "engine: shift cuts torque",
    near(e.torque(1, 1, true), t * P.engine.dynamics.shiftCutFraction),
  )
  e.rpm = P.engine.revLimiterRPM + 50
  e.stepRpm({
    dt: 1 / 120,
    simTime: 0,
    gear: 1,
    throttle: 1,
    fwdSpeed: 30,
    coupledRpm: P.engine.revLimiterRPM + 500,
    launchArmed: false,
    launching: false,
    launchBog: 0,
    launchRpm: 0,
    launchWobble: 0,
    clutchDumping: false,
    kickdownTimer: 0,
    airborne: false,
    shifting: false,
    flareRpm: 0,
  })
  check(
    "engine: limiter clamps rpm and cuts torque",
    e.rpm <= P.engine.revLimiterRPM && e.torque(1, 1, false) === 0,
    `rpm=${e.rpm.toFixed(0)}`,
  )
  const idle = new Engine(P.engine)
  for (let i = 0; i < 600; i++)
    idle.stepRpm({
      dt: 1 / 120,
      simTime: 0,
      gear: 0,
      throttle: 0,
      fwdSpeed: 0,
      coupledRpm: 0,
      launchArmed: false,
      launching: false,
      launchBog: 0,
      launchRpm: 0,
      launchWobble: 0,
      clutchDumping: false,
      kickdownTimer: 0,
      airborne: false,
      shifting: false,
      flareRpm: 0,
    })
  check(
    "engine: neutral rpm settles at idle",
    near(idle.rpm, P.engine.idleRPM, 0.03),
    `rpm=${idle.rpm.toFixed(0)}`,
  )
}

// ---- Gearbox ----------------------------------------------------------------
{
  const g = new Gearbox(P.transmission, P.shiftLogic, P.engine.redlineRPM)
  check(
    "gearbox: count matches ratios",
    g.count === P.transmission.gearRatios.length,
  )
  check(
    "gearbox: 1st overall ratio",
    near(
      g.ratio(1),
      P.transmission.gearRatios[0] * P.transmission.finalDriveRatio,
    ),
  )
  check("gearbox: neutral ratio is 0", g.ratio(0) === 0)
  check("gearbox: reverse ratio is positive", g.ratio(-1) > 0)
  const omega = 100
  check(
    "gearbox: predicted rpm scales with ratio",
    g.predictedRpm(2, omega) < g.predictedRpm(1, omega),
  )
  check(
    "gearbox: manual upshift 1 -> 2 returns previous gear",
    g.manualShift(1, 10, omega) === 1 && g.gear === 2,
  )
  check(
    "gearbox: shift in progress refuses another",
    g.manualShift(1, 10, omega) === null,
  )
  g.shiftTimer = 0
  g.gear = 3
  const hi = (P.engine.redlineRPM * 60) / (2 * Math.PI) / g.ratio(2) / 1.0
  check(
    "gearbox: over-rev downshift refused",
    g.manualShift(-1, 10, hi * 2) === null && g.gear === 3,
  )
  g.gear = 1
  check(
    "gearbox: auto shift beyond top is a no-op",
    !g.autoShift(99 + g.count, 0) || g.gear <= g.count,
  )
}

// ---- ShiftLogic -------------------------------------------------------------
{
  const logic = new ShiftLogic(
    P.shiftLogic,
    P.engine,
    P.transmission.autoUpshiftRPM,
    P.transmission.gearRatios,
  )
  const base: ShiftInput = {
    dt: 1 / 120,
    gear: 2,
    gearCount: P.transmission.gearRatios.length,
    rpm: P.engine.idleRPM,
    throttle: 0.5,
    aggressionCoef: 0.5,
    speedKmh: 60,
    autoMode: true,
    shifting: false,
    changeDelayActive: false,
    launchArmed: false,
    limiterCut: false,
    assistCutting: false,
    slipRatioAvg: 0,
    lateralVelocity: 0,
    predictedRpm: () => P.engine.idleRPM * 2,
  }
  check(
    "shift: upshifts near redline",
    logic.decide({
      ...base,
      rpm: P.engine.redlineRPM - 100,
      aggressionCoef: 1,
    }) === 1,
  )
  check(
    "shift: no upshift in manual mode",
    logic.decide({ ...base, autoMode: false, rpm: P.engine.redlineRPM }) === 0,
  )
  check(
    "shift: no upshift mid-shift",
    logic.decide({ ...base, shifting: true, rpm: P.engine.redlineRPM }) === 0,
  )
  const highUp = Math.min(
    P.transmission.autoUpshiftRPM ?? logic.optimal[base.gear - 1],
    P.engine.redlineRPM - P.shiftLogic.upMargin,
  )
  check(
    "shift: no upshift while wheelspinning",
    logic.decide({
      ...base,
      rpm: highUp - 1,
      slipRatioAvg: 0.5,
      aggressionCoef: 0.5,
    }) === 0,
  )
  check(
    "shift: limiter forces an upshift even while spinning",
    logic.decide({
      ...base,
      rpm: highUp + 1,
      slipRatioAvg: 0.5,
      aggressionCoef: 0.5,
    }) === 1,
  )
  check(
    "shift: downshifts at low rpm",
    logic.decide({
      ...base,
      gear: 4,
      rpm: P.engine.idleRPM * 1.1,
      speedKmh: 40,
      throttle: 0.2,
      aggressionCoef: 0,
    }) < 0,
  )
  const arcadeLow = logic.decide({
    ...base,
    rpm: highUp - 400,
    aggressionCoef: 0,
  })
  const arcadeHigh = logic.decide({
    ...base,
    rpm: highUp - 400,
    aggressionCoef: 1,
  })
  check(
    "shift: aggression moves the arcade shift point",
    arcadeLow === 1 && arcadeHigh === 0,
    `${arcadeLow}/${arcadeHigh}`,
  )
  check(
    "shift: realistic aggression is a valid fraction",
    P.shiftLogic.realisticAggression >= 0 &&
      P.shiftLogic.realisticAggression <= 1,
  )
  check(
    "shift: first gear never downshifts",
    logic.decide({ ...base, gear: 1, rpm: P.engine.idleRPM, speedKmh: 40 }) ===
      0,
  )
  check(
    "shift: computed points sit between idle and redline",
    logic.optimal.every(
      (r) => r >= P.engine.idleRPM && r <= P.engine.redlineRPM,
    ),
  )
  const peak = P.engine.torqueCurve.reduce((m, c) => (c[1] > m[1] ? c : m))
  check(
    "shift: first computed upshift is not before the torque peak",
    logic.optimal[0] >=
      Math.min(peak[0], P.engine.redlineRPM - P.shiftLogic.upMargin),
  )
}

// ---- Aggression -------------------------------------------------------------
{
  const a = new Aggression(P.shiftLogic)
  for (let i = 0; i < 240; i++) a.step(1 / 120, 1, 0, 1)
  check(
    "aggression: rises under full throttle",
    a.value > 0.8,
    `v=${a.value.toFixed(2)}`,
  )
  const hold = a.value
  for (let i = 0; i < 60; i++) a.step(1 / 120, 0, 0, 0)
  check(
    "aggression: mostly held through a brief lift",
    a.value > hold * 0.9,
    `${hold.toFixed(2)} -> ${a.value.toFixed(2)}`,
  )
  for (let i = 0; i < 120 * 30; i++) a.step(1 / 120, 0, 0, 0)
  check(
    "aggression: decays after a long lift",
    a.value < hold * 0.2,
    `v=${a.value.toFixed(2)}`,
  )
}

// ---- Driveline --------------------------------------------------------------
{
  const d = new Driveline(P.drivetrain)
  const out = d.prepare({
    dt: 1 / 120,
    gear: 3,
    gearRatio: 5,
    engineTorque: 400,
    converterMultiplier: 1,
    throttle: 1,
    speedKmh: 80,
    launchArmed: false,
    launching: false,
    clutchDumping: false,
    rawPower: false,
  })
  const front = d.wheelTorque(true, out, 3, P.drivetrain.frontTorqueSplit)
  const rear = d.wheelTorque(false, out, 3, P.drivetrain.frontTorqueSplit)
  check(
    "driveline: axle torques add up to the total",
    near(2 * front + 2 * rear, out.total),
    `sum=${(2 * front + 2 * rear).toFixed(1)} total=${out.total.toFixed(1)}`,
  )
  if (P.drivetrain.type === "rwd")
    check("driveline: RWD sends nothing to the front", front === 0)
  if (P.drivetrain.type === "fwd")
    check("driveline: FWD sends nothing to the rear", rear === 0)
  if (P.drivetrain.type === "awd")
    check("driveline: AWD drives both axles", front > 0 && rear > 0)
  check(
    "driveline: launch armed sends no torque",
    d.prepare({
      dt: 1 / 120,
      gear: 1,
      gearRatio: 20,
      engineTorque: 500,
      converterMultiplier: 1,
      throttle: 1,
      speedKmh: 0,
      launchArmed: true,
      launching: false,
      clutchDumping: false,
      rawPower: false,
    }).total === 0,
  )
}

// ---- Brakes + ABS -----------------------------------------------------------
{
  const b = new Brakes(P.brakes, P.wheels, 4)
  b.parking = false
  const ctx = {
    wheelIndex: 0,
    omega: 0,
    dt: 1 / 120,
    front: true,
    reverse: false,
    brake: 1,
    handbrake: false,
    steer: 0,
    throttle: 0,
    speedKmh: 50,
  }
  check(
    "brakes: front torque is the front brake force",
    near(b.torque(ctx), P.wheels.brakeForce.front),
  )
  check(
    "brakes: rear torque is the rear brake force",
    near(b.torque({ ...ctx, front: false }), P.wheels.brakeForce.rear),
  )
  check(
    "brakes: handbrake adds rear torque only",
    near(
      b.torque({
        ...ctx,
        brake: 0,
        handbrake: true,
        front: false,
        speedKmh: 0,
      }),
      P.wheels.handbrakeForce,
    ) && b.torque({ ...ctx, brake: 0, handbrake: true }) === 0,
  )
  check(
    "brakes: handbrake locks the rears on a rolling car",
    b.torque({
      ...ctx,
      brake: 0,
      handbrake: true,
      front: false,
      speedKmh: 50,
    }) >
      P.wheels.handbrakeForce * 10,
  )
  b.parking = true
  check(
    "brakes: parking brake holds a minimum torque",
    b.torque({ ...ctx, brake: 0 }) >= P.brakes.parkingTorque,
  )
  b.parking = true
  b.releaseOnThrottle(1)
  check("brakes: throttle releases the parking brake", b.parking === false)
  if (P.brakes.fade) {
    const hot = new Brakes(P.brakes, P.wheels, 4)
    hot.parking = false
    const cold = hot.torque({ ...ctx, omega: 80 })
    for (let i = 0; i < 120 * 20; i++) hot.torque({ ...ctx, omega: 80 })
    check(
      "brakes: sustained braking heats the rotor",
      hot.temps[0] > P.brakes.fade.ambientC + 50,
      `${hot.temps[0].toFixed(0)}C`,
    )
    check(
      "brakes: hot rotors fade",
      hot.torque({ ...ctx, omega: 80 }) < cold,
      `${cold.toFixed(0)} -> ${hot.torque({ ...ctx, omega: 80 }).toFixed(0)}`,
    )
    check(
      "brakes: fade never drops below the minimum fraction",
      hot.torque({ ...ctx, omega: 80 }) >=
        cold * P.brakes.fade.minFraction - 1e-6,
    )
    for (let i = 0; i < 120 * 600; i++)
      hot.torque({ ...ctx, brake: 0, omega: 0, speedKmh: 100 })
    check(
      "brakes: rotors cool back toward ambient",
      hot.temps[0] < P.brakes.fade.ambientC + 10,
      `${hot.temps[0].toFixed(0)}C`,
    )
  } else {
    const nf = new Brakes(P.brakes, P.wheels, 4)
    nf.parking = false
    for (let i = 0; i < 120 * 20; i++) nf.torque({ ...ctx, omega: 80 })
    check(
      "brakes: no fade spec means no fade",
      near(nf.torque(ctx), P.wheels.brakeForce.front),
    )
  }
  const dt = 1 / 120
  const A = P.assists.abs
  const abs = new Abs(A, true, 4)
  check(
    "abs: leaves a rolling wheel alone",
    abs.modulate(0, 1000, 1, 20, 20, dt) === 1000,
  )
  let out = 1000
  for (let i = 0; i < 120; i++) out = abs.modulate(0, 1000, 1, 2, 20, dt)
  check(
    "abs: releases pressure on a locking wheel",
    out < 1000 * A.slipTarget + 1,
    `${out.toFixed(0)}`,
  )
  for (let i = 0; i < 240; i++) out = abs.modulate(0, 1000, 1, 20, 20, dt)
  check("abs: rebuilds pressure once the wheel recovers", out === 1000)
  check("abs: wheels are independent", abs.pressureAt(1) === 1)
  check(
    "abs: free below its minimum speed",
    new Abs(A, true, 1).modulate(0, 1000, 1, 0, A.minSpeed / 2, dt) === 1000,
  )
  check(
    "abs: disabled passes through",
    new Abs(A, false, 1).modulate(0, 1000, 1, 1, 20, dt) === 1000,
  )
  // lock slip settles near the target on a wheel that slows with the brake pressure
  const loop = new Abs(A, true, 1)
  let w = 20
  let lockSum = 0
  let n = 0
  for (let i = 0; i < 1200; i++) {
    const t = loop.modulate(0, 4000, 1, w, 20, dt)
    w = Math.max(0, w + (-(t - 1500) / 40) * dt * (w > 0 ? 1 : 0)) // 1500 N m is the grip torque the tyre can hold
    if (i > 600) {
      lockSum += 1 - w / 20
      n++
    }
  }
  check(
    "abs: holds the wheel near its target slip",
    Math.abs(lockSum / n - A.slipTarget) < 0.15,
    `mean lock ${(lockSum / n).toFixed(2)}`,
  )
}

// ---- Steering ---------------------------------------------------------------
{
  const s = new Steering(P.wheels.steering, 2.7, 1.6)
  s.step(1 / 120, 1, 0, 0)
  check(
    "steering: slew limited",
    s.angle <= P.wheels.steering.ratePerSec / 120 + 1e-12,
  )
  for (let i = 0; i < 240; i++) s.step(1 / 120, 1, 0, 0)
  check(
    "steering: reaches max lock at standstill",
    near(s.angle, P.wheels.steering.maxAngle, 1e-3),
    `a=${s.angle.toFixed(3)}`,
  )
  const fast = new Steering(P.wheels.steering, 2.7, 1.6)
  for (let i = 0; i < 240; i++) fast.step(1 / 120, 1, 250, 70)
  check("steering: less lock at speed", fast.angle < s.angle)
}

// ---- Torque converter, traction control, aero, limiter --------------------------
{
  const tc = new TorqueConverter(P.transmission.torqueConverter)
  check(
    "converter: stall multiplication at standstill",
    near(
      tc.multiplier(true, 0),
      P.transmission.torqueConverter.stallMultiplication,
    ),
  )
  check(
    "converter: locked above lockup speed",
    tc.multiplier(true, P.transmission.torqueConverter.lockupSpeedKmh + 1) ===
      1,
  )
  check("converter: neutral is 1", tc.multiplier(false, 0) === 1)
  const trac = new TractionControl(
    P.assists.tractionControl,
    P.assists.traction,
  )
  const calm = {
    handbrake: false,
    launching: false,
    launchArmed: false,
    clutchDumping: false,
    throttle: 1,
    slipRatioAvg: 0,
    beta: 0,
    steerAngle: 0,
  }
  check("traction: no cut without slip", trac.factor(calm) === 1)
  check(
    "traction: cuts torque under slip",
    P.assists.tractionControl === 0 ||
      trac.factor({ ...calm, slipRatioAvg: 0.4 }) < 1,
  )
  const T = P.assists.traction
  check(
    "traction: no brake on a gripping wheel",
    trac.brakeFraction(20, 20, 1) === 0,
  )
  check(
    "traction: brakes a spinning wheel",
    trac.brakeFraction(20 * (1 + T.brakeSlipStart + 0.2), 20, 1) > 0,
  )
  check(
    "traction: reverse spin counts the other way",
    trac.brakeFraction(-20 * (1 + T.brakeSlipStart + 0.2), -20, -1) > 0 &&
      trac.brakeFraction(-5, -20, -1) === 0,
  )
  check(
    "traction: brake share is capped",
    trac.brakeFraction(100, 10, 1) <= T.brakeMaxFraction + 1e-9,
  )
  const aero = new Aero(P.aero)
  check("aero: nothing below min speed", aero.force(0.1, 0) === null)
  const f = aero.force(-30, 0)!
  check(
    "aero: drag opposes motion",
    f.dragX > 0 && Math.abs(f.dragZ) < 1e-9 && f.down >= 0,
  )
  const lim = new VelocityLimiter(P.limits)
  check(
    "limiter: clamps above max speed",
    lim.linearScale(P.limits.maxSpeed * 2, 0, 0) < 1 &&
      lim.linearScale(1, 0, 0) === 1,
  )
}

// ---- Stability control ------------------------------------------------------
{
  const wheels = [
    { front: true, left: true },
    { front: true, left: false },
    { front: false, left: true },
    { front: false, left: false },
  ]
  const mk = () =>
    new StabilityControl(P.assists.stability, wheels, 2.7, P.wheels.frictionMu)
  const base = {
    dt: 1 / 120,
    fwdSpeed: 25,
    groundedWheels: 4,
    handbrake: false,
    steerAngle: 0.05,
    beta: 0,
    yawRate: 0,
    launchActive: false,
    downforceAccel: 0,
  }
  const run = (esc: StabilityControl, i: object) => {
    for (let k = 0; k < 120; k++) esc.step({ ...base, ...i })
    return esc
  }
  const ref = mk().referenceYaw(0.05, 25)
  check(
    "esc: reference yaw follows the steer direction",
    ref > 0 && mk().referenceYaw(-0.05, 25) < 0,
  )
  check(
    "esc: reference yaw is capped by grip",
    Math.abs(mk().referenceYaw(1, 25)) * 25 <=
      P.assists.stability.gripFraction * P.wheels.frictionMu * 9.81 + 1e-6,
  )
  const calm = run(mk(), { yawRate: ref })
  check(
    "esc: idle while the car follows the driver",
    calm.pressure.every((p) => p === 0) && calm.engineFactor === 1,
  )
  const over = run(mk(), { yawRate: ref + 1, beta: 0.3 })
  check(
    "esc: oversteer to the left brakes the outer (right) front",
    over.pressure[1] > 0 &&
      over.pressure[0] === 0 &&
      over.pressure[2] === 0 &&
      over.pressure[3] === 0,
    over.pressure.map((p) => p.toFixed(2)).join(" "),
  )
  check("esc: oversteer cuts the engine", over.engineFactor < 1)
  const mirror = run(mk(), { steerAngle: -0.05, yawRate: -ref - 1, beta: -0.3 })
  check(
    "esc: oversteer to the right brakes the outer (left) front",
    mirror.pressure[0] > 0 && mirror.pressure[1] === 0,
  )
  const under = run(mk(), { steerAngle: 0.15, yawRate: 0 })
  check(
    "esc: understeer to the left brakes the inner (left) rear",
    under.pressure[2] > 0 &&
      under.pressure[0] === 0 &&
      under.pressure[1] === 0 &&
      under.pressure[3] === 0,
    under.pressure.map((p) => p.toFixed(2)).join(" "),
  )
  check(
    "esc: pressure stays within the axle share",
    Math.max(...over.pressure, ...under.pressure) <=
      P.assists.stability.maxBrakeFraction + 1e-9,
  )
  check(
    "esc: handbrake disables it",
    run(mk(), { yawRate: ref + 1, beta: 0.3, handbrake: true }).pressure.every(
      (p) => p === 0,
    ),
  )
  check(
    "esc: slow car is left alone",
    run(mk(), { fwdSpeed: 1, yawRate: ref + 1, beta: 0.3 }).pressure.every(
      (p) => p === 0,
    ),
  )
  const e1 = mk()
  e1.step({ ...base, yawRate: ref + 1, beta: 0.3 })
  check(
    "esc: pressure builds at a hydraulic rate",
    e1.pressure[1] > 0 && e1.pressure[1] < P.assists.stability.maxBrakeFraction,
  )
  run(e1, { yawRate: ref })
  check(
    "esc: pressure releases once the car is back",
    e1.pressure.every((p) => p === 0),
  )
}

// ---- Cruise, launch, direction shift, relaxation -----------------------------
{
  const c = new Cruise(P.cruise, 340)
  const st = {
    speedKmh: 100,
    fwdSpeed: 27,
    gear: 4,
    brake: 0,
    handbrake: false,
    parkingBrake: false,
  }
  c.handleButtons(
    { togglePressed: false, setPressed: true, upPressed: false },
    st,
  )
  check("cruise: set locks the current speed", c.active && c.targetKmh === 100)
  const slow = c.inject(1 / 120, 0, 0, 80, 4)
  check("cruise: adds throttle when below target", slow.throttle > 0)
  check(
    "cruise: driver throttle wins",
    c.inject(1 / 120, 1, 0, 80, 4).throttle === 1,
  )
  c.handleButtons(
    { togglePressed: false, setPressed: false, upPressed: false },
    { ...st, brake: 1 },
  )
  check("cruise: braking pauses it", !c.active && c.targetKmh === 100)

  const l = new Launch(P.launch, P.transmission.launchControlRPM)
  l.arm(true, 1, 1, 1)
  check("launch: arms at a standstill with both pedals", l.armed)
  l.arm(false, 1, 1, 1)
  check("launch: does not arm while moving", !l.armed)

  const g = { gear: 1 as const, shiftTimer: 0 }
  const d = new DirectionShift(P.autoDirection)
  const held = {
    dt: 1 / 120,
    fwdSpeed: 0,
    throttle: 0,
    brake: 1,
    handbrake: false,
  }
  const gs: { gear: number; shiftTimer: number } = g
  for (let i = 0; i < 240; i++) d.step(gs as never, held)
  for (let i = 0; i < 120; i++) d.step(gs as never, held)
  check(
    "direction: holding brake at a stop goes 1 -> N -> R",
    gs.gear === -1,
    `gear=${gs.gear}`,
  )

  const r = new TireRelaxation(
    4,
    P.contact,
    P.wheels.relaxationLength,
    P.wheels.tire.maxSlip,
  )
  // 10 m/s along the wheel with the wheel surface 1 m/s faster: slip ratio 0.1 at steady state
  const first = r.step(0, 1 / 120, 1, 0, 10).slipRatio
  let last = first
  for (let i = 0; i < 600; i++) last = r.step(0, 1 / 120, 1, 0, 10).slipRatio
  check(
    "relaxation: slip builds up over the rolled distance",
    first > 0 && first < 0.05 && Math.abs(last - 0.1) < 0.01,
    `${first.toFixed(4)} -> ${last.toFixed(3)}`,
  )
  const still = new TireRelaxation(
    4,
    P.contact,
    P.wheels.relaxationLength,
    P.wheels.tire.maxSlip,
  )
  let sl = still.step(0, 1 / 120, 0, 0, 0)
  for (let i = 0; i < 600; i++) sl = still.step(0, 1 / 120, 0, 0, 0)
  check(
    "relaxation: no slip speed at a standstill means exactly no slip",
    sl.slipRatio === 0 && sl.slipTan === 0,
  )
  const spun = new TireRelaxation(
    4,
    P.contact,
    P.wheels.relaxationLength,
    P.wheels.tire.maxSlip,
  )
  let big = spun.step(0, 1 / 120, 500, 500, 0)
  for (let i = 0; i < 600; i++) big = spun.step(0, 1 / 120, 500, 500, 0)
  check(
    "relaxation: deflection is clamped to the car's maxSlip",
    Math.abs(big.slipRatio) <= P.wheels.tire.maxSlip + 1e-9 &&
      Number.isFinite(big.slipTan),
  )

  const pt = new Engine(P.engine)
  pt.rpm = enginePeaks(P.engine).torqueRPM
  const full = pt.torque(1, 1, false)
  const half = pt.torque(0.5, 1, false)
  check(
    "engine: part throttle gives less torque than full",
    half < full && half > 0,
    `${half.toFixed(0)} < ${full.toFixed(0)}`,
  )
  check("engine: closed throttle brakes the engine", pt.torque(0, 1, false) < 0)
  pt.rpm = P.engine.idleRPM
  const fe = new Engine(P.engine)
  const rin = {
    dt: 1 / 120,
    simTime: 0,
    gear: 0,
    throttle: 1,
    fwdSpeed: 0,
    coupledRpm: 0,
    launchArmed: false,
    launching: false,
    launchBog: 0,
    launchRpm: 0,
    launchWobble: 0,
    clutchDumping: false,
    kickdownTimer: 0,
    airborne: false,
    slipSpeed: 0,
    flareRpm: 0,
  }
  const net =
    P.engine.maxTorqueNm * curveLookup(P.engine.torqueCurve, P.engine.idleRPM) -
    fe.frictionTorque()
  fe.stepRpm(rin)
  const rise = fe.rpm - P.engine.idleRPM
  check(
    "engine: free revving never beats torque over inertia",
    rise <=
      (net / P.engine.engineInertia) * (1 / 120) * (60 / (2 * Math.PI)) + 1e-6,
    `rise=${rise.toFixed(1)}`,
  )

  const te = new Engine(P.engine)
  te.rpm =
    (enginePeaks(P.engine).torqueRPM + enginePeaks(P.engine).powerRPM) / 2
  if (P.engine.turbo) {
    const full =
      P.engine.maxTorqueNm * curveLookup(P.engine.torqueCurve, te.rpm) -
      te.frictionTorque() * P.engine.dynamics.frictionShare
    const cold = te.torque(1, 1, false)
    check(
      "turbo: no boost at start means less than the full-boost torque",
      cold < full,
      `${cold.toFixed(0)} < ${full.toFixed(0)}`,
    )
    const rin = {
      dt: 1 / 120,
      simTime: 0,
      gear: 1,
      throttle: 1,
      fwdSpeed: 30,
      coupledRpm: te.rpm,
      launchArmed: false,
      launching: false,
      launchBog: 0,
      launchRpm: 0,
      launchWobble: 0,
      clutchDumping: false,
      kickdownTimer: 0,
      airborne: false,
      slipSpeed: 0,
      flareRpm: 0,
    }
    for (let i = 0; i < 600; i++) te.stepRpm({ ...rin, coupledRpm: te.rpm })
    check(
      "turbo: spools to full boost under sustained throttle",
      te.boost > 0.95,
      `boost=${te.boost.toFixed(2)}`,
    )
    for (let i = 0; i < 600; i++)
      te.stepRpm({ ...rin, throttle: 0, coupledRpm: te.rpm })
    check(
      "turbo: boost falls off when the throttle is lifted",
      te.boost < 0.05,
      `boost=${te.boost.toFixed(2)}`,
    )
  } else {
    check(
      "turbo: naturally aspirated engine reports zero boost",
      te.boost === 0 && !te.turbocharged,
    )
  }

  const cdSpec = P.drivetrain.centerDiff
  const cd = new CenterDiff(cdSpec, P.drivetrain.frontTorqueSplit)
  const evenShare = cd.step(1 / 120, 20, 20)
  check(
    "centre diff: equal axle speeds keep the base split",
    near(evenShare, P.drivetrain.frontTorqueSplit),
    `${evenShare}`,
  )
  if (cdSpec) {
    let slow = evenShare
    for (let i = 0; i < 600; i++) slow = cd.step(1 / 120, 10, 40)
    check(
      "centre diff: rear spinning sends torque to the front",
      slow > P.drivetrain.frontTorqueSplit,
      `${slow.toFixed(2)}`,
    )
    check(
      "centre diff: share stays inside its limits",
      slow <= cdSpec.maxFrontShare + 1e-9 &&
        slow >= cdSpec.minFrontShare - 1e-9,
    )
    let low = slow
    for (let i = 0; i < 600; i++) low = cd.step(1 / 120, 40, 10)
    check(
      "centre diff: front spinning sends torque to the rear",
      low < P.drivetrain.frontTorqueSplit,
      `${low.toFixed(2)}`,
    )
  } else {
    check(
      "centre diff: no spec means a fixed split",
      near(cd.step(1 / 120, 5, 50), P.drivetrain.frontTorqueSplit),
    )
  }

  const D = P.differential
  const diff = new Differential(D)
  const [a, b] = diff.split(1000, 20, 20)
  check(
    "diff: equal wheel speeds split evenly",
    near(a, 500) && near(b, 500),
    `${a}/${b}`,
  )
  const [fa, fb] = diff.split(1000, 30, 10)
  check("diff: torque total is conserved", near(fa + fb, 1000))
  if (D.type === "open")
    check("diff: open never biases", near(fa, 500) && near(fb, 500))
  else
    check(
      "diff: faster wheel loses torque to the slower",
      fa < 500 && fb > 500,
      `${fa}/${fb}`,
    )
  const [la, lb] = diff.split(1000, 30, 10)
  const cap =
    D.type === "locked" ? 1000 : D.preloadTorque + D.lsdAccelLock * 1000
  check(
    "diff: transfer never exceeds the lock cap",
    D.type === "open" || Math.abs(la - lb) / 2 <= cap / 1 + 1e-6,
  )
  const [ma, mb] = diff.split(1000, 10, 30)
  check(
    "diff: bias is mirror-symmetric",
    D.type === "open" || (near(ma, fb) && near(mb, fa)),
  )
}

// ---- surfaces and weather ---------------------------------------------------
{
  const ids = Object.keys(SURFACES) as SurfaceId[]
  const wx = Object.keys(WEATHER_GRIP) as WeatherId[]
  check(
    "surfaces: dry asphalt is the unscaled reference",
    surfaceGrip("asphalt", "dry") === 1 && SURFACES.asphalt.rolling === 1,
  )
  check(
    "surfaces: every grip stays in (0, 1] and loose ground grips less than asphalt",
    ids.every((i) => surfaceGrip(i, "dry") > 0 && surfaceGrip(i, "dry") <= 1) &&
      surfaceGrip("sand", "dry") < 1,
  )
  check(
    "weather: worse weather never adds grip",
    ids.every((i) =>
      wx.every((w) => surfaceGrip(i, w) <= surfaceGrip(i, "dry") + 1e-12),
    ),
  )
  const tm = new TireModel(tireParamsFrom(P.wheels), P.wheels.radius)
  const contact = {
    grounded: true,
    normalLoad: 4000,
    normal: { x: 0, y: 1, z: 0 },
    patchVel: { x: 0, y: 0, z: -20 },
    wheelOmega: 0,
    slipRatio: 0.12,
    slipTan: 0,
    wheelHeading: { x: 0, y: 0, z: -1 },
    bodyForward: { x: 0, y: 0, z: -1 },
  }
  const dry = tm.eval(contact)
  const wet = tm.eval({ ...contact, gripScale: surfaceGrip("asphalt", "wet") })
  check(
    "tyre: wet grip scale lowers the traction force",
    Math.abs(wet.fx) < Math.abs(dry.fx),
    `${wet.fx.toFixed(0)} vs ${dry.fx.toFixed(0)}`,
  )
  const roll = (rs: number) =>
    tm.eval({ ...contact, slipRatio: 0, rollingScale: rs }).rollingForce
  check(
    "tyre: rolling scale multiplies rolling resistance",
    Math.abs(roll(4) / roll(1) - 4) < 1e-6,
  )
}

// ---- impact ---------------------------------------------------------------
{
  const C = P.chassis.crash
  const still = { x: 0, y: 0, z: 0 }
  const fast = { x: 0, y: 0, z: -30 }
  const mk = () => {
    const im = new Impact(C)
    im.update(1 / 120, fast, still, () => true)
    im.record(fast, still)
    return im
  }
  const free = mk()
  free.update(1 / 120, still, still, () => false)
  check(
    "impact: a velocity jump without contact (a teleport) is not a hit",
    free.gripScale === 1,
  )
  const hit = mk()
  const out = hit.update(
    1 / 120,
    { x: 0, y: 40, z: 0 },
    { x: 30, y: 0, z: 0 },
    () => true,
  )
  check(
    "impact: a hit costs grip, within the class limit",
    hit.gripScale < 1 && hit.gripScale >= 1 - C.gripLoss - 1e-9,
    `grip ${hit.gripScale.toFixed(2)}`,
  )
  check(
    "impact: upward speed and spin are capped",
    !!out.linvel &&
      out.linvel.y <= C.maxLaunchSpeed + 1e-9 &&
      !!out.angvel &&
      Math.abs(out.angvel.x) <= C.maxSpin + 1e-9,
  )
  for (let i = 0; i < C.gripRecovery * 120 + 5; i++)
    hit.update(1 / 120, still, still, () => false)
  check("impact: grip is back after the recovery time", hit.gripScale === 1)
  hit.reset()
  check("impact: reset clears the loss", hit.gripScale === 1)
}

console.log(
  fails === 0
    ? "ALL COMPONENT CHECKS PASSED"
    : `${fails} COMPONENT CHECKS FAILED`,
)
process.exit(fails === 0 ? 0 : 1)
