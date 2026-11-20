import * as THREE from "three"
import type { WorldManager } from "../WorldManager"
import type { PropVariant } from "./types"

const NEAR_CAP = 400
const MOVE_M = 4
const REACH = 6

let invisible: THREE.MeshBasicMaterial | null = null

function proxyMaterial() {
  if (!invisible) {
    invisible = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
    })
  }
  return invisible
}

export function addShadowProxy(this: WorldManager, pv: PropVariant) {
  const cap = Math.min(NEAR_CAP, pv.im.instanceMatrix.count)
  const proxy = new THREE.InstancedMesh(pv.im.geometry, proxyMaterial(), cap)
  proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  proxy.count = 0
  proxy.frustumCulled = false
  proxy.castShadow = pv.im.castShadow
  proxy.receiveShadow = false
  proxy.renderOrder = -1
  proxy.name = `${pv.im.name}-shadow`
  this.applyShadowFade(proxy)
  pv.im.castShadow = false
  this.group.add(proxy)
  pv.shadowIm = proxy
  pv.shadowVersion = -1
}

export function syncShadowCasters(this: WorldManager) {
  const cx = this.carPos.x
  const cz = this.carPos.z
  const moved = Math.hypot(cx - this.shadowSyncX, cz - this.shadowSyncZ)
  const reach = this.SHADOW_FADE_RADIUS + REACH
  const r2 = reach * reach
  for (const pv of this.propVariants) {
    const proxy = pv.shadowIm
    if (!proxy) continue
    const src = pv.im.instanceMatrix
    if (moved < MOVE_M && pv.shadowVersion === src.version) continue
    pv.shadowVersion = src.version
    const a = src.array as Float32Array
    const dst = proxy.instanceMatrix.array as Float32Array
    const cap = proxy.instanceMatrix.count
    let n = 0
    for (let i = 0, end = pv.im.count; i < end && n < cap; i++) {
      const o = i * 16
      if (a[o] === 0 && a[o + 5] === 0) continue
      const dx = a[o + 12] - cx
      const dz = a[o + 14] - cz
      if (dx * dx + dz * dz > r2) continue
      dst.set(a.subarray(o, o + 16), n * 16)
      n++
    }
    proxy.count = n
    proxy.instanceMatrix.needsUpdate = true
  }
  if (moved >= MOVE_M) {
    this.shadowSyncX = cx
    this.shadowSyncZ = cz
  }
}
