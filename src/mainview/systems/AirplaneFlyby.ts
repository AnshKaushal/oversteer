import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { roadCenterX, roadYaw } from "./WorldManager"
import { type TimeOfDayMode, isLowLight } from "../constants/timeOfDay"

/**
 * Set dressing: a twin-turboprop transport that periodically crosses the
 * road, either just after take-off or on final approach.
 *
 * The pass is entirely kinematic — nothing about it touches the simulation.
 * Each pass picks a random line through the road, anywhere between 20 and
 * 90 degrees to it, and flies that line from one side to the other. The
 * line is fixed for the whole pass: it does not slide along with the car.
 * The crossing point is chosen once, ahead of the player, and the aircraft
 * fades in out of the haze as it approaches and dissolves back into it as
 * it goes away.
 */

/**
 * Wingspan in metres. The stock model spans 34.9 m and is 32.7 m long, so
 * this lands it as a heavy transport rather than a light aircraft.
 */
export const TARGET_SPAN = 36
/** How far ahead of the car, along the road, the crossing happens. */
export const CROSS_LEAD = 120
/** Lateral distance from the road centre at each end of the pass. */
export const PASS_HALF = 400
/** Total length of a pass, from one end to the other. */
export const PASS_LENGTH = PASS_HALF * 2
/**
 * How far past the end of its path the aircraft keeps flying before the
 * pass is over. It is deep in the haze by then, so it can simply be
 * switched off rather than faded away.
 */
const EXIT_LEN = 400
/** How far ahead of the car the crossing may be pushed for a fast car. */
const MAX_LEAD = 700
/** Seconds between passes once one has finished. */
const MIN_GAP = 8
const MAX_GAP = 10
/** Seconds until the first pass of a session. */
const FIRST_GAP_MIN = 5
const FIRST_GAP_MAX = 5

/**
 * Smallest angle to the road a pass may use, in degrees.
 */
const MIN_ANGLE = 20
/** Largest angle to the road a pass may use, in degrees. */
const MAX_ANGLE = 90
/**
 * Height of a cruising aircraft. The cloud layer sits between 53 m and
 * 127 m, so this is above the weather and the aircraft is seen against
 * open sky.
 */
export const CRUISE_ALT = 145
/**
 * How far ahead of the car a cruise crosses. A plane this high would sit
 * right at the top of the frame if it crossed at the usual distance, so
 * it crosses further down the road where it is still comfortably in shot.
 */
export const CRUISE_LEAD = 380
/**
 * The sun sits 180 m up and 120 m east / 60 m north of the scene, so a
 * shadow on the ground slides that far sideways for every metre of
 * altitude.
 */
const SUN_SHADOW_X = 120 / 180
const SUN_SHADOW_Z = 60 / 180

const DEG = Math.PI / 180

export type FlybyMode = "takeoff" | "landing" | "cruise"

/**
 * One kind of aircraft: how big it is, how the file is turned, how fast
 * it flies and what it is allowed to do.
 */
export interface AircraftSpec {
  /** The GLB in the models folder. */
  file: string
  /** Wingspan in metres. The model is scaled to this. */
  span: number
  /** Which axis of the model file the wingspan runs along. */
  spanAxis: "x" | "z"
  /** Yaw that turns the model so its nose points along +Z. */
  yaw: number
  /** Multiplies the speed of the flight profile. */
  speed: number
  /** The manoeuvres this aircraft can make. */
  modes: FlybyMode[]
  /** Where the propeller is, if it has one. */
  prop: "separate" | "merged" | "none"
}

/**
 * The traffic. A pass picks one of these at random, so the sky is never
 * the same twice.
 *
 * The transport is a twin-turboprop, 36 m across, and its file is
 * authored nose-towards -X with the span along Z, so it needs a quarter
 * turn. The Globemaster is a 52 m four-engined jet, authored nose-towards
 * +Z. The Cessna is a light aircraft with a two-blade propeller that is
 * baked into the body mesh.
 */
export const AIRCRAFT: AircraftSpec[] = [
  {
    file: "airplane.glb",
    span: 36,
    spanAxis: "z",
    yaw: Math.PI / 2,
    speed: 1,
    modes: ["takeoff", "landing", "cruise"],
    prop: "separate",
  },
  {
    file: "c17_globemaster.glb",
    span: 52,
    spanAxis: "x",
    yaw: 0,
    speed: 1.2,
    modes: ["takeoff", "cruise", "landing"],
    prop: "none",
  },
  {
    file: "cessna_172.glb",
    span: 18,
    spanAxis: "x",
    yaw: 0,
    speed: 0.85,
    modes: ["takeoff", "landing", "cruise"],
    prop: "merged",
  },
]

/** A spinning part and the axis it spins about in its own space. */
export interface PropDisc {
  /** The thing that turns. */
  node: THREE.Object3D
  /** The axis it turns about. */
  axis: THREE.Vector3
}

/** An aircraft that has been loaded, turned and prepared for the pass. */
export interface LoadedAircraft {
  spec: AircraftSpec
  /** Yaw frame: positioned on the road every frame. */
  root: THREE.Group
  /** Pitch and roll live here so the yaw frame stays level. */
  body: THREE.Group
  /** The propeller parts, spun about their own axis. */
  props: PropDisc[]
  /** The materials, cloned so the pass can fade them. */
  mats: THREE.MeshStandardMaterial[]
  /** Wingspan in metres. */
  span: number
  /**
   * How far below the flight path the ground has to stay. The path is
   * the aircraft's centre line, so its belly hangs this far below.
   */
  clearance: number
  /** Container for aircraft navigation and strobe lights. */
  lightsRoot: THREE.Group
  /** Flashing wingtip strobes. */
  strobes: THREE.Mesh[]
  /** Flashing anti-collision beacons. */
  beacons: THREE.Mesh[]
  lightGeoms: THREE.BufferGeometry[]
  lightMats: THREE.Material[]
}

/** Reports the height of the ground at a world position. */
export type TerrainAt = (x: number, z: number) => number

/**
 * A flight path: a straight line through the road, at an angle to it.
 */
export interface FlightPath {
  /** The point on the road the aircraft crosses. */
  x: number
  z: number
  /** Unit direction of the path in the XZ plane. */
  dx: number
  dz: number
  /** How long the path is, in metres. */
  length: number
  /** The angle between the path and the road, in radians. */
  theta: number
}

interface Flight {
  mode: FlybyMode
  /** The aircraft flying this pass. */
  ac: LoadedAircraft
  /** The line the aircraft flies. Fixed for the whole pass. */
  path: FlightPath
  /** Distance flown along the pass, in metres. */
  traveled: number
  /** 0..1 along the pass. */
  u: number
  /** Airspeed in m/s. */
  speed: number
  /** Seconds since the pass started. */
  age: number
}

interface Profile {
  /** Height of the fuselage above the road, in metres. */
  y: number
  /** Airspeed in m/s. */
  speed: number
  /** Pitch in radians, positive is nose up. */
  pitch: number
}

/**
 * Flight profile for a pass. `u` runs from the start of the pass to the
 * far side of the road.
 */
function profileFor(mode: FlybyMode, u: number): Profile {
  if (mode === "takeoff") {
    // Rotating off the deck: low over the trees, climbing away as it crosses.
    return {
      y: 12 + 40 * Math.pow(u, 0.75),
      speed: 44 + 20 * u,
      pitch: 13 * Math.pow(1 - u, 1.6) * DEG,
    }
  }
  if (mode === "landing") {
    // On final approach: high and fast at the start, nose down and slow
    // as it drops over the treeline.
    return {
      y: 50 - 42 * Math.pow(u, 1.7),
      speed: 58 - 18 * u,
      pitch: (-1.5 - 6 * Math.pow(u, 1.8)) * DEG,
    }
  }
  return {
    y: CRUISE_ALT,
    speed: 56,
    pitch: 0,
  }
}

/**
 * Builds the line the aircraft flies: a straight path through the point
 * where it crosses the road, at `theta` to the road's direction of travel.
 *
 * `side` picks which side of the road it comes from and `drift` whether
 * it slides along the road as it crosses, so a shallow pass can sweep in
 * from down the road or drift away down it.
 */
export function makePath(
  sCross: number,
  theta: number,
  side: 1 | -1,
  drift: 1 | -1,
  length = PASS_LENGTH,
): FlightPath {
  const yaw = roadYaw(sCross)
  // The road's normal and its direction of travel, both unit vectors and
  // perpendicular to each other.
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

export interface PassState {
  x: number
  y: number
  z: number
  /** Yaw of the nose, radians, in the world XZ plane. */
  heading: number
  /** Pitch in radians, positive is nose up. */
  pitch: number
  /** Airspeed in m/s. */
  speed: number
}

/**
 * Where the aircraft is at a point along a pass. Pure maths so it can be
 * checked without a renderer: the path is fixed for the whole pass and
 * the aircraft simply flies along it.
 */
export function passState(
  mode: FlybyMode,
  traveled: number,
  path: FlightPath,
  age: number,
  speedFactor = 1,
): PassState {
  const u = Math.max(0, Math.min(1, traveled / path.length))
  const pr = profileFor(mode, u)
  const along = traveled - path.length / 2

  return {
    x: path.x + along * path.dx,
    y: pr.y + Math.sin(age * 0.9) * 0.5,
    z: path.z + along * path.dz,
    heading: Math.atan2(path.dx, path.dz),
    pitch: pr.pitch,
    speed: pr.speed * speedFactor,
  }
}

/**
 * The aircraft's shadow on the ground: a soft patch offset along the sun,
 * spreading and fading as the aircraft climbs.
 */
export interface ShadowState {
  x: number
  y: number
  z: number
  /** Length of the shadow along the aircraft's span. */
  span: number
  /** Width of the shadow along the aircraft's length. */
  length: number
  /** Yaw of the shadow, matching the aircraft. */
  heading: number
  alpha: number
}

export function shadowState(
  st: PassState,
  terrainAt?: TerrainAt,
  span = TARGET_SPAN,
): ShadowState {
  const h = Math.max(0, st.y)
  const x = st.x + h * SUN_SHADOW_X
  const z = st.z + h * SUN_SHADOW_Z
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

/**
 * Whether the flight path would clip a hill.
 *
 * The whole aircraft has to clear the ground, not just the fuselage: the
 * wingtips are half a span either side of the line, and the Globemaster
 * is 52 m across. The height of the path is the height of the
 * aircraft's centre, so the belly is a clearance below it.
 */
export function pathBlocked(
  path: FlightPath,
  mode: FlybyMode,
  terrainAt: TerrainAt,
  span = TARGET_SPAN,
  clearance = 6,
  extra = 0,
): boolean {
  // The path is long, so it has to be sampled finely or a hill can slip
  // between two samples. `extra` is the distance the aircraft keeps
  // flying past the end of the path, which has to be clear as well.
  const total = path.length + extra
  const samples = Math.max(16, Math.round(total / 15))
  const half = span / 2
  // The direction across the path.
  const px = -path.dz
  const pz = path.dx
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const along = u * total - total / 2
    const x = path.x + along * path.dx
    const z = path.z + along * path.dz
    const y = profileFor(mode, Math.min(1, u * total / path.length)).y
    if (terrainAt(x, z) > y - clearance) return true
    if (half > 0) {
      if (terrainAt(x + px * half, z + pz * half) > y - clearance) return true
      if (terrainAt(x - px * half, z - pz * half) > y - clearance) return true
    }
  }
  return false
}

/**
 * Picks the point on the road the aircraft should cross.
 *
 * The preferred spot is `base`, but if a hill is in the way the crossing
 * is moved along the road — forwards first, so the pass still happens
 * ahead of the player — until the path is clear. The crossing is never
 * moved to the far side of the car.
 *
 * Returns -1 when no crossing along the road is clear: there is no point
 * flying through a hill.
 */
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
): number {
  const offsets = [
    0, 70, -70, 140, -140, 210, -210, 300, -300, 400, -400, 520, -520,
  ]
  for (const off of offsets) {
    const s = base + off
    const ahead = s - carS
    if (minLead >= 0 ? ahead < minLead : ahead > minLead) continue
    if (!pathBlocked(pathFor(s), mode, terrainAt, span, clearance, extra)) return s
  }
  return -1
}

/**
 * Scales, turns and re-centres the loaded model, and works out which parts
 * of it are propellers.
 *
 * Each aircraft is different: the transport is authored nose-towards -X
 * with the span along Z, the other two nose-towards +Z with the span
 * along X. The spec says which, and the model is scaled so that its span
 * is the size the aircraft really is.
 */
export function prepareAircraft(
  model: THREE.Object3D,
  spec: AircraftSpec,
): { props: PropDisc[]; span: number; height: number } {
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

  // Re-centre so the group origin sits on the middle of the fuselage.
  model.updateMatrixWorld(true)
  const c = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
  model.position.set(-c.x, -c.y, -c.z)
  model.updateMatrixWorld(true)
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y
  return { props, span: spec.span, height }
}

/**
 * Finds the parts of the model that spin with the propellers.
 *
 * A propeller is a thin disc: in the mesh's own space it is a flat plate
 * whose other two extents match. The spinner cone in front of it matches
 * too; the turbine disc behind the engine does not get the same treatment
 * because it sits at the back of the nacelle rather than the front.
 *
 * The disc is spun about the thin axis of its own geometry, so no
 * reparenting is needed and the node's own rotation cannot shear it.
 */
function findProps(model: THREE.Object3D): PropDisc[] {
  const groups = new Map<THREE.Object3D, PropDisc[]>()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const raw = rawExtents(mesh)
    if (!raw) return
    const { x, y, z } = raw
    // Thin on one axis, round on the other two.
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

  // Keep the discs that sit at the front of a compact engine pod. The
  // fuselage carries a disc of its own (the nose cone) but it is a long
  // group, not an engine, so it is left alone.
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

/**
 * Pulls a propeller out of a body that has it baked in.
 *
 * The Cessna is a single merged mesh, so its two blades are islands of
 * geometry inside the fuselage. They are found by shape — a thin plate
 * whose other two extents are of the same order, big enough to be a
 * blade, and sitting at the front of the aircraft — and then cut out into
 * a mesh of their own, hung on a pivot at the hub so the whole prop can
 * turn about the thrust axis.
 */
function findMergedProp(
  model: THREE.Object3D,
  spec: AircraftSpec,
): PropDisc | null {
  model.updateMatrixWorld(true)
  // Where the nose points, in the model's own space.
  const nose = new THREE.Vector3(-Math.sin(spec.yaw), 0, Math.cos(spec.yaw))
  for (const o of model.children) {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      const found = extractPropFromMesh(mesh, nose)
      if (found) return found
    }
  }
  // The mesh may be nested, so look deeper.
  let hit: PropDisc | null = null
  model.traverse((o) => {
    if (hit) return
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    hit = extractPropFromMesh(mesh, nose)
  })
  return hit
}

/** The nose direction in a mesh's own space. */
function localNose(mesh: THREE.Mesh, nose: THREE.Vector3): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert()
  const rot = new THREE.Matrix4().extractRotation(inv)
  return nose.clone().applyMatrix4(rot).normalize()
}

/**
 * Whether a set of parts is arranged like a propeller: they sit around a
 * common hub, with something on both sides of it. A windscreen or a
 * tailplane is a single piece on the centreline and fails this, a pair of
 * opposed blades does not.
 */
function isBalancedProp(
  parts: { centre: THREE.Vector3 }[],
  dir: THREE.Vector3,
): boolean {
  if (parts.length < 2) return false
  const hub = new THREE.Vector3()
  for (const p of parts) hub.add(p.centre)
  hub.multiplyScalar(1 / parts.length)
  // The two axes across the thrust axis.
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

/**
 * Cuts the propeller out of one mesh and hangs it on a pivot.
 */
function extractPropFromMesh(
  mesh: THREE.Mesh,
  nose: THREE.Vector3,
): PropDisc | null {
  const geo = mesh.geometry as THREE.BufferGeometry
  const index = geo.getIndex()
  const pos = geo.getAttribute("position")
  if (!index || !pos) return null
  if (geo.groups.length > 0) return null

  // Islands of geometry: vertices joined through shared triangles.
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
  // The length of the aircraft along its own axis, and where the nose is.
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

  // Look at every island: a blade is a thin plate whose other two
  // extents are of the same order, and it has to be at the front of the
  // aircraft — that is where the engine and the prop are.
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

  // The blades of one prop are all the same size, so they group
  // together. Take the biggest group at the front of the aircraft.
  candidates.sort((a, b) => b.big - a.big)
  const groups: Candidate[][] = []
  for (const c of candidates) {
    const g = groups[groups.length - 1]
    if (g && c.big >= g[0].big * 0.95) g.push(c)
    else groups.push([c])
  }
  const blades = groups.find((g) => isBalancedProp(g, dir))
  if (!blades) return null

  // The hub is the middle of the blades, which for an opposed pair is
  // the axis the prop turns about.
  const hub = new THREE.Vector3()
  for (const b of blades) hub.add(b.centre)
  hub.multiplyScalar(1 / blades.length)

  // Cut the blade triangles out of the body.
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

  // The body keeps everything but the blades.
  geo.setIndex(
    new THREE.BufferAttribute(
      new (keepTris.length > 65535 ? Uint32Array : Uint16Array)(keepTris),
      1,
    ),
  )

  // The blades become a mesh of their own, with the same attributes.
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
  // The pivot sits at the hub, so the blades shift back by the same
  // amount to stay where they were.
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

/** Extents of a mesh's own geometry, ignoring any node transform. */
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

/** A soft round patch used for the aircraft's shadow. */
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

/**
 * Builds standard FAA / ICAO aircraft navigation and strobe lights:
 * - Port (left) wingtip: Steady Red
 * - Starboard (right) wingtip: Steady Green
 * - Tail cone: Steady White
 * - Wingtip strobes: High-intensity double-flashing White
 * - Vertical stabilizer & belly beacons: Flashing Red
 */
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

  // Dimensions scaled so lights remain visible and crisp across flight altitudes
  const navRadius = Math.max(0.35, span * 0.016)
  const strobeRadius = navRadius * 1.35
  const beaconRadius = navRadius * 1.45

  const navGeo = new THREE.SphereGeometry(navRadius, 8, 8)
  const strobeGeo = new THREE.SphereGeometry(strobeRadius, 8, 8)
  const beaconGeo = new THREE.SphereGeometry(beaconRadius, 8, 8)
  geoms.push(navGeo, strobeGeo, beaconGeo)

  // toneMapped: false ensures maximum emissive output in HDR tone mapping
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff1818, toneMapped: false })
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, toneMapped: false })
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2800, toneMapped: false })
  mats.push(redMat, greenMat, whiteMat, strobeMat, beaconMat)

  // 1. Port wingtip steady Red
  const portNav = new THREE.Mesh(navGeo, redMat)
  portNav.position.copy(leftTip)
  lightsRoot.add(portNav)

  // 2. Starboard wingtip steady Green
  const stbdNav = new THREE.Mesh(navGeo, greenMat)
  stbdNav.position.copy(rightTip)
  lightsRoot.add(stbdNav)

  // 3. Tail cone steady White
  const tailNav = new THREE.Mesh(navGeo, whiteMat)
  tailNav.position.copy(tailTip)
  lightsRoot.add(tailNav)

  // 4. Wingtip flashing White strobes
  const portStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  portStrobe.position.set(leftTip.x * 1.01, leftTip.y, leftTip.z - 0.1)
  lightsRoot.add(portStrobe)
  strobes.push(portStrobe)

  const stbdStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  stbdStrobe.position.set(rightTip.x * 1.01, rightTip.y, rightTip.z - 0.1)
  lightsRoot.add(stbdStrobe)
  strobes.push(stbdStrobe)

  // 5. Flashing Red beacons (top fin & fuselage belly)
  const topBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  topBeacon.position.copy(topFin)
  lightsRoot.add(topBeacon)
  beacons.push(topBeacon)

  const bellyBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  bellyBeacon.position.set(0, minY + 0.15, (leftTip.z + tailTip.z) * 0.45)
  lightsRoot.add(bellyBeacon)
  beacons.push(bellyBeacon)

  return { lightsRoot, strobes, beacons, geoms, mats }
}

export class AirplaneFlyby {
  /** Reports the height of the ground, used to keep the path off hills. */
  private terrainAt: TerrainAt

  /** Every aircraft that loaded, ready to fly. */
  private aircraft: LoadedAircraft[] = []
  /** Carries the shadow so it can be yawed with the aircraft. */
  private shadowRoot = new THREE.Group()
  private shadow: THREE.Mesh
  private shadowMat: THREE.MeshBasicMaterial
  private geoms: THREE.BufferGeometry[] = []
  private flight: Flight | null = null
  private timer = 0
  private nextIn = 0
  private ready = false
  private disposed = false
  private isLowLight = false

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

  /**
   * Loads the traffic and prepares the scene graph. Failures are
   * swallowed per aircraft: one missing model must never take the game
   * down, and the rest of the traffic still flies.
   */
  async init(scene: THREE.Scene, baseUrl: string): Promise<boolean> {
    for (const spec of AIRCRAFT) {
      try {
        const glb = await new GLTFLoader().loadAsync(
          `${baseUrl}models/${spec.file}`,
        )
        const model = glb.scene
        model.updateMatrixWorld(true)

        const { props, span, height } = prepareAircraft(model, spec)
        const mats = this.prepareFade(model)

        if (this.disposed) return false

        // The yaw frame is positioned on the road, the body carries the
        // pitch and roll.
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
        lightsRoot.visible = this.isLowLight
        body.add(lightsRoot)

        this.aircraft.push({
          spec,
          root,
          body,
          props,
          mats,
          span,
          // The belly of the aircraft hangs half its height below the
          // centre line, plus a little for the wingtips.
          clearance: height / 2 + 1,
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

    if (this.disposed) return false
    if (this.aircraft.length === 0) return false
    scene.add(this.shadowRoot)

    this.ready = true
    this.nextIn = FIRST_GAP_MIN + Math.random() * (FIRST_GAP_MAX - FIRST_GAP_MIN)
    return true
  }

  /**
   * Clones the materials so the pass can fade in and out without touching
   * the shared originals.
   */
  private prepareFade(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    const mats: THREE.MeshStandardMaterial[] = []
    const cloneOf = (m: THREE.Material) => {
      let c = clones.get(m)
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone()
        // The aircraft is never faded, so it must not be sorted as a
        // transparent object: that would draw it over the clouds.
        c.transparent = false
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

  /**
   * Advances the pass. `carS` is the car's position along the road,
   * `carSpeed` how fast it is going and `camera` where it is looking.
   * `active` is false outside free roam.
   *
   * The car's position is only used when a pass starts, to decide where
   * along the road the aircraft should cross. Once the pass is under way
   * the aircraft flies its own line and the car has no further say in
   * where it goes.
   */
  update(
    dt: number,
    carS: number,
    carSpeed: number,
    active: boolean,
  ) {
    if (!this.ready) return
    if (!active) {
      this.endFlight()
      this.timer = 0
      return
    }

    this.timer += dt
    if (!this.flight && this.timer >= this.nextIn) {
      this.startFlight(carS, carSpeed)
    }

    const f = this.flight
    if (!f) {
      this.shadowRoot.visible = false
      return
    }

    const ac = f.ac
    f.traveled += f.speed * dt
    f.age += dt
    f.u = Math.max(0, Math.min(1, f.traveled / f.path.length))
    const pr = profileFor(f.mode, f.u)
    f.speed = pr.speed * ac.spec.speed

    const st = passState(f.mode, f.traveled, f.path, f.age, ac.spec.speed)
    ac.root.position.set(st.x, st.y, st.z)
    ac.root.rotation.y = st.heading

    // A little sway so it does not look like it is on rails.
    const sway = Math.sin(f.age * 0.55) * 0.6 + Math.sin(f.age * 1.3) * 0.25
    ac.body.rotation.x = -st.pitch
    ac.body.rotation.z = (sway * 2.2 + (f.mode === "landing" ? 3 : -2)) * DEG

    // No fade: the aircraft is simply there or it is not. It flies its
    // line, on past the end of the path, until it is lost in the haze.
    this.updateShadow(st, ac.span)

    // The propeller turns by this much each frame. Applying the total
    // instead would compound it, and the prop would wind itself up
    // over the pass.
    const turn = (16 + f.speed * 0.2) * dt
    for (const p of ac.props) {
      p.node.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(p.axis, turn),
      )
    }

    if (this.isLowLight) {
      // Wingtip strobes: distinctive FAA double-flash every 1.0s
      const strobeCycle = f.age % 1.0
      const strobeActive =
        strobeCycle < 0.08 || (strobeCycle > 0.16 && strobeCycle < 0.24)
      for (let i = 0; i < ac.strobes.length; i++) {
        ac.strobes[i].visible = strobeActive
      }

      // Red beacons: pulse every 1.2s
      const beaconCycle = (f.age + 0.3) % 1.2
      const beaconActive = beaconCycle < 0.14
      for (let i = 0; i < ac.beacons.length; i++) {
        ac.beacons[i].visible = beaconActive
      }
    }

    if (f.traveled >= f.path.length + EXIT_LEN) this.endFlight()
  }

  /**
   * Drops the aircraft's shadow on the ground, offset along the sun and
   * spreading as it climbs.
   */
  private updateShadow(st: PassState, span: number) {
    const sh = shadowState(st, this.terrainAt, span)
    this.shadowRoot.visible = true
    this.shadowRoot.position.set(sh.x, sh.y, sh.z)
    this.shadowRoot.rotation.y = sh.heading
    this.shadow.scale.set(sh.span, sh.length, 1)
    this.shadowMat.opacity = sh.alpha
  }

  private startFlight(carS: number, carSpeed: number) {
    if (this.aircraft.length === 0) return
    // The traffic is picked at random, so the sky is never the same
    // twice: a twin-turboprop, a jet or a light aircraft.
    const ac = this.aircraft[
      Math.floor(Math.random() * this.aircraft.length)
    ]
    const modes = ac.spec.modes
    const mode = modes[Math.floor(Math.random() * modes.length)]
    // Every pass gets its own line: the angle to the road, which side it
    // comes from and whether it slides along the road as it crosses.
    const theta = (MIN_ANGLE + Math.random() * (MAX_ANGLE - MIN_ANGLE)) * DEG
    const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const drift: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const pr = profileFor(mode, 0)

    // The crossing is placed ahead of the car. A car in a hurry covers
    // ground while the aircraft is still on its way in, so the crossing
    // is pushed further out to keep the pass in front of the player. The
    // sign follows the car: a car reversing gets the crossing behind it.
    // A cruise crosses much further down the road: it is high above the
    // cloud layer, and it would be over the top of the frame otherwise.
    const flightTime = PASS_HALF / 52
    const baseLead = mode === "cruise" ? CRUISE_LEAD : CROSS_LEAD
    const lead = Math.max(
      -MAX_LEAD,
      Math.min(baseLead + carSpeed * flightTime, MAX_LEAD),
    )
    const base = carS + lead
    const pathFor = (s: number) => makePath(s, theta, side, drift)
    const sCross = pickCrossing(
      base,
      mode,
      pathFor,
      this.terrainAt,
      carS,
      lead * 0.35,
      ac.span,
      ac.clearance,
      EXIT_LEN,
    )
    // Every crossing along the road is blocked by a hill, so there is
    // nothing to fly: try again in a moment rather than fly through it.
    if (sCross < 0) {
      this.timer = 0
      this.nextIn = 2 + Math.random() * 3
      return
    }

    // Only one aircraft is in the air at a time.
    for (const other of this.aircraft) other.root.visible = false
    ac.root.visible = true

    this.flight = {
      mode,
      ac,
      path: pathFor(sCross),
      traveled: 0,
      u: 0,
      speed: pr.speed * ac.spec.speed,
      age: 0,
    }
  }

  private endFlight() {
    if (!this.flight) return
    this.flight.ac.root.visible = false
    this.flight = null
    this.shadowRoot.visible = false
    this.shadowMat.opacity = 0
    this.timer = 0
    this.nextIn = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.isLowLight = isLowLight(mode)
    for (const ac of this.aircraft) {
      ac.lightsRoot.visible = this.isLowLight
    }
  }

  dispose() {
    this.disposed = true
    for (const ac of this.aircraft) {
      ac.root.removeFromParent()
      for (const m of ac.mats) m.dispose()
      ac.mats.length = 0
      ac.props.length = 0
      ac.lightsRoot.removeFromParent()
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
