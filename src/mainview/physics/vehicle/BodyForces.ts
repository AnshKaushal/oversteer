import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { CarPhysicsConfig } from "../../data/schema"
import type { DriveInput } from "../../systems/InputManager"
import { Aero } from "./components/Aero"
import { Impact } from "./components/Impact"
import { SelfRight } from "./components/SelfRight"
import { VelocityLimiter } from "./components/VelocityLimiter"
import { clamp } from "../math"
import type { Kinematics } from "./types"

const DEFAULT_HIGH_SPEED_GAIN = 2
const HIGH_SPEED_START = 0.7
const HIGH_SPEED_SPAN = 1.5
const SLIDE_CUT_START = 0.2
const SLIDE_CUT_RANGE = 0.3
const SLIDE_CUT_MAX = 0.85
const SLIDE_CUT_MIN_SPEED = 5
const SLIDE_CUT_RISE = 4
const SLIDE_CUT_FALL = 3

export class BodyForces {
  private readonly aero: Aero
  readonly impact: Impact
  private readonly selfRight: SelfRight
  private readonly limiter: VelocityLimiter
  private readonly chassis: CarPhysicsConfig["chassis"]
  private readonly stability: CarPhysicsConfig["assists"]["bodyStability"]
  private slideCut = 0

  constructor(
    private readonly world: RAPIER.World,
    private readonly body: RAPIER.RigidBody,
    P: CarPhysicsConfig,
  ) {
    this.aero = new Aero(P.aero)
    this.selfRight = new SelfRight(P.selfRight)
    this.limiter = new VelocityLimiter(P.limits)
    this.chassis = P.chassis
    this.stability = P.assists.bodyStability
    this.impact = new Impact(P.chassis.crash)
  }

  /**
   * Engine torque factor while the body slides with the wheel centred. A
   * rear-driven car that keeps full power through a slide holds the rear
   * wheels spinning (no lateral grip) and never straightens; production cars
   * cut power in that situation. It stays off while the driver steers, so
   * deliberate countersteered drifts keep their power.
   */
  slidePower(
    dt: number,
    k: Kinematics,
    input: DriveInput,
    groundedWheels: number,
  ): number {
    const b = this.stability
    const speed = Math.hypot(k.linvel.x, k.linvel.z)
    const active =
      Math.abs(input.steer) < b.steeringThreshold &&
      !input.handbrake &&
      speed > SLIDE_CUT_MIN_SPEED &&
      groundedWheels >= b.minGrounded
    const target = active
      ? SLIDE_CUT_MAX *
        clamp((Math.abs(k.beta) - SLIDE_CUT_START) / SLIDE_CUT_RANGE, 0, 1)
      : 0
    const rate = target > this.slideCut ? SLIDE_CUT_RISE : SLIDE_CUT_FALL
    this.slideCut += clamp(target - this.slideCut, -rate * dt, rate * dt)
    return 1 - this.slideCut
  }

  resetSlidePower() {
    this.slideCut = 0
  }

  downforce(vx: number, vz: number, yaw = 0): number {
    return this.aero.force(vx, vz, yaw)?.down ?? 0
  }

  private touching(): boolean {
    let found = false
    for (let i = 0; i < this.body.numColliders(); i++) {
      const col = this.body.collider(i)
      this.world.contactPairsWith(col, (other) => {
        this.world.contactPair(col, other, (m) => {
          if (m.numContacts() > 0) found = true
        })
      })
    }
    return found
  }

  yawToAirflow(k: Kinematics): number {
    return Math.atan2(
      k.linvel.x * k.right.x + k.linvel.z * k.right.z,
      Math.abs(k.linvel.x * k.fwd.x + k.linvel.z * k.fwd.z),
    )
  }

  apply(
    dt: number,
    k: Kinematics,
    input: DriveInput,
    groundedWheels: number,
    launchActive: boolean,
  ) {
    const body = this.body
    const hit = this.impact.update(dt, body.linvel(), body.angvel(), () =>
      this.touching(),
    )
    if (hit.linvel) body.setLinvel(hit.linvel, true)
    if (hit.angvel) body.setAngvel(hit.angvel, true)
    this.aero.update(
      dt,
      Math.hypot(k.linvel.x, k.linvel.z),
      Math.abs(input.steer),
    )
    const aero = this.aero.force(k.linvel.x, k.linvel.z, this.yawToAirflow(k))
    if (aero) {
      body.applyImpulse(
        { x: aero.dragX * dt, y: -aero.down * dt, z: aero.dragZ * dt },
        true,
      )
    }

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(k.quat)
    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(k.quat)
    const lv0 = body.linvel()
    const av0 = body.angvel()
    const roll = this.selfRight.torque(
      up.y,
      Math.hypot(k.linvel.x, k.linvel.z),
      lv0.y,
      av0.x * axis.x + av0.y * axis.y + av0.z * axis.z,
      input.throttle,
      input.brake,
      input.steer,
    )
    if (roll !== 0) {
      body.applyTorqueImpulse(
        { x: axis.x * roll * dt, y: axis.y * roll * dt, z: axis.z * roll * dt },
        true,
      )
    }

    const lv = body.linvel()
    const ls = this.limiter.linearScale(lv.x, lv.y, lv.z)
    if (ls !== 1)
      body.setLinvel({ x: lv.x * ls, y: lv.y * ls, z: lv.z * ls }, true)
    const av = body.angvel()
    const as = this.limiter.angularScale(av.x, av.y, av.z)
    if (as !== 1)
      body.setAngvel({ x: av.x * as, y: av.y * as, z: av.z * as }, true)

    const yaw = body.angvel().y
    body.applyTorqueImpulse(
      { x: 0, y: -yaw * this.chassis.yawDamping * dt, z: 0 },
      true,
    )

    const b = this.stability
    if (
      Math.abs(k.fwdSpeed) > b.minSpeed &&
      groundedWheels >= b.minGrounded &&
      !input.handbrake
    ) {
      const steering = Math.abs(input.steer) >= b.steeringThreshold
      const excess =
        Math.abs(k.beta) - (steering ? b.deadzoneSteering : b.deadzone)
      if (excess > 0) {
        const speedF = clamp(Math.abs(k.fwdSpeed) / b.speedRef, 0, 1)
        const highSpeed =
          1 +
          (b.highSpeedGain ?? DEFAULT_HIGH_SPEED_GAIN) *
            clamp(
              (Math.abs(k.fwdSpeed) - HIGH_SPEED_START * b.speedRef) /
                b.speedRef,
              0,
              HIGH_SPEED_SPAN,
            )
        const powerOn = input.throttle > b.powerOnThrottle && !launchActive
        const authority =
          (steering
            ? b.steeringAuthorityLow +
              (b.steeringAuthorityHigh - b.steeringAuthorityLow) * speedF
            : 1) *
          (b.baseAuthority + b.authority) *
          (powerOn ? 1 : b.liftBoost) *
          highSpeed
        const countersteering = Math.sign(input.steer) === -Math.sign(k.beta)
        const intent = countersteering
          ? input.steer *
            clamp(excess / b.countersteerRange, 0, 1) *
            b.countersteer
          : 0
        const torque =
          -Math.sign(k.beta) * excess * b.sideSlipGain -
          yaw * b.yawDamp +
          intent
        body.applyTorqueImpulse(
          {
            x: 0,
            y:
              clamp(
                torque * authority,
                -b.maxTorque * highSpeed,
                b.maxTorque * highSpeed,
              ) * dt,
            z: 0,
          },
          true,
        )
      }
    }
    this.impact.record(body.linvel(), body.angvel())
  }
}
