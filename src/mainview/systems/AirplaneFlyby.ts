import { fadeWithFog } from "./fogFade"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { roadCenterX, roadYaw } from "./WorldManager"
import {
  AirportView,
  airportBlocked,
  layoutAirport,
  type ClearZone,
  RUNWAY_END_D,
  warmAirportTextures,
} from "./Airport"
import { warmStructureTextures } from "./AirportStructures"
import { makeGlowTexture } from "./GlowTexture"
import { type TimeOfDayMode } from "../constants/timeOfDay"


export const TARGET_SPAN = 36
export const CROSS_LEAD = 120
export const PASS_HALF = 400
export const PASS_LENGTH = PASS_HALF * 2
const EXIT_LEN = 1800
const LANDING_EXIT_LEN = 600
function exitLen(mode: FlybyMode): number {
  return mode === "landing" ? LANDING_EXIT_LEN : EXIT_LEN
}
const TAKEOFF_START_D = -(RUNWAY_END_D - PASS_LENGTH) + 40
const LANDING_START_D = -500
const TAKEOFF_ROLL = 520
const TAKEOFF_LIFTOFF_D = TAKEOFF_START_D + TAKEOFF_ROLL
const TAKEOFF_ACCEL = 2.2
const TAKEOFF_GRADIENT = 0.07
const TAKEOFF_EASE = 300
const TAKEOFF_HOLD = 3
const FADE_TIME = 1.5
const LANDING_DWELL = 4
const AIRPORT_STAY_DIST = 1100
const AIRPORT_VIEW_DIST = 1800
const AIRPORT_MIN_ANGLE = 40
const MAX_LEAD = 700
const MIN_GAP = 8
const MAX_GAP = 10
const FIRST_GAP_MIN = 5
const FIRST_GAP_MAX = 5

const MIN_ANGLE = 20
const MAX_ANGLE = 90
export const CRUISE_ALT = 145
export const CRUISE_LEAD = 380
/** The sun shadow map covers this far round the car, so the soft patch fades in between these. */
const SHADOW_MAP_NEAR = 40
const SHADOW_MAP_FAR = 75
const SUN_SHADOW_X = 120 / 180
const SUN_SHADOW_Z = 60 / 180

const DEG = Math.PI / 180

export type FlybyMode = "takeoff" | "landing" | "cruise"

export interface AircraftSpec {
  file: string
  span: number
  spanAxis: "x" | "z"
  yaw: number
  speed: number
  modes: FlybyMode[]
  prop: "separate" | "merged" | "none"
  gear?: boolean
}

export const AIRCRAFT: AircraftSpec[] = [
  {
    file: "airplane.glb",
    span: 50,
    spanAxis: "z",
    yaw: Math.PI / 2,
    speed: 1.15,
    modes: ["takeoff", "landing", "cruise"],
    prop: "separate",
  },
  {
    file: "c17_globemaster.glb",
    span: 70,
    spanAxis: "x",
    yaw: 0,
    speed: 1.4,
    modes: ["takeoff", "cruise", "landing"],
    prop: "none",
  },
  {
    file: "cessna_172.glb",
    span: 11,
    spanAxis: "x",
    yaw: 0,
    speed: 0.6,
    modes: ["takeoff", "landing", "cruise"],
    prop: "merged",
    gear: false,
  },
]

export interface PropDisc {
  node: THREE.Object3D
  axis: THREE.Vector3
}

export interface LoadedAircraft {
  spec: AircraftSpec
  root: THREE.Group
  body: THREE.Group
  props: PropDisc[]
  mats: THREE.MeshStandardMaterial[]
  span: number
  clearance: number
  gearDrop: number
  gearAft: number
  gear: THREE.Group
  gearGeoms: THREE.BufferGeometry[]
  wheels: THREE.Mesh[]
  lightsRoot: THREE.Group
  strobes: THREE.Mesh[]
  beacons: THREE.Mesh[]
  lightGeoms: THREE.BufferGeometry[]
  lightMats: THREE.Material[]
}

export type TerrainAt = (x: number, z: number) => number

export interface FlightPath {
  x: number
  z: number
  dx: number
  dz: number
  length: number
  theta: number
}

interface Flight {
  mode: FlybyMode
  ac: LoadedAircraft
  path: FlightPath
  traveled: number
  u: number
  speed: number
  age: number
  stopped: number
}

interface Profile {
  y: number
  speed: number
  pitch: number
}

const LANDING_TOUCH_D = 900
const LANDING_HILL_MARGIN = 4
const LANDING_SLOPE = 0.07
const LANDING_FLARE = 160
const LANDING_TOUCH_SPEED = 40
const LANDING_DECEL = 1.8
const LANDING_STOP_DIST = (LANDING_TOUCH_SPEED * LANDING_TOUCH_SPEED) / (2 * LANDING_DECEL)

function profileFor(mode: FlybyMode, _u: number, rolled = 0, d = 0): Profile {
  if (mode === "takeoff") {
    const roll = Math.max(0, d - TAKEOFF_START_D)
    const x = d - TAKEOFF_LIFTOFF_D
    const liftSpeed = Math.sqrt(9 + 2 * TAKEOFF_ACCEL * TAKEOFF_ROLL)
    const t = Math.min(1, Math.max(0, x / TAKEOFF_EASE))
    const gain =
      x <= 0
        ? 0
        : x < TAKEOFF_EASE
          ? TAKEOFF_GRADIENT * TAKEOFF_EASE * (t * t * t - (t * t * t * t) / 2)
          : TAKEOFF_GRADIENT * (TAKEOFF_EASE / 2 + (x - TAKEOFF_EASE))
    const climb = Math.atan(TAKEOFF_GRADIENT * (t * t * (3 - 2 * t)))
    const r = Math.min(1, Math.max(0, (x + 90) / 90))
    const rotate = r * r * (3 - 2 * r)
    return {
      y: gain,
      speed: x <= 0 ? Math.sqrt(9 + 2 * TAKEOFF_ACCEL * roll) : liftSpeed + 8 * Math.min(1, x / 700),
      pitch: 6 * DEG * rotate + climb * 0.8,
    }
  }
  if (mode === "landing") {
    const k = Math.min(1, Math.max(0, d / LANDING_TOUCH_D))
    const v0 = LANDING_TOUCH_SPEED
    const speed =
      rolled > 0
        ? Math.sqrt(Math.max(0, v0 * v0 - 2 * LANDING_DECEL * rolled))
        : 58 - (58 - v0) * k
    const r = Math.max(0, -rolled)
    const y =
      r >= LANDING_FLARE
        ? LANDING_SLOPE * (r - LANDING_FLARE / 2)
        : (LANDING_SLOPE * r * r) / (2 * LANDING_FLARE)
    return { y, speed, pitch: 0 }
  }
  return {
    y: CRUISE_ALT,
    speed: 56,
    pitch: 0,
  }
}

export function makePath(
  sCross: number,
  theta: number,
  side: 1 | -1,
  drift: 1 | -1,
  length = PASS_LENGTH,
): FlightPath {
  const yaw = roadYaw(sCross)
  const nx = Math.cos(yaw)
  const nz = Math.sin(yaw)
  const tx = Math.sin(yaw)
  const tz = -Math.cos(yaw)
  const sn = Math.sin(theta)
  const cs = Math.cos(theta)
  return {
    x: roadCenterX(sCross),
    z: -sCross,
    dx: side * (sn * nx + drift * cs * tx),
    dz: side * (sn * nz + drift * cs * tz),
    length,
    theta,
  }
}

function buildGear(
  model: THREE.Object3D,
  span: number,
  height: number,
  length: number,
  fitted = true,
) {
  const geoms: THREE.BufferGeometry[] = []
  const wheels: THREE.Mesh[] = []
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, roughness: 0.4, metalness: 0.6 })
  if (!fitted) {
    const none = new THREE.Group()
    none.visible = false
    return { group: none, geoms, wheels, mats: [tyre, metal], drop: 0, aft: 0 }
  }
  const big = span > 40
  const radius = Math.max(0.3, span * 0.012)
  const drop = radius * 2.4 + height * 0.01
  const group = new THREE.Group()
  group.position.y = -height / 2
  const aft = length * 0.06
  const track = span * (big ? 0.085 : 0.1)
  model.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  const underside = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, -height * 2, z), new THREE.Vector3(0, 1, 0))
    const hit = ray.intersectObject(model, true)[0]
    return hit ? Math.max(0, hit.point.y + height / 2) + 0.15 : 0.3
  }
  const mainTop = underside(track, -aft)
  const bottom = mainTop - drop
  const leg = (x: number, z: number, pair: number, r: number) => {
    const top = Math.max(underside(x, z), bottom + r * 2)
    const thick = r * 0.7
    const gap = thick * 1.25
    const hubY = bottom * 1.25 + r
    const reach = top - hubY
    const strut = new THREE.CylinderGeometry(r * 0.2, r * 0.26, reach, 10)
    geoms.push(strut)
    const sm = new THREE.Mesh(strut, metal)
    sm.position.set(x, hubY + reach / 2, z)
    group.add(sm)
    if (pair > 1) {
      const ax = new THREE.CylinderGeometry(r * 0.14, r * 0.14, gap * pair, 8)
      ax.rotateZ(Math.PI / 2)
      geoms.push(ax)
      const am = new THREE.Mesh(ax, metal)
      am.position.set(x, hubY, z)
      group.add(am)
    }
    const tg = new THREE.CylinderGeometry(r, r, thick, 18)
    tg.rotateZ(Math.PI / 2)
    const hg = new THREE.CylinderGeometry(r * 0.55, r * 0.55, thick * 1.08, 12)
    hg.rotateZ(Math.PI / 2)
    geoms.push(tg, hg)
    for (let i = 0; i < pair; i++) {
      const w = new THREE.Mesh(tg, tyre)
      w.add(new THREE.Mesh(hg, metal))
      w.position.set(x + (i - (pair - 1) / 2) * gap, hubY, z)
      group.add(w)
      wheels.push(w)
    }
  }
  for (const side of [-1, 1]) leg(side * track, -aft, big ? 2 : 1, radius)
  leg(0, length * 0.32, big ? 2 : 1, radius * 0.8)
  return { group, geoms, wheels, mats: [tyre, metal], drop: drop - mainTop, aft }
}

export interface PassState {
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  speed: number
}

export function passState(
  mode: FlybyMode,
  traveled: number,
  path: FlightPath,
  age: number,
  speedFactor = 1,
  belly = 0,
): PassState {
  const u = Math.max(0, Math.min(1, traveled / path.length))
  const pr = profileFor(mode, u, traveled - LANDING_TOUCH_D, traveled)
  const along = traveled - path.length / 2
  const x = path.x + along * path.dx
  const z = path.z + along * path.dz

  const y =
    mode === "landing" || mode === "takeoff"
      ? belly + pr.y
      : pr.y + Math.sin(age * 0.9) * 0.5

  return {
    x,
    y,
    z,
    heading: Math.atan2(path.dx, path.dz),
    pitch: pr.pitch,
    speed: pr.speed * speedFactor,
  }
}

export interface ShadowState {
  x: number
  y: number
  z: number
  span: number
  length: number
  heading: number
  alpha: number
}

export function shadowState(
  st: PassState,
  terrainAt?: TerrainAt,
  span = TARGET_SPAN,
  /** Ground shift of the shadow per metre of height, away from the light. */
  slope = { x: SUN_SHADOW_X, z: SUN_SHADOW_Z },
): ShadowState {
  const h = Math.max(0, st.y)
  const x = st.x + h * slope.x
  const z = st.z + h * slope.z
  const ground = terrainAt ? terrainAt(x, z) : 0
  return {
    x,
    y: ground + 0.06,
    z,
    span: span * (1 + h * 0.012),
    length: span * 0.9 * (1 + h * 0.012),
    heading: st.heading,
    alpha: 0.5 / (1 + h * 0.03),
  }
}

export function pathBlocked(
  path: FlightPath,
  mode: FlybyMode,
  terrainAt: TerrainAt,
  span = TARGET_SPAN,
  clearance = 6,
  extra = 0,
): boolean {
  const total = path.length + extra
  const start = mode === "landing" ? LANDING_START_D : 0
  const reach = total - start
  const samples = Math.max(16, Math.round(reach / 15))
  const half = span / 2
  const px = -path.dz
  const pz = path.dx
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const d = start + u * reach
    const along = d - path.length / 2
    const x = path.x + along * path.dx
    const z = path.z + along * path.dz
    const y = profileFor(
      mode,
      Math.min(1, Math.max(0, d / path.length)),
      d - LANDING_TOUCH_D,
      d,
    ).y
    const limit =
      mode === "landing"
        ? Math.max(0.3, y - LANDING_HILL_MARGIN)
        : mode === "takeoff"
          ? Math.max(0.3, y - clearance)
          : y - clearance
    if (terrainAt(x, z) > limit) return true
    if (half > 0) {
      if (terrainAt(x + px * half, z + pz * half) > limit) return true
      if (terrainAt(x - px * half, z - pz * half) > limit) return true
    }
  }
  return false
}

export function pickCrossing(
  base: number,
  mode: FlybyMode,
  pathFor: (s: number) => FlightPath,
  terrainAt: TerrainAt,
  carS: number,
  minLead: number,
  span = TARGET_SPAN,
  clearance = 6,
  extra = 0,
  alsoBlocked?: (s: number) => boolean,
): number {
  const offsets = [
    0, 70, -70, 140, -140, 210, -210, 300, -300, 400, -400, 520, -520,
  ]
  for (const off of offsets) {
    const s = base + off
    const ahead = s - carS
    if (minLead >= 0 ? ahead < minLead : ahead > minLead) continue
    if (
      !pathBlocked(pathFor(s), mode, terrainAt, span, clearance, extra) &&
      !alsoBlocked?.(s)
    )
      return s
  }
  return -1
}

export function prepareAircraft(
  model: THREE.Object3D,
  spec: AircraftSpec,
): { props: PropDisc[]; span: number; height: number; length: number } {
  model.updateMatrixWorld(true)

  let props: PropDisc[] = []
  if (spec.prop === "separate") {
    props = findProps(model)
  } else if (spec.prop === "merged") {
    const found = findMergedProp(model, spec)
    props = found ? [found] : []
  }

  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const spanSize =
    spec.spanAxis === "x" ? size.x : size.z
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

function findProps(model: THREE.Object3D): PropDisc[] {
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
    if (Math.abs(other[0] - other[1]) / Math.max(other[0], other[1]) > 0.25) return
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
  return kept
}

function findMergedProp(
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

function localNose(mesh: THREE.Mesh, nose: THREE.Vector3): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert()
  const rot = new THREE.Matrix4().extractRotation(inv)
  return nose.clone().applyMatrix4(rot).normalize()
}

function isBalancedProp(
  parts: { centre: THREE.Vector3 }[],
  dir: THREE.Vector3,
): boolean {
  if (parts.length < 2) return false
  const hub = new THREE.Vector3()
  for (const p of parts) hub.add(p.centre)
  hub.multiplyScalar(1 / parts.length)
  const perp = Math.abs(dir.x) < 0.9
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

function extractPropFromMesh(
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
    whole.expandByPoint(
      new THREE.Vector3().fromBufferAttribute(pos, i),
    )
  }
  const size = whole.getSize(new THREE.Vector3())
  const length = Math.max(
    Math.abs(size.x * dir.x) + Math.abs(size.y * dir.y) + Math.abs(size.z * dir.z),
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

function rawExtents(mesh: THREE.Mesh) {
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

function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 128
  c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(255,255,255,0.95)")
  grad.addColorStop(0.5, "rgba(255,255,255,0.5)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

let sharedGlowTexture: THREE.Texture | null = null

function getAirplaneLightGlowTexture(): THREE.Texture {
  sharedGlowTexture ??= makeGlowTexture([[0, 1], [0.1, 0.9], [0.28, 0.32], [0.55, 0.08], [1, 0]])
  return sharedGlowTexture
}

function buildAircraftLights(
  model: THREE.Object3D,
  span: number,
): {
  lightsRoot: THREE.Group
  strobes: THREE.Mesh[]
  beacons: THREE.Mesh[]
  geoms: THREE.BufferGeometry[]
  mats: THREE.Material[]
} {
  const lightsRoot = new THREE.Group()
  lightsRoot.name = "aircraftLights"
  const strobes: THREE.Mesh[] = []
  const beacons: THREE.Mesh[] = []
  const geoms: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxY = -Infinity
  let minY = Infinity
  const leftTip = new THREE.Vector3()
  const rightTip = new THREE.Vector3()
  const tailTip = new THREE.Vector3()
  const topFin = new THREE.Vector3()
  const tempV = new THREE.Vector3()

  model.updateMatrixWorld(true)
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.attributes.position
    if (!pos) return
    const step = pos.count > 5000 ? Math.ceil(pos.count / 2000) : 1
    for (let i = 0; i < pos.count; i += step) {
      tempV.fromBufferAttribute(pos, i)
      tempV.applyMatrix4(mesh.matrixWorld)
      if (tempV.x < minX) {
        minX = tempV.x
        leftTip.copy(tempV)
      }
      if (tempV.x > maxX) {
        maxX = tempV.x
        rightTip.copy(tempV)
      }
      if (tempV.z < minZ) {
        minZ = tempV.z
        tailTip.copy(tempV)
      }
      if (tempV.y > maxY) {
        maxY = tempV.y
        topFin.copy(tempV)
      }
      if (tempV.y < minY) {
        minY = tempV.y
      }
    }
  })

  const navRadius = Math.max(0.12, span * 0.009)
  const strobeRadius = navRadius * 1.35
  const beaconRadius = navRadius * 1.45

  const lens = (r: number) => {
    const g = new THREE.SphereGeometry(r, 20, 12)
    g.scale(1, 0.8, 1)
    return g
  }
  const navGeo = lens(navRadius)
  const strobeGeo = lens(strobeRadius)
  const beaconGeo = lens(beaconRadius)
  geoms.push(navGeo, strobeGeo, beaconGeo)

  const redMat = new THREE.MeshBasicMaterial({ color: 0xff1818, toneMapped: false })
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, toneMapped: false })
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2800, toneMapped: false })
  mats.push(redMat, greenMat, whiteMat, strobeMat, beaconMat)

  const glowTex = getAirplaneLightGlowTexture()
  const redGlowMat = fadeWithFog(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xff2020,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  const greenGlowMat = fadeWithFog(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0x00ff66,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  const whiteGlowMat = fadeWithFog(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffffff,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  const beaconGlowMat = fadeWithFog(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xff2200,
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  for (const m of [redGlowMat, greenGlowMat, whiteGlowMat, beaconGlowMat]) m.color.multiplyScalar(2.2)
  for (const m of [redMat, greenMat, whiteMat, strobeMat, beaconMat]) m.color.multiplyScalar(1.6)
  mats.push(redGlowMat, greenGlowMat, whiteGlowMat, beaconGlowMat)

  const navGlowScale = Math.max(1.6, span * 0.07)
  const strobeGlowScale = Math.max(3, span * 0.13)
  const beaconGlowScale = Math.max(2.6, span * 0.11)

  const portNav = new THREE.Mesh(navGeo, redMat)
  portNav.position.copy(leftTip)
  const portNavGlow = new THREE.Sprite(redGlowMat)
  portNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  portNav.add(portNavGlow)
  lightsRoot.add(portNav)

  const stbdNav = new THREE.Mesh(navGeo, greenMat)
  stbdNav.position.copy(rightTip)
  const stbdNavGlow = new THREE.Sprite(greenGlowMat)
  stbdNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  stbdNav.add(stbdNavGlow)
  lightsRoot.add(stbdNav)

  const tailNav = new THREE.Mesh(navGeo, whiteMat)
  tailNav.position.copy(tailTip)
  const tailNavGlow = new THREE.Sprite(whiteGlowMat)
  tailNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  tailNav.add(tailNavGlow)
  lightsRoot.add(tailNav)

  const portStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  portStrobe.position.set(leftTip.x * 1.01, leftTip.y, leftTip.z - 0.1)
  const portStrobeGlow = new THREE.Sprite(whiteGlowMat)
  portStrobeGlow.scale.set(strobeGlowScale, strobeGlowScale, 1)
  portStrobe.add(portStrobeGlow)
  lightsRoot.add(portStrobe)
  strobes.push(portStrobe)

  const stbdStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  stbdStrobe.position.set(rightTip.x * 1.01, rightTip.y, rightTip.z - 0.1)
  const stbdStrobeGlow = new THREE.Sprite(whiteGlowMat)
  stbdStrobeGlow.scale.set(strobeGlowScale, strobeGlowScale, 1)
  stbdStrobe.add(stbdStrobeGlow)
  lightsRoot.add(stbdStrobe)
  strobes.push(stbdStrobe)

  const topBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  topBeacon.position.copy(topFin)
  const topBeaconGlow = new THREE.Sprite(beaconGlowMat)
  topBeaconGlow.scale.set(beaconGlowScale, beaconGlowScale, 1)
  topBeacon.add(topBeaconGlow)
  lightsRoot.add(topBeacon)
  beacons.push(topBeacon)

  const bellyBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  bellyBeacon.position.set(0, minY + 0.15, (leftTip.z + tailTip.z) * 0.45)
  const bellyBeaconGlow = new THREE.Sprite(beaconGlowMat)
  bellyBeaconGlow.scale.set(beaconGlowScale, beaconGlowScale, 1)
  bellyBeacon.add(bellyBeaconGlow)
  lightsRoot.add(bellyBeacon)
  beacons.push(bellyBeacon)

  return { lightsRoot, strobes, beacons, geoms, mats }
}

export class AirplaneFlyby {
  private terrainAt: TerrainAt

  private aircraft: LoadedAircraft[] = []
  private shadowRoot = new THREE.Group()
  private shadow: THREE.Mesh
  private shadowMat: THREE.MeshBasicMaterial
  private geoms: THREE.BufferGeometry[] = []
  private flight: Flight | null = null
  private scene: THREE.Scene | null = null
  private airport: {
    view: AirportView
    landing: FlightPath
    takeoff: FlightPath
  } | null = null
  private retiring: AirportView[] = []
  private lastAirportMode: FlybyMode = "takeoff"
  private lampsLit = false
  private onClearZones: ((zones: ClearZone[]) => void) | null = null
  private timer = 0
  private nextIn = 0
  private ready = false
  private disposed = false

  setClearZonesHandler(fn: (zones: ClearZone[]) => void) {
    this.onClearZones = fn
  }

  private pushClearZones() {
    const views = [
      ...(this.airport ? [this.airport.view] : []),
      ...this.retiring,
    ]
    this.onClearZones?.(views.flatMap((v) => v.layout.zones))
  }

  private retireAirport() {
    if (!this.airport) return
    this.airport.view.target = 0
    this.retiring.push(this.airport.view)
    this.airport = null
  }

  constructor(terrainAt: TerrainAt) {
    this.terrainAt = terrainAt
    const geo = new THREE.PlaneGeometry(1, 1)
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: makeShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    this.shadow = new THREE.Mesh(geo, this.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.frustumCulled = false
    this.shadowRoot.add(this.shadow)
    this.shadowRoot.visible = false
  }

  async init(scene: THREE.Scene, baseUrl: string): Promise<boolean> {
    for (const spec of AIRCRAFT) {
      try {
        const glb = await new GLTFLoader().loadAsync(
          `${baseUrl}models/${spec.file}`,
        )
        const model = glb.scene
        model.updateMatrixWorld(true)

        const { props, span, height, length } = prepareAircraft(model, spec)
        const mats = this.prepareFade(model)
        // the aircraft throws a real shadow whenever it is inside the light's shadow map
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) mesh.castShadow = true
        })

        if (this.disposed) return false

        const body = new THREE.Group()
        const root = new THREE.Group()
        body.add(model)
        root.add(body)
        root.visible = false
        scene.add(root)

        const {
          lightsRoot,
          strobes,
          beacons,
          geoms: lightGeoms,
          mats: lightMats,
        } = buildAircraftLights(model, span)
        lightsRoot.visible = true
        body.add(lightsRoot)

        const gear = buildGear(model, span, height, length, spec.gear !== false)
        body.add(gear.group)
        mats.push(...gear.mats)

        this.aircraft.push({
          spec,
          root,
          body,
          props,
          mats,
          span,
          clearance: height / 2 + 1,
          gearDrop: gear.drop,
          gearAft: gear.aft,
          gear: gear.group,
          gearGeoms: gear.geoms,
          wheels: gear.wheels,
          lightsRoot,
          strobes,
          beacons,
          lightGeoms,
          lightMats,
        })
      } catch (e) {
        console.warn(`${spec.file} failed to load, no flyby for it`, e)
      }
    }

    warmAirportTextures()
    warmStructureTextures()

    if (this.disposed) return false
    if (this.aircraft.length === 0) return false
    scene.add(this.shadowRoot)
    this.scene = scene

    this.ready = true
    this.nextIn = FIRST_GAP_MIN + Math.random() * (FIRST_GAP_MAX - FIRST_GAP_MIN)
    return true
  }

  private prepareFade(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    const mats: THREE.MeshStandardMaterial[] = []
    const cloneOf = (m: THREE.Material) => {
      let c = clones.get(m)
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone()
        c.transparent = false
        c.fog = true
        clones.set(m, c)
        mats.push(c)
      }
      return c
    }
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(cloneOf)
        : cloneOf(mesh.material)
      const g = mesh.geometry as THREE.BufferGeometry
      if (g && !this.geoms.includes(g)) this.geoms.push(g)
    })
    return mats
  }

  update(
    dt: number,
    carS: number,
    carSpeed: number,
    active: boolean,
    carXWorld?: number,
  ) {
    const carX = carXWorld ?? roadCenterX(carS)
    if (!this.ready) return
    if (!active) {
      this.endFlight()
      this.retireAirport()
      this.tickAirports(dt)
      this.timer = 0
      return
    }

    this.tickAirports(dt)
    if (this.airport && !this.flight) {
      const l = this.airport.view.layout
      const d = Math.hypot(l.cx - carX, l.cz + carS)
      if (d > AIRPORT_VIEW_DIST) this.retireAirport()
    }

    this.timer += dt
    if (!this.flight && this.timer >= this.nextIn) {
      this.startFlight(carS, carSpeed, carX)
    }

    const f = this.flight
    if (!f) {
      this.shadowRoot.visible = false
      return
    }

    const ac = f.ac
    const holding = f.mode === "takeoff" && f.age < TAKEOFF_HOLD
    if (!holding) f.traveled += f.speed * dt
    f.age += dt
    f.u = Math.max(0, Math.min(1, f.traveled / f.path.length))
    const rolled = f.traveled - LANDING_TOUCH_D
    const pr = profileFor(f.mode, f.u, rolled, f.traveled)
    f.speed = holding ? 0 : pr.speed * ac.spec.speed
    if (f.mode === "landing" && rolled >= LANDING_STOP_DIST - 1) f.stopped += dt

    let alpha = 1
    if (f.mode === "takeoff") alpha = Math.min(1, f.age / FADE_TIME)
    if (f.mode === "landing" && f.stopped > LANDING_DWELL) {
      alpha = Math.max(0, 1 - (f.stopped - LANDING_DWELL) / FADE_TIME)
    }
    this.setAircraftAlpha(ac, alpha)

    const st = passState(f.mode, f.traveled, f.path, f.age, ac.spec.speed, ac.clearance - 1 + ac.gearDrop)
    const lifting = f.mode !== "cruise" ? st.pitch : 0
    const pivotLift = f.mode === "cruise" ? 0 : ac.gearAft * Math.sin(lifting) - (ac.clearance - 1 + ac.gearDrop) * (1 - Math.cos(lifting))
    ac.root.position.set(st.x, st.y + pivotLift, st.z)
    ac.root.rotation.y = st.heading
    this.hazeAircraft(ac)

    const sway = Math.sin(f.age * 0.55) * 0.6 + Math.sin(f.age * 1.3) * 0.25
    const level =
      f.mode === "landing" ||
      (f.mode === "takeoff" && f.traveled < TAKEOFF_LIFTOFF_D + 30)
    ac.body.rotation.x = -st.pitch
    ac.body.rotation.z = f.mode !== "cruise" ? 0 : (sway * 2.2 - 2) * DEG
    ac.body.rotation.y = 0
    void level

    let down = 1
    if (f.mode === "cruise") down = 0
    else if (f.mode === "takeoff") {
      const x = f.traveled - f.path.length / 2
      const q = Math.min(1, Math.max(0, x / 90))
      down = 1 - q * q * (3 - 2 * q)
    }
    ac.gear.visible = down > 0.02 && ac.wheels.length > 0
    ac.gear.scale.set(1, Math.max(0.01, down), 1)
    const spin = (f.speed / 0.6) * dt
    for (const w of ac.wheels) w.rotation.x += spin

    this.updateShadow(st, ac.span, carX, carS)

    const turn = (16 + f.speed * 0.2) * dt
    for (const p of ac.props) {
      p.node.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(p.axis, turn),
      )
    }

    const strobeCycle = f.age % 1.0
    const strobeActive =
      strobeCycle < 0.08 || (strobeCycle > 0.16 && strobeCycle < 0.24)
    for (let i = 0; i < ac.strobes.length; i++) {
      ac.strobes[i].visible = strobeActive
    }

    const beaconCycle = (f.age + 0.3) % 1.2
    const beaconActive = beaconCycle < 0.14
    for (let i = 0; i < ac.beacons.length; i++) {
      ac.beacons[i].visible = beaconActive
    }

    if (f.mode === "landing") {
      if (f.stopped >= LANDING_DWELL + FADE_TIME) this.endFlight()
    } else if (f.traveled >= f.path.length + exitLen(f.mode)) {
      this.endFlight()
    }
  }

  private sunSource: (() => { x: number; y: number; z: number }) | null = null

  /** Where the light (sun by day, moon by night) is, relative to the ground below it. */
  setSunSource(fn: () => { x: number; y: number; z: number }) {
    this.sunSource = fn
  }

  private updateShadow(st: PassState, span: number, carX: number, carS: number) {
    let slope: { x: number; z: number } | undefined
    const sun = this.sunSource?.()
    if (sun) {
      const up = Math.max(sun.y, 20)
      slope = { x: -sun.x / up, z: -sun.z / up }
    }
    const sh = shadowState(st, this.terrainAt, span, slope)
    this.shadowRoot.visible = true
    this.shadowRoot.position.set(sh.x, sh.y, sh.z)
    this.shadowRoot.rotation.y = sh.heading
    this.shadow.scale.set(sh.span, sh.length, 1)
    // Near the car the light's own shadow map shows the aircraft's real
    // shadow; the soft patch takes over where that does not reach.
    const d = Math.hypot(sh.x - carX, sh.z + carS)
    const k = Math.min(1, Math.max(0, (d - SHADOW_MAP_NEAR) / (SHADOW_MAP_FAR - SHADOW_MAP_NEAR)))
    this.shadowMat.opacity = sh.alpha * k * k * (3 - 2 * k)
  }

  private startFlight(carS: number, carSpeed: number, carX: number) {
    if (this.aircraft.length === 0) return

    const ap = this.airport
    if (ap) {
      const l = ap.view.layout
      const d = Math.hypot(l.cx - carX, l.cz + carS)
      if (d < AIRPORT_STAY_DIST) {
        const want: FlybyMode = this.lastAirportMode === "landing" ? "takeoff" : "landing"
        const pool = this.aircraft.filter((a) => a.spec.modes.includes(want))
        if (pool.length > 0) {
          const ac = pool[Math.floor(Math.random() * pool.length)]
          this.lastAirportMode = want
          this.beginFlight(want, ac, want === "landing" ? ap.landing : ap.takeoff)
          return
        }
      }
    }

    const ac = this.aircraft[
      Math.floor(Math.random() * this.aircraft.length)
    ]
    const modes = ac.spec.modes
    const mode = modes[Math.floor(Math.random() * modes.length)]
    const atAirport = mode !== "cruise"
    const minAngle = atAirport ? AIRPORT_MIN_ANGLE : MIN_ANGLE
    const theta = (minAngle + Math.random() * (MAX_ANGLE - minAngle)) * DEG
    const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const drift: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const landingFor = (s: number) => makePath(s, theta, side, drift)
    const takeoffFor = (s: number) => makePath(s, theta, -side as 1 | -1, drift)
    const pathFor = mode === "takeoff" ? takeoffFor : landingFor

    const flightTime = mode === "takeoff" ? 22 : mode === "landing" ? 17 : PASS_HALF / 52
    const baseLead = mode === "cruise" ? CRUISE_LEAD : CROSS_LEAD
    const lead = Math.max(
      -MAX_LEAD,
      Math.min(baseLead + carSpeed * flightTime, MAX_LEAD),
    )
    const base = carS + lead

    const span = atAirport ? Math.max(...this.aircraft.map((a) => a.span)) : ac.span
    const clearance = atAirport
      ? Math.max(...this.aircraft.map((a) => a.clearance))
      : ac.clearance
    const other: FlybyMode = mode === "landing" ? "takeoff" : "landing"
    const otherFor = mode === "landing" ? takeoffFor : landingFor
    const airfieldBlocked = (s: number) =>
      airportBlocked(layoutAirport(landingFor(s)), this.terrainAt) ||
      pathBlocked(otherFor(s), other, this.terrainAt, span, clearance, exitLen(other))

    const sCross = pickCrossing(
      base,
      mode,
      pathFor,
      this.terrainAt,
      carS,
      lead * 0.35,
      span,
      clearance,
      exitLen(mode),
      atAirport ? airfieldBlocked : undefined,
    )
    if (sCross < 0) {
      this.timer = 0
      this.nextIn = 2 + Math.random() * 3
      return
    }

    this.retireAirport()
    if (atAirport && this.scene) {
      const landing = landingFor(sCross)
      const view = new AirportView(layoutAirport(landing))
      this.scene.add(view.group)
      view.lit = this.lampsLit
      this.airport = { view, landing, takeoff: takeoffFor(sCross) }
      this.lastAirportMode = mode
    }
    this.pushClearZones()
    this.beginFlight(mode, ac, pathFor(sCross))
  }

  private beginFlight(mode: FlybyMode, ac: LoadedAircraft, path: FlightPath) {
    for (const other of this.aircraft) other.root.visible = false
    ac.root.visible = true
    const start =
      mode === "takeoff" ? TAKEOFF_START_D : mode === "landing" ? LANDING_START_D : 0
    this.flight = {
      mode,
      ac,
      path,
      traveled: start,
      u: 0,
      speed: profileFor(mode, 0, 0, start).speed * ac.spec.speed,
      age: 0,
      stopped: 0,
    }
  }

  private setAircraftAlpha(ac: LoadedAircraft, a: number) {
    const fading = a < 0.999
    for (const m of ac.mats) {
      const base = (m.userData.baseOpacity ??= m.opacity) as number
      m.transparent = fading
      m.opacity = base * a
    }
    ac.lightsRoot.visible = a > 0.6
  }

  private hazeAircraft(ac: LoadedAircraft) {
    for (const m of ac.mats) {
      m.emissive.setScalar(0)
    }
  }

  private tickAirports(dt: number) {
    this.airport?.view.step(dt)
    let changed = false
    this.retiring = this.retiring.filter((v) => {
      if (!v.step(dt)) return true
      v.dispose()
      changed = true
      return false
    })
    if (changed) this.pushClearZones()
  }

  private endFlight() {
    if (!this.flight) return
    this.setAircraftAlpha(this.flight.ac, 1)
    this.flight.ac.root.visible = false
    this.flight = null
    this.shadowRoot.visible = false
    this.shadowMat.opacity = 0
    this.timer = 0
    this.nextIn = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.lampsLit = mode !== "day"
    if (this.airport) this.airport.view.lit = this.lampsLit
    for (const v of this.retiring) v.lit = this.lampsLit
    for (const ac of this.aircraft) {
      ac.lightsRoot.visible = true
    }
  }

  dispose() {
    this.disposed = true
    this.retireAirport()
    for (const v of this.retiring) v.dispose()
    this.retiring.length = 0
    this.pushClearZones()
    for (const ac of this.aircraft) {
      ac.root.removeFromParent()
      for (const m of ac.mats) m.dispose()
      ac.mats.length = 0
      ac.props.length = 0
      ac.lightsRoot.removeFromParent()
      for (const g of ac.gearGeoms) g.dispose()
      ac.gearGeoms.length = 0
      ac.wheels.length = 0
      for (const g of ac.lightGeoms) g.dispose()
      for (const m of ac.lightMats) m.dispose()
      ac.lightGeoms.length = 0
      ac.lightMats.length = 0
      ac.strobes.length = 0
      ac.beacons.length = 0
    }
    this.aircraft.length = 0
    this.shadowRoot.removeFromParent()
    this.shadow.geometry.dispose()
    this.shadowMat.map?.dispose()
    this.shadowMat.dispose()
    for (const g of this.geoms) g.dispose()
    this.geoms.length = 0
    this.ready = false
  }
}
