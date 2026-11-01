import { DEFAULT_SURFACE, type SurfaceId } from "../../../data/surfaces"
import { surfaceOf } from "../../core/Surfaces"
import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { SuspensionSpec } from "../../../data/schema"
import { WORLD } from "../../../data/world"

export interface WheelDef {
  x: number
  z: number
  front: boolean
  left: boolean
}

export type SuspensionParams = SuspensionSpec

export interface WheelSuspState {
  wi: number
  grounded: boolean
  compression: number
  suspVel: number
  springF: number
  damperF: number
  arbF: number
  force: number
  load: number
  contactY: number
  surface: SurfaceId
  contactNormal: THREE.Vector3
  anchorWorld: THREE.Vector3
  pointVel: THREE.Vector3
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export class SuspensionSystem {
  readonly states: WheelSuspState[] = []
  private world: RAPIER.World
  private body: RAPIER.RigidBody
  private R: typeof RAPIER
  private wheels: WheelDef[]
  private params: SuspensionParams
  private readonly restLengths: number[]

  constructor(
    world: RAPIER.World,
    body: RAPIER.RigidBody,
    R: typeof RAPIER,
    wheels: WheelDef[],
    params: SuspensionParams,
    sprungMass: number,
  ) {
    this.world = world
    this.body = body
    this.R = R
    this.wheels = wheels
    this.params = params
    const zFront = wheels.find((w) => w.front)?.z ?? 0
    const zRear = wheels.find((w) => !w.front)?.z ?? 0
    const frontShare = zRear / (zRear - zFront)
    this.restLengths = wheels.map((w) => {
      const axle = w.front ? params.front : params.rear
      const share = w.front ? frontShare : 1 - frontShare
      const staticLoad = (sprungMass * WORLD.gravity * share) / 2
      return axle.rideHeight + params.rayLift + staticLoad / axle.springRate
    })
    wheels.forEach((_, wi) => {
      this.states.push({
        wi,
        grounded: false,
        compression: 0,
        suspVel: 0,
        springF: 0,
        damperF: 0,
        arbF: 0,
        force: 0,
        load: 0,
        contactY: 0,
        surface: DEFAULT_SURFACE,
        contactNormal: new THREE.Vector3(0, 1, 0),
        anchorWorld: new THREE.Vector3(),
        pointVel: new THREE.Vector3(),
      })
    })
  }

  update(
    dt: number,
    quat: THREE.Quaternion,
    bodyPos: THREE.Vector3,
    linvel: THREE.Vector3,
    angvel: THREE.Vector3,
    com: THREE.Vector3,
  ): WheelSuspState[] {
    const sp = this.params
    const travelLimit = sp.travel + sp.travelMargin
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat)

    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const st = this.states[wi]
      const anchor = new THREE.Vector3(w.x, 0, w.z)
        .applyQuaternion(quat)
        .add(bodyPos)
      st.anchorWorld.copy(anchor)

      const origin = anchor.clone().addScaledVector(up, sp.rayLift)
      const dir = up.clone().negate()
      const ray = new this.R.Ray(origin, dir)
      const hit = this.world.castRayAndGetNormal(
        ray,
        this.restLengths[wi] + sp.reachMargin,
        true,
        undefined,
        undefined,
        undefined,
        this.body,
      )

      const r = anchor.clone().sub(com)
      const pointVel = linvel.clone().add(angvel.clone().cross(r))
      st.pointVel.copy(pointVel)

      if (!hit || hit.timeOfImpact < sp.minContactToi) {
        st.grounded = false
        st.compression = 0
        st.suspVel = 0
        st.springF = 0
        st.damperF = 0
        st.arbF = 0
        st.force = 0
        st.load = 0
        continue
      }

      const toi = hit.timeOfImpact
      const axle = w.front ? sp.front : sp.rear
      const compression = clamp(this.restLengths[wi] - toi, sp.droopLimit, travelLimit)
      const suspVel = -pointVel.dot(up)

      const bump = 1 + Math.max(0, compression - sp.bumpStart) * sp.bumpGain
      const springF = axle.springRate * bump * Math.max(0, compression)
      const damping = suspVel > 0 ? axle.bumpDamping : axle.reboundDamping
      const damperF = damping * suspVel

      const contact = origin.clone().addScaledVector(dir, toi)
      st.grounded = true
      st.compression = compression
      st.suspVel = suspVel
      st.springF = springF
      st.damperF = damperF
      st.arbF = 0
      st.contactY = contact.y
      st.surface = surfaceOf(this.world, (hit as { collider?: RAPIER.Collider }).collider, contact.x, contact.z)
      const n = (hit as { normal?: { x: number; y: number; z: number } }).normal
      if (n) st.contactNormal.set(n.x, n.y, n.z)
      else st.contactNormal.set(0, 1, 0)
    }

    for (const front of [true, false]) {
      const idx = this.wheels
        .map((_, i) => i)
        .filter((i) => this.wheels[i].front === front)
      if (idx.length !== 2) continue
      const li = this.wheels[idx[0]].left ? idx[0] : idx[1]
      const ri = li === idx[0] ? idx[1] : idx[0]
      const left = this.states[li]
      const right = this.states[ri]
      if (!left.grounded || !right.grounded) continue
      const kArb = front
        ? this.params.antiRollBarFront
        : this.params.antiRollBarRear
      const arb = clamp(
        (kArb * (left.compression - right.compression)) / 2,
        -sp.arbForceLimit,
        sp.arbForceLimit,
      )
      left.arbF = arb
      right.arbF = -arb
    }

    const upY = up.y
    for (const st of this.states) {
      if (!st.grounded || upY < sp.minUpY) {
        st.force = 0
        st.load = 0
        continue
      }
      const force = Math.max(
        0,
        Math.min(sp.maxCornerForce, st.springF + st.damperF + st.arbF),
      )
      st.force = force
      st.load = force
      this.body.applyImpulseAtPoint(
        {
          x: up.x * force * dt,
          y: up.y * force * dt,
          z: up.z * force * dt,
        },
        st.anchorWorld,
        true,
      )
    }

    return this.states
  }
}
