import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { SurfaceId } from "../../data/surfaces"
import type { TimeOfDayMode } from "../../constants/timeOfDay"
import { registerSurface } from "../../physics/core/Surfaces"
import type { ClearZone } from "../../systems/Airport"
import type { MapWorld } from "../types"
import { mulberry32 } from "./config"
import { SkyRig } from "./SkyRig"
import {
  buildClouds,
  buildHills,
  hillColliders,
  loadPropKit,
  type HillPlacement,
  type PropKit,
} from "./Scenery"
import type { Track } from "./Track"

const ROAD_REPEAT_M = 24
const KERB_REPEAT_M = 2.4
const KERB_WIDTH_M = 1.4
const KERB_CURVATURE = 1 / 280
const CHUNK_M = 100
const TREE_LOD_M = 70
const TREE_SHADOW_M = 140
const FAR_LOD_M = 500

interface TreeChunk {
  mesh: THREE.InstancedMesh
  hi: THREE.BufferGeometry
  lo?: THREE.BufferGeometry
  far?: THREE.BufferGeometry
  total: number
  cx: number
  cz: number
  radius: number
}

function noiseTexture(
  w: number,
  h: number,
  base: [number, number, number],
  spread: number,
  specks: number,
  decorate?: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d")!
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < specks; i++) {
    const d = (Math.random() - 0.5) * spread
    g.fillStyle = `rgb(${base[0] + d},${base[1] + d},${base[2] + d})`
    g.fillRect(
      Math.random() * w,
      Math.random() * h,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    )
  }
  decorate?.(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function roadTexture(): THREE.CanvasTexture {
  const t = noiseTexture(256, 256, [58, 60, 64], 26, 3200, (g) => {
    g.fillStyle = "rgba(20,20,22,0.18)"
    g.fillRect(256 * 0.3, 0, 256 * 0.14, 256)
    g.fillRect(256 * 0.56, 0, 256 * 0.14, 256)
    g.fillStyle = "rgba(235,235,235,0.92)"
    g.fillRect(256 * 0.015, 0, 256 * 0.022, 256)
    g.fillRect(256 * 0.963, 0, 256 * 0.022, 256)
  })
  t.wrapS = THREE.ClampToEdgeWrapping
  return t
}

function stripeTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 32
  c.height = 64
  const g = c.getContext("2d")!
  g.fillStyle = a
  g.fillRect(0, 0, 32, 32)
  g.fillStyle = b
  g.fillRect(0, 32, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function checkerTexture(cols: number, rows: number): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = cols * 16
  c.height = rows * 16
  const g = c.getContext("2d")!
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? "#141414" : "#f2f2f2"
      g.fillRect(x * 16, y * 16, 16, 16)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export class CircuitWorld implements MapWorld {
  readonly group = new THREE.Group()
  readonly travelDir = 1
  private readonly sky: SkyRig
  private ground!: THREE.Mesh
  private chunks: TreeChunk[] = []
  private kit: PropKit | null = null
  private hills: HillPlacement[] = []
  private hillDress: THREE.Mesh[] = []
  private vegetation = 1
  private propShadows = true
  private wallGeo: THREE.BufferGeometry | null = null

  constructor(private readonly track: Track) {
    this.sky = new SkyRig(this.group, (p) => {
      if (this.ground) {
        ;(this.ground.material as THREE.MeshStandardMaterial).color.setHex(
          p.groundColor,
        )
      }
    })
  }

  sunDirection() {
    return this.sky.direction
  }

  terrainHeightAt(): number {
    return 0
  }

  puddleAt(): number {
    return 0
  }

  surfaceAt(x: number, z: number): SurfaceId {
    const hit = this.track.nearby(x, z)
    if (!hit) return "grass"
    const half = this.track.config.widthM / 2
    if (hit.dist <= half + KERB_WIDTH_M) return "asphalt"
    if (hit.dist <= half + this.track.config.gravelM) return "gravel"
    return "grass"
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.sky.setTimeOfDay(mode)
  }
  setShadowQuality(pct: number) {
    this.sky.setShadowQuality(pct)
  }
  setFog(enabled: boolean, intensity: number) {
    this.sky.setFog(enabled, intensity)
  }
  setDrawDistance(percent: number) {
    this.sky.setDrawDistance(percent)
  }
  setLightning(f: number) {
    this.sky.setLightning(f)
  }
  setStreetLights() {}
  setClearZones(_zones: ClearZone[]) {}

  setPropShadows(on: boolean) {
    if (on === this.propShadows) return
    this.propShadows = on
    for (const m of this.hillDress) m.castShadow = on
  }

  setVegetation(percent: number) {
    this.vegetation = Math.min(1, Math.max(0, percent / 100))
    for (const c of this.chunks) {
      c.mesh.count = Math.ceil(c.total * this.vegetation)
    }
    for (const m of this.hillDress) {
      m.visible = (m.userData.vegRank as number) < this.vegetation
    }
  }

  private ribbon(
    from: number,
    to: number,
    y: number,
    repeatM: number,
  ): THREE.BufferGeometry {
    const t = this.track
    const n = t.n
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const nor: number[] = []
    for (let r = 0; r <= n; r++) {
      const i = r % n
      pos.push(
        t.xs[i] - t.tz[i] * from,
        y,
        t.zs[i] + t.tx[i] * from,
        t.xs[i] - t.tz[i] * to,
        y,
        t.zs[i] + t.tx[i] * to,
      )
      nor.push(0, 1, 0, 0, 1, 0)
      const v = (r * t.ds) / repeatM
      uv.push(0, v, 1, v)
    }
    for (let r = 0; r < n; r++) {
      const a = r * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    return g
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat)
    m.receiveShadow = true
    m.frustumCulled = false
    this.group.add(m)
    return m
  }

  private buildRoad() {
    const t = this.track
    const half = t.config.widthM / 2

    if (t.config.gravelM > 0) {
      for (const sign of [-1, 1]) {
        const a = sign * (half + KERB_WIDTH_M * 0.5)
        const b = sign * (half + t.config.gravelM)
        const width = Math.abs(b - a)
        const tex = noiseTexture(128, 128, [176, 160, 124], 40, 2400)
        tex.repeat.set(Math.max(1, width / 10), 1)
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
        this.add(this.ribbon(Math.min(a, b), Math.max(a, b), 0.02, 10), mat)
      }
    }

    const mat = new THREE.MeshStandardMaterial({
      map: roadTexture(),
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    this.add(this.ribbon(-half, half, 0.03, ROAD_REPEAT_M), mat)

    if (t.config.kerbs) this.buildKerbs(half)
  }

  private buildKerbs(half: number) {
    const t = this.track
    const n = t.n
    const flag = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      if (Math.abs(t.kappa[i]) > KERB_CURVATURE) {
        flag[i] = t.kappa[i] > 0 ? 1 : 2
      }
    }
    const grown = Uint8Array.from(flag)
    const reach = Math.max(1, Math.round(30 / t.ds))
    for (let i = 0; i < n; i++) {
      if (!flag[i]) continue
      for (let k = -reach; k <= reach; k++) grown[(i + k + n) % n] = flag[i]
    }
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const edge = (i: number, lat: number): [number, number] => [
      t.xs[i] - t.tz[i] * lat,
      t.zs[i] + t.tx[i] * lat,
    ]
    for (let i = 0; i < n; i++) {
      const side = grown[i]
      if (!side) continue
      const j = (i + 1) % n
      const s = side === 1 ? 1 : -1
      const a0 = edge(i, s * half)
      const b0 = edge(i, s * (half + KERB_WIDTH_M))
      const a1 = edge(j, s * half)
      const b1 = edge(j, s * (half + KERB_WIDTH_M))
      const base = pos.length / 3
      const v0 = (i * t.ds) / KERB_REPEAT_M
      const v1 = ((i + 1) * t.ds) / KERB_REPEAT_M
      pos.push(a0[0], 0.045, a0[1], b0[0], 0.045, b0[1])
      pos.push(a1[0], 0.045, a1[1], b1[0], 0.045, b1[1])
      for (let k = 0; k < 4; k++) nor.push(0, 1, 0)
      uv.push(0, v0, 1, v0, 0, v1, 1, v1)
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
    if (!idx.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    const mat = new THREE.MeshStandardMaterial({
      map: stripeTexture("#d11a1a", "#f4f4f4"),
      roughness: 0.8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.add(g, mat)
  }

  private wallGeometry(): THREE.BufferGeometry {
    const t = this.track
    const n = t.n
    const off = t.config.widthM / 2 + t.config.runoffM
    const h = t.config.barrierHeightM
    const th = 0.6
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (const sign of [-1, 1]) {
      const start = pos.length / 3
      for (let r = 0; r <= n; r++) {
        const i = r % n
        const nx = -t.tz[i] * sign
        const nz = t.tx[i] * sign
        const ix = t.xs[i] + nx * off
        const iz = t.zs[i] + nz * off
        const ox = t.xs[i] + nx * (off + th)
        const oz = t.zs[i] + nz * (off + th)
        const v = (r * t.ds) / 8
        pos.push(ix, 0, iz, ix, h, iz)
        pos.push(ix, h, iz, ox, h, oz)
        pos.push(ox, h, oz, ox, 0, oz)
        uv.push(0, v, 1, v, 0, v, 1, v, 0, v, 1, v)
      }
      for (let r = 0; r < n; r++) {
        for (let q = 0; q < 3; q++) {
          const a = start + r * 6 + q * 2
          const b = a + 6
          idx.push(a, b, a + 1, a + 1, b, b + 1)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  private buildBarriers() {
    const g = this.wallGeometry()
    this.wallGeo = g
    const mat = new THREE.MeshStandardMaterial({
      map: stripeTexture("#e8e8ea", "#c8202a"),
      roughness: 0.85,
      side: THREE.DoubleSide,
    })
    this.add(g, mat).castShadow = true
  }

  private buildStartLine() {
    const t = this.track
    const w = t.config.widthM
    const p = t.at(0)
    const root = new THREE.Group()
    root.position.set(p.x, 0, p.z)
    root.rotation.y = Math.atan2(-p.tx, -p.tz)

    const lineMat = new THREE.MeshBasicMaterial({
      map: checkerTexture(14, 2),
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), lineMat)
    line.rotation.x = -Math.PI / 2
    line.position.y = 0.06
    root.add(line)

    const steel = new THREE.MeshStandardMaterial({
      color: 0x2a2f38,
      roughness: 0.6,
      metalness: 0.4,
    })
    const postGeo = new THREE.BoxGeometry(0.7, 7, 0.7)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, steel)
      post.position.set(sx * (w / 2 + 1.6), 3.5, 0)
      post.castShadow = true
      root.add(post)
    }
    const face = new THREE.MeshStandardMaterial({ map: checkerTexture(28, 2) })
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 3.2, 1.3, 0.8), [
      steel,
      steel,
      steel,
      steel,
      face,
      face,
    ])
    beam.position.set(0, 6.6, 0)
    beam.castShadow = true
    root.add(beam)
    this.group.add(root)
  }

  private treeGeometry(): THREE.BufferGeometry {
    const paint = (
      g: THREE.BufferGeometry,
      r: number,
      gr: number,
      b: number,
    ) => {
      const out = g.toNonIndexed()
      g.dispose()
      const c = out.attributes.position.count
      const col = new Float32Array(c * 3)
      for (let i = 0; i < c; i++) {
        col[i * 3] = r
        col[i * 3 + 1] = gr
        col[i * 3 + 2] = b
      }
      out.setAttribute("color", new THREE.BufferAttribute(col, 3))
      return out
    }
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6)
    trunk.translate(0, 1.1, 0)
    const low = new THREE.ConeGeometry(2.0, 3.4, 7)
    low.translate(0, 3.7, 0)
    const high = new THREE.ConeGeometry(1.4, 2.8, 7)
    high.translate(0, 5.5, 0)
    return mergeGeometries([
      paint(trunk, 0.32, 0.22, 0.14),
      paint(low, 0.14, 0.34, 0.16),
      paint(high, 0.18, 0.4, 0.2),
    ])!
  }

  private buildTrees() {
    const t = this.track
    const cfg = t.config
    const clear = cfg.widthM / 2 + cfg.runoffM + 3
    const protos: {
      geometry: THREE.BufferGeometry
      material: THREE.Material | THREE.Material[]
    }[] = this.kit?.trees.length
      ? this.kit.trees
      : [
          {
            geometry: this.treeGeometry(),
            material: new THREE.MeshStandardMaterial({
              vertexColors: true,
              roughness: 1,
              flatShading: true,
            }),
          },
        ]
    const glb = !!this.kit?.trees.length
    const chunkCount = Math.max(1, Math.ceil(t.lengthM / CHUNK_M))
    const perChunk = Math.round(
      ((cfg.treesPer100m * (t.lengthM / chunkCount)) / 100) * 2,
    )
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    for (let c = 0; c < chunkCount; c++) {
      const rng = mulberry32(cfg.seed * 7919 + c * 104729 + 17)
      const mats: THREE.Matrix4[][] = protos.map(() => [])
      const tints: THREE.Color[][] = protos.map(() => [])
      let placed = 0
      const sLo = (c * t.lengthM) / chunkCount
      const sHi = ((c + 1) * t.lengthM) / chunkCount
      for (let k = 0; k < perChunk * 2 && placed < perChunk; k++) {
        const p = t.at(sLo + rng() * (sHi - sLo))
        const side = rng() < 0.5 ? -1 : 1
        const d = clear + Math.pow(rng(), 1.4) * cfg.treeBandM
        const x = p.x - p.tz * side * d + (rng() - 0.5) * 3
        const z = p.z + p.tx * side * d + (rng() - 0.5) * 3
        const hit = t.nearby(x, z)
        if (hit && hit.dist < clear) continue
        const sc =
          cfg.treeScale.min + rng() * (cfg.treeScale.max - cfg.treeScale.min)
        const v = Math.floor(rng() * protos.length) % protos.length
        e.set(0, rng() * Math.PI * 2, 0)
        q.setFromEuler(e)
        m4.compose(
          pos.set(x, 0, z),
          q,
          scale.set(sc, sc * (0.9 + rng() * 0.4), sc),
        )
        mats[v].push(m4.clone())
        tints[v].push(
          new THREE.Color().setHSL(
            0.27 + (rng() - 0.5) * 0.08,
            0.35 + rng() * 0.25,
            0.55 + rng() * 0.35,
          ),
        )
        placed++
      }
      protos.forEach((pr, v) => {
        const matrices = mats[v]
        if (!matrices.length) return
        const im = new THREE.InstancedMesh(
          pr.geometry,
          pr.material,
          matrices.length,
        )
        matrices.forEach((mm, i) => {
          im.setMatrixAt(i, mm)
          if (!glb) im.setColorAt(i, tints[v][i])
        })
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        im.castShadow = this.propShadows
        im.name = "tree"
        im.receiveShadow = glb
        im.computeBoundingSphere()
        const bs = im.boundingSphere!
        this.group.add(im)
        this.chunks.push({
          mesh: im,
          hi: pr.geometry,
          lo: (pr as { lod?: THREE.BufferGeometry }).lod,
          far: (pr as { far?: THREE.BufferGeometry }).far,
          total: matrices.length,
          cx: bs.center.x,
          cz: bs.center.z,
          radius: bs.radius,
        })
      })
    }
  }

  async init(scene: THREE.Scene, baseUrl: string) {
    scene.add(this.group)
    this.kit = await loadPropKit(baseUrl)
    this.sky.attach(scene)
    const gMat = new THREE.MeshStandardMaterial({
      color: 0x44602f,
      roughness: 1,
    })
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), gMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -0.08
    this.ground.receiveShadow = true
    this.group.add(this.ground)
    this.buildRoad()
    if (this.track.config.barriers) this.buildBarriers()
    if (this.track.config.startLine) this.buildStartLine()
    this.buildTrees()
    const hills = buildHills(this.group, this.track, this.kit, 14)
    this.hills = hills.hills
    this.hillDress = hills.dress
    if (this.kit) buildClouds(this.group, this.track, this.kit, 28)
    this.setVegetation(this.vegetation * 100)
  }

  createPhysicsGround(R: typeof RAPIER, world: RAPIER.World) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed())
    const col = R.ColliderDesc.cuboid(3000, 5, 3000)
      .setTranslation(0, -4.98, 0)
      .setFriction(1.0)
      .setRestitution(0)
    registerSurface(world, world.createCollider(col, body), (x, z) =>
      this.surfaceAt(x, z),
    )
    hillColliders(R, world, this.hills)
    if (this.wallGeo) {
      const wb = world.createRigidBody(R.RigidBodyDesc.fixed())
      const verts = new Float32Array(
        this.wallGeo.getAttribute("position").array as Float32Array,
      )
      const indices = new Uint32Array(
        this.wallGeo.getIndex()!.array as Uint32Array,
      )
      registerSurface(
        world,
        world.createCollider(
          R.ColliderDesc.trimesh(verts, indices)
            .setFriction(0.4)
            .setRestitution(0.1),
          wb,
        ),
        "grass",
      )
    }
    return body
  }

  update(_carS: number, carPos: THREE.Vector3, _grassTarget = 1) {
    this.sky.update(carPos)
    this.ground.position.x = Math.round(carPos.x / 8) * 8
    this.ground.position.z = Math.round(carPos.z / 8) * 8
    const far = this.sky.fogFar + 40
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - carPos.x, c.cz - carPos.z) - c.radius
      c.mesh.visible = d < far && c.mesh.count > 0
      c.mesh.geometry =
        c.far && d >= FAR_LOD_M ? c.far : c.lo && d >= TREE_LOD_M ? c.lo : c.hi
      c.mesh.castShadow = this.propShadows && d < TREE_SHADOW_M
    }
  }
}
