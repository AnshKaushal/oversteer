import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import type { WheelDef } from "../../physics/vehicle/components/Suspension"
import { loWheelMat, loGeos } from "../carVisual/shared"
import type { CarVisual } from "../CarVisual"

export function buildImposter(
  this: CarVisual,
  tint: number | undefined,
  wheelSpots: readonly WheelDef[] | undefined,
  wheelRadius: number,
) {
  const wr = wheelRadius
  const g = loGeos(wr)
  const lo = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({
    color: tint ?? 0x8a8f96,
    roughness: 0.6,
    metalness: 0.3,
  })
  this.loPaint = paint
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101418,
    roughness: 0.25,
    metalness: 0.6,
  })
  const bodyM = new THREE.Mesh(g.body, paint)
  bodyM.position.y = 0.55
  const cabinM = new THREE.Mesh(g.cabin, glass)
  cabinM.position.set(0, 1.05, 0.25)
  lo.add(bodyM, cabinM)
  const spots = (wheelSpots ?? [
    { x: -0.76, z: -1.51 },
    { x: 0.76, z: -1.51 },
    { x: -0.76, z: 1.31 },
    { x: 0.76, z: 1.31 },
  ]) as readonly { x: number; z: number }[]
  for (const { x, z } of spots) {
    const w = new THREE.Mesh(g.wheel, loWheelMat)
    w.position.set(x, wr, z)
    lo.add(w)
  }

  const headGeo = new THREE.PlaneGeometry(0.28, 0.16)
  headGeo.rotateY(Math.PI)
  const headMat = new THREE.MeshBasicMaterial({
    color: 0xfff0cc,
    toneMapped: false,
    transparent: true,
    opacity: 0.85,
  })
  const leftHead = new THREE.Mesh(headGeo, headMat)
  leftHead.position.set(-0.62, 0.58, -2.36)
  const rightHead = new THREE.Mesh(headGeo, headMat)
  rightHead.position.set(0.62, 0.58, -2.36)
  leftHead.visible = this.headlightsOn
  rightHead.visible = this.headlightsOn

  const tailGeo = new THREE.PlaneGeometry(0.28, 0.16)
  const tailMat = new THREE.MeshBasicMaterial({
    color: 0xff1505,
    toneMapped: false,
  })
  const leftTail = new THREE.Mesh(tailGeo, tailMat)
  leftTail.position.set(-0.62, 0.65, 2.36)
  const rightTail = new THREE.Mesh(tailGeo, tailMat)
  rightTail.position.set(0.62, 0.65, 2.36)
  leftTail.visible = this.headlightsOn
  rightTail.visible = this.headlightsOn

  lo.add(leftHead, rightHead, leftTail, rightTail)
  this.loHeadlights = [leftHead, rightHead, leftTail, rightTail]

  lo.visible = false
  this.group.add(lo)
  this.loGroup = lo
}

export function setDetail(this: CarVisual, hi: boolean) {
  if (hi === this.hiDetail) return
  if (!this.hiBody || !this.loGroup) return
  this.hiDetail = hi
  this.hiBody.visible = hi
  for (const w of this.wheels) w.mesh.visible = hi
  for (const m of this.hiMerged) m.visible = hi
  this.loGroup.visible = !hi
}

export function mergeStatic(this: CarVisual) {
  if (!this.hiBody) return
  this.group.updateMatrixWorld(true)
  const skip = new Set<THREE.Object3D>()
  if (this.loGroup) skip.add(this.loGroup)
  for (const w of this.wheels) {
    w.mesh.traverse((o) => skip.add(o))
  }
  for (const m of this.headlightMeshes) {
    skip.add(m)
  }
  for (const m of this.brakeMeshes) {
    skip.add(m)
  }
  this.mergeInto([this.hiBody], this.group, null, skip)
  for (const w of this.wheels) {
    const inv = w.mesh.matrixWorld.clone().invert()
    this.mergeInto([w.mesh], w.mesh, inv, new Set())
  }
}

export function mergeInto(
  this: CarVisual,
  roots: THREE.Object3D[],
  target: THREE.Object3D,
  toLocal: THREE.Matrix4 | null,
  exclude: Set<THREE.Object3D>,
) {
  const buckets = new Map<
    string,
    { mat: THREE.Material; geos: THREE.BufferGeometry[]; src: THREE.Mesh[] }
  >()
  const visit = (o: THREE.Object3D) => {
    if (exclude.has(o)) return
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !(mesh as any).isSkinnedMesh) {
      const mat = mesh.material as THREE.Material | THREE.Material[]
      const g = mesh.geometry as THREE.BufferGeometry | undefined
      if (
        mat &&
        !Array.isArray(mat) &&
        g &&
        g.getAttribute("position") &&
        Object.keys(g.morphAttributes ?? {}).length === 0 &&
        !(mat as any).vertexColors
      ) {
        const needsUv = !!(mat as any).map
        if (!needsUv || g.getAttribute("uv")) {
          let b = buckets.get(mat.uuid)
          if (!b) {
            b = { mat, geos: [], src: [] }
            buckets.set(mat.uuid, b)
          }
          b.geos.push(g)
          b.src.push(mesh)
        }
      }
    }
    for (const c of o.children) visit(c)
  }
  for (const r of roots) visit(r)
  for (const { mat, geos, src } of buckets.values()) {
    if (geos.length < 2) continue
    const hasUv = geos.every((g) => !!g.getAttribute("uv"))
    const prepped: THREE.BufferGeometry[] = []
    for (let i = 0; i < geos.length; i++) {
      const g = geos[i].clone()
      if (toLocal) g.applyMatrix4(toLocal.clone().multiply(src[i].matrixWorld))
      else g.applyMatrix4(src[i].matrixWorld)
      const ng = g.index ? g.toNonIndexed() : g
      if (!hasUv) ng.deleteAttribute("uv")
      ng.deleteAttribute("tangent")
      ng.deleteAttribute("uv1")
      ng.deleteAttribute("uv2")
      ng.deleteAttribute("uv3")
      ng.deleteAttribute("color")
      prepped.push(ng)
    }
    let merged: THREE.BufferGeometry | null = null
    try {
      merged = mergeGeometries(prepped, false)
    } catch {
      merged = null
    }
    for (const g of prepped) g.dispose()
    if (!merged) continue
    for (const m of src) m.visible = false
    const out = new THREE.Mesh(merged, mat)
    out.castShadow = this.castShadow
    out.receiveShadow = true
    target.add(out)
    this.hiMerged.push(out)
  }
}
