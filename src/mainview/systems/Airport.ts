import * as THREE from "three"
import type { FlightPath, TerrainAt } from "./AirplaneFlyby"
import { roadCenterX } from "./WorldManager"
import {
  AirportStructures,
  FENCE_OFFSET,
  FENCE_PAST_ENDS,
  type LocalLamp,
} from "./AirportStructures"

/**
 * A small airfield laid along a flight line: one runway and an access road
 * from it to the main road.
 *
 * Distances below are measured along the *landing* path, from the start of
 * the pass, so `d` here means the same thing as the flyby's `traveled`. The
 * line crosses the road at d = path.length / 2; the runway starts well past
 * that, so aircraft cross the road on approach (or when climbing out) and
 * never land on the carriageway.
 */
export const RUNWAY_START_D = 600
export const RUNWAY_END_D = 1500
export const RUNWAY_LENGTH = RUNWAY_END_D - RUNWAY_START_D
export const RUNWAY_WIDTH = 32
const CONNECTOR_WIDTH = 9
/** Where along the landing path the access road leaves the runway. */
const CONNECTOR_D = RUNWAY_START_D + 90
/** Closest the runway centre line may come to the main road, in metres. */
const ROAD_CLEARANCE = 90
/** Ground higher than this under the airfield counts as a hill. */
const FLAT = 0.3

/** An oriented rectangle on the ground where no trees or grass may grow. */
export interface ClearZone {
  x: number
  z: number
  /** Unit direction of the long side. */
  ux: number
  uz: number
  /** Half length and half width. */
  hl: number
  hw: number
}

export interface AirportLayout {
  /** Runway centre. */
  cx: number
  cz: number
  /** Unit direction of the runway, the way a landing aircraft rolls. */
  ux: number
  uz: number
  /** Compass bearing of that direction, degrees. */
  bearing: number
  connector: {
    cx: number
    cz: number
    ux: number
    uz: number
    length: number
  }
  zones: ClearZone[]
}

function pointAt(path: FlightPath, d: number): { x: number; z: number } {
  const along = d - path.length / 2
  return { x: path.x + along * path.dx, z: path.z + along * path.dz }
}

/** Lays the runway and its access road along a landing path. */
export function layoutAirport(path: FlightPath): AirportLayout {
  const mid = pointAt(path, (RUNWAY_START_D + RUNWAY_END_D) / 2)
  const ux = path.dx
  const uz = path.dz
  const bearing = ((Math.atan2(ux, -uz) * 180) / Math.PI + 360) % 360

  // The access road runs from the runway to the nearest bit of main road.
  const q = pointAt(path, CONNECTOR_D)
  const sCross = -path.z
  let bx = 0
  let bz = 0
  let best = Infinity
  for (let s = sCross - 600; s <= sCross + 600; s += 5) {
    const rx = roadCenterX(s)
    const rz = -s
    const d2 = (rx - q.x) ** 2 + (rz - q.z) ** 2
    if (d2 < best) {
      best = d2
      bx = rx
      bz = rz
    }
  }
  const dist = Math.sqrt(best)
  const cux = (bx - q.x) / Math.max(dist, 1e-6)
  const cuz = (bz - q.z) / Math.max(dist, 1e-6)
  // Stop at the road's edge rather than driving across it.
  const stop = Math.max(0, dist - 8.5)
  const connector = {
    cx: q.x + cux * stop * 0.5,
    cz: q.z + cuz * stop * 0.5,
    ux: cux,
    uz: cuz,
    length: stop,
  }

  const zones: ClearZone[] = [
    {
      x: mid.x,
      z: mid.z,
      ux,
      uz,
      hl: RUNWAY_LENGTH / 2 + FENCE_PAST_ENDS + 20,
      hw: FENCE_OFFSET + 10,
    },
    {
      x: connector.cx,
      z: connector.cz,
      ux: cux,
      uz: cuz,
      hl: connector.length / 2 + 5,
      hw: CONNECTOR_WIDTH / 2 + 8,
    },
  ]
  return { cx: mid.x, cz: mid.z, ux, uz, bearing, connector, zones }
}

/** Distance from a point to the nearest bit of main road. */
function roadDistance(x: number, z: number): number {
  const s0 = -z
  let best = Infinity
  for (let s = s0 - 700; s <= s0 + 700; s += 10) {
    const d2 = (roadCenterX(s) - x) ** 2 + (-s - z) ** 2
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

/**
 * Whether the airfield cannot go here: a hill under the runway or access
 * road, or a runway so close to the main road that it would sit on it.
 */
export function airportBlocked(
  layout: AirportLayout,
  terrainAt: TerrainAt,
): boolean {
  const { cx, cz, ux, uz } = layout
  // Across the runway.
  const nx = -uz
  const nz = ux
  // The whole fenced field has to be flat, and clear of the road.
  const half = RUNWAY_LENGTH / 2 + FENCE_PAST_ENDS + 10
  // Sampled finely, out past the fence, so no hill can sit in the strip, the
  // aprons or just beyond the fence line where it would loom over the field.
  for (let a = -half - 15; a <= half + 15; a += 10) {
    const x = cx + ux * a
    const z = cz + uz * a
    for (let off = -96; off <= 96; off += 8) {
      if (terrainAt(x + nx * off, z + nz * off) > FLAT) return true
    }
    if (roadDistance(x, z) < ROAD_CLEARANCE) return true
  }
  const c = layout.connector
  if (c.length < 15) return true
  const cnx = -c.uz
  const cnz = c.ux
  for (let a = -c.length / 2; a <= c.length / 2; a += 10) {
    const x = c.cx + c.ux * a
    const z = c.cz + c.uz * a
    for (const off of [-6, 0, 6]) {
      if (terrainAt(x + cnx * off, z + cnz * off) > FLAT) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Drawing

function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = 38 + Math.random() * 26
    g.fillStyle = `rgb(${v},${v},${v + 4})`
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
}

// ---------------------------------------------------------------------------
// Shared textures. Drawing them (the runway is 4096 px wide and speckled with
// tens of thousands of dots) and uploading them to the GPU is what made an
// airfield appearing cost a frame, so each is drawn once and reused by every
// airfield after it.

const shared = new Map<string, { tex: THREE.CanvasTexture; refs: number }>()
/** Runway textures kept around with nobody using them. */
const SPARE_RUNWAYS = 3

/** A texture drawn once and shared. Hand it back with `releaseTexture`. */
export function sharedTexture(
  key: string,
  make: () => THREE.CanvasTexture,
): THREE.CanvasTexture {
  let e = shared.get(key)
  if (!e) {
    e = { tex: make(), refs: 0 }
    shared.set(key, e)
  }
  e.refs++
  return e.tex
}

export function releaseTexture(tex: THREE.Texture) {
  for (const e of shared.values()) {
    if (e.tex === tex) {
      e.refs = Math.max(0, e.refs - 1)
      break
    }
  }
  // Runway textures are big and there can be many; keep only a few spare.
  const idle = [...shared].filter(([k, e]) => k.startsWith("runway") && e.refs === 0)
  for (const [k, e] of idle.slice(0, Math.max(0, idle.length - SPARE_RUNWAYS))) {
    e.tex.dispose()
    shared.delete(k)
  }
}

/** The runway number: its heading in tens of degrees. */
export function runwayNumber(bearing: number): number {
  return Math.round(bearing / 10) % 36 || 36
}

/** Draws the textures an airfield needs ahead of time, while loading. */
export function warmAirportTextures() {
  releaseTexture(sharedTexture("glow", makeGlowTexture))
  releaseTexture(sharedTexture("connector", makeConnectorTexture))
  releaseTexture(sharedTexture("runway" + 36, () => makeRunwayTexture(360)))
}

/** Texture for the runway: the long axis is the canvas x axis, E0 on the left. */
function makeRunwayTexture(bearing: number): THREE.CanvasTexture {
  const W = 4096
  const H = 256
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")!
  const mx = W / RUNWAY_LENGTH // pixels per metre along the runway
  const my = H / RUNWAY_WIDTH // pixels per metre across it

  g.fillStyle = "#2f3237"
  g.fillRect(0, 0, W, H)
  noise(g, W, H, 40000)

  // Rubber laid down where wheels meet the runway, at both ends.
  g.fillStyle = "rgba(0,0,0,0.22)"
  for (const end of [0, 1]) {
    for (let i = 0; i < 14; i++) {
      const along = 40 + Math.random() * 190
      const len = 20 + Math.random() * 40
      const x = end === 0 ? along : RUNWAY_LENGTH - along - len
      const across = (end === 0 ? 8 : 8) + Math.random() * 3
      for (const sgn of [-1, 1]) {
        g.fillRect(x * mx, (RUNWAY_WIDTH / 2 + sgn * across - 0.4) * my, len * mx, 0.8 * my)
      }
    }
  }

  g.fillStyle = "#ececec"
  // Edge lines.
  g.fillRect(0, 1.0 * my, W, 0.35 * my)
  g.fillRect(0, (RUNWAY_WIDTH - 1.35) * my, W, 0.35 * my)
  // Dashed centre line, kept clear of the threshold markings.
  for (let x = 130; x + 30 < RUNWAY_LENGTH - 130; x += 50) {
    g.fillRect(x * mx, (RUNWAY_WIDTH / 2 - 0.45) * my, 30 * mx, 0.9 * my)
  }
  // Threshold bars, either side of a gap in the middle.
  const bar = (xm: number, lenM: number, yFromCentre: number, wM: number) => {
    g.fillRect(xm * mx, (RUNWAY_WIDTH / 2 + yFromCentre) * my, lenM * mx, wM * my)
  }
  for (const end of [0, 1]) {
    for (let i = 0; i < 6; i++) {
      for (const sgn of [-1, 1]) {
        const off = 2.6 + i * 2.4
        const xm = end === 0 ? 8 : RUNWAY_LENGTH - 8 - 30
        bar(xm, 30, sgn > 0 ? off : -off - 1.5, 1.5)
      }
    }
    // Touchdown zone bars and the aiming point.
    for (const [dist, len, w, off] of [
      [150, 22, 1.8, 7],
      [220, 22, 1.8, 7],
      [310, 55, 5, 9],
    ] as const) {
      const xm = end === 0 ? dist : RUNWAY_LENGTH - dist - len
      for (const sgn of [-1, 1]) bar(xm, len, sgn > 0 ? off : -off - w, w)
    }
  }

  // Runway numbers, read the right way up from each approach.
  const num = runwayNumber(bearing)
  const opp = ((num + 17) % 36) + 1
  g.fillStyle = "#ececec"
  g.textAlign = "center"
  g.textBaseline = "middle"
  const draw = (text: string, xm: number, rot: number) => {
    g.save()
    g.translate(xm * mx, (RUNWAY_WIDTH / 2) * my)
    g.scale(mx, my)
    g.rotate(rot)
    g.font = "bold 12px Arial"
    g.fillText(text.padStart(2, "0"), 0, 0)
    g.restore()
  }
  draw(String(num), 62, Math.PI / 2)
  draw(String(opp), RUNWAY_LENGTH - 62, -Math.PI / 2)

  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Texture for the access road, repeating every 12 m along its length. */
function makeConnectorTexture(): THREE.CanvasTexture {
  const W = 256
  const H = 64
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")!
  g.fillStyle = "#33363b"
  g.fillRect(0, 0, W, H)
  noise(g, W, H, 500)
  g.fillStyle = "#e8e8e8"
  g.fillRect(0, 3, W, 2)
  g.fillRect(0, H - 5, W, 2)
  g.fillStyle = "#cfcfcf"
  g.fillRect(0, H / 2 - 1, W / 2, 2)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A soft round glow for each lamp. */
function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 64
  c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

type Rgb = [number, number, number]
const WHITE: Rgb = [1, 0.96, 0.85]
const AMBER: Rgb = [1, 0.62, 0.12]
const GREEN: Rgb = [0.1, 1, 0.3]
const RED: Rgb = [1, 0.12, 0.08]
const BLUE: Rgb = [0.15, 0.3, 1]

/** Lamps lined up the way a small airfield has them. */
function buildLamps(layout: AirportLayout, extra: LocalLamp[]) {
  const pos: number[] = []
  const col: number[] = []
  const { cx, cz, ux, uz } = layout
  const nx = -uz
  const nz = ux
  const half = RUNWAY_LENGTH / 2
  const add = (a: number, b: number, color: Rgb, y = 0.4): number => {
    pos.push(cx + ux * a + nx * b, y, cz + uz * a + nz * b)
    col.push(...color)
    return pos.length / 3 - 1
  }

  // Runway edges, amber over the last stretch at each end.
  const edge = RUNWAY_WIDTH / 2 - 0.6
  for (let a = -half; a <= half; a += 30) {
    const nearEnd = a < -half + 120 || a > half - 120
    for (const b of [-edge, edge]) add(a, b, nearEnd ? AMBER : WHITE)
  }
  // Threshold: green where aircraft come in, red at the far end.
  for (let b = -15; b <= 15; b += 3) {
    add(-half - 1, b, GREEN)
    add(half + 1, b, RED)
  }
  // Centre line through the touchdown zone.
  for (let a = -half + 150; a <= half - 150; a += 30) add(a, 0, WHITE, 0.15)
  // Glide-path indicator beside the runway: two white over two red.
  const papiA = -half + 300
  for (let i = 0; i < 4; i++) add(papiA, -(19 + i * 4), i < 2 ? RED : WHITE, 0.8)
  // Taxi lights, blue, along both sides of the access road.
  const c = layout.connector
  const cnx = -c.uz
  const cnz = c.ux
  for (let a = -c.length / 2; a <= c.length / 2; a += 20) {
    for (const b of [-5, 5]) {
      pos.push(c.cx + c.ux * a + cnx * b, 0.35, c.cz + c.uz * a + cnz * b)
      col.push(...BLUE)
    }
  }

  // Lead-in strobes ahead of the threshold, flashed in sequence.
  const strobes = [90, 60, 30].map((d) => add(-half - d, 0, WHITE, 0.5))
  // Lamps that belong to the buildings, given in the runway's frame.
  for (const l of extra) {
    pos.push(cx + ux * l.x + nx * l.z, l.y, cz + uz * l.x + nz * l.z)
    col.push(...l.color)
  }

  return {
    pos: new Float32Array(pos),
    col: new Float32Array(col),
    strobes,
  }
}

/**
 * The drawn airfield. It fades in when it appears and out when it is
 * retired, so it never pops in view.
 */
export class AirportView {
  readonly group = new THREE.Group()
  /** 0..1 opacity, moved toward `target`. */
  alpha = 0
  target = 1
  private mats: THREE.MeshStandardMaterial[] = []
  private geoms: THREE.BufferGeometry[] = []
  private maps: THREE.Texture[] = []
  private structures: AirportStructures
  private lamps: THREE.Points
  private lampMat: THREE.PointsMaterial
  private lampColors: THREE.BufferAttribute
  private baseColors: Float32Array
  private strobes: number[]
  /** The big lamps: tower floodlights and the control tower beacon. */
  private bigLamps: THREE.Points
  private bigMat: THREE.PointsMaterial
  private bigColors: THREE.BufferAttribute
  private bigBase: Float32Array
  private beaconIndex: number
  private clock = 0
  /** Whether the lamps are lit; they are off in daylight. */
  lit = false
  /** Shared textures this view holds, handed back on dispose. */
  private shares: THREE.Texture[] = []
  private share(key: string, make: () => THREE.CanvasTexture) {
    const t = sharedTexture(key, make)
    this.shares.push(t)
    return t
  }

  constructor(readonly layout: AirportLayout) {
    const lay = (
      w: number,
      l: number,
      map: THREE.Texture,
      x: number,
      z: number,
      ux: number,
      uz: number,
      y: number,
    ) => {
      const geo = new THREE.PlaneGeometry(l, w)
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.order = "YXZ"
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.y = Math.atan2(-uz, ux)
      mesh.position.set(x, y, z)
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.mats.push(mat)
      this.geoms.push(geo)
      if (!this.shares.includes(map)) this.maps.push(map)
    }

    const c = layout.connector
    const baseCon = sharedTexture("connector", makeConnectorTexture)
    // A clone shares the drawn image but can repeat to this road's length.
    const conMap = baseCon.clone()
    conMap.needsUpdate = true
    this.shares.push(baseCon)
    conMap.repeat.set(c.length / 12, 1)
    lay(CONNECTOR_WIDTH, c.length, conMap, c.cx, c.cz, c.ux, c.uz, 0.03)
    lay(
      RUNWAY_WIDTH,
      RUNWAY_LENGTH,
      this.share("runway" + runwayNumber(layout.bearing), () =>
        makeRunwayTexture(layout.bearing),
      ),
      layout.cx,
      layout.cz,
      layout.ux,
      layout.uz,
      0.04,
    )

    // Fence, light towers and control tower, in the runway's own frame.
    const { ux, uz } = layout
    const nx = -uz
    const nz = ux
    this.structures = new AirportStructures({
      half: RUNWAY_LENGTH / 2,
      connectorA: CONNECTOR_D - (RUNWAY_START_D + RUNWAY_END_D) / 2,
      connectorDir: {
        x: c.ux * ux + c.uz * uz,
        z: c.ux * nx + c.uz * nz,
      },
    })
    const st = this.structures
    st.group.position.set(layout.cx, 0, layout.cz)
    st.group.rotation.y = Math.atan2(-uz, ux)
    this.group.add(st.group)

    const glow = this.share("glow", makeGlowTexture)
    const lampMaterial = (size: number) =>
      new THREE.PointsMaterial({
        size,
        map: glow,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })

    // The runway lamps: one point sprite each, drawn bright and unfogged so
    // they read at a distance, like the lights on an aircraft.
    const small = buildLamps(layout, st.lamps)
    this.strobes = small.strobes
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(small.pos, 3))
    this.baseColors = small.col.slice()
    this.lampColors = new THREE.BufferAttribute(small.col.slice(), 3)
    geo.setAttribute("color", this.lampColors)
    this.lampMat = lampMaterial(3.2)
    this.lamps = new THREE.Points(geo, this.lampMat)
    this.lamps.frustumCulled = false
    this.lamps.visible = false
    this.group.add(this.lamps)
    this.geoms.push(geo)

    // Floodlights on the towers and the control tower's beacon, drawn big,
    // in the structures' frame.
    const bigList: LocalLamp[] = [...st.towerLamps]
    this.beaconIndex = bigList.length
    if (st.beacon) bigList.push(st.beacon.white, st.beacon.green)
    const bigPos = new Float32Array(bigList.length * 3)
    const bigCol = new Float32Array(bigList.length * 3)
    bigList.forEach((l, i) => {
      bigPos.set([l.x, l.y, l.z], i * 3)
      bigCol.set(l.color, i * 3)
    })
    const bigGeo = new THREE.BufferGeometry()
    bigGeo.setAttribute("position", new THREE.BufferAttribute(bigPos, 3))
    this.bigBase = bigCol.slice()
    this.bigColors = new THREE.BufferAttribute(bigCol, 3)
    bigGeo.setAttribute("color", this.bigColors)
    this.bigMat = lampMaterial(9)
    this.bigLamps = new THREE.Points(bigGeo, this.bigMat)
    this.bigLamps.frustumCulled = false
    this.bigLamps.visible = false
    st.group.add(this.bigLamps)
    this.geoms.push(bigGeo)
  }

  /** Advances the fade. Returns true once a retired airfield has faded out. */
  step(dt: number): boolean {
    const rate = dt / 1.5
    if (this.alpha < this.target) this.alpha = Math.min(this.target, this.alpha + rate)
    else if (this.alpha > this.target) this.alpha = Math.max(this.target, this.alpha - rate)
    for (const m of this.mats) m.opacity = this.alpha
    this.group.visible = this.alpha > 0.001
    this.structures.fade(this.alpha)
    this.structures.setLit(this.lit, this.alpha)
    this.stepLamps(dt)
    return this.target === 0 && this.alpha === 0
  }

  /** Lights the lamps and runs the sequenced strobes and the beacon. */
  private stepLamps(dt: number) {
    this.clock += dt
    const on = this.lit && this.alpha > 0.001
    this.lamps.visible = on
    this.bigLamps.visible = on
    if (!on) return
    this.lampMat.opacity = this.alpha
    this.bigMat.opacity = this.alpha
    const c = this.lampColors.array as Float32Array
    const set = (arr: Float32Array, base: Float32Array, i: number, k: number) => {
      for (let j = 0; j < 3; j++) arr[i * 3 + j] = base[i * 3 + j] * k
    }
    // A chaser runs in toward the threshold twice a second.
    const phase = (this.clock * 2) % 1
    this.strobes.forEach((i, n) => {
      set(c, this.baseColors, i, phase > n / 3 && phase < n / 3 + 0.14 ? 1 : 0)
    })
    this.lampColors.needsUpdate = true
    // White then green, as an airfield beacon turns.
    const b = this.bigColors.array as Float32Array
    const turn = this.clock % 2.4
    set(b, this.bigBase, this.beaconIndex, turn < 0.25 ? 1 : 0)
    set(b, this.bigBase, this.beaconIndex + 1, turn > 1.2 && turn < 1.45 ? 1 : 0)
    this.bigColors.needsUpdate = true
  }

  dispose() {
    this.group.removeFromParent()
    this.structures.dispose()
    for (const g of this.geoms) g.dispose()
    for (const m of this.mats) m.dispose()
    this.lampMat.dispose()
    this.bigMat.dispose()
    for (const t of this.maps) t.dispose()
    for (const t of this.shares) releaseTexture(t)
    this.shares.length = 0
    this.geoms.length = 0
    this.mats.length = 0
    this.maps.length = 0
  }
}
