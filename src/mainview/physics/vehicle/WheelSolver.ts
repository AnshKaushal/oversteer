import {
  SURFACES,
  surfaceGrip,
  type SurfaceId,
  type WeatherId,
} from "../../data/surfaces"
import { Alignment } from "./components/Alignment"
import { Steering } from "./components/Steering"
import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { CarPhysicsConfig } from "../../data/schema"
import type { DriveInput as PedalInput } from "../../systems/InputManager"
import { Abs } from "./components/Abs"
import { Brakes } from "./components/Brakes"
import { CreepForces } from "./components/CreepForces"
import { CenterDiff } from "./components/CenterDiff"
import { Differential } from "./components/Differential"
import { Driveline, type DriveOutput } from "./components/Driveline"
import type { StabilityControl } from "./components/StabilityControl"
import type { TractionControl } from "./components/TractionControl"
import { SlipTracker } from "./components/SlipTracker"
import type { SuspensionSystem, WheelDef } from "./components/Suspension"
import { TireRelaxation } from "./components/TireRelaxation"
import type { TireModel, TireResult } from "./components/TireModel"
import type { WheelDynamics } from "./components/WheelDynamics"
import type { Kinematics } from "./types"

interface Solve {
  w: WheelDef
  wi: number
  grounded: boolean
  load: number
  contactY: number
  anchor: THREE.Vector3
  patchVel: THREE.Vector3
  heading: THREE.Vector3
  normal: THREE.Vector3
  driveT: number
  brakeM: number
  camber: number
  surface: SurfaceId
}

export interface WheelStepInput {
  dt: number
  pedals: PedalInput
  k: Kinematics
  steerAngle: number
  gear: number
  gearRatio: number
  drive: DriveOutput
  engineFriction: number
  engineOn: boolean
  stabilityBrake: readonly number[]
  tractionBrake: boolean
  weather: WeatherId
  gripScale: number
}

export class WheelSolver {
  readonly relaxation: TireRelaxation
  readonly centerDiff: CenterDiff
  readonly frontDiff: Differential
  readonly rearDiff: Differential
  readonly lastLoad: number[]
  readonly lastLong: number[]
  lastTireDiag: TireResult[] = []
  tractionBraking = false

  steerTorque(): number {
    let sum = 0
    this.wheels.forEach((w, i) => {
      if (w.front) sum += this.lastTireDiag[i]?.mz ?? 0
    })
    return sum
  }

  steerTorqueScale(): number {
    const p = this.P.wheels
    const fronts = this.wheels.filter((w) => w.front).length
    return fronts * p.frictionMu * p.referenceLoad * p.steering.pneumaticTrail
  }

  constructor(
    private readonly body: RAPIER.RigidBody,
    private readonly P: CarPhysicsConfig,
    private readonly wheels: readonly WheelDef[],
    private readonly suspension: SuspensionSystem,
    private readonly dynamics: WheelDynamics,
    private readonly tires: TireModel,
    private readonly driveline: Driveline,
    private readonly brakes: Brakes,
    private readonly abs: Abs,
    private readonly traction: TractionControl,
    private readonly stability: StabilityControl,
    private readonly creep: CreepForces,
    private readonly slip: SlipTracker,
    private readonly steering: Steering,
    private readonly alignment: Alignment,
  ) {
    this.relaxation = new TireRelaxation(
      wheels.length,
      P.contact,
      P.wheels.relaxationLength,
      P.wheels.tire.maxSlip,
    )
    this.centerDiff = new CenterDiff(
      P.drivetrain.centerDiff,
      P.drivetrain.frontTorqueSplit,
    )
    this.frontDiff = new Differential(P.differential)
    this.rearDiff = new Differential(P.differential)
    this.lastLoad = wheels.map(() => 0)
    this.lastLong = wheels.map(() => 0)
  }

  reset() {
    this.relaxation.reset()
    this.centerDiff.reset()
    this.frontDiff.reset()
    this.rearDiff.reset()
  }

  step(c: WheelStepInput): number {
    const { dt, k, pedals } = c
    const radius = this.P.wheels.radius
    const linVec = new THREE.Vector3(k.linvel.x, k.linvel.y, k.linvel.z)
    const angVec = new THREE.Vector3(k.angvel.x, k.angvel.y, k.angvel.z)
    const states = this.suspension.update(
      dt,
      k.quat,
      k.pos,
      linVec,
      angVec,
      k.com,
    )
    let grounded = 0
    for (const st of states) {
      this.lastLoad[st.wi] = st.load
      if (!st.grounded) this.lastLong[st.wi] = 0
      else grounded++
    }

    const driveTorque = this.axleTorques(c)
    this.tractionBraking = false
    const solves: Solve[] = []
    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const st = states[wi]
      const steer =
        this.steering.wheelAngle(w.front, w.left, c.steerAngle) +
        this.alignment.toe(w.front, w.left)
      const heading = new THREE.Vector3(
        Math.sin(steer) * -1,
        0,
        -Math.cos(steer),
      ).applyQuaternion(k.quat)
      heading.y = 0
      heading.normalize()
      const spin = this.dynamics.wheels[wi].omega
      const raw = driveTorque[wi]
      const driveT = (
        c.gear === -1 ? raw > 0 && spin >= 0 : raw < 0 && spin <= 0
      )
        ? 0
        : raw
      const groundSpeed = st.pointVel.dot(heading)
      const wheelSpeed = spin * radius
      const axleMax = this.brakes.maxTorque(w.front)
      const tcFraction =
        c.tractionBrake && st.grounded && this.driveline.isDriven(w.front)
          ? this.traction.brakeFraction(
              wheelSpeed,
              groundSpeed,
              c.gear === -1 ? -1 : 1,
            )
          : 0
      const tcTorque = Math.min(
        tcFraction * axleMax,
        Math.abs(driveT) * this.traction.brakeDriveShare,
      )
      if (tcTorque > 0) this.tractionBraking = true
      const assist =
        c.stabilityBrake[wi] * this.stability.gripScale(wheelSpeed, groundSpeed)
      const brakeM = this.abs.modulate(
        wi,
        this.brakes.torque({
          wheelIndex: wi,
          omega: this.dynamics.wheels[wi].omega,
          dt,
          front: w.front,
          reverse: c.gear === -1,
          brake: pedals.brake,
          handbrake: pedals.handbrake,
          steer: pedals.steer,
          throttle: pedals.throttle,
          speedKmh: k.speedKmh,
        }) +
          assist * axleMax +
          tcTorque,
        Math.max(pedals.brake, assist, tcTorque / axleMax),
        wheelSpeed,
        groundSpeed,
        dt,
      )
      if (!st.grounded) {
        this.dynamics.step(wi, dt, driveT, brakeM, 0, undefined)
        this.relaxation.zero(wi)
        solves.push({
          w,
          wi,
          grounded: false,
          load: 0,
          contactY: 0,
          anchor: st.anchorWorld,
          patchVel: new THREE.Vector3(),
          heading,
          normal: new THREE.Vector3(0, 1, 0),
          driveT,
          brakeM,
          camber: 0,
          surface: st.surface,
        })
        continue
      }
      const contactPoint = new THREE.Vector3(
        st.anchorWorld.x,
        st.contactY,
        st.anchorWorld.z,
      )
      const lever = contactPoint.clone().sub(k.com)
      solves.push({
        w,
        wi,
        grounded: true,
        load: st.load,
        contactY: st.contactY,
        anchor: st.anchorWorld,
        patchVel: linVec.clone().add(angVec.clone().cross(lever)),
        heading,
        normal: st.contactNormal.clone(),
        driveT,
        brakeM,
        camber: this.alignment.camber(w.front, w.left, st.compression),
        surface: st.surface,
      })
    }

    this.slip.begin()
    for (const s of solves) this.applyWheel(s, c, radius)
    return grounded
  }

  private axleOmega(front: boolean): number {
    let sum = 0
    let n = 0
    this.wheels.forEach((w, i) => {
      if (w.front !== front) return
      sum += this.dynamics.wheels[i].omega
      n++
    })
    return n > 0 ? sum / n : 0
  }

  private axleTorques(c: WheelStepInput): number[] {
    const frontShare = this.centerDiff.step(
      c.dt,
      this.axleOmega(true),
      this.axleOmega(false),
    )
    const out = this.wheels.map((w) =>
      this.driveline.wheelTorque(w.front, c.drive, c.gear, frontShare),
    )
    for (const front of [true, false]) {
      const l = this.wheels.findIndex((w) => w.front === front && w.left)
      const r = this.wheels.findIndex((w) => w.front === front && !w.left)
      if (l < 0 || r < 0 || !this.driveline.isDriven(front)) continue
      const diff = front ? this.frontDiff : this.rearDiff
      const om = this.dynamics.wheels
      ;[out[l], out[r]] = diff.split(out[l] + out[r], om[l].omega, om[r].omega)
    }
    return out
  }

  private applyWheel(s: Solve, c: WheelStepInput, radius: number) {
    const { dt, k, pedals } = c
    const { w, wi } = s
    const driven = this.driveline.isDriven(w.front)
    if (!s.grounded) {
      this.lastLong[wi] = 0
      this.lastTireDiag[wi] = this.tires.eval({
        grounded: false,
        normalLoad: 0,
        normal: { x: 0, y: 1, z: 0 },
        patchVel: { x: 0, y: 0, z: 0 },
        wheelOmega: 0,
        slipRatio: 0,
        slipTan: 0,
        wheelHeading: { x: 0, y: 0, z: -1 },
        bodyForward: { x: 0, y: 0, z: -1 },
      })
      return
    }
    const omega = this.dynamics.wheels[wi].omega
    const contact = {
      grounded: true,
      normalLoad: s.load,
      normal: { x: s.normal.x, y: s.normal.y, z: s.normal.z },
      patchVel: { x: s.patchVel.x, y: s.patchVel.y, z: s.patchVel.z },
      wheelOmega: omega,
      slipRatio: 0,
      slipTan: 0,
      wheelHeading: { x: s.heading.x, y: s.heading.y, z: s.heading.z },
      bodyForward: { x: k.fwd.x, y: 0, z: k.fwd.z },
      camber: s.camber,
      gripScale: surfaceGrip(s.surface, c.weather) * c.gripScale,
      rollingScale: SURFACES[s.surface].rolling,
    }
    const axes = this.tires.basis(contact)
    const rollSpeed =
      s.patchVel.x * axes.t.x +
      s.patchVel.y * axes.t.y +
      s.patchVel.z * axes.t.z
    const sideSpeed =
      s.patchVel.x * axes.l.x +
      s.patchVel.y * axes.l.y +
      s.patchVel.z * axes.l.z
    const slips = this.relaxation.step(
      wi,
      dt,
      omega * radius - rollSpeed,
      sideSpeed,
      rollSpeed,
    )
    contact.slipRatio = slips.slipRatio
    contact.slipTan = slips.slipTan
    const res = this.tires.eval(contact)
    const creepF = this.creep.force({
      gear: c.gear,
      driven,
      drivenCount: this.driveline.drivenCount,
      throttle: pedals.throttle,
      brake: pedals.brake,
      fwdSpeed: k.fwdSpeed,
      slipSpeed: res.vx,
      speedKmh: k.speedKmh,
      engineFriction: c.engineFriction,
      engineOn: c.engineOn,
      gearRatio: c.gearRatio,
      efficiency: this.P.drivetrain.efficiency,
      wheelRadius: radius,
    })
    this.lastTireDiag[wi] = res
    if (driven) this.slip.addDriven(res.sx)
    const patchGain =
      (radius * dt) /
      (1 +
        (dt * (Math.abs(rollSpeed) + this.P.contact.relaxationSpeedFloor)) /
          this.P.wheels.relaxationLength)
    const torqueSlope =
      (res.slopeX / this.P.wheels.relaxationLength) * patchGain * radius
    this.dynamics.step(
      wi,
      dt,
      s.driveT,
      s.brakeM,
      res.fx * radius,
      res.vx,
      torqueSlope,
      res.fmax * radius,
    )

    const fx = res.fx + creepF
    const fy = res.fy
    this.lastLong[wi] = fx
    const applyY =
      s.contactY +
      (s.anchor.y - s.contactY) * this.P.contact.applyHeightFraction
    this.body.applyImpulseAtPoint(
      {
        x: (res.t.x * fx + res.l.x * fy) * dt,
        y: (res.t.y * fx + res.l.y * fy) * dt,
        z: (res.t.z * fx + res.l.z * fy) * dt,
      },
      { x: s.anchor.x, y: applyY, z: s.anchor.z },
      true,
    )
  }
}
