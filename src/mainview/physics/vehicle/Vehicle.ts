import { conditions, timeOfDayGrip } from "../core/Conditions"
import { DEFAULT_SHIFT_MODE, type ShiftMode } from "../../data/world"
import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { CarDashConfig, CarPhysicsConfig } from "../../data/schema"
import { KMH_PER_MS, SECONDS_PER_MINUTE, TWO_PI } from "../../data/units"
import { clamp } from "../math"
import type { DriveInput } from "../../systems/InputManager"
import { Abs } from "./components/Abs"
import { Aggression } from "./components/Aggression"
import { Brakes } from "./components/Brakes"
import { CreepForces } from "./components/CreepForces"
import { Cruise } from "./components/Cruise"
import { DirectionShift } from "./components/DirectionShift"
import { Driveline } from "./components/Driveline"
import { Alignment } from "./components/Alignment"
import { Engine, enginePeaks } from "./components/Engine"
import { Gearbox } from "./components/Gearbox"
import { Launch } from "./components/Launch"
import { ShiftLogic } from "./components/ShiftLogic"
import { SlipTracker } from "./components/SlipTracker"
import { Steering } from "./components/Steering"
import { SuspensionSystem, type WheelDef } from "./components/Suspension"
import { TireModel, tireParamsFrom } from "./components/TireModel"
import { TorqueConverter } from "./components/TorqueConverter"
import { StabilityControl } from "./components/StabilityControl"
import { TractionControl } from "./components/TractionControl"
import { WheelDynamics, estimateWheelInertia } from "./components/WheelDynamics"
import { BodyForces } from "./BodyForces"
import { forwardSpeedOf, lateralSpeedOf, measureKinematics } from "./Kinematics"
import { buildTelemetry } from "./Telemetry"
import type { CarTelemetry, Gear } from "./types"
import { WheelSolver } from "./WheelSolver"

export type { CarTelemetry, Gear } from "./types"

/**
 * One car. Builds every component from its spec and runs them in a fixed
 * order each physics step. Components never call each other; this class
 * passes values between them. App, AI and multiplayer talk to this API.
 */
export class Vehicle {
  readonly wheelbase: number
  readonly trackWidth: number

  readonly gearbox: Gearbox
  readonly engine: Engine
  readonly launch: Launch
  readonly abs: Abs
  readonly cruise: Cruise
  readonly steering: Steering
  readonly brakes: Brakes
  readonly driveline: Driveline
  readonly suspension: SuspensionSystem
  readonly wheelDynamics: WheelDynamics
  readonly tireModel: TireModel
  readonly slip: SlipTracker
  private readonly directionShift: DirectionShift
  private readonly aggression: Aggression
  private readonly shiftLogic: ShiftLogic
  private readonly traction: TractionControl
  private readonly stability: StabilityControl
  private readonly converter: TorqueConverter
  private readonly solver: WheelSolver
  private readonly forces: BodyForces

  autoMode = true
  /** Traction control on or off (the X key). Driver aids start off. */
  tractionControlOn = false
  stabilityControlOn = false
  private readonly rawFlareRpm: number
  /** Arcade shifts follow driving style; realistic shifts at a fixed style. */
  shiftMode: ShiftMode = DEFAULT_SHIFT_MODE
  autoShiftEnabled = true
  private simTime = 0
  /** Wheels on the ground at the last step; the stability control reads it a step late. */
  private groundedWheels = 0
  private readonly noBrake: number[]
  private readonly totalMass: number
  /** Traction control is cutting engine torque this step. */
  private engineCut = false

  constructor(
    readonly world: RAPIER.World,
    readonly body: RAPIER.RigidBody,
    readonly R: typeof RAPIER,
    readonly P: CarPhysicsConfig,
    readonly wheelDefs: readonly WheelDef[],
    readonly dash: CarDashConfig,
  ) {
    const fronts = wheelDefs.filter((w) => w.front)
    const rears = wheelDefs.filter((w) => !w.front)
    const meanZ = (ws: readonly WheelDef[]) =>
      ws.reduce((a, w) => a + w.z, 0) / Math.max(1, ws.length)
    this.wheelbase = Math.abs(meanZ(rears) - meanZ(fronts))
    this.trackWidth = Math.abs(Math.max(...fronts.map((f) => f.x)) - Math.min(...fronts.map((f) => f.x)))
    this.noBrake = wheelDefs.map(() => 0)
    this.totalMass = P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel)
    body.setLinearDamping(P.chassis.linearDamping)
    body.setAngularDamping(P.chassis.angularDamping)

    const w = P.wheels
    this.gearbox = new Gearbox(P.transmission, P.shiftLogic, P.engine.redlineRPM)
    this.engine = new Engine(P.engine)
    this.launch = new Launch(P.launch, P.transmission.launchControlRPM)
    this.cruise = new Cruise(P.cruise, dash.maxKmh)
    this.steering = new Steering(w.steering, this.wheelbase, this.trackWidth)
    this.rawFlareRpm = enginePeaks(P.engine).torqueRPM
    this.abs = new Abs(P.assists.abs, P.assists.absEnabled, wheelDefs.length)
    this.brakes = new Brakes(P.brakes, w, wheelDefs.length)
    this.driveline = new Driveline(P.drivetrain)
    this.directionShift = new DirectionShift(P.autoDirection)
    this.aggression = new Aggression(P.shiftLogic)
    this.shiftLogic = new ShiftLogic(P.shiftLogic, P.engine, P.transmission.autoUpshiftRPM, P.transmission.gearRatios)
    this.traction = new TractionControl(P.assists.tractionControl, P.assists.traction)
    this.stability = new StabilityControl(P.assists.stability, wheelDefs, this.wheelbase, w.frictionMu)
    this.converter = new TorqueConverter(P.transmission.torqueConverter)
    this.forces = new BodyForces(world, body, P)
    this.slip = new SlipTracker(P.contact, P.kinematics)

    this.suspension = new SuspensionSystem(world, body, R, [...wheelDefs], w.suspension, P.mass.chassis)
    const wheelMass = (P.mass.frontWheel + P.mass.rearWheel) / 2
    this.wheelDynamics = new WheelDynamics(
      w.radius,
      estimateWheelInertia(wheelMass, w.radius),
      w.slipDampRate,
      wheelDefs.length,
    )
    this.tireModel = new TireModel(tireParamsFrom(w), w.radius)
    this.solver = new WheelSolver(
      body,
      P,
      wheelDefs,
      this.suspension,
      this.wheelDynamics,
      this.tireModel,
      this.driveline,
      this.brakes,
      this.abs,
      this.traction,
      this.stability,
      new CreepForces(P.creep),
      this.slip,
      this.steering,
      new Alignment(P.wheels.alignment),
    )
  }

  // ---- state other code reads or sets ---------------------------------
  get gear(): Gear {
    return this.gearbox.gear
  }
  set gear(g: Gear) {
    this.gearbox.gear = g
  }
  get rpm(): number {
    return this.engine.rpm
  }
  set rpm(v: number) {
    this.engine.rpm = v
  }
  get parkingBrake(): boolean {
    return this.brakes.parking
  }
  set parkingBrake(v: boolean) {
    this.brakes.parking = v
  }
  get steerAngle(): number {
    return this.steering.angle
  }
  set steerAngle(v: number) {
    this.steering.angle = v
  }
  get slipRatioAvg(): number {
    return this.slip.slipRatioAvg
  }
  get rearSlip(): number {
    return this.slip.rearSlip
  }
  get drifting(): boolean {
    return this.slip.drifting
  }
  get launching(): boolean {
    return this.launch.launching
  }
  get launchArmed(): boolean {
    return this.launch.armed
  }
  get launchEnabled(): boolean {
    return this.launch.enabled
  }
  set launchEnabled(v: boolean) {
    this.launch.enabled = v
  }
  get cruiseActive(): boolean {
    return this.cruise.active
  }
  get cruiseTargetKmh(): number | null {
    return this.cruise.targetKmh
  }
  get aggressionLevel(): number {
    return this.aggression.value
  }
  /** Angular speed of the driven axle (rad/s). */
  get spinOmega(): number {
    return this.driveline.drivenOmega
  }
  get lastWheelLoad(): number[] {
    return this.solver.lastLoad
  }
  get lastWheelLong(): number[] {
    return this.solver.lastLong
  }
  get lastTireDiag() {
    return this.solver.lastTireDiag
  }
  get tirePatch() {
    return this.solver.relaxation.patch
  }

  get forwardSpeed(): number {
    return forwardSpeedOf(this.body)
  }

  getWheelOmegas(): [number, number, number, number] {
    return this.wheelDynamics.omegas()
  }

  getWheelCompressions(): [number, number, number, number] {
    const [a, b, c, d] = this.suspension.states.map((s) => s.compression)
    return [a ?? 0, b ?? 0, c ?? 0, d ?? 0]
  }

  /** Traction and stability control both on: the car manages its own launch. */
  get safetyAidsOn(): boolean {
    return this.tractionControlOn && this.stabilityControlOn
  }

  /** Handbrake latched on by a tap of the key. */
  handbrakeLatched = false

  /** One switch for the safety dynamics: all on, or (if any is on) the lot off. */
  toggleSafety() {
    const on = !(this.tractionControlOn || this.stabilityControlOn)
    this.tractionControlOn = on
    this.stabilityControlOn = on
  }

  /** Revs while the clutch slips: the managed flare, or peak torque when raw. */
  private flareRpm(): number {
    return this.safetyAidsOn ? this.P.engine.dynamics.launchFlareRPM : this.rawFlareRpm
  }

  private stallT = 0

  /**
   * Starting off in a gear too tall to pull the car from rest: the converter slips at its
   * stall speed, but with too little wheel force the engine just labours and then dies.
   */
  private checkStall(dt: number, gear: number, throttle: number, speedKmh: number, gearRatio: number) {
    const P = this.P
    const d = P.engine.dynamics
    const mass = P.mass.chassis + 2 * (P.mass.frontWheel + P.mass.rearWheel)
    const flare = this.flareRpm()
    const force =
      (this.engine.fullPedalTorque(flare) * this.converter.multiplier(true, 0) * Math.abs(gearRatio) * P.drivetrain.efficiency) /
      P.wheels.radius
    const labouring =
      gear !== 0 && throttle > 0 && speedKmh < P.transmission.torqueConverter.lockupSpeedKmh && force / mass < d.stallMinAccel
    this.stallT = labouring ? this.stallT + dt : 0
    if (this.stallT >= d.stallDelay) {
      this.engine.stall()
      this.stallT = 0
    }
  }

  /** Tyre grip left after a recent hit (1 undisturbed). */
  get impactGrip(): number {
    return this.forces.impact.gripScale
  }

  reset(pos: THREE.Vector3, yaw = 0) {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.gearbox.reset()
    this.engine.reset()
    this.stallT = 0
    this.aggression.reset()
    this.shiftLogic.reset()
    this.directionShift.reset()
    this.launch.reset()
    this.cruise.reset()
    this.driveline.reset()
    this.steering.reset()
    this.slip.reset()
    this.forces.impact.reset()
    this.solver.reset()
    this.abs.reset()
    this.stability.reset()
    this.wheelDynamics.reset()
    this.brakes.parking = true
    this.brakes.reset()
    for (const st of this.suspension.states) {
      st.grounded = false
      st.compression = 0
      st.suspVel = 0
      st.springF = 0
      st.damperF = 0
      st.arbF = 0
      st.force = 0
      st.load = 0
    }
  }

  // ---- one physics step -------------------------------------------------
  update(dt: number, raw: DriveInput): CarTelemetry {
    const P = this.P
    const g = this.gearbox
    this.simTime += dt
    const origThrottle = raw.throttle
    const origBrake = raw.brake
    let input = raw
    // In reverse, auto mode keeps S as throttle. Manual keeps W as throttle.
    if (g.gear === -1 && this.autoMode) {
      input = { ...input, throttle: input.brake, brake: input.throttle }
    }
    if (input.toggleModePressed) this.autoMode = !this.autoMode
    if (input.toggleLaunchPressed) this.launch.enabled = !this.launch.enabled
    if (input.toggleTractionPressed) this.tractionControlOn = !this.tractionControlOn
    if (input.toggleSafetyPressed) this.toggleSafety()
    if (input.toggleIgnitionPressed) this.engine.toggleIgnition()
    // Handbrake: a tap latches it, a hold only engages it while held. A latched
    // handbrake lets go once the driver pulls away on the throttle.
    if (input.toggleHandbrakePressed) this.handbrakeLatched = !this.handbrakeLatched
    else if (input.throttle > this.P.brakes.parkingReleaseThrottle) this.handbrakeLatched = false
    if (this.handbrakeLatched) input = { ...input, handbrake: true }
    if (input.toggleStabilityPressed) this.stabilityControlOn = !this.stabilityControlOn
    if (input.toggleAbsPressed) this.abs.enabled = !this.abs.enabled
    if (input.toggleParkPressed && Math.abs(this.forwardSpeed) * KMH_PER_MS < this.P.brakes.parkToggleMaxKmh) {
      this.brakes.parking = !this.brakes.parking
    }
    g.tick(dt)
    if (!this.autoMode) {
      if (input.upshiftPressed) this.manualShift(1)
      if (input.downshiftPressed) this.manualShift(-1)
    }

    const k = measureKinematics(this.body, P.kinematics, dt)
    this.brakes.releaseOnThrottle(input.throttle)
    this.shiftLogic.cancelIfRelaxed(input.throttle, input.brake)
    this.cruise.handleButtons(
      {
        togglePressed: input.cruiseTogglePressed,
        setPressed: input.cruiseSetPressed,
        upPressed: input.cruiseUpPressed,
      },
      {
        speedKmh: k.speedKmh,
        fwdSpeed: k.fwdSpeed,
        gear: g.gear,
        brake: origBrake,
        handbrake: input.handbrake,
        parkingBrake: this.brakes.parking,
      },
    )
    this.steering.step(dt, input.steer, k.speedKmh, k.fwdSpeed)

    if (this.autoMode && this.autoShiftEnabled) {
      this.directionShift.step(g, {
        dt,
        fwdSpeed: k.fwdSpeed,
        throttle: origThrottle,
        brake: origBrake,
        handbrake: input.handbrake,
      })
    }
    const standstill = Math.abs(k.fwdSpeed) < P.autoDirection.standstillSpeed
    this.launch.arm(standstill && this.safetyAidsOn, g.gear, input.throttle, input.brake)
    const cruised = this.cruise.inject(dt, input.throttle, input.brake, k.speedKmh, g.gear)
    input = { ...input, throttle: cruised.throttle, brake: cruised.brake }

    const gearRatio = g.ratio(g.gear)
    // Spinning driven wheels drag the engine up with them, so wheelspin loads
    // and limits the engine instead of leaving it at the ground-speed rpm.
    const coupled = Math.max(
      Math.abs(((k.fwdSpeed / P.wheels.radius) * gearRatio * SECONDS_PER_MINUTE) / TWO_PI),
      g.gear !== 0 ? Math.abs((this.driveline.drivenOmega * gearRatio * SECONDS_PER_MINUTE) / TWO_PI) : 0,
    )
    this.launch.step(dt, g.gear, input.throttle, coupled)
    this.engine.stepRpm({
      dt,
      simTime: this.simTime,
      gear: g.gear,
      throttle: input.throttle,
      fwdSpeed: k.fwdSpeed,
      shifting: g.shifting,
      flareRpm: this.flareRpm(),
      coupledRpm: coupled,
      launchArmed: this.launch.armed,
      launching: this.launch.launching,
      launchBog: this.launch.bogDrop(),
      launchRpm: this.launch.targetRpm,
      launchWobble: this.launch.wobble(this.simTime),
      clutchDumping: this.launch.dumping,
      kickdownTimer: this.shiftLogic.kickdownTimer,
      airborne: this.suspension.states.length > 0 && this.suspension.states.every((s) => !s.grounded),
    })
    this.checkStall(dt, g.gear, input.throttle, k.speedKmh, gearRatio)

    const driven = this.aggression.step(dt, input.throttle, input.brake, this.driveline.prevThrottle)
    const coef = this.shiftMode === "realistic" ? this.P.shiftLogic.realisticAggression : driven
    g.tickChangeDelay(dt)
    const delta = this.shiftLogic.decide({
      dt,
      gear: g.gear,
      gearCount: g.count,
      // while the clutch slips, flared revs say nothing about the wheels
      rpm: this.engine.slipping ? coupled : this.engine.rpm,
      throttle: input.throttle,
      aggressionCoef: coef,
      speedKmh: k.speedKmh,
      autoMode: this.autoMode,
      shifting: g.shifting,
      changeDelayActive: g.changeDelayActive,
      launchArmed: this.launch.armed,
      limiterCut: this.engine.limiterCut,
      assistCutting: this.engineCut || this.stability.engineFactor < 1,
      slipRatioAvg: this.slip.slipRatioAvg,
      lateralVelocity: this.lateralVelocity(),
      predictedRpm: (gear) => g.predictedRpm(gear, this.driveline.drivenOmega),
    })
    if (delta !== 0 && g.autoShift(delta, this.driveline.drivenOmega)) {
      this.engine.settleAfterShift(g.coupledRpm(this.driveline.drivenOmega))
    }

    const shifting = g.shifting
    let engineTorque = this.engine.torque(input.throttle, g.gear, shifting)
    this.engineCut = false
    if (this.tractionControlOn) {
      const cut = this.traction.factor({
        handbrake: input.handbrake,
        launching: this.launch.launching,
        launchArmed: this.launch.armed,
        clutchDumping: this.launch.dumping,
        slipRatioAvg: this.slip.slipRatioAvg,
      })
      engineTorque *= cut
      this.engineCut = cut < 1
    }
    this.stability.step({
      dt,
      fwdSpeed: k.fwdSpeed,
      groundedWheels: this.groundedWheels,
      handbrake: input.handbrake,
      steerAngle: this.steering.angle,
      beta: k.beta,
      yawRate: k.angvel.y,
      launchActive: this.launch.armed || this.launch.launching,
      downforceAccel: this.forces.downforce(k.linvel.x, k.linvel.z, this.forces.yawToAirflow(k)) / this.totalMass,
    })
    if (this.stabilityControlOn) engineTorque *= this.stability.engineFactor
    engineTorque = Math.min(
      Math.max(0, engineTorque, this.engine.governorTorque),
      this.engine.clutchCapacity,
    )

    const drive = this.driveline.prepare({
      dt,
      gear: g.gear,
      gearRatio,
      engineTorque,
      converterMultiplier: this.converter.multiplier(g.gear !== 0, k.speedKmh),
      throttle: input.throttle,
      speedKmh: k.speedKmh,
      launchArmed: this.launch.armed,
      launching: this.launch.launching,
      clutchDumping: this.launch.dumping,
      rawPower: !this.safetyAidsOn,
    })

    const grounded = this.solver.step({
      dt,
      pedals: input,
      k,
      steerAngle: this.steering.angle,
      gear: g.gear,
      gearRatio,
      drive,
      engineFriction: this.engine.frictionTorque(),
      engineOn: !this.engine.stalled,
      stabilityBrake: this.stabilityControlOn ? this.stability.pressure : this.noBrake,
      tractionBrake:
        this.tractionControlOn &&
        !input.handbrake &&
        !this.launch.armed &&
        !this.launch.launching &&
        g.gear !== 0 &&
        input.throttle > 0,
      weather: conditions.weather,
      gripScale: this.forces.impact.gripScale * timeOfDayGrip(),
    })
    this.groundedWheels = grounded

    this.slip.end(dt, grounded, this.lateralVelocity(), k.speedKmh)
    const om = this.wheelDynamics.omegas()
    const drivenSpeeds = om.filter((_, i) => this.driveline.isDriven(this.wheelDefs[i].front))
    this.driveline.drivenOmega = drivenSpeeds.reduce((sum, w) => sum + w, 0) / drivenSpeeds.length

    this.forces.apply(dt, k, input, this.groundedWheels, this.launch.armed || this.launch.launching)

    return buildTelemetry({
      k,
      input,
      gearbox: g,
      engine: this.engine,
      launch: this.launch,
      cruise: this.cruise,
      slip: this.slip,
      parking: this.brakes.parking || input.handbrake,
      autoMode: this.autoMode,
      aggression: this.aggression.value,
      safetyAids: this.safetyAidsOn,
      tractionControl: this.tractionControlOn,
      stabilityControl: this.stabilityControlOn,
      absOn: this.abs.enabled,
      tractionActive: this.tractionControlOn && (this.engineCut || this.solver.tractionBraking),
      stabilityActive: this.stabilityControlOn && this.stability.intervening,
      absActive: this.abs.active,
      steerFeedback: clamp(this.solver.steerTorque() / this.solver.steerTorqueScale(), -1, 1),
      engineOn: !this.engine.stalled,
      dash: this.dash,
    })
  }

  private lateralVelocity(): number {
    return lateralSpeedOf(this.body)
  }

  /** Paddle shift, with the high-rpm clutch dump from neutral. */
  private manualShift(dir: 1 | -1) {
    const g = this.gearbox
    const prevRpm = this.engine.rpm
    const prev = g.manualShift(dir, this.forwardSpeed, this.driveline.drivenOmega)
    if (prev === null) return
    if (this.launch.dumpTriggers(prev, g.gear, prevRpm, this.P.engine.idleRPM)) {
      const dump = this.launch.startDump(prevRpm, this.P.engine.idleRPM, g.ratio(1))
      this.engine.rpm = dump.rpm
      for (let wi = 0; wi < this.wheelDefs.length; wi++) {
        if (this.driveline.isDriven(this.wheelDefs[wi].front) && this.wheelDynamics.wheels[wi]) {
          this.wheelDynamics.wheels[wi].omega = dump.wheelOmega
        }
      }
      this.driveline.drivenOmega = dump.wheelOmega
      return
    }
    this.engine.settleAfterShift(g.coupledRpm(this.driveline.drivenOmega))
  }
}
