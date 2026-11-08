import { fadeWithFog } from "./fogFade"
import * as THREE from "three"
import { sharedTexture, releaseTexture } from "./Airport"
import { makeGlowTexture } from "./GlowTexture"

export const FENCE_PAST_ENDS = 40
export const FENCE_OFFSET = 60

const TOWER_Z = FENCE_OFFSET - 6
const TOWER_HEIGHT = 18

export interface LocalLamp {
  x: number
  y: number
  z: number
  color: [number, number, number]
}

export interface StructureInput {
  half: number
  road: { x: number; z: number }[]
  towerA: number
  towerB: number
}

function makeChainLinkTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 64
  c.height = 64
  const g = c.getContext("2d")!
  g.fillStyle = "#c4c9cf"
  for (let cy = 0; cy < 64; cy += 16) {
    for (let cx = 0; cx < 64; cx += 16) {
      for (let t = 0; t < 16; t++) {
        g.fillRect(cx + t, cy + t, 1.6, 1.6)
        g.fillRect(cx + 15 - t, cy + t, 1.6, 1.6)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function makeTowerGlow(): THREE.Texture {
  return makeGlowTexture([
    [0, 1],
    [0.4, 0.4],
    [1, 0],
  ])
}

export function warmStructureTextures() {
  releaseTexture(sharedTexture("chainLink", makeChainLinkTexture))
  releaseTexture(sharedTexture("towerGlow", makeTowerGlow))
}

export class AirportStructures {
  private shares: THREE.Texture[] = []
  private share(key: string, make: () => THREE.Texture) {
    const t = sharedTexture(key, make)
    this.shares.push(t)
    return t
  }

  readonly group = new THREE.Group()
  readonly lamps: LocalLamp[] = []
  readonly towerLamps: LocalLamp[] = []
  beacon: { white: LocalLamp; green: LocalLamp } | null = null

  private solid: THREE.MeshStandardMaterial[] = []
  private windows: THREE.MeshStandardMaterial
  private pools: THREE.MeshBasicMaterial[] = []
  private geoms: THREE.BufferGeometry[] = []
  private maps: THREE.Texture[] = []

  constructor(input: StructureInput) {
    const { half } = input
    const glow = this.share("towerGlow", makeTowerGlow)

    const std = (
      color: number,
      extra: Partial<THREE.MeshStandardMaterialParameters> = {},
    ) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.1,
        ...extra,
      })
      this.solid.push(m)
      return m
    }
    const box = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d)
      this.geoms.push(geo)
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      this.group.add(m)
      return m
    }
    const cyl = (
      rTop: number,
      rBot: number,
      h: number,
      seg: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg)
      this.geoms.push(geo)
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      this.group.add(m)
      return m
    }

    const X = half + FENCE_PAST_ENDS
    const Z = FENCE_OFFSET
    const postMat = std(0x7b8087, { metalness: 0.5 })
    const railMat = std(0x9aa0a6, { metalness: 0.6 })
    const gateMat = std(0xd9b632)
    const chain = this.share("chainLink", makeChainLinkTexture)
    const meshMat = new THREE.MeshStandardMaterial({
      map: chain,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.5,
    })
    this.solid.push(meshMat)

    const posts: [number, number, number][] = []
    const sides = [
      { nx: 0, nz: 1 },
      { nx: 0, nz: -1 },
      { nx: 1, nz: 0 },
      { nx: -1, nz: 0 },
    ]
    for (const side of sides) {
      const along = side.nx === 0
      const extent = along ? X : Z
      const fixed = along ? side.nz * Z : side.nx * X
      const gaps: [number, number][] = []
      const rd = input.road
      for (let i = 1; i < rd.length; i++) {
        const p = rd[i - 1]
        const q = rd[i]
        const pc = (along ? p.z : p.x) - fixed
        const qc = (along ? q.z : q.x) - fixed
        if (pc * qc > 0 || pc === qc) continue
        const u = pc / (pc - qc)
        const sAt =
          (along ? p.x : p.z) + u * ((along ? q.x : q.z) - (along ? p.x : p.z))
        const dx = q.x - p.x
        const dz = q.z - p.z
        const cross =
          Math.abs(along ? dz : dx) / Math.max(Math.hypot(dx, dz), 1e-6)
        const half = 4.5 / Math.max(0.3, cross) + 2
        gaps.push([sAt - half, sAt + half])
      }
      gaps.sort((g, h) => g[0] - h[0])
      const segs: [number, number][] = []
      let cursor = -extent
      for (const [g0, g1] of gaps) {
        if (g0 > cursor) segs.push([cursor, Math.min(extent, g0)])
        cursor = Math.max(cursor, g1)
      }
      if (cursor < extent) segs.push([cursor, extent])
      const gateEnds = gaps.flatMap(([g0, g1]) => [g0, g1])
      for (const [s0, s1] of segs) {
        const len = s1 - s0
        if (len < 2) continue
        const fixed = along ? side.nz * Z : side.nx * X
        const mid = (s0 + s1) / 2
        const px = along ? mid : fixed
        const pz = along ? fixed : mid
        const yaw = along ? 0 : Math.PI / 2

        const geo = new THREE.PlaneGeometry(len, 2.1)
        this.geoms.push(geo)
        const m = new THREE.MeshStandardMaterial({
          map: meshMat.map!.clone(),
          alphaTest: 0.35,
          side: THREE.DoubleSide,
          roughness: 0.6,
          metalness: 0.5,
        })
        m.map!.repeat.set(len / 1.4, 2.1 / 1.4)
        m.map!.needsUpdate = true
        this.solid.push(m)
        this.maps.push(m.map!)
        const panel = new THREE.Mesh(geo, m)
        panel.position.set(px, 1.2, pz)
        panel.rotation.y = yaw
        panel.frustumCulled = false
        this.group.add(panel)

        for (const y of [0.15, 2.3]) {
          const rail = box(len, 0.09, 0.09, railMat, px, y, pz)
          rail.rotation.y = yaw
          rail.castShadow = false
        }
        const n = Math.max(1, Math.round(len / 3.5))
        for (let i = 0; i <= n; i++) {
          const s = s0 + (len * i) / n
          posts.push(along ? [s, fixed, 2.4] : [fixed, s, 2.4])
        }
      }
      for (const e of gateEnds) {
        if (Math.abs(e) > extent) continue
        const gx = along ? e : side.nx * X
        const gz = along ? side.nz * Z : e
        box(0.3, 3.2, 0.3, gateMat, gx, 1.6, gz)
      }
    }
    if (posts.length > 0) {
      const geo = new THREE.BoxGeometry(0.14, 2.4, 0.14)
      this.geoms.push(geo)
      const im = new THREE.InstancedMesh(geo, postMat, posts.length)
      const mtx = new THREE.Matrix4()
      posts.forEach(([x, z, h], i) => {
        mtx.makeTranslation(x, h / 2, z)
        im.setMatrixAt(i, mtx)
      })
      im.frustumCulled = false
      im.castShadow = true
      this.group.add(im)
    }

    const towerMat = std(0x8d9297, { metalness: 0.6, roughness: 0.6 })
    const headMat = std(0x2a2d31)
    const poolGeo = new THREE.PlaneGeometry(64, 64)
    this.geoms.push(poolGeo)
    for (const x of [-250, 0, 250]) {
      for (const sgn of [-1, 1]) {
        const z = sgn * TOWER_Z
        cyl(0.2, 0.36, TOWER_HEIGHT, 8, towerMat, x, TOWER_HEIGHT / 2, z)
        box(4.2, 0.18, 1.2, towerMat, x, TOWER_HEIGHT - 0.2, z)
        const head = box(
          4,
          0.7,
          0.5,
          headMat,
          x,
          TOWER_HEIGHT + 0.3,
          z - sgn * 0.4,
        )
        head.castShadow = false
        for (const dx of [-1.4, 0, 1.4]) {
          this.towerLamps.push({
            x: x + dx,
            y: TOWER_HEIGHT + 0.3,
            z: z - sgn * 0.9,
            color: [1, 0.9, 0.7],
          })
        }
        const poolMat = new THREE.MeshBasicMaterial({
          map: glow,
          color: 0xffe2b4,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        })
        fadeWithFog(poolMat)
        this.pools.push(poolMat)
        const pool = new THREE.Mesh(poolGeo, poolMat)
        pool.rotation.x = -Math.PI / 2
        pool.position.set(x, 0.032, z - sgn * 16)
        pool.frustumCulled = false
        this.group.add(pool)
      }
    }

    const ax = input.towerA
    const az = input.towerB
    const concrete = std(0xbfc2c6)
    const shaftMat = std(0xe0e2e4)
    const roofMat = std(0x4a4e55)
    this.windows = new THREE.MeshStandardMaterial({
      color: 0x547d96,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0xffd7a0,
      emissiveIntensity: 0,
    })
    this.solid.push(this.windows)
    box(13, 4, 13, concrete, ax, 2, az)
    box(15, 0.4, 15, roofMat, ax, 4.2, az)
    cyl(1.9, 2.3, 15, 8, shaftMat, ax, 4.4 + 7.5, az)
    cyl(5.3, 4.1, 3.4, 8, this.windows, ax, 19.9 + 1.7, az)
    cyl(5.9, 5.9, 0.5, 8, roofMat, ax, 23.55, az)
    cyl(0.07, 0.07, 6, 5, towerMat, ax, 26.8, az)
    box(2.4, 0.15, 0.5, towerMat, ax, 25.5, az)
    box(0.5, 1.3, 1.6, shaftMat, ax + 2.2, 24.4, az)
    for (const [dx, dz] of [
      [4.6, 0],
      [-4.6, 0],
      [0, 4.6],
      [0, -4.6],
    ]) {
      this.lamps.push({
        x: ax + dx,
        y: 23.9,
        z: az + dz,
        color: [1, 0.12, 0.08],
      })
    }
    this.lamps.push({ x: ax, y: 29.9, z: az, color: [1, 0.12, 0.08] })
    this.beacon = {
      white: { x: ax, y: 30.5, z: az, color: [1, 0.96, 0.85] },
      green: { x: ax, y: 30.5, z: az, color: [0.1, 1, 0.3] },
    }
  }

  fade(alpha: number) {
    const fading = alpha < 0.999
    for (const m of this.solid) {
      m.transparent = fading
      m.opacity = alpha
    }
    this.group.visible = alpha > 0.001
  }

  setLit(lit: boolean, alpha: number) {
    for (const p of this.pools) p.opacity = lit ? 0.3 * alpha : 0
    this.windows.emissiveIntensity = lit ? 1.6 : 0
  }

  dispose() {
    this.group.removeFromParent()
    for (const g of this.geoms) g.dispose()
    for (const m of this.solid) m.dispose()
    for (const m of this.pools) m.dispose()
    for (const t of this.maps) t.dispose()
    for (const t of this.shares) releaseTexture(t)
    this.shares.length = 0
    this.geoms.length = 0
    this.solid.length = 0
    this.pools.length = 0
    this.maps.length = 0
  }
}
