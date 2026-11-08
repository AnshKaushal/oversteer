import * as THREE from "three"
import { roadCenterX } from "../../maps/highway/road"
import { CLOUD_GAP, CLOUD_RING, fadeOut } from "../world/constants"
import type { WorldManager } from "../WorldManager"

export function initClouds(this: WorldManager) {
  if (this.cloudVariants.length === 0) return
  const nV = this.cloudVariants.length
  for (let i = 0; i < this.NUM_CLOUDS; i++) {
    this.cloudEntries.push({
      pos: new THREE.Vector3(0, 60, 0),
      rot: 0,
      variantIdx: i % nV,
      k: Number.NaN,
    })
  }
  this.updateClouds(0, new THREE.Vector3())
}

export function flushClouds(this: WorldManager, carS = this.cloudLastCarS) {
  if (this.cloudVariants.length === 0) return
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const sc = new THREE.Vector3()
  const counters = this.cloudVariants.map(() => 0)
  for (const c of this.cloudEntries) {
    const vi = c.variantIdx % this.cloudVariants.length
    const pv = this.cloudVariants[vi]
    const idx = counters[vi]++
    if (idx >= pv.im.instanceMatrix.count) continue
    e.set(0, c.rot, 0)
    q.setFromEuler(e)
    const cd = Math.abs(-c.pos.z - carS)
    sc.setScalar(this.withinFog(cd) ? fadeOut(cd, 1000, 1500) : 0)
    m.compose(c.pos, q, sc)
    pv.im.setMatrixAt(idx, m)
  }
  this.cloudVariants.forEach((pv, vi) => {
    pv.im.count = counters[vi]
    pv.im.instanceMatrix.needsUpdate = true
  })
}

export function updateClouds(
  this: WorldManager,
  carS: number,
  _carPos: THREE.Vector3,
) {
  if (this.cloudVariants.length === 0) return
  let dirty = Math.abs(carS - this.cloudLastCarS) > 25
  for (let i = 0; i < this.cloudEntries.length; i++) {
    const c = this.cloudEntries[i]
    const base = i * CLOUD_GAP
    const k = Math.round((carS - base) / CLOUD_RING)
    if (k === c.k) continue
    c.k = k
    const seed = i * 4001 + k * 7919
    const s = base + k * CLOUD_RING + (this.rand(seed * 5) - 0.5) * 60
    c.pos.set(
      roadCenterX(s) + (this.rand(seed) - 0.5) * 700,
      60 + this.rand(seed * 7) * 60,
      -s,
    )
    c.rot = this.rand(seed * 11) * Math.PI * 2
    dirty = true
  }
  if (dirty) {
    this.cloudLastCarS = carS
    this.flushClouds(carS)
  }
}
