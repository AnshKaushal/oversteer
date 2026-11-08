import { ZERO_M } from "./constants"
import * as THREE from "three"
import { makeTreeFarGeometry, propMaterial } from "../lowPolyProps"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { WORLD_CONFIG } from "../../constants/world"
import { roadCenterX } from "../../maps/highway/road"
import { FAR_LOD_M, PropVariant, PropEntry } from "../world/types"
import type { WorldManager } from "../WorldManager"

export function addFarTwin(this: WorldManager, pv: PropVariant) {
  const cap = pv.im.instanceMatrix.count
  const far = new THREE.InstancedMesh(
    makeTreeFarGeometry(),
    propMaterial(),
    cap,
  )
  far.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  for (let i = 0; i < cap; i++) far.setMatrixAt(i, ZERO_M)
  far.count = 0
  far.castShadow = false
  far.receiveShadow = false
  far.frustumCulled = false
  far.name = "prop-tree-far"
  this.group.add(far)
  pv.far = far
}

export function genSegProps(this: WorldManager, seg: number): PropEntry[] {
  let all = this.genSegPropsAll(seg)
  if (this.clearZones.length > 0) {
    all = all.filter((t) => !this.inClearZone(t.pos.x, t.pos.z))
  }
  if (this.vegetation >= 1) return all
  return all.filter((t) => {
    const cat = this.propVariants[t.variantIdx]?.category
    if (cat !== "tree" && cat !== "grass") return true
    const rank = this.rand(
      Math.floor(t.pos.x * 7) + Math.floor(t.pos.z * 13) * 10007 + seg * 31,
    )
    return rank < this.vegetation
  })
}

export function genSegPropsAll(this: WorldManager, seg: number): PropEntry[] {
  const out: PropEntry[] = []
  if (this.propVariants.length === 0) return out
  const W = WORLD_CONFIG.vegetation
  const treeIdxs = this.propVariants
    .map((p, i) => (p.category === "tree" ? i : -1))
    .filter((i) => i >= 0)
  const rockIdxs = this.propVariants
    .map((p, i) => (p.category === "rock" ? i : -1))
    .filter((i) => i >= 0)
  const grassIdxs = this.propVariants
    .map((p, i) => (p.category === "grass" ? i : -1))
    .filter((i) => i >= 0)
  const barrelIdxs = this.propVariants
    .map((p, i) => (p.category === "barrel" ? i : -1))
    .filter((i) => i >= 0)
  const logIdxs = this.propVariants
    .map((p, i) => (p.category === "log" ? i : -1))
    .filter((i) => i >= 0)
  const s0 = seg * this.segLen
  const ROAD_CLEAR = 9.5

  const pushProp = (
    s: number,
    seed: number,
    i: number,
    minDist: number,
    maxDist: number,
    pool: number[],
    baseScale: number,
    y = 0,
  ) => {
    if (pool.length === 0) return
    const cx = roadCenterX(s)
    const side = this.rand(seed * 7 + i * 131) > 0.5 ? 1 : -1
    const dist = Math.max(
      ROAD_CLEAR,
      minDist + this.rand(seed + i * 17) * (maxDist - minDist),
    )
    const variantIdx =
      pool[Math.floor(this.rand(seed * 29 + i * 5) * pool.length) % pool.length]
    const scaleVar =
      W.scaleRange.min +
      this.rand(seed * 3 + i * 7) * (W.scaleRange.max - W.scaleRange.min)
    out.push({
      pos: new THREE.Vector3(
        cx + side * dist,
        y,
        -(s + (this.rand(seed * 13 + i) - 0.5) * 8),
      ),
      rot: this.rand(seed + i) * Math.PI * 2,
      scale: scaleVar * baseScale,
      variantIdx,
    })
  }

  for (let s = s0; s < s0 + this.segLen; s += 8) {
    const seed = Math.floor(s) * 7 + seg * 10007
    const n = 2 + Math.floor(this.rand(seed) * 2)
    for (let i = 0; i < n; i++) {
      const roll = this.rand(seed * 31 + i * 53)
      let pool: number[] = treeIdxs
      let base = 1.4
      let minD: number = W.minDistanceFromRoad
      let maxD: number = W.maxDistanceFromRoad
      if (roll > 0.75 && rockIdxs.length > 0) {
        pool = rockIdxs
        base = 1.0
      } else if (roll > 0.9 && barrelIdxs.length > 0) {
        pool = barrelIdxs
        base = 1.0
        minD = 10
        maxD = 50
      } else if (roll > 0.95 && logIdxs.length > 0) {
        pool = logIdxs
        base = 1.0
        minD = 12
        maxD = 50
      }
      if (pool.length === 0) {
        pool = treeIdxs
        base = 1.4
        minD = W.minDistanceFromRoad
        maxD = W.maxDistanceFromRoad
      }
      pushProp(s, seed, i, minD, maxD, pool, base, -0.15)
      if (out.length > 60) return out
    }
  }

  if (this.GRASS_ENABLED) {
    const bands = [
      { step: 2.0, nMin: 4, nMax: 8, minD: 8, maxD: 45, base: 1.0 },
      { step: 4, nMin: 3, nMax: 6, minD: 45, maxD: 120, base: 1.6 },
      { step: 10, nMin: 2, nMax: 4, minD: 120, maxD: 300, base: 2.8 },
    ]
    let gi = 0
    for (const b of bands) {
      for (let s = s0; s < s0 + this.segLen; s += b.step) {
        const seed = Math.floor(s * 4) * 13 + seg * 30011 + 777 + gi * 7919
        const n = b.nMin + Math.floor(this.rand(seed) * (b.nMax - b.nMin + 1))
        for (let i = 0; i < n; i++) {
          pushProp(
            s,
            seed,
            i + 1000 + gi * 500,
            b.minD,
            b.maxD,
            grassIdxs,
            b.base,
            -0.04,
          )
          if (out.length > 900) return out
        }
      }
      gi++
    }
  }
  return out
}

export function ensureSegs(
  this: WorldManager,
  minSeg: number,
  maxSeg: number,
  carSeg: number,
) {
  if (
    this.primed &&
    this.segMax >= minSeg &&
    this.segMin <= maxSeg &&
    this.segMax - this.segMin <= maxSeg - minSeg
  ) {
    let complete = true
    for (let s = minSeg; s <= maxSeg; s++) {
      if (!this.segProps.has(s)) {
        complete = false
        break
      }
    }
    if (complete) return
  }
  for (const k of [...this.segProps.keys()]) {
    if (k < minSeg || k > maxSeg) {
      this.freeSeg(k)
      this.segProps.delete(k)
    }
  }
  let total = 0
  for (const arr of this.segProps.values()) total += arr.length
  const missing: number[] = []
  for (let s = minSeg; s <= maxSeg; s++) {
    if (!this.segProps.has(s)) missing.push(s)
  }
  missing.sort((a, b) => Math.abs(a - carSeg) - Math.abs(b - carSeg))
  const budget = this.primed ? this.SEGS_PER_FRAME : missing.length
  for (let i = 0; i < Math.min(budget, missing.length); i++) {
    const s = missing[i]
    const arr = this.genSegProps(s)
    if (total + arr.length > this.maxProps) break
    total += arr.length
    this.segProps.set(s, arr)
    this.integrateSeg(s, arr)
  }
  this.primed = true
  this.segMin = minSeg
  this.segMax = maxSeg
  if (this.touchedVariants.size === 0) return
  this.syncPropColliders()
  for (const vi of this.touchedVariants) {
    const pv = this.propVariants[vi]
    if (pv) {
      pv.im.instanceMatrix.needsUpdate = true
      if (pv.far) pv.far.instanceMatrix.needsUpdate = true
    }
  }
  this.touchedVariants.clear()
}

export function integrateSeg(
  this: WorldManager,
  seg: number,
  arr: PropEntry[],
) {
  const slots: { vi: number; idx: number; t: PropEntry }[] = []
  for (const t of arr) {
    const vi = t.variantIdx
    const pv = this.propVariants[vi]
    if (!pv) continue
    const im = pv.im
    const cap = im.instanceMatrix.count
    const free = this.slotFree.get(vi)
    let idx: number
    if (free && free.length > 0) {
      idx = free.pop()!
    } else {
      idx = this.slotHigh.get(vi) ?? 0
      if (idx >= cap) continue
      this.slotHigh.set(vi, idx + 1)
      im.count = idx + 1
    }
    this.scratchE.set(0, t.rot, 0)
    this.scratchQ.setFromEuler(this.scratchE)
    this.scratchS.set(t.scale, t.scale, t.scale)
    this.scratchM.compose(t.pos, this.scratchQ, this.scratchS)
    im.setMatrixAt(idx, this.scratchM)
    if (pv.far) pv.far.count = im.count
    slots.push({ vi, idx, t })
    this.touchedVariants.add(vi)
  }
  this.segSlots.set(seg, slots)
  this.segFar.set(seg, false)
}

export function freeSeg(this: WorldManager, seg: number) {
  const slots = this.segSlots.get(seg)
  this.segSlots.delete(seg)
  this.segFar.delete(seg)
  if (!slots) return
  for (const { vi, idx } of slots) {
    const pv = this.propVariants[vi]
    if (!pv) continue
    pv.im.setMatrixAt(idx, ZERO_M)
    pv.far?.setMatrixAt(idx, ZERO_M)
    let free = this.slotFree.get(vi)
    if (!free) {
      free = []
      this.slotFree.set(vi, free)
    }
    free.push(idx)
    this.touchedVariants.add(vi)
  }
}

export function applyFarLod(this: WorldManager, carPos: THREE.Vector3) {
  const dirty = new Set<number>()
  for (const [seg, slots] of this.segSlots) {
    if (slots.length === 0) continue
    const p = slots[0].t.pos
    const d = Math.hypot(p.x - carPos.x, p.z - carPos.z)
    const was = this.segFar.get(seg) ?? false
    const far = was ? d > FAR_LOD_M - 30 : d > FAR_LOD_M + this.segLen * 0.5
    if (far === was) continue
    this.segFar.set(seg, far)
    for (const { vi, idx, t } of slots) {
      const pv = this.propVariants[vi]
      if (!pv) continue
      this.scratchE.set(0, t.rot, 0)
      this.scratchQ.setFromEuler(this.scratchE)
      this.scratchS.set(t.scale, t.scale, t.scale)
      this.scratchM.compose(t.pos, this.scratchQ, this.scratchS)
      if (far) {
        pv.im.setMatrixAt(idx, ZERO_M)
        pv.far?.setMatrixAt(idx, this.scratchM)
      } else {
        pv.im.setMatrixAt(idx, this.scratchM)
        pv.far?.setMatrixAt(idx, ZERO_M)
      }
      dirty.add(vi)
    }
  }
  for (const vi of dirty) {
    const pv = this.propVariants[vi]
    pv.im.instanceMatrix.needsUpdate = true
    if (pv.far) {
      pv.far.count = pv.im.count
      pv.far.instanceMatrix.needsUpdate = true
    }
  }
}

export function syncPropColliders(this: WorldManager) {
  if (!this.R || !this.physWorld) return
  const R = this.R
  const world = this.physWorld
  for (const [seg, cols] of [...this.segColliders]) {
    if (this.segProps.get(seg) === this.segColliderSrc.get(seg)) continue
    for (const c of cols) world.removeCollider(c, false)
    this.segColliders.delete(seg)
    this.segColliderSrc.delete(seg)
  }
  for (const [seg, props] of this.segProps) {
    if (this.segColliders.has(seg)) continue
    const cols: RAPIER.Collider[] = []
    for (const t of props) {
      const pv = this.propVariants[t.variantIdx]
      if (!pv || pv.category === "grass" || pv.category === "log") continue
      const dx = t.pos.x - this.carPos.x
      const dz = t.pos.z - this.carPos.z
      if (dx * dx + dz * dz < 16) continue
      const fit = colliderFit(pv)
      const k = t.scale
      const c = Math.cos(t.rot)
      const sn = Math.sin(t.rot)
      const ox = fit.cx * k
      const oz = fit.cz * k
      const hh = fit.hh * k
      const col = R.ColliderDesc.cuboid(fit.hx * k, hh, fit.hz * k)
        .setTranslation(
          t.pos.x + ox * c + oz * sn,
          hh,
          t.pos.z - ox * sn + oz * c,
        )
        .setRotation({ x: 0, y: Math.sin(t.rot / 2), z: 0, w: Math.cos(t.rot / 2) })
        .setFriction(0.7)
        .setRestitution(0)
      cols.push(world.createCollider(col))
    }
    this.segColliders.set(seg, cols)
    this.segColliderSrc.set(seg, props)
  }
}

interface Fit {
  hx: number
  hz: number
  hh: number
  cx: number
  cz: number
}
const fitCache = new WeakMap<object, Fit>()

function colliderFit(pv: { im: THREE.InstancedMesh; category: string }): Fit {
  const hit = fitCache.get(pv.im)
  if (hit) return hit
  const pos = pv.im.geometry.getAttribute("position")
  const isTree = pv.category === "tree"
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let maxY = 0
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > maxY) maxY = y
    if (isTree && y > 1.2) continue
    const x = pos.getX(i)
    const z = pos.getZ(i)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  let fit: Fit
  if (!isFinite(minX)) {
    fit = { hx: 0.4, hz: 0.4, hh: 1.8, cx: 0, cz: 0 }
  } else {
    const shrink = isTree ? 1 : 0.9
    fit = {
      hx: Math.max(0.1, ((maxX - minX) / 2) * shrink),
      hz: Math.max(0.1, ((maxZ - minZ) / 2) * shrink),
      hh: isTree ? 1.8 : Math.max(0.2, maxY / 2),
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
    }
  }
  fitCache.set(pv.im, fit)
  return fit
}
