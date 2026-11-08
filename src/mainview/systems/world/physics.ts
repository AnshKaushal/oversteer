import { registerSurface } from "../../physics/core/Surfaces"
import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { groundSurfaceAt } from "../world/ribbon"
import type { WorldManager } from "../WorldManager"

export function createPhysicsGround(
  this: WorldManager,
  R: typeof RAPIER,
  world: RAPIER.World,
) {
  const g = R.RigidBodyDesc.fixed()
  const body = world.createRigidBody(g)
  const col = R.ColliderDesc.cuboid(3000, 5, 3000)
    .setTranslation(0, -4.99, 0)
    .setFriction(1.0)
    .setRestitution(0)
  registerSurface(world, world.createCollider(col, body), groundSurfaceAt)
  this.R = R
  this.physWorld = world
  this.streetLights?.attachPhysics(R, world)
  for (const hill of this.hills) {
    const hb = world.createRigidBody(R.RigidBodyDesc.fixed())
    const hg = hill.mesh.geometry as THREE.BufferGeometry
    const hp = hg.getAttribute("position") as THREE.BufferAttribute
    const verts = new Float32Array(hp.array)
    const hidx = hg.getIndex()!
    const indices = new Uint32Array(hidx.array as Uint32Array)
    registerSurface(
      world,
      world.createCollider(
        R.ColliderDesc.trimesh(verts, indices)
          .setFriction(0.9)
          .setRestitution(0),
        hb,
      ),
      "grass",
    )
    hill.body = hb
    this.syncHillBody(hill)
    for (const child of hill.mesh.children) {
      const cm = child as any
      if (!cm.isMesh) continue
      if (!cm.userData?.collidable) continue
      const geo = cm.geometry as THREE.BufferGeometry
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      if (!bb) continue
      const size = new THREE.Vector3()
      bb.getSize(size)
      const center = new THREE.Vector3()
      bb.getCenter(center)
      const he = new THREE.Vector3(
        (size.x * cm.scale.x) / 2,
        (size.y * cm.scale.y) / 2,
        (size.z * cm.scale.z) / 2,
      )
      if (he.x < 1e-4 || he.y < 1e-4 || he.z < 1e-4) continue
      const localCenter = center
        .clone()
        .multiply(cm.scale)
        .applyQuaternion(cm.quaternion)
        .add(cm.position)
      const q = cm.quaternion
      const col = R.ColliderDesc.cuboid(he.x, he.y, he.z)
        .setTranslation(localCenter.x, localCenter.y, localCenter.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.7)
        .setRestitution(0)
      const made = world.createCollider(col, hb)
      cm.userData.collider = made
      if (!cm.visible) made.setEnabled(false)
    }
  }
  this.syncPropColliders()
  return body
}
