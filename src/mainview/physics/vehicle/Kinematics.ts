import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { KinematicsSpec } from "../../data/schema"
import { KMH_PER_MS } from "../../data/units"
import { clamp } from "../math"
import type { Kinematics } from "./types"

export function forwardSpeedOf(body: RAPIER.RigidBody): number {
  const v = body.linvel()
  const q = body.rotation()
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion(q.x, q.y, q.z, q.w),
  )
  return v.x * fwd.x + v.y * fwd.y + v.z * fwd.z
}

export function lateralSpeedOf(body: RAPIER.RigidBody): number {
  const v = body.linvel()
  const q = body.rotation()
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
    new THREE.Quaternion(q.x, q.y, q.z, q.w),
  )
  return v.x * right.x + v.z * right.z
}

export function measureKinematics(
  body: RAPIER.RigidBody,
  spec: KinematicsSpec,
  dt: number,
): Kinematics {
  const linvel = body.linvel()
  const angvel = body.angvel()
  const fwdSpeed = forwardSpeedOf(body)
  const r = body.rotation()
  const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w)
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat)
  fwd.y = 0
  right.y = 0
  fwd.normalize()
  right.normalize()
  const lateral = linvel.x * right.x + linvel.z * right.z
  const beta = clamp(
    lateral / Math.max(spec.betaMinSpeed, Math.abs(fwdSpeed)),
    -spec.betaMax,
    spec.betaMax,
  )
  const p = body.translation()
  const c = body.worldCom()
  return {
    dt,
    fwdSpeed,
    speedKmh: Math.abs(fwdSpeed) * KMH_PER_MS,
    beta,
    linvel,
    angvel,
    pos: new THREE.Vector3(p.x, p.y, p.z),
    com: new THREE.Vector3(c.x, c.y, c.z),
    quat,
    fwd,
    right,
  }
}
