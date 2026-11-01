import type { CarSpec } from "./schema"

export function validateCar(car: CarSpec): string[] {
  const errs: string[] = []
  const err = (m: string) => errs.push(`${car.id}: ${m}`)

  const walk = (v: unknown, path: string) => {
    if (v === undefined || v === null) {
      if (path !== "defaultTint") err(`${path} is missing`)
      return
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) err(`${path} is not finite`)
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`))
    } else if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
    }
  }
  walk(car.physics, "physics")
  walk(car.wheels, "wheels")
  walk(car.dash, "dash")
  if (errs.length) return errs

  const p = car.physics
  const pos = (n: number, path: string) => {
    if (!(n > 0)) err(`${path} must be > 0 (got ${n})`)
  }
  for (const [k, v] of Object.entries(p.dimensions)) {
    if (k === "centerOfMassOffsetZ") {
      if (!Number.isFinite(v)) err(`dimensions.${k} must be a number`)
    } else pos(v, `dimensions.${k}`)
  }
  pos(p.mass.chassis, "mass.chassis")
  for (const k of ["yawDamping"] as const) {
    if (!(p.chassis[k] >= 0)) err(`chassis.${k} must be >= 0 (got ${p.chassis[k]})`)
  }
  pos(p.wheels.radius, "wheels.radius")
  for (const ax of ["front", "rear"] as const) {
    const a = p.wheels.suspension[ax]
    pos(a.springRate, `suspension.${ax}.springRate`)
    pos(a.bumpDamping, `suspension.${ax}.bumpDamping`)
    pos(a.reboundDamping, `suspension.${ax}.reboundDamping`)
    pos(a.rideHeight, `suspension.${ax}.rideHeight`)
    if (a.reboundDamping < a.bumpDamping) err(`suspension.${ax}.reboundDamping should be at least bumpDamping`)
  }

  if (car.wheels.length !== 4) err("needs exactly 4 wheels")
  const fronts = car.wheels.filter((w) => w.front)
  const rears = car.wheels.filter((w) => !w.front)
  if (fronts.length !== 2 || rears.length !== 2) err("needs 2 front and 2 rear wheels")
  else if (!(Math.min(...rears.map((w) => w.z)) > Math.max(...fronts.map((w) => w.z))))
    err("front wheels must have smaller z than rear wheels (forward is -z)")

  const e = p.engine
  const c = e.torqueCurve
  if (c.length < 2) err("torqueCurve needs at least 2 points")
  for (let i = 1; i < c.length; i++)
    if (!(c[i][0] > c[i - 1][0])) err(`torqueCurve rpm not ascending at index ${i}`)
  if (c.length) {
    const peak = Math.max(...c.map((x) => x[1]))
    if (Math.abs(peak - 1) > 0.02) err(`torqueCurve peak is ${peak}, expected 1.0 (fraction of maxTorqueNm)`)
  }
  if (!(e.idleRPM < e.redlineRPM)) err("idleRPM must be below redlineRPM")
  if (e.revLimiterRPM < e.redlineRPM) err("revLimiterRPM below redlineRPM")

  const t = p.transmission
  if (t.gearRatios.length < 1) err("needs at least one gear")
  for (let i = 1; i < t.gearRatios.length; i++)
    if (!(t.gearRatios[i] < t.gearRatios[i - 1])) err(`gearRatios not descending at gear ${i + 1}`)
  pos(t.finalDriveRatio, "transmission.finalDriveRatio")
  if (t.autoUpshiftRPM !== undefined && !(t.autoDownshiftRPM < t.autoUpshiftRPM)) err("autoDownshiftRPM must be below autoUpshiftRPM")

  const tm = p.engine.throttleMap
  if (tm.length < 2 || tm[0][0] !== 0 || tm[tm.length - 1][0] !== 1)
    err("engine.throttleMap must run from throttle 0 to 1")
  if (tm.some(([, f], i) => f < 0 || f > 1 || (i > 0 && f < tm[i - 1][1])))
    err("engine.throttleMap fractions must rise within 0..1")
  if (!(p.engine.engineInertia > 0)) err("engine.engineInertia must be > 0")
  if (!(p.engine.config.cylinders >= 1) || !(p.engine.config.displacementL > 0)) err("engine.config needs cylinders >= 1 and displacementL > 0")
  if (p.engine.engineBrakeBase < 0 || p.engine.engineBrakeRPMFactor < 0) err("engine braking values must be >= 0")

  const dyn = p.engine.dynamics
  if (!(dyn.clutchLockStart > 0 && dyn.clutchLockStart < 1)) err("engine.dynamics.clutchLockStart must be between 0 and 1")
  if (!(dyn.clutchHoldMargin >= 1)) err("engine.dynamics.clutchHoldMargin must be at least 1 (a locked clutch holds peak torque)")
  if (!(dyn.stallMinAccel >= 0)) err("engine.dynamics.stallMinAccel must be >= 0")
  if (!(p.shiftLogic.kickdownAfterUpshift >= 0)) err("shiftLogic.kickdownAfterUpshift must be >= 0")
  if (!(p.aero.yawDragGain >= 0) || !(p.aero.yawDownforceLoss >= 0)) err("aero.yawDragGain and yawDownforceLoss must be >= 0")
  const act = p.aero.active
  if (act && !(act.dragScale > 0 && act.downforceScale >= 0 && act.blendRate > 0)) err("aero.active needs dragScale > 0, downforceScale >= 0, blendRate > 0")
  const cr = p.chassis.crash
  if (!(cr.detectDeltaV > 0 && cr.severeDeltaV > 0 && cr.maxLaunchSpeed >= 0 && cr.maxSpin >= 0 && cr.gripRecovery > 0 && cr.gripLoss >= 0 && cr.gripLoss <= 1))
    err("chassis.crash needs positive thresholds, gripRecovery > 0 and gripLoss in 0..1")
  const as = p.assists
  for (const [k, v] of Object.entries(as.bodyStability)) {
    if (!(v >= 0)) err(`assists.bodyStability.${k} must be >= 0 (got ${v})`)
  }
  if (!(as.abs.slipTarget > 0 && as.abs.slipTarget < 1)) err("assists.abs.slipTarget must be between 0 and 1")
  if (!(as.abs.reapplyFraction > 0 && as.abs.reapplyFraction < 1)) err("assists.abs.reapplyFraction must be between 0 and 1")
  if (!(as.abs.releaseRate > 0 && as.abs.applyRate > 0 && as.abs.minSpeed > 0)) err("assists.abs rates and minSpeed must be > 0")
  const tcs = as.traction
  if (!(tcs.brakeGain >= 0 && tcs.brakeSlipStart > 0 && tcs.slipSpeedFloor > 0 && tcs.brakeDriveShare > 0)) err("assists.traction brake fields must be positive")
  if (!(tcs.brakeMaxFraction >= 0 && tcs.brakeMaxFraction <= 1)) err("assists.traction.brakeMaxFraction must be between 0 and 1")
  const esc = as.stability
  if (!(esc.understeerDegPerG >= 0)) err("assists.stability.understeerDegPerG must be >= 0")
  if (!(esc.gripFraction > 0 && esc.gripFraction <= 1)) err("assists.stability.gripFraction must be in (0, 1]")
  if (!(esc.maxBrakeFraction > 0 && esc.maxBrakeFraction <= 1)) err("assists.stability.maxBrakeFraction must be in (0, 1]")
  if (!(esc.indicateFraction > 0 && esc.indicateFraction <= esc.maxBrakeFraction)) err("assists.stability.indicateFraction must be in (0, maxBrakeFraction]")
  if (!(esc.wheelSlipLimit > 0 && esc.wheelSlipLimit < 1)) err("assists.stability.wheelSlipLimit must be between 0 and 1")
  if (!(esc.pressureRiseRate > 0 && esc.pressureFallRate > 0)) err("assists.stability pressure rates must be > 0")
  if (!(esc.maxEngineCut >= 0 && esc.maxEngineCut <= 1)) err("assists.stability.maxEngineCut must be between 0 and 1")
  if (!(dyn.stallDelay > 0)) err("engine.dynamics.stallDelay must be > 0")
  if (!(dyn.idleHoldFraction >= 0 && dyn.idleHoldFraction <= 1)) err("engine.dynamics.idleHoldFraction must be between 0 and 1")
  if (!(dyn.restartTime > 0)) err("engine.dynamics.restartTime must be positive")
  const fl = p.engine.dynamics.launchFlareRPM
  if (!(fl > p.engine.idleRPM && fl < p.engine.redlineRPM)) err("engine.dynamics.launchFlareRPM must sit between idle and redline")

  const tb = p.engine.turbo
  if (tb) {
    if (tb.boostCurve.length < 2) err("turbo.boostCurve needs at least two points")
    if (tb.boostCurve.some(([, b]) => b < 0 || b > 1)) err("turbo.boostCurve values must be within 0..1")
    if (tb.boostTorqueShare <= 0 || tb.boostTorqueShare >= 1) err("turbo.boostTorqueShare must be within 0..1")
    if (!(tb.spoolUpRate > 0) || !(tb.spoolDownRate > 0)) err("turbo spool rates must be > 0")
  }

  const al = p.wheels.alignment
  for (const ax of ["front", "rear"] as const) {
    if (Math.abs(al[ax].camberDeg) > 6) err(`alignment.${ax}.camberDeg beyond +-6 degrees`)
    if (Math.abs(al[ax].toeDeg) > 1) err(`alignment.${ax}.toeDeg beyond +-1 degree`)
  }
  if (!(al.camberThrust >= 0 && al.camberThrust <= 0.5)) err("alignment.camberThrust must be in 0..0.5")
  if (!(p.wheels.steering.pneumaticTrail > 0)) err("steering.pneumaticTrail must be > 0")
  if (!(p.wheels.steering.ackermannFactor >= 0 && p.wheels.steering.ackermannFactor <= 1)) err("steering.ackermannFactor must be in 0..1")
  const s = p.wheels.suspension
  if (!(s.travel > 0)) err("suspension.travel must be > 0")
  if (!(s.bumpStart < s.travel + s.travelMargin)) err("suspension.bumpStart beyond travel limit")
  if (p.drivetrain.type !== "rwd" && p.drivetrain.type !== "fwd" && p.drivetrain.type !== "awd")
    err(`drivetrain.type "${p.drivetrain.type}" is not rwd, fwd or awd`)

  const d = p.differential
  if (d.type !== "open" && d.type !== "lsd" && d.type !== "locked")
    err(`differential.type "${d.type}" is not open, lsd or locked`)
  if (d.lsdAccelLock < 0 || d.lsdAccelLock > 1 || d.lsdDecelLock < 0 || d.lsdDecelLock > 1)
    err("differential lock fractions must be within 0..1")
  if (!(d.lockStiffness > 0)) err("differential.lockStiffness must be > 0")

  const cd = p.drivetrain.centerDiff
  if (cd) {
    if (p.drivetrain.type !== "awd") err("centerDiff needs drivetrain.type awd")
    if (!(cd.lockStiffness > 0) || !(cd.responseRate > 0)) err("centerDiff stiffness and response must be > 0")
    const b = p.drivetrain.frontTorqueSplit
    if (!(cd.minFrontShare >= 0 && cd.minFrontShare <= b && b <= cd.maxFrontShare && cd.maxFrontShare <= 1))
      err("centerDiff shares must satisfy 0 <= min <= frontTorqueSplit <= max <= 1")
  }

  const fd = p.brakes.fade
  if (fd) {
    if (!(fd.heatCapacity > 0)) err("brakes.fade.heatCapacity must be > 0")
    if (!(fd.fadeStartC < fd.fadeEndC)) err("brakes.fade start temperature must be below the end")
    if (!(fd.minFraction > 0 && fd.minFraction <= 1)) err("brakes.fade.minFraction must be within 0..1")
  }

  if (car.dash.redFromRpm > car.dash.maxRpm) err("dash.redFromRpm above dash.maxRpm")
  return errs
}

export function validateAll(cars: CarSpec[]): string[] {
  const errs = cars.flatMap(validateCar)
  const seen = new Set<string>()
  for (const c of cars) {
    if (seen.has(c.id)) errs.push(`${c.id}: duplicate id`)
    seen.add(c.id)
  }
  return errs
}
