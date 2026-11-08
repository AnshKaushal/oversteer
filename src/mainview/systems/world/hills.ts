import * as THREE from "three"
import { roadCenterX } from "../../maps/highway/road"
import { PropVariant, Hill } from "../world/types"
import type { WorldManager } from "../WorldManager"

export function hillSpot(
  this: WorldManager,
  hill: Hill,
  seg: number,
): { x: number; z: number } {
  const sMid = seg * this.segLen + this.segLen / 2
  const cx = roadCenterX(sMid)
  const side = this.rand(seg * 71 + 5) > 0.5 ? 1 : -1
  const far = hill.radius > 90
  const clearance = hill.radius * 1.4 + 12
  const lateral = clearance + this.rand(seg * 131 + 29) * (far ? 450 : 130)
  return {
    x: cx + side * lateral,
    z: -(sMid + (this.rand(seg * 17 + 3) - 0.5) * this.segLen),
  }
}

export function placeHill(this: WorldManager, hill: Hill, seg: number) {
  const { x: nx, z: nz } = this.hillSpot(hill, seg)
  const dx = nx - this.carPos.x
  const dz = nz - this.carPos.z
  if (this.hillHitsZone(nx, nz, hill.radius)) return
  const keepOut = hill.radius + 15
  if (hill.seg !== -999999 && dx * dx + dz * dz < keepOut * keepOut) return
  hill.seg = seg
  hill.mesh.position.set(nx, -0.3, nz)
  this.syncHillBody(hill)
}

export function dressHill(
  this: WorldManager,
  hill: Hill,
  seed: number,
  count: number,
) {
  const treeVars = this.propVariants.filter((p) => p.category === "tree")
  const rockVars = this.propVariants.filter((p) => p.category === "rock")
  const grassVars = this.propVariants.filter((p) => p.category === "grass")
  if (treeVars.length === 0) return
  const spots = this.sampleHillSurface(
    hill.mesh.geometry as THREE.BufferGeometry,
    seed,
    count,
  )
  const yAxis = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const qy = new THREE.Quaternion()
  spots.forEach((s, k) => {
    const r = this.rand(seed + k * 13)
    const steep = s.nrm.y < 0.55
    let pv: PropVariant | undefined
    let sc: number
    let sink: number
    if (!steep && r < 0.5) {
      pv =
        treeVars[
          Math.floor(this.rand(seed + k * 17) * treeVars.length) %
            treeVars.length
        ]
      sc = 1.6 + this.rand(seed + k * 19) * 1.2
      sink = 0.15
    } else if (r < 0.75 && rockVars.length > 0) {
      pv =
        rockVars[
          Math.floor(this.rand(seed + k * 29) * rockVars.length) %
            rockVars.length
        ]
      sc = 1.2 + this.rand(seed + k * 31) * 1.0
      sink = 0.1
    } else if (grassVars.length > 0) {
      pv =
        grassVars[
          Math.floor(this.rand(seed + k * 37) * grassVars.length) %
            grassVars.length
        ]
      sc = 1.0 + this.rand(seed + k * 41) * 0.8
      sink = 0.05
    } else {
      return
    }
    const m = new THREE.Mesh(
      pv.im.geometry as THREE.BufferGeometry,
      pv.im.material as THREE.Material | THREE.Material[],
    )
    m.castShadow = pv.im.castShadow
    m.receiveShadow = pv.category !== "cloud"
    q.setFromUnitVectors(yAxis, s.nrm)
    qy.setFromAxisAngle(yAxis, this.rand(seed + k * 43) * Math.PI * 2)
    q.premultiply(qy)
    m.quaternion.copy(q)
    m.position.copy(s.pos).addScaledVector(s.nrm, -sink)
    m.scale.setScalar(sc)
    m.userData.collidable = pv.category === "tree" || pv.category === "rock"
    if (pv.category === "tree" || pv.category === "grass") {
      const rank = this.rand(seed + k * 53)
      m.userData.vegRank = rank
      m.visible = rank < this.vegetation
    }
    hill.mesh.add(m)
  })
}

export function hillHitsZone(
  this: WorldManager,
  x: number,
  z: number,
  radius: number,
): boolean {
  const r = radius * 1.2 + 12
  for (const c of this.clearZones) {
    const dx = x - c.x
    const dz = z - c.z
    const along = Math.abs(dx * c.ux + dz * c.uz)
    const across = Math.abs(-dx * c.uz + dz * c.ux)
    const ex = Math.max(0, along - c.hl)
    const ez = Math.max(0, across - c.hw)
    if (ex * ex + ez * ez < r * r) return true
  }
  return false
}

export function syncHillBody(this: WorldManager, hill: Hill) {
  if (!hill.body) return
  const p = hill.mesh.position
  hill.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    hill.rotY,
  )
  hill.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
}

export function inClearZone(this: WorldManager, x: number, z: number): boolean {
  for (const c of this.clearZones) {
    const dx = x - c.x
    const dz = z - c.z
    if (
      Math.abs(dx * c.ux + dz * c.uz) < c.hl &&
      Math.abs(-dx * c.uz + dz * c.ux) < c.hw
    ) {
      return true
    }
  }
  return false
}
