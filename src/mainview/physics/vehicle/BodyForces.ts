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

export class BodyForces {
  private readonly aero: Aero
  readonly impact: Impact
  private readonly selfRight: SelfRight
  private readonly limiter: VelocityLimiter
  private readonly chassis: CarPhysicsConfig["chassis"]
  private readonly stability: CarPhysicsConfig["assists"]["bodyStability"]

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
    const hit = this.impact.update(dt, body.linvel(), body.angvel(), () => this.touching())
    if (hit.linvel) body.setLinvel(hit.linvel, true)
    if (hit.angvel) body.setAngvel(hit.angvel, true)
    this.aero.update(dt, Math.hypot(k.linvel.x, k.linvel.z), Math.abs(input.steer))
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
    if (ls !== 1) body.setLinvel({ x: lv.x * ls, y: lv.y * ls, z: lv.z * ls }, true)
    const av = body.angvel()
    const as = this.limiter.angularScale(av.x, av.y, av.z)
    if (as !== 1) body.setAngvel({ x: av.x * as, y: av.y * as, z: av.z * as }, true)

    const yaw = body.angvel().y
    body.applyTorqueImpulse({ x: 0, y: -yaw * this.chassis.yawDamping * dt, z: 0 }, true)

    const b = this.stability
    if (Math.abs(k.fwdSpeed) > b.minSpeed && groundedWheels >= b.minGrounded && !input.handbrake) {
      const steering = Math.abs(input.steer) >= b.steeringThreshold
      const excess = Math.abs(k.beta) - (steering ? b.deadzoneSteering : b.deadzone)
      if (excess > 0) {
        const speedF = clamp(Math.abs(k.fwdSpeed) / b.speedRef, 0, 1)
        const powerOn = input.throttle > b.powerOnThrottle && !launchActive
        const authority =
          (steering ? b.steeringAuthorityLow + (b.steeringAuthorityHigh - b.steeringAuthorityLow) * speedF : 1) *
          (b.baseAuthority + b.authority) *
          (powerOn ? 1 : b.liftBoost)
        const countersteering = Math.sign(input.steer) === -Math.sign(k.beta)
        const intent = countersteering
          ? input.steer * clamp(excess / b.countersteerRange, 0, 1) * b.countersteer
          : 0
        const torque = -Math.sign(k.beta) * excess * b.sideSlipGain - yaw * b.yawDamp + intent
        body.applyTorqueImpulse({ x: 0, y: clamp(torque * authority, -b.maxTorque, b.maxTorque) * dt, z: 0 }, true)
      }
    }
    this.impact.record(body.linvel(), body.angvel())
  }
}
