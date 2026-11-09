import * as THREE from "three"
import type { CarVisual } from "../CarVisual"
import { INDICATOR_ZONES } from "./indicatorZones"

export type IndicatorMode = "off" | "left" | "right" | "hazard"

const AMBER = 0xff9a14
const PERIOD_S = 0.75

interface Spot {
  x: number
  y: number
  z: number
  w: number
  h: number
  left: boolean
  front: boolean
}

const WHITE_EMISSIVE = 0.85
const AMBER_NAME = /yellow|orange|amber|blink|indic/i

const NOT_LAMP = /body|paint|chassis|glass/i

function litWhite(mat: THREE.Material): boolean {
  if (NOT_LAMP.test(mat.name)) return false
  const e = (mat as THREE.MeshStandardMaterial).emissive
  return (
    !!e &&
    e.r > WHITE_EMISSIVE &&
    e.g > WHITE_EMISSIVE &&
    e.b > WHITE_EMISSIVE * 0.8
  )
}

function litRed(mat: THREE.Material): boolean {
  const e = (mat as THREE.MeshStandardMaterial).emissive
  return !!e && e.r > 0.12 && e.r > e.g * 1.7 && e.r > e.b * 1.7
}

function meshVerts(mesh: THREE.Mesh, inv: THREE.Matrix4, out: THREE.Vector3[]) {
  const pos = mesh.geometry.getAttribute("position")
  if (!pos) return
  const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
  const step = Math.max(1, Math.floor(pos.count / 4000))
  for (let i = 0; i < pos.count; i += step)
    out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m))
}

function yellowSampler(
  mat: THREE.Material,
): ((u: number, v: number) => boolean) | null {
  const map = (mat as THREE.MeshStandardMaterial).emissiveMap
  const img = map?.image as CanvasImageSource & {
    width: number
    height: number
  }
  if (!map || !img || typeof document === "undefined") return null
  try {
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    const flip = map.flipY
    return (u, v) => {
      const x = Math.min(
        c.width - 1,
        Math.max(0, Math.floor((u - Math.floor(u)) * c.width)),
      )
      const vv = v - Math.floor(v)
      const y = Math.min(
        c.height - 1,
        Math.max(0, Math.floor((flip ? 1 - vv : vv) * c.height)),
      )
      const i = (y * c.width + x) * 4
      return data[i] > 200 && data[i + 1] > 170 && data[i + 2] < 100
    }
  } catch {
    return null
  }
}

function overlayFor(
  mesh: THREE.Mesh,
  inv: THREE.Matrix4,
  isFront: boolean,
  cx: number,
  zEdge: number,
  band: number,
  mat: THREE.Material,
  out: Partial<Record<"l" | "r", THREE.Mesh>>,
  groupOut: THREE.Group,
  accept?: (ids: number[], v: THREE.Vector3[]) => boolean,
) {
  const geo = mesh.geometry
  const pos = geo.getAttribute("position")
  if (!pos) return
  const nor = geo.getAttribute("normal")
  const idx = geo.getIndex()
  const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
  const nm = new THREE.Matrix3().getNormalMatrix(m)
  const bufs = {
    l: { p: [] as number[], n: [] as number[] },
    r: { p: [] as number[], n: [] as number[] },
  }
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const n = new THREE.Vector3()
  const count = idx ? idx.count : pos.count
  for (let t = 0; t + 2 < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k))
    ids.forEach((id, k) => v[k].fromBufferAttribute(pos, id).applyMatrix4(m))
    const cz = (v[0].z + v[1].z + v[2].z) / 3
    if (accept) {
      if (!accept(ids, v)) continue
    } else if (isFront ? cz > zEdge + band : cz < zEdge - band) continue
    const x = (v[0].x + v[1].x + v[2].x) / 3
    const b = bufs[x < cx ? "l" : "r"]
    ids.forEach((id, k) => {
      b.p.push(v[k].x, v[k].y, v[k].z)
      if (nor) n.fromBufferAttribute(nor, id).applyMatrix3(nm).normalize()
      else n.set(0, 0, isFront ? -1 : 1)
      b.n.push(n.x, n.y, n.z)
    })
  }
  for (const side of ["l", "r"] as const) {
    const b = bufs[side]
    if (b.p.length < 9) continue
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3))
    const o = new THREE.Mesh(g, (mat as THREE.MeshStandardMaterial).clone())
    o.visible = false
    o.renderOrder = 5
    groupOut.add(o)
    const prev = out[side]
    if (prev) {
      const merged = new THREE.BufferGeometry()
      for (const name of ["position", "normal"]) {
        const a = prev.geometry.getAttribute(name).array as Float32Array
        const c = g.getAttribute(name).array as Float32Array
        const arr = new Float32Array(a.length + c.length)
        arr.set(a)
        arr.set(c, a.length)
        merged.setAttribute(name, new THREE.BufferAttribute(arr, 3))
      }
      prev.geometry.dispose()
      prev.geometry = merged
      groupOut.remove(o)
      g.dispose()
    } else out[side] = o
  }
}

export function planIndicators(
  this: CarVisual,
  model: THREE.Object3D,
  modelFile = "",
) {
  this.group.updateMatrixWorld(true)
  model.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert()
  const body = new THREE.Box3()
  const front: THREE.Vector3[] = []
  const rear: THREE.Vector3[] = []
  const frontAmber: THREE.Vector3[] = []
  const meshes: THREE.Mesh[] = []
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  const corner = new THREE.Vector3()
  for (const m of meshes) {
    const g = m.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    const bb = g.boundingBox!
    const mx = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? bb.max.x : bb.min.x,
          i & 2 ? bb.max.y : bb.min.y,
          i & 4 ? bb.max.z : bb.min.z,
        )
        .applyMatrix4(mx)
      body.expandByPoint(corner)
    }
  }
  const size = body.getSize(new THREE.Vector3())
  const cx = (body.min.x + body.max.x) / 2
  const band = size.z * 0.14
  const frontZ = body.min.z
  const rearZ = body.max.z
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    const all: THREE.Vector3[] = []
    const isFrontLamp = mats.some(litWhite)
    const isRearLamp =
      mats.some(litRed) || m.name.toLowerCase().includes("tail")
    const isAmber =
      mats.some((x) => AMBER_NAME.test(x.name)) && !m.name.includes("Body")
    if (!isFrontLamp && !isRearLamp && !isAmber) continue
    meshVerts(m, inv, all)
    for (const v of all) {
      if (v.z < frontZ + band) {
        if (isAmber) frontAmber.push(v)
        else if (isFrontLamp) front.push(v)
      }
      if (v.z > rearZ - band && isRearLamp) rear.push(v)
    }
  }
  const grp = new THREE.Group()
  grp.name = "indicators"
  this.group.add(grp)
  const ends: Record<
    "front" | "rear",
    Partial<Record<"l" | "r", THREE.Mesh>>
  > = {
    front: {},
    rear: {},
  }
  const amberOverlay = (mat: THREE.MeshStandardMaterial) => {
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -4
    mat.polygonOffsetUnits = -4
    return mat
  }
  const lampMat = amberOverlay(
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: AMBER,
      emissiveIntensity: 0,
      roughness: 0.5,
    }),
  )
  this.indicatorOverlayMat = lampMat
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.some(litWhite))
      overlayFor(m, inv, true, cx, frontZ, band, lampMat, ends.front, grp)
    if (mats.some(litRed) || m.name.toLowerCase().includes("tail"))
      overlayFor(m, inv, false, cx, rearZ, band, lampMat, ends.rear, grp)
  }
  for (const [end, sides] of Object.entries(ends) as [
    "front" | "rear",
    Partial<Record<"l" | "r", THREE.Mesh>>,
  ][])
    for (const side of ["l", "r"] as const) {
      const mesh = sides[side]
      if (mesh)
        this.indicatorOverlays.push({
          mesh,
          left: side === "l",
          front: end === "front",
          amber: false,
        })
    }
  const amberEnds: Record<
    "front" | "rear",
    Partial<Record<"l" | "r", THREE.Mesh>>
  > = {
    front: {},
    rear: {},
  }
  const midZ = (frontZ + rearZ) / 2
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.length !== 1) continue
    const sample = yellowSampler(mats[0])
    const uv = m.geometry.getAttribute("uv")
    if (!sample || !uv) continue
    const mk = () =>
      new THREE.MeshStandardMaterial({
        color: 0x1c1004,
        emissive: AMBER,
        emissiveIntensity: 0,
        roughness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      })
    for (const isFront of [true, false])
      overlayFor(
        m,
        inv,
        isFront,
        cx,
        0,
        0,
        mk(),
        amberEnds[isFront ? "front" : "rear"],
        grp,
        (ids, v) => {
          const cz = (v[0].z + v[1].z + v[2].z) / 3
          if (isFront ? cz > midZ : cz < midZ) return false
          let hit = 0
          for (const id of ids) if (sample(uv.getX(id), uv.getY(id))) hit++
          return hit === 3
        },
      )
  }
  const zones = INDICATOR_ZONES[modelFile.split("/").pop() ?? ""] ?? []
  const zoned = new Set<"front" | "rear">()
  for (const z of zones) {
    const re = z.mesh ? new RegExp(z.mesh, "i") : null
    const isFront = z.end === "front"
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      if (re && !re.test(m.name) && !mats.some((x) => re.test(x.name))) continue
      overlayFor(
        m,
        inv,
        isFront,
        cx,
        0,
        0,
        new THREE.MeshStandardMaterial({
          // glow zones copy the model's brakelight material so the colours match
          color: z.glow
            ? new THREE.Color().setRGB(0.8, 0.8, 0.8, THREE.LinearSRGBColorSpace)
            : (z.idle ?? 0x1c1004),
          emissive: z.glow ?? AMBER,
          emissiveIntensity: z.glow ? 4.373 : 0,
          roughness: z.glow ? 0.804 : 0.5,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
        amberEnds[z.end],
        grp,
        (_ids, v) => {
          const x = (v[0].x + v[1].x + v[2].x) / 3
          const y = (v[0].y + v[1].y + v[2].y) / 3
          const zc = (v[0].z + v[1].z + v[2].z) / 3
          if (isFront ? zc > midZ : zc < midZ) return false
          const dx = Math.abs((x - body.min.x) / size.x - 0.5)
          const fy = (y - body.min.y) / size.y
          if (z.dx && (dx < z.dx[0] || dx > z.dx[1])) return false
          if (z.y && (fy < z.y[0] || fy > z.y[1])) return false
          return true
        },
      )
    }
    if (z.glow) {
      for (const side of ["l", "r"] as const) {
        const mat = amberEnds[z.end][side]?.material as
          | THREE.MeshStandardMaterial
          | undefined
        if (mat) mat.userData.glow = z.glow
      }
    }
    zoned.add(z.end)
  }
  this.indicatorOverlays = this.indicatorOverlays.filter((o) => {
    if (o.amber || !zoned.has(o.front ? "front" : "rear")) return true
    o.mesh.geometry.dispose()
    grp.remove(o.mesh)
    return false
  })
  for (const end of ["front", "rear"] as const)
    for (const side of ["l", "r"] as const) {
      const mesh = amberEnds[end][side]
      if (!mesh) continue
      mesh.visible = true
      this.indicatorOverlays.push({
        mesh,
        left: side === "l",
        front: end === "front",
        amber: true,
      })
    }
  const spots: Spot[] = []
  const sideSpots = (
    verts: THREE.Vector3[],
    isFront: boolean,
    tight: boolean,
  ) => {
    for (const left of [true, false]) {
      const side = verts.filter((v) => v.x < cx === left)
      if (side.length < 3) continue
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const v of side) {
        minX = Math.min(minX, v.x)
        maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y)
        maxY = Math.max(maxY, v.y)
      }
      const span = maxX - minX
      const h = Math.max(0.03, maxY - minY)
      const outer = left ? minX : maxX
      const w = tight ? span : Math.min(span * 0.3, 0.3)
      const x = tight ? (minX + maxX) / 2 : outer + (left ? 1 : -1) * w * 0.55
      const faceZ = side.reduce(
        (a, v) => (isFront ? Math.min(a, v.z) : Math.max(a, v.z)),
        isFront ? Infinity : -Infinity,
      )
      spots.push({
        x,
        y: (minY + maxY) / 2,
        z: faceZ + (isFront ? -0.012 : 0.012),
        w: Math.max(0.08, w),
        h: Math.min(0.14, Math.max(0.045, h * (tight ? 1 : 0.55))),
        left,
        front: isFront,
      })
    }
  }
  if (frontAmber.length > 4) sideSpots(frontAmber, true, true)
  else if (front.length > 4) sideSpots(front, true, false)
  if (rear.length > 4) sideSpots(rear, false, false)
  if (frontAmber.length > 4)
    this.indicatorOverlays = this.indicatorOverlays.filter((o) => {
      if (!o.front || o.amber) return true
      o.mesh.geometry.dispose()
      grp.remove(o.mesh)
      return false
    })
  const covered = (f: boolean, l: boolean) =>
    this.indicatorOverlays.some((o) => o.front === f && o.left === l)
  for (let i = spots.length - 1; i >= 0; i--)
    if (covered(spots[i].front, spots[i].left)) spots.splice(i, 1)
  const have = (f: boolean, l: boolean) =>
    spots.some((s) => s.front === f && s.left === l)
  for (const isFront of [true, false])
    for (const left of [true, false]) {
      if (have(isFront, left) || covered(isFront, left)) continue
      spots.push({
        x: cx + (left ? -1 : 1) * size.x * 0.36,
        y: body.min.y + size.y * (isFront ? 0.34 : 0.5),
        z: isFront ? frontZ - 0.012 : rearZ + 0.012,
        w: 0.2,
        h: 0.09,
        left,
        front: isFront,
      })
    }
  this.indicatorPlan = spots
}

export function buildIndicators(this: CarVisual) {
  if (this.indicatorLamps.length > 0) return
  for (const sp of this.indicatorPlan) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a1600,
      emissive: AMBER,
      emissiveIntensity: 0,
      roughness: 0.4,
    })
    const m = new THREE.Mesh(new THREE.BoxGeometry(sp.w, sp.h, 0.03), mat)
    m.position.set(sp.x, sp.y, sp.z)
    m.visible = false
    this.group.add(m)
    this.indicatorLamps.push({ mesh: m, mat, left: sp.left })
  }
}

export function setIndicator(this: CarVisual, mode: IndicatorMode) {
  this.indicatorMode = mode
  this.indicatorClock = 0
  const frontCovered = (left: boolean) =>
    this.indicatorOverlays.some((o) => o.front && o.left === left && !o.amber)
  const uncovered =
    mode !== "off" &&
    ((mode !== "right" && !frontCovered(true)) ||
      (mode !== "left" && !frontCovered(false)))
  this.headlightDim = uncovered ? 0.12 : 1
  this.applyLamps()
  this.updateIndicators(0)
}

export function toggleIndicator(
  this: CarVisual,
  which: "left" | "right" | "hazard",
) {
  this.setIndicator(this.indicatorMode === which ? "off" : which)
}

export function updateIndicators(this: CarVisual, dt: number) {
  if (this.indicatorLamps.length === 0 && this.indicatorMode !== "off")
    this.buildIndicators()
  this.indicatorClock += dt
  const on =
    this.indicatorMode !== "off" &&
    this.power > 0.2 &&
    this.indicatorClock % PERIOD_S < PERIOD_S / 2
  const sideOn = (left: boolean) =>
    this.indicatorMode === "hazard" ||
    (this.indicatorMode === "left" && left) ||
    (this.indicatorMode === "right" && !left)
  for (const o of this.indicatorOverlays) {
    const active = sideOn(o.left)
    o.mesh.visible = o.amber || active
    const mat = o.mesh.material as THREE.MeshStandardMaterial
    const flash = on && active
    const glow = mat.userData.glow as number | undefined
    if (glow !== undefined) {
      // indicator running: amber or dark, never the red tail glow
      mat.emissive.set(active ? AMBER : glow)
      mat.emissiveIntensity = (active ? (flash ? 5 : 0) : 4.373) * this.power
      mat.color.setScalar(active && !flash ? 0.03 : 0.8)
    } else mat.emissiveIntensity = flash ? 5 * this.power : 0
  }
  for (const l of this.indicatorLamps) {
    const active =
      this.indicatorMode === "hazard" ||
      (this.indicatorMode === "left" && l.left) ||
      (this.indicatorMode === "right" && !l.left)
    const lit = on && active
    l.mesh.visible = this.indicatorMode !== "off"
    l.mat.emissiveIntensity = lit ? 4 * this.power : 0
  }
}
