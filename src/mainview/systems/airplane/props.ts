import * as THREE from "three"
import { AircraftSpec, PropDisc } from "./types"

export function prepareAircraft(
  model: THREE.Object3D,
  spec: AircraftSpec,
): { props: PropDisc[]; span: number; height: number; length: number } {
  model.updateMatrixWorld(true)

  let props: PropDisc[] = []
  if (spec.prop === "separate") {
    props = findProps(model)
  } else if (spec.prop === "fan" && spec.fan) {
    props = extractFans(model, spec.fan)
  } else if (spec.prop === "merged") {
    const found = findMergedProp(model, spec)
    props = found ? [found] : []
  }

  const size = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3())
  const spanSize = spec.spanAxis === "x" ? size.x : size.z
  const scale = spec.span / Math.max(spanSize, 0.001)
  model.scale.setScalar(scale)
  model.rotation.y = spec.yaw

  model.updateMatrixWorld(true)
  const c = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
  model.position.set(-c.x, -c.y, -c.z)
  model.updateMatrixWorld(true)
  const fit = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  return { props, span: spec.span, height: fit.y, length: fit.z }
}

export function findProps(model: THREE.Object3D): PropDisc[] {
  const groups = new Map<THREE.Object3D, PropDisc[]>()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const raw = rawExtents(mesh)
    if (!raw) return
    const { x, y, z } = raw
    const thin = Math.min(x, y, z)
    const other = [x, y, z].filter((v) => v > thin + 0.01)
    if (other.length !== 2) return
    if (other[0] < 1 || other[1] < 1) return
    if (Math.abs(other[0] - other[1]) / Math.max(other[0], other[1]) > 0.25)
      return
    const axis =
      thin === x
        ? new THREE.Vector3(1, 0, 0)
        : thin === y
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1)
    const parent = mesh.parent
    if (!parent) return
    const list = groups.get(parent) ?? []
    list.push({ node: mesh, axis })
    groups.set(parent, list)
  })

  const whole = new THREE.Box3().setFromObject(model)
  const modelLength = whole.max.x - whole.min.x
  const kept: PropDisc[] = []
  for (const [parent, discs] of groups) {
    const bb = new THREE.Box3().setFromObject(parent)
    if (bb.max.x - bb.min.x > modelLength * 0.3) continue
    const front = bb.min.x + (bb.max.x - bb.min.x) * 0.35
    for (const disc of discs) {
      const mb = new THREE.Box3().setFromObject(disc.node)
      if ((mb.min.x + mb.max.x) / 2 > front) continue
      kept.push(disc)
    }
  }
  const best = new Map<THREE.Object3D, PropDisc>()
  const verts = (d: PropDisc) =>
    (d.node as THREE.Mesh).geometry.getAttribute("position").count
  for (const d of kept) {
    const cur = best.get(d.node.parent as THREE.Object3D)
    if (!cur || verts(d) > verts(cur)) best.set(d.node.parent as THREE.Object3D, d)
  }
  return [...best.values()]
}

export function extractFans(
  model: THREE.Object3D,
  fan: { mesh: string; zMin: number; zMax: number; radius: number },
): PropDisc[] {
  const out: PropDisc[] = []
  const src = model.getObjectByName(fan.mesh) as THREE.Mesh | undefined
  if (!src || !src.isMesh) return out
  const geo = src.geometry as THREE.BufferGeometry
  const index = geo.getIndex()
  const pos = geo.getAttribute("position")
  if (!index || !pos) return out
  const tri = index.count / 3
  const sides: Record<string, number[]> = { l: [], r: [] }
  const keep: number[] = []
  const v = new THREE.Vector3()
  for (let t = 0; t < tri; t++) {
    const ids = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)]
    let zc = 0
    let xc = 0
    for (const i of ids) {
      v.fromBufferAttribute(pos, i)
      zc += v.z / 3
      xc += v.x / 3
    }
    if (zc >= fan.zMin && zc <= fan.zMax) sides[xc < 0 ? "l" : "r"].push(...ids)
    else keep.push(...ids)
  }
  const bladesOf = (ids: number[]) => ids
  void bladesOf
  const byCentre: { ids: number[]; c: THREE.Vector3 }[] = []
  for (const ids of [sides.l, sides.r]) {
    if (ids.length === 0) continue
    const b = new THREE.Box3()
    for (const i of ids) b.expandByPoint(v.fromBufferAttribute(pos, i))
    byCentre.push({ ids, c: b.getCenter(new THREE.Vector3()) })
  }
  const back: number[] = []
  for (const { ids, c } of byCentre) {
    const spin: number[] = []
    for (let k = 0; k < ids.length; k += 3) {
      let r = 0
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(pos, ids[k + j])
        r = Math.max(r, Math.hypot(v.x - c.x, v.y - c.y))
      }
      if (r <= fan.radius) spin.push(ids[k], ids[k + 1], ids[k + 2])
      else back.push(ids[k], ids[k + 1], ids[k + 2])
    }
    if (spin.length === 0) continue
    const remap = new Map<number, number>()
    const list: number[] = []
    const tris: number[] = []
    for (const i of spin) {
      let n = remap.get(i)
      if (n === undefined) {
        n = list.length
        remap.set(i, n)
        list.push(i)
      }
      tris.push(n)
    }
    const g = new THREE.BufferGeometry()
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name] as THREE.BufferAttribute
      const sz = attr.itemSize
      const arr = new Float32Array(list.length * sz)
      for (let i = 0; i < list.length; i++)
        for (let q = 0; q < sz; q++) arr[i * sz + q] = attr.array[list[i] * sz + q]
      g.setAttribute(name, new THREE.BufferAttribute(arr, sz, attr.normalized))
    }
    g.setIndex(tris)
    g.translate(-c.x, -c.y, -c.z)
    const pivot = new THREE.Group()
    pivot.position.copy(c)
    pivot.add(new THREE.Mesh(g, src.material))
    src.add(pivot)
    out.push({ node: pivot, axis: new THREE.Vector3(0, 0, 1) })
  }
  geo.setIndex([...keep, ...back])
  return out
}

export function findMergedProp(
  model: THREE.Object3D,
  spec: AircraftSpec,
): PropDisc | null {
  model.updateMatrixWorld(true)
  const nose = new THREE.Vector3(-Math.sin(spec.yaw), 0, Math.cos(spec.yaw))
  for (const o of model.children) {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      const found = extractPropFromMesh(mesh, nose)
      if (found) return found
    }
  }
  let hit: PropDisc | null = null
  model.traverse((o) => {
    if (hit) return
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    hit = extractPropFromMesh(mesh, nose)
  })
  return hit
}

export function localNose(
  mesh: THREE.Mesh,
  nose: THREE.Vector3,
): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert()
  const rot = new THREE.Matrix4().extractRotation(inv)
  return nose.clone().applyMatrix4(rot).normalize()
}

export function isBalancedProp(
  parts: { centre: THREE.Vector3 }[],
  dir: THREE.Vector3,
): boolean {
  if (parts.length < 2) return false
  const hub = new THREE.Vector3()
  for (const p of parts) hub.add(p.centre)
  hub.multiplyScalar(1 / parts.length)
  const perp =
    Math.abs(dir.x) < 0.9
      ? [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]
      : [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
  for (const axis of perp) {
    let min = Infinity
    let max = -Infinity
    for (const p of parts) {
      const off = p.centre.dot(axis) - hub.dot(axis)
      min = Math.min(min, off)
      max = Math.max(max, off)
    }
    if (min < -1e-6 && max > 1e-6) return true
  }
  return false
}

export function extractPropFromMesh(
  mesh: THREE.Mesh,
  nose: THREE.Vector3,
): PropDisc | null {
  const geo = mesh.geometry as THREE.BufferGeometry
  const index = geo.getIndex()
  const pos = geo.getAttribute("position")
  if (!index || !pos) return null
  if (geo.groups.length > 0) return null

  const parent = new Int32Array(pos.count)
  for (let i = 0; i < pos.count; i++) parent[i] = i
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const triCount = index.count / 3
  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3)
    const b = index.getX(t * 3 + 1)
    const c = index.getX(t * 3 + 2)
    union(a, b)
    union(b, c)
  }

  const dir = localNose(mesh, nose)
  const whole = new THREE.Box3()
  for (let i = 0; i < pos.count; i++) {
    whole.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i))
  }
  const size = whole.getSize(new THREE.Vector3())
  const length = Math.max(
    Math.abs(size.x * dir.x) +
      Math.abs(size.y * dir.y) +
      Math.abs(size.z * dir.z),
    0.001,
  )
  let noseTip = -Infinity
  for (let i = 0; i < pos.count; i++) {
    noseTip = Math.max(
      noseTip,
      new THREE.Vector3().fromBufferAttribute(pos, i).dot(dir),
    )
  }

  const comps = new Map<number, number[]>()
  for (let i = 0; i < pos.count; i++) {
    const r = find(i)
    const list = comps.get(r) ?? []
    list.push(i)
    comps.set(r, list)
  }
  type Candidate = {
    verts: number[]
    centre: THREE.Vector3
    extents: THREE.Vector3
    thin: "x" | "y" | "z"
    big: number
  }
  const candidates: Candidate[] = []
  for (const verts of comps.values()) {
    const b = new THREE.Box3()
    for (const i of verts) {
      b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i))
    }
    const ex = b.getSize(new THREE.Vector3())
    const centre = b.getCenter(new THREE.Vector3())
    const sorted = [ex.x, ex.y, ex.z].sort((a, b) => a - b)
    const big = sorted[2]
    if (big < length * 0.05) continue
    if (sorted[0] > big * 0.25) continue
    if (sorted[1] < big * 0.45) continue
    if (centre.dot(dir) < noseTip - length * 0.12) continue
    const thin: "x" | "y" | "z" =
      ex.x === sorted[0] ? "x" : ex.y === sorted[0] ? "y" : "z"
    candidates.push({ verts, centre, extents: ex, thin, big })
  }
  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.big - a.big)
  const groups: Candidate[][] = []
  for (const c of candidates) {
    const g = groups[groups.length - 1]
    if (g && c.big >= g[0].big * 0.95) g.push(c)
    else groups.push([c])
  }
  const blades = groups.find((g) => isBalancedProp(g, dir))
  if (!blades) return null

  const hub = new THREE.Vector3()
  for (const b of blades) hub.add(b.centre)
  hub.multiplyScalar(1 / blades.length)

  const isBlade = new Uint8Array(pos.count)
  for (const b of blades) for (const v of b.verts) isBlade[v] = 1
  const remap = new Int32Array(pos.count).fill(-1)
  const bladeVerts: number[] = []
  const bladeTris: number[] = []
  const keepTris: number[] = []
  for (let t = 0; t < triCount; t++) {
    const a = index.getX(t * 3)
    const b = index.getX(t * 3 + 1)
    const c = index.getX(t * 3 + 2)
    if (isBlade[a] && isBlade[b] && isBlade[c]) {
      for (const v of [a, b, c]) {
        if (remap[v] < 0) {
          remap[v] = bladeVerts.length
          bladeVerts.push(v)
        }
      }
      bladeTris.push(remap[a], remap[b], remap[c])
    } else {
      keepTris.push(a, b, c)
    }
  }
  if (bladeTris.length === 0) return null

  geo.setIndex(
    new THREE.BufferAttribute(
      new (keepTris.length > 65535 ? Uint32Array : Uint16Array)(keepTris),
      1,
    ),
  )

  const bladeGeo = new THREE.BufferGeometry()
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.attributes[name] as THREE.BufferAttribute
    const size = attr.itemSize
    const arr = new Float32Array(bladeVerts.length * size)
    for (let i = 0; i < bladeVerts.length; i++) {
      const src = bladeVerts[i]
      for (let c = 0; c < size; c++) {
        arr[i * size + c] = attr.array[src * size + c]
      }
    }
    bladeGeo.setAttribute(
      name,
      new THREE.BufferAttribute(arr, size, attr.normalized),
    )
  }
  bladeGeo.setIndex(
    new THREE.BufferAttribute(
      new (bladeTris.length > 65535 ? Uint32Array : Uint16Array)(bladeTris),
      1,
    ),
  )
  bladeGeo.translate(-hub.x, -hub.y, -hub.z)

  const pivot = new THREE.Group()
  pivot.position.copy(hub)
  const bladeMesh = new THREE.Mesh(bladeGeo, mesh.material)
  pivot.add(bladeMesh)
  mesh.add(pivot)

  const axis =
    blades[0].thin === "x"
      ? new THREE.Vector3(1, 0, 0)
      : blades[0].thin === "y"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1)
  return { node: pivot, axis }
}

export function rawExtents(mesh: THREE.Mesh) {
  const pos = mesh.geometry.getAttribute("position")
  if (!pos) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (x < min[0]) min[0] = x
    if (y < min[1]) min[1] = y
    if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x
    if (y > max[1]) max[1] = y
    if (z > max[2]) max[2] = z
  }
  return {
    x: max[0] - min[0],
    y: max[1] - min[1],
    z: max[2] - min[2],
  }
}
