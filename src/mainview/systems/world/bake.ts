import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

export function bakeInstanced(
  node: THREE.Object3D,
  maxInstances: number,
  targetH: number,
  opts?: { uniformScale?: number },
): THREE.InstancedMesh | null {
  const clone = node.clone()
  clone.rotation.x = -Math.PI / 2
  clone.updateMatrixWorld(true)

  const cbox0 = new THREE.Box3().setFromObject(clone)
  const size0 = cbox0.getSize(new THREE.Vector3())
  if (size0.y < 0.001 && opts?.uniformScale === undefined) return null
  const norm = opts?.uniformScale ?? targetH / size0.y
  clone.scale.multiplyScalar(norm)
  clone.updateMatrixWorld(true)

  const cbox = new THREE.Box3().setFromObject(clone)
  const cx = (cbox.min.x + cbox.max.x) / 2
  const cz = (cbox.min.z + cbox.max.z) / 2

  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  clone.traverse((o: any) => {
    if (!o.isMesh) return
    const src = o.geometry as THREE.BufferGeometry
    const pos = src.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined
    if (!pos || pos.count < 24) return
    src.computeBoundingBox()
    const bb = src.boundingBox!
    const sz = new THREE.Vector3()
    bb.getSize(sz)
    const longest = Math.max(sz.x, sz.y, sz.z)
    if (longest < 1e-6) return
    const g = src.clone().applyMatrix4(o.matrixWorld)
    g.translate(-cx, -cbox.min.y, -cz)
    geos.push(g)
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    mats.push(
      m ?? new THREE.MeshStandardMaterial({ color: 0x2d5a22, roughness: 1 }),
    )
  })

  if (geos.length === 0) return null

  let geo: THREE.BufferGeometry
  let mat: THREE.Material | THREE.Material[]
  if (geos.length > 1) {
    const merged = mergeGeometries(
      geos.map((g) => (g.index ? g.toNonIndexed() : g)),
      true,
    )
    if (merged) {
      geo = merged
      mat = mats
    } else {
      geo = geos[0]
      mat = mats[0]
    }
  } else {
    geo = geos[0]
    mat = mats[0]
  }

  const im = new THREE.InstancedMesh(geo, mat, maxInstances)
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  im.count = 0
  return im
}

export function bakeSplit(
  node: THREE.Object3D,
  chunks: number,
  maxInstances: number,
  opts: { uniformScale?: number; targetH?: number; flattenY?: number },
): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = []
  const clone = node.clone()
  clone.rotation.x = -Math.PI / 2
  clone.updateMatrixWorld(true)

  const parts: THREE.BufferGeometry[] = []
  let mat: THREE.Material | null = null
  clone.traverse((o: any) => {
    if (!o.isMesh) return
    const src = o.geometry as THREE.BufferGeometry
    const pos = src.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined
    if (!pos || pos.count < 24) return
    if (!mat)
      mat = (Array.isArray(o.material) ? o.material[0] : o.material) ?? null
    const g = src.clone().applyMatrix4(o.matrixWorld)
    parts.push(g.index ? g.toNonIndexed() : g)
  })
  if (parts.length === 0) return out
  const merged = mergeGeometries(parts, false)
  if (!merged) return out
  const material =
    mat ?? new THREE.MeshStandardMaterial({ color: 0x4d7a2e, roughness: 1 })

  merged.computeBoundingBox()
  const bb = merged.boundingBox!
  const spanX = Math.max(1e-6, bb.max.x - bb.min.x)

  const posA = merged.getAttribute("position") as THREE.BufferAttribute
  const normA = merged.getAttribute("normal") as
    | THREE.BufferAttribute
    | undefined
  const uvA = merged.getAttribute("uv") as THREE.BufferAttribute | undefined
  const triCount = Math.floor(posA.count / 3)
  const bins: number[][] = Array.from({ length: chunks }, () => [])

  const cx = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    cx.fromBufferAttribute(posA, t * 3)
      .add(new THREE.Vector3().fromBufferAttribute(posA, t * 3 + 1))
      .add(new THREE.Vector3().fromBufferAttribute(posA, t * 3 + 2))
      .multiplyScalar(1 / 3)
    const b = Math.min(
      chunks - 1,
      Math.floor(((cx.x - bb.min.x) / spanX) * chunks),
    )
    bins[b].push(t)
  }

  for (const bin of bins) {
    if (bin.length === 0) continue
    const n = bin.length * 3
    const pArr = new Float32Array(n * 3)
    const nArr = normA ? new Float32Array(n * 3) : null
    const uArr = uvA ? new Float32Array(n * 2) : null
    let k = 0
    let minY = Infinity
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity
    for (const t of bin) {
      for (let v = 0; v < 3; v++) {
        const vi = t * 3 + v
        const x = posA.getX(vi),
          y = posA.getY(vi),
          z = posA.getZ(vi)
        if (y < minY) minY = y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
      }
    }
    const ccx = (minX + maxX) / 2
    const ccz = (minZ + maxZ) / 2
    const fy = opts.flattenY ?? 1
    for (const t of bin) {
      for (let v = 0; v < 3; v++) {
        const vi = t * 3 + v
        pArr[k * 3 + 0] = posA.getX(vi) - ccx
        pArr[k * 3 + 1] = (posA.getY(vi) - minY) * fy
        pArr[k * 3 + 2] = posA.getZ(vi) - ccz
        if (nArr && normA) {
          nArr[k * 3 + 0] = normA.getX(vi)
          nArr[k * 3 + 1] = normA.getY(vi)
          nArr[k * 3 + 2] = normA.getZ(vi)
        }
        if (uArr && uvA) {
          uArr[k * 2 + 0] = uvA.getX(vi)
          uArr[k * 2 + 1] = uvA.getY(vi)
        }
        k++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pArr, 3))
    if (nArr) g.setAttribute("normal", new THREE.BufferAttribute(nArr, 3))
    if (uArr) g.setAttribute("uv", new THREE.BufferAttribute(uArr, 2))
    if (opts.uniformScale !== undefined)
      g.scale(opts.uniformScale, opts.uniformScale, opts.uniformScale)
    else if (opts.targetH !== undefined) {
      g.computeBoundingBox()
      const h = Math.max(1e-6, g.boundingBox!.max.y - g.boundingBox!.min.y)
      const s = opts.targetH / h
      g.scale(s, s, s)
    }
    const im = new THREE.InstancedMesh(g, material, maxInstances)
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    im.count = 0
    out.push(im)
  }
  return out
}
