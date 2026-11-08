import * as THREE from "three"
import { LampSet } from "./AirportLamps"
import { makeGlowTexture } from "./GlowTexture"
import type { FlightPath, TerrainAt } from "./AirplaneFlyby"
import { roadCenterX } from "./WorldManager"
import {
  AirportStructures,
  FENCE_OFFSET,
  FENCE_PAST_ENDS,
  type LocalLamp,
} from "./AirportStructures"

export const RUNWAY_START_D = 600
export const RUNWAY_END_D = 1500
export const RUNWAY_LENGTH = RUNWAY_END_D - RUNWAY_START_D
export const RUNWAY_WIDTH = 32
const CONNECTOR_WIDTH = 9
const ROAD_CLEARANCE = 90
const APPROACH_LENGTH = 150
const FLAT = 0.15

export interface ClearZone {
  x: number
  z: number
  ux: number
  uz: number
  hl: number
  hw: number
  paved?: boolean
}

export interface RoadSeg {
  cx: number
  cz: number
  ux: number
  uz: number
  length: number
}

export interface AirportLayout {
  cx: number
  cz: number
  ux: number
  uz: number
  bearing: number
  connector: RoadSeg
  path: { x: number; z: number }[]
  segs: RoadSeg[]
  junction: { a: number; b: number }
  tower: { a: number; b: number }
  zones: ClearZone[]
}

export function roadSegs(l: AirportLayout): RoadSeg[] {
  return l.segs
}

function pointAt(path: FlightPath, d: number): { x: number; z: number } {
  const along = d - path.length / 2
  return { x: path.x + along * path.dx, z: path.z + along * path.dz }
}

function segBetween(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  padStart = 0,
  padEnd = 0,
): RoadSeg {
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.max(Math.hypot(dx, dz), 1e-6)
  const ux = dx / len
  const uz = dz / len
  const length = len + padStart + padEnd
  const sx = x0 - ux * padStart
  const sz = z0 - uz * padStart
  return {
    cx: sx + (ux * length) / 2,
    cz: sz + (uz * length) / 2,
    ux,
    uz,
    length,
  }
}

const SERVICE_OFFSET = 32
const TOWER_A = -200
const TOWER_B = 44
const TOWER_HALF = 6.5
const ROAD_JOIN = 6.5

function nearestRoad(
  x: number,
  z: number,
): { x: number; z: number; dist: number } {
  const s0 = -z
  let bs = s0
  let best = Infinity
  for (let s = s0 - 600; s <= s0 + 600; s += 5) {
    const d2 = (roadCenterX(s) - x) ** 2 + (-s - z) ** 2
    if (d2 < best) {
      best = d2
      bs = s
    }
  }
  const c = bs
  for (let s = c - 5; s <= c + 5; s += 0.5) {
    const d2 = (roadCenterX(s) - x) ** 2 + (-s - z) ** 2
    if (d2 < best) {
      best = d2
      bs = s
    }
  }
  return { x: roadCenterX(bs), z: -bs, dist: Math.sqrt(best) }
}

export function layoutAirport(path: FlightPath): AirportLayout {
  const mid = pointAt(path, (RUNWAY_START_D + RUNWAY_END_D) / 2)
  const ux = path.dx
  const uz = path.dz
  const nx = -uz
  const nz = ux
  const bearing = ((Math.atan2(ux, -uz) * 180) / Math.PI + 360) % 360
  const at = (a: number, b: number) => ({
    x: mid.x + ux * a + nx * b,
    z: mid.z + uz * a + nz * b,
  })

  const jA = RUNWAY_START_D + 90 - (RUNWAY_START_D + RUNWAY_END_D) / 2
  const onLine = at(jA, 0)
  const roadPt = nearestRoad(onLine.x, onLine.z)
  const side =
    (roadPt.x - onLine.x) * nx + (roadPt.z - onLine.z) * nz >= 0 ? 1 : -1
  const jB = side * SERVICE_OFFSET
  const j = at(jA, jB)

  const r = nearestRoad(j.x, j.z)
  const d1x = (r.x - j.x) / Math.max(r.dist, 1e-6)
  const d1z = (r.z - j.z) / Math.max(r.dist, 1e-6)
  const reach = Math.max(0, r.dist - ROAD_JOIN)
  const start = { x: j.x + d1x * reach, z: j.z + d1z * reach }
  const connector = segBetween(j.x, j.z, start.x, start.z)

  const R1 = Math.min(32, reach * 0.6)
  const t = at(TOWER_A, jB)
  const tb = side * (TOWER_B - TOWER_HALF - 0.5)
  const R2 = Math.abs(tb - jB)
  const spurEnd = at(TOWER_A, tb)
  const e1 = { x: -d1x, z: -d1z }
  const e2 = { x: ux, z: uz }
  const along = (
    p: { x: number; z: number },
    e: { x: number; z: number },
    d: number,
  ) => ({
    x: p.x + e.x * d,
    z: p.z + e.z * d,
  })
  const bend = (
    p0: { x: number; z: number },
    c: { x: number; z: number },
    p1: { x: number; z: number },
    n: number,
  ) => {
    const out: { x: number; z: number }[] = []
    for (let i = 1; i <= n; i++) {
      const u = i / n
      const k0 = (1 - u) * (1 - u)
      const k1 = 2 * u * (1 - u)
      const k2 = u * u
      out.push({
        x: k0 * p0.x + k1 * c.x + k2 * p1.x,
        z: k0 * p0.z + k1 * c.z + k2 * p1.z,
      })
    }
    return out
  }
  const turn1a = along(j, e1, -R1)
  const turn1b = along(j, e2, R1)
  const turn2a = along(t, e2, -R2)
  const road: { x: number; z: number }[] = [start]
  const straight = (
    p: { x: number; z: number },
    q: { x: number; z: number },
  ) => {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 10))
    const last = road[road.length - 1]
    for (let i = 1; i <= n; i++)
      road.push({
        x: last.x + ((q.x - last.x) * i) / n,
        z: last.z + ((q.z - last.z) * i) / n,
      })
  }
  straight(start, turn1a)
  road.push(...bend(turn1a, j, turn1b, 10))
  straight(turn1b, turn2a)
  road.push(...bend(turn2a, t, spurEnd, 6))
  const segs: RoadSeg[] = []
  for (let i = 1; i < road.length; i++) {
    const p = road[i - 1]
    const q = road[i]
    segs.push(segBetween(p.x, p.z, q.x, q.z, 0.5, 0.5))
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
      x: mid.x,
      z: mid.z,
      ux,
      uz,
      hl: RUNWAY_LENGTH / 2,
      hw: RUNWAY_WIDTH / 2,
      paved: true,
    },
    {
      x: mid.x - ux * (RUNWAY_LENGTH / 2 + APPROACH_LENGTH / 2),
      z: mid.z - uz * (RUNWAY_LENGTH / 2 + APPROACH_LENGTH / 2),
      ux,
      uz,
      hl: APPROACH_LENGTH / 2 + 20,
      hw: 24,
    },
  ]
  const merged: RoadSeg[] = []
  for (const sg of segs) {
    const last = merged[merged.length - 1]
    if (last && last.ux * sg.ux + last.uz * sg.uz > 0.9999) {
      const x0 = last.cx - (last.ux * last.length) / 2
      const z0 = last.cz - (last.uz * last.length) / 2
      const x1 = sg.cx + (sg.ux * sg.length) / 2
      const z1 = sg.cz + (sg.uz * sg.length) / 2
      merged[merged.length - 1] = segBetween(x0, z0, x1, z1)
    } else merged.push(sg)
  }
  for (const s of merged) {
    zones.push(
      {
        x: s.cx,
        z: s.cz,
        ux: s.ux,
        uz: s.uz,
        hl: s.length / 2 + 5,
        hw: CONNECTOR_WIDTH / 2 + 8,
      },
      {
        x: s.cx,
        z: s.cz,
        ux: s.ux,
        uz: s.uz,
        hl: s.length / 2,
        hw: CONNECTOR_WIDTH / 2 + 0.5,
        paved: true,
      },
    )
  }
  return {
    cx: mid.x,
    cz: mid.z,
    ux,
    uz,
    bearing,
    connector,
    path: road,
    segs,
    junction: { a: jA, b: jB },
    tower: { a: TOWER_A, b: side * TOWER_B },
    zones,
  }
}

function roadDistance(x: number, z: number): number {
  const s0 = -z
  let best = Infinity
  for (let s = s0 - 700; s <= s0 + 700; s += 10) {
    const d2 = (roadCenterX(s) - x) ** 2 + (-s - z) ** 2
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

export function airportBlocked(
  layout: AirportLayout,
  terrainAt: TerrainAt,
): boolean {
  const { cx, cz, ux, uz } = layout
  const nx = -uz
  const nz = ux
  const half = RUNWAY_LENGTH / 2 + FENCE_PAST_ENDS + 10
  for (let a = -half - 15; a <= half + 15; a += 10) {
    const x = cx + ux * a
    const z = cz + uz * a
    for (let off = -120; off <= 120; off += 10) {
      if (terrainAt(x + nx * off, z + nz * off) > FLAT) return true
    }
    if (roadDistance(x, z) < ROAD_CLEARANCE) return true
  }
  for (
    let a = -RUNWAY_LENGTH / 2 - APPROACH_LENGTH;
    a < -RUNWAY_LENGTH / 2;
    a += 10
  ) {
    const x = cx + ux * a
    const z = cz + uz * a
    if (roadDistance(x, z) < 24) return true
    for (let off = -14; off <= 14; off += 7) {
      if (terrainAt(x + nx * off, z + nz * off) > FLAT) return true
    }
  }
  if (layout.connector.length < 15) return true
  for (const c of roadSegs(layout)) {
    const cnx = -c.uz
    const cnz = c.ux
    for (let a = -c.length / 2; a <= c.length / 2; a += 10) {
      const x = c.cx + c.ux * a
      const z = c.cz + c.uz * a
      for (const off of [-6, 0, 6]) {
        if (terrainAt(x + cnx * off, z + cnz * off) > FLAT) return true
      }
    }
  }
  return false
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = 38 + Math.random() * 26
    g.fillStyle = `rgb(${v},${v},${v + 4})`
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
}

const shared = new Map<string, { tex: THREE.Texture; refs: number }>()
const SPARE_RUNWAYS = 3

export function sharedTexture(
  key: string,
  make: () => THREE.Texture,
): THREE.Texture {
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
  const idle = [...shared].filter(
    ([k, e]) => k.startsWith("runway") && e.refs === 0,
  )
  for (const [k, e] of idle.slice(
    0,
    Math.max(0, idle.length - SPARE_RUNWAYS),
  )) {
    e.tex.dispose()
    shared.delete(k)
  }
}

export function runwayNumber(bearing: number): number {
  return Math.round(bearing / 10) % 36 || 36
}

export function warmAirportTextures() {
  releaseTexture(sharedTexture("glow", makeLampGlow))
  releaseTexture(sharedTexture("connector", makeConnectorTexture))
  releaseTexture(sharedTexture("runway" + 36, () => makeRunwayTexture(360)))
}

function makeRunwayTexture(bearing: number): THREE.CanvasTexture {
  const W = 4096
  const H = 256
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")!
  const mx = W / RUNWAY_LENGTH
  const my = H / RUNWAY_WIDTH

  g.fillStyle = "#2f3237"
  g.fillRect(0, 0, W, H)
  noise(g, W, H, 40000)

  g.fillStyle = "rgba(0,0,0,0.22)"
  for (const end of [0, 1]) {
    for (let i = 0; i < 14; i++) {
      const along = 40 + Math.random() * 190
      const len = 20 + Math.random() * 40
      const x = end === 0 ? along : RUNWAY_LENGTH - along - len
      const across = (end === 0 ? 8 : 8) + Math.random() * 3
      for (const sgn of [-1, 1]) {
        g.fillRect(
          x * mx,
          (RUNWAY_WIDTH / 2 + sgn * across - 0.4) * my,
          len * mx,
          0.8 * my,
        )
      }
    }
  }

  g.fillStyle = "#ececec"
  g.fillRect(0, 1.0 * my, W, 0.35 * my)
  g.fillRect(0, (RUNWAY_WIDTH - 1.35) * my, W, 0.35 * my)
  for (let x = 130; x + 30 < RUNWAY_LENGTH - 130; x += 50) {
    g.fillRect(x * mx, (RUNWAY_WIDTH / 2 - 0.45) * my, 30 * mx, 0.9 * my)
  }
  const bar = (xm: number, lenM: number, yFromCentre: number, wM: number) => {
    g.fillRect(
      xm * mx,
      (RUNWAY_WIDTH / 2 + yFromCentre) * my,
      lenM * mx,
      wM * my,
    )
  }
  for (const end of [0, 1]) {
    for (let i = 0; i < 6; i++) {
      for (const sgn of [-1, 1]) {
        const off = 2.6 + i * 2.4
        const xm = end === 0 ? 8 : RUNWAY_LENGTH - 8 - 30
        bar(xm, 30, sgn > 0 ? off : -off - 1.5, 1.5)
      }
    }
    for (const [dist, len, w, off] of [
      [150, 22, 1.8, 7],
      [220, 22, 1.8, 7],
      [310, 55, 5, 9],
    ] as const) {
      const xm = end === 0 ? dist : RUNWAY_LENGTH - dist - len
      for (const sgn of [-1, 1]) bar(xm, len, sgn > 0 ? off : -off - w, w)
    }
  }

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

function makeLampGlow(): THREE.Texture {
  return makeGlowTexture([
    [0, 1],
    [0.25, 0.55],
    [1, 0],
  ])
}

type Rgb = [number, number, number]
const WHITE: Rgb = [1, 0.96, 0.85]
const AMBER: Rgb = [1, 0.62, 0.12]
const GREEN: Rgb = [0.1, 1, 0.3]
const RED: Rgb = [1, 0.12, 0.08]
const BLUE: Rgb = [0.15, 0.3, 1]

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

  const edge = RUNWAY_WIDTH / 2 - 0.6
  for (let a = -half; a <= half; a += 30) {
    const nearEnd = a < -half + 120 || a > half - 120
    for (const b of [-edge, edge]) add(a, b, nearEnd ? AMBER : WHITE)
  }
  for (let b = -15; b <= 15; b += 3) {
    add(-half - 1, b, GREEN)
    add(half + 1, b, RED)
  }
  for (let a = -half + 150; a <= half - 150; a += 30) add(a, 0, WHITE, 0.15)
  const papiA = -half + 300
  for (let i = 0; i < 4; i++)
    add(papiA, -(19 + i * 4), i < 2 ? RED : WHITE, 0.8)
  {
    const pts = layout.path
    let run = 0
    let next = 14
    for (let i = 1; i < pts.length - 1; i++) {
      run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      if (run < next) continue
      next = run + 20
      const tx = pts[i + 1].x - pts[i - 1].x
      const tz = pts[i + 1].z - pts[i - 1].z
      const k = 1 / Math.max(Math.hypot(tx, tz), 1e-6)
      for (const b of [-5, 5]) {
        pos.push(pts[i].x - tz * k * b, 0.35, pts[i].z + tx * k * b)
        col.push(...BLUE)
      }
    }
  }

  const strobes: number[] = []
  for (let d = APPROACH_LENGTH; d >= 30; d -= 30) {
    strobes.push(add(-half - d, 0, WHITE, 0.5))
    if (d > 30) add(-half - d + 15, 0, WHITE, 0.5)
  }
  for (const [d, reach] of [
    [60, 9],
    [120, 12],
  ] as const) {
    for (let b = 3; b <= reach; b += 3) {
      add(-half - d, b, WHITE, 0.5)
      add(-half - d, -b, WHITE, 0.5)
    }
  }
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

const MOUTH_EXTRA = 6
const MOUTH_LENGTH = 16

function roadRibbon(pts: { x: number; z: number }[]): THREE.BufferGeometry {
  const n = pts.length
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let run = 0
  for (let i = 0; i < n; i++) {
    if (i > 0)
      run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[Math.min(n - 1, i + 1)]
    const tx = p1.x - p0.x
    const tz = p1.z - p0.z
    const k = 1 / Math.max(Math.hypot(tx, tz), 1e-6)
    const px = -tz * k
    const pz = tx * k
    const f = Math.max(0, 1 - run / MOUTH_LENGTH)
    const half = CONNECTOR_WIDTH / 2 + MOUTH_EXTRA * f * f
    pos.push(
      pts[i].x + px * half,
      0,
      pts[i].z + pz * half,
      pts[i].x - px * half,
      0,
      pts[i].z - pz * half,
    )
    nor.push(0, 1, 0, 0, 1, 0)
    uv.push(run / 12, 0, run / 12, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  return geo
}

export class AirportView {
  readonly group = new THREE.Group()
  alpha = 0
  target = 1
  private mats: THREE.MeshStandardMaterial[] = []
  private geoms: THREE.BufferGeometry[] = []
  private maps: THREE.Texture[] = []
  private structures: AirportStructures
  private lamps: LampSet
  private strobes: number[]
  private bigLamps: LampSet
  private beaconIndex: number
  private clock = 0
  lit = false
  private shares: THREE.Texture[] = []
  private share(key: string, make: () => THREE.Texture) {
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

    {
      const geo = roadRibbon(layout.path)
      const baseCon = sharedTexture("connector", makeConnectorTexture)
      this.shares.push(baseCon)
      const mat = new THREE.MeshStandardMaterial({
        map: baseCon,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = 0.024
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.mats.push(mat)
      this.geoms.push(geo)
    }
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
      0.028,
    )

    const { ux, uz } = layout
    const nx = -uz
    const nz = ux
    this.structures = new AirportStructures({
      half: RUNWAY_LENGTH / 2,
      road: layout.path.map((q) => ({
        x: (q.x - layout.cx) * ux + (q.z - layout.cz) * uz,
        z: (q.x - layout.cx) * nx + (q.z - layout.cz) * nz,
      })),
      towerA: layout.tower.a,
      towerB: layout.tower.b,
    })
    const st = this.structures
    st.group.position.set(layout.cx, 0, layout.cz)
    st.group.rotation.y = Math.atan2(-uz, ux)
    this.group.add(st.group)

    const glow = this.share("glow", makeLampGlow)

    const small = buildLamps(layout, st.lamps)
    this.strobes = small.strobes
    const smallY = (i: number) => small.pos[i * 3 + 1]
    this.lamps = new LampSet({
      pos: small.pos,
      col: small.col,
      radius: (i) => (smallY(i) > 3 ? 0.4 : 0.26),
      stem: (i) => smallY(i) > 0.45 && smallY(i) < 3,
      flat: (i) => smallY(i) <= 0.45,
      glow,
      haloScale: 9,
    })
    this.group.add(this.lamps.group)

    const bigList: LocalLamp[] = [...st.towerLamps]
    this.beaconIndex = bigList.length
    if (st.beacon) bigList.push(st.beacon.white, st.beacon.green)
    const bigPos = new Float32Array(bigList.length * 3)
    const bigCol = new Float32Array(bigList.length * 3)
    bigList.forEach((l, i) => {
      bigPos.set([l.x, l.y, l.z], i * 3)
      bigCol.set(l.color, i * 3)
    })
    this.bigLamps = new LampSet({
      pos: bigPos,
      col: bigCol,
      radius: (i) => (i >= this.beaconIndex ? 0.7 : 0.5),
      stem: () => false,
      glow,
      haloScale: 12,
    })
    st.group.add(this.bigLamps.group)
    for (const set of [this.lamps, this.bigLamps]) {
      this.mats.push(...(set.fadeMats as THREE.MeshStandardMaterial[]))
      this.geoms.push(...set.geoms)
    }
  }

  step(dt: number): boolean {
    const rate = dt / 1.5
    if (this.alpha < this.target)
      this.alpha = Math.min(this.target, this.alpha + rate)
    else if (this.alpha > this.target)
      this.alpha = Math.max(this.target, this.alpha - rate)
    for (const m of this.mats) m.opacity = this.alpha
    this.group.visible = this.alpha > 0.001
    this.structures.fade(this.alpha)
    this.structures.setLit(this.lit, this.alpha)
    this.stepLamps(dt)
    return this.target === 0 && this.alpha === 0
  }

  private stepLamps(dt: number) {
    this.clock += dt
    const on = this.lit && this.alpha > 0.001
    const phase = (this.clock * 2) % 1
    const count = this.strobes.length
    this.strobes.forEach((i, n) => {
      const at = n / count
      this.lamps.setLevel(i, phase > at && phase < at + 0.4 / count ? 1 : 0)
    })
    const turn = this.clock % 2.4
    this.bigLamps.setLevel(this.beaconIndex, turn < 0.25 ? 1 : 0)
    this.bigLamps.setLevel(
      this.beaconIndex + 1,
      turn > 1.2 && turn < 1.45 ? 1 : 0,
    )
    this.lamps.update(on, this.alpha)
    this.bigLamps.update(on, this.alpha)
  }

  dispose() {
    this.group.removeFromParent()
    this.structures.dispose()
    for (const g of this.geoms) g.dispose()
    for (const m of this.mats) m.dispose()
    this.lamps.dispose()
    this.bigLamps.dispose()
    for (const t of this.maps) t.dispose()
    for (const t of this.shares) releaseTexture(t)
    this.shares.length = 0
    this.geoms.length = 0
    this.mats.length = 0
    this.maps.length = 0
  }
}
