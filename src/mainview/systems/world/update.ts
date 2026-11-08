import * as THREE from "three"
import { WORLD_CONFIG } from "../../constants/world"
import {
  SKY_DISK_DISTANCE,
  fadeOut,
  HILL_PERIOD,
  hillResidue,
  HILL_MAX_RADIUS,
} from "../world/constants"
import { writeRibbon } from "../world/ribbon"
import type { WorldManager } from "../WorldManager"

export function update(
  this: WorldManager,
  carS: number,
  carPos: THREE.Vector3,
  grassTarget = 1,
) {
  const W = WORLD_CONFIG
  this.carPos.copy(carPos)
  this.puddles?.update(carPos)
  if (Number.isFinite(this.lastCarS)) {
    const delta = carS - this.lastCarS
    if (delta > 1e-3) this.travelDir = 1
    else if (delta < -1e-3) this.travelDir = -1
  }
  this.lastCarS = carS
  const startS =
    Math.floor((carS - W.road.segmentsBehind * this.segLen) / this.segLen) *
    this.segLen
  for (let i = 0; i < this.roadSegs.length; i++) {
    const s0 = startS + i * this.segLen
    const seg = this.roadSegs[i]
    if (seg.s0 === s0) continue
    seg.s0 = s0
    writeRibbon(
      seg.mesh.geometry as THREE.BufferGeometry,
      s0,
      this.segLen,
      this.ROAD_RIB,
      W.road.width,
    )
    seg.mesh.position.set(0, 0.02, 0)
  }
  this.ground.position.x = Math.round(carPos.x / 8) * 8
  this.ground.position.z = Math.round(carPos.z / 8) * 8
  const sun =
    this.sunLight ??
    ((this.group as any)._sun as THREE.DirectionalLight | undefined)
  if (sun) {
    const f = this.snapToShadowGrid(carPos)
    sun.position.set(
      f.x + this.sunOffset.x,
      f.y + this.sunOffset.y,
      f.z + this.sunOffset.z,
    )
    sun.target.position.set(f.x, 0, f.z)
    sun.target.updateMatrixWorld()
  }
  if (this.sunVisual) {
    const k = SKY_DISK_DISTANCE / this.sunOffset.length()
    this.sunVisual.position.set(
      carPos.x + this.sunOffset.x * k,
      this.sunOffset.y * k,
      carPos.z + this.sunOffset.z * k,
    )
  }
  this.skyDome?.follow(carPos.x, carPos.z)
  if (this.starsPoints && this.starsPoints.visible) {
    this.starsPoints.position.set(carPos.x, carPos.y, carPos.z)
  }
  const carSeg = Math.floor(carS / this.segLen)
  this.ensureSegs(carSeg - this.segRange, carSeg + this.segRange, carSeg)
  this.applyFarLod(carPos)
  for (let i = 0; i < this.hills.length; i++) {
    const h = this.hills[i]
    const r = hillResidue(i)
    const seg = r + HILL_PERIOD * Math.round((carSeg - r) / HILL_PERIOD)
    if (seg !== h.seg) this.placeHill(h, seg)
    const f = fadeOut(
      Math.hypot(h.mesh.position.x - carPos.x, h.mesh.position.z - carPos.z),
      800,
      1050,
    )
    h.mesh.visible =
      f > 0.01 &&
      this.withinFog(
        Math.hypot(h.mesh.position.x - carPos.x, h.mesh.position.z - carPos.z) -
          h.radius,
      )
    const sc = Math.max(f, 0.01)
    if (h.mesh.scale.x !== sc) h.mesh.scale.setScalar(sc)
  }
  this.streetLights?.update(carS, carPos)
  this.updateClouds(carS, carPos)
  this.grassDensity += (grassTarget - this.grassDensity) * 0.08
  if (Math.abs(grassTarget - this.grassDensity) < 0.005) {
    this.grassDensity = grassTarget
  }
  if (this.grassDensity < 0.999) {
    for (let vi = 0; vi < this.propVariants.length; vi++) {
      const pv = this.propVariants[vi]
      if (pv.category !== "grass") continue
      const high = this.slotHigh.get(vi) ?? pv.im.count
      pv.im.count = Math.floor(high * this.grassDensity)
    }
  } else {
    for (let vi = 0; vi < this.propVariants.length; vi++) {
      const pv = this.propVariants[vi]
      if (pv.category !== "grass") continue
      const high = this.slotHigh.get(vi)
      if (high !== undefined && pv.im.count !== high) pv.im.count = high
    }
  }
}

export function terrainHeightAt(
  this: WorldManager,
  x: number,
  z: number,
): number {
  let h = 0
  for (const hill of this.hills) {
    const dx = x - hill.mesh.position.x
    const dz = z - hill.mesh.position.z
    const r = hill.radius * 1.4
    if (dx * dx + dz * dz > r * r) continue
    hill.mesh.updateWorldMatrix(true, false)
    this.hillRay.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0))
    const hit = this.hillRay.intersectObject(hill.mesh, false)
    if (hit.length > 0 && hit[0].point.y > h) h = hit[0].point.y
  }
  const g0 = Math.floor(-z / this.segLen)
  const reach = Math.ceil((HILL_MAX_RADIUS * 1.3) / this.segLen)
  for (let g = g0 - reach; g <= g0 + reach; g++) {
    const m = (((g + 2) % HILL_PERIOD) + HILL_PERIOD) % HILL_PERIOD
    if (m % 2) continue
    const hill = this.hills[m / 2]
    if (!hill || hill.seg === g) continue
    const spot = this.hillSpot(hill, g)
    const dx = x - spot.x
    const dz = z - spot.z
    const r = hill.radius * 1.3
    if (dx * dx + dz * dz < r * r && hill.height > h) h = hill.height
  }
  return h
}
