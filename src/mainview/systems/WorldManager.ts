import type { ClearZone } from "./Airport"
import { Puddles } from "./Puddles"
import { makeHillGeometry } from "./Hills"
import { StreetLights } from "./StreetLights"
import type { SurfaceId } from "../data/surfaces"
import { registerSurface } from "../physics/core/Surfaces"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { WORLD_CONFIG } from "../constants/world"
import { SkyDome } from "./SkyDome"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_PRESETS,
} from "../constants/timeOfDay"

import {
  roadCenterX,
  roadYaw,
  roadDirYaw,
  ROAD_PERIOD,
  roadArcLength,
  roadGapM,
} from "../maps/highway/road"

export {
  roadCenterX,
  roadYaw,
  roadDirYaw,
  ROAD_PERIOD,
  roadArcLength,
  roadGapM,
}

const RIB_DIV = 16

const SKY_DISK_DISTANCE = 1200
const CLOUD_GAP = 80
const CLOUD_RING = 40 * CLOUD_GAP
function fadeOut(d: number, from: number, to: number): number {
  const x = Math.min(1, Math.max(0, (d - from) / (to - from)))
  return 1 - x * x * (3 - 2 * x)
}

const HILL_PERIOD = 44
const hillResidue = (i: number) => -2 + i * 2
const HILL_MAX_RADIUS = 220


function makeRibbonGeometry(
  len: number,
  div: number,
  width: number,
  vRepeat: number,
): THREE.BufferGeometry {
  const rows = div + 1
  const verts = rows * 2
  const pos = new Float32Array(verts * 3)
  const uv = new Float32Array(verts * 2)
  for (let j = 0; j < rows; j++) {
    const v = (j / div) * vRepeat
    uv[j * 2 * 2 + 0] = 0
    uv[j * 2 * 2 + 1] = v
    uv[(j * 2 + 1) * 2 + 0] = 1
    uv[(j * 2 + 1) * 2 + 1] = v
  }
  const idx: number[] = []
  for (let j = 0; j < div; j++) {
    const a = j * 2,
      b = j * 2 + 1,
      c = (j + 1) * 2,
      d = (j + 1) * 2 + 1
    idx.push(a, b, c, b, d, c)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  void len
  void width
  return geo
}

let pavedZones: ClearZone[] = []

export function groundSurfaceAt(x: number, z: number): SurfaceId {
  for (const c of pavedZones) {
    const dx = x - c.x
    const dz = z - c.z
    if (Math.abs(dx * c.ux + dz * c.uz) < c.hl && Math.abs(-dx * c.uz + dz * c.ux) < c.hw) return "asphalt"
  }
  const s = -z
  const tx = (roadCenterX(s + 2) - roadCenterX(s - 2)) / 4
  const across = Math.abs(x - roadCenterX(s)) / Math.hypot(tx, 1)
  return across <= (WORLD_CONFIG.road.width + 2 * WORLD_CONFIG.road.shoulderWidth) / 2 ? "asphalt" : "grass"
}

function writeRibbon(
  geo: THREE.BufferGeometry,
  s0: number,
  len: number,
  div: number,
  width: number,
) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute
  const half = width / 2
  for (let j = 0; j <= div; j++) {
    const s = s0 + (len * j) / div
    const cx = roadCenterX(s)
    const h = 0.5
    const tx = (roadCenterX(s + h) - roadCenterX(s - h)) / (2 * h)
    const inv = 1 / Math.hypot(tx, 1)
    const nx = inv
    const nz = -tx * inv
    const z = -s
    const l = j * 2,
      r = j * 2 + 1
    pos.setXYZ(l, cx - nx * half, 0, z - nz * half)
    pos.setXYZ(r, cx + nx * half, 0, z + nz * half)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 256
  c.height = 256
  const g = c.getContext("2d")!
  g.fillStyle = "#33363b"
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2500; i++) {
    const v = 40 + Math.random() * 25
    g.fillStyle = `rgb(${v},${v},${v + 4})`
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  g.fillStyle = "#e8e8e8"
  g.fillRect(8, 0, 5, 256)
  g.fillRect(243, 0, 5, 256)
  g.fillStyle = "#d8b93a"
  g.fillRect(124, 0, 4, 256)
  g.fillRect(132, 0, 4, 256)
  g.fillStyle = "#cfcfcf"
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(70, y, 4, 32)
    g.fillRect(182, y, 4, 32)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface RoadSeg {
  mesh: THREE.Mesh
  s0: number
}

type PropCategory = "tree" | "rock" | "cloud" | "grass" | "barrel" | "log"

interface PropVariant {
  im: THREE.InstancedMesh
  category: PropCategory
  targetH: number
}

interface PropEntry {
  pos: THREE.Vector3
  rot: number
  scale: number
  variantIdx: number
}

interface CloudEntry {
  pos: THREE.Vector3
  rot: number
  variantIdx: number
  k: number
}

interface Hill {
  mesh: THREE.Mesh
  seg: number
  rotY: number
  radius: number
  height: number
  body?: RAPIER.RigidBody
}

export const TREE_NODES = [
  "ARVORE_SEM",
  "Branches01",
  "Componen12",
  "Group23",
  "Group27",
  "Group4",
  "Group5",
  "Group6",
  "skp3703_1",
  "skp4847_1",
  "skp5771_1",
  "skp665F1",
  "skp7EEA1",
  "skp7EEA_1_",
  "skpC133_1",
  "skpEFB7_1",
]
export const CLOUD_NODES = [
  "NUVEM1",
  "NUVEM_0201",
  "NUVEM_02_1",
  "NUVEM_1_1",
  "NUVEM_2_1",
]

const LIGHTNING_TINT = new THREE.Color(0xe4ecff)

export class WorldManager {
  group = new THREE.Group()
  private roadSegs: RoadSeg[] = []
  private segLen = WORLD_CONFIG.road.segmentLength
  private ground!: THREE.Mesh
  private propVariants: PropVariant[] = []
  private cloudVariants: PropVariant[] = []
  private segProps = new Map<number, PropEntry[]>()
  private segMin = 0
  private segMax = -1
  private maxProps = 18000
  private slotFree = new Map<number, number[]>()
  private slotHigh = new Map<number, number>()
  private segSlots = new Map<number, { vi: number; idx: number }[]>()
  private touchedVariants = new Set<number>()
  private grassDensity = 1
  private propShadows = true
  private readonly SHADOW_FADE_RADIUS = 70
  private shadowFadeMat: THREE.MeshDepthMaterial | null = null
  private timeOfDay: TimeOfDayMode = "day"
  private streetLights: StreetLights | null = null
  private streetLightsShown = true
  private streetLightsPower = true
  private fogEnabled = true
  private fogIntensity = 1
  private sunLight: THREE.DirectionalLight | null = null
  private hemiLight: THREE.HemisphereLight | null = null
  private sunVisual: THREE.Mesh | null = null
  private skyDome: SkyDome | null = null
  private sunOffset = new THREE.Vector3(120, 180, 60)
  private sceneRef: THREE.Scene | null = null
  private starsPoints: THREE.Points | null = null

  /** The light's offset from the ground it shines on: the sun by day, the moon by night. */
  sunDirection(): { x: number; y: number; z: number } {
    return this.sunOffset
  }

  setShadowQuality(pct: number) {
    const sun = this.sunLight
    if (!sun) return
    const q = Math.min(100, Math.max(25, pct)) / 100
    const size = Math.max(1024, Math.round((4096 * q) / 256) * 256)
    const half = 50 + 20 * q
    this.shadowTexel = (2 * half) / size
    const cam = sun.shadow.camera
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      sun.shadow.mapSize.set(size, size)
      sun.shadow.needsUpdate = true
    }
    sun.shadow.radius = 2.5 + (1 - q) * 2
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.updateProjectionMatrix()
  }

  private shadowTexel = 0.1
  private readonly lightRight = new THREE.Vector3()
  private readonly lightUp = new THREE.Vector3()
  private readonly snapped = new THREE.Vector3()

  private snapToShadowGrid(carPos: THREE.Vector3): THREE.Vector3 {
    const dir = this.sunOffset
    const right = this.lightRight.set(0, 1, 0).cross(dir).normalize()
    const up = this.lightUp.copy(dir).cross(right).normalize()
    const texel = this.shadowTexel
    const ground = this.snapped.set(carPos.x, 0, carPos.z)
    const pr = ground.dot(right)
    const pu = ground.dot(up)
    return ground
      .addScaledVector(right, Math.round(pr / texel) * texel - pr)
      .addScaledVector(up, Math.round(pu / texel) * texel - pu)
  }

  setPropShadows(on: boolean) {
    if (on === this.propShadows) return
    this.propShadows = on
    for (const pv of this.propVariants) {
      if (pv.category === "grass" || pv.category === "cloud") continue
      pv.im.castShadow = on
    }
  }

  setLightning(f: number) {
    const preset = TIME_OF_DAY_PRESETS[this.timeOfDay]
    if (!preset) return
    this.puddles?.setFlash(f)
    if (this.hemiLight) this.hemiLight.intensity = preset.hemiIntensity + f * 3.2
    if (this.sunLight) this.sunLight.intensity = preset.sunIntensity + f * 2.5
    const scene = this.sceneRef
    if (!scene) return
    const white = LIGHTNING_TINT
    if (scene.background instanceof THREE.Color) {
      this.hazedSky(scene.background, preset).lerp(white, f * 0.55)
    }
    if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(this.fogEnabled ? preset.fogColor : preset.skyColor).lerp(white, f * 0.5)
    this.syncDome(f)
  }

  surfaceAt(x: number, z: number): SurfaceId {
    return groundSurfaceAt(x, z)
  }

  renderReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, around?: (on: boolean) => void) {
    this.puddles?.renderReflection(renderer, scene, camera, around)
  }

  puddleAt(x: number, z: number): number {
    return this.puddles?.coverageAt(x, z) ?? 0
  }

  private puddleSurface(x: number, z: number, r: number): "road" | "grass" | null {
    const road = WORLD_CONFIG.road
    const s = -z
    const tx = (roadCenterX(s + 2) - roadCenterX(s - 2)) / 4
    const across = Math.abs(x - roadCenterX(s)) / Math.hypot(tx, 1)
    if (across + r <= road.width / 2) return "road"
    if (across - r < (road.width + 2 * road.shoulderWidth) / 2 + 1) return null
    for (const hill of this.hills) {
      const dx = x - hill.mesh.position.x
      const dz = z - hill.mesh.position.z
      const reach = hill.radius * 1.4 + r + 2
      if (dx * dx + dz * dz < reach * reach) return null
    }
    return "grass"
  }

  getTimeOfDay(): TimeOfDayMode {
    return this.timeOfDay
  }

  private clearZones: ClearZone[] = []

  setClearZones(zones: ClearZone[]) {
    const segs = new Set<number>()
    const mark = (list: ClearZone[]) => {
      for (const z of list) {
        const ext = Math.abs(z.uz) * z.hl + Math.abs(z.ux) * z.hw
        const sLo = -(z.z + ext) - 10
        const sHi = -(z.z - ext) + 10
        for (let g = Math.floor(sLo / this.segLen); g <= Math.floor(sHi / this.segLen); g++) {
          segs.add(g)
        }
      }
    }
    mark(this.clearZones)
    mark(zones)
    this.clearZones = zones
    pavedZones = zones.filter((z) => z.paved)
    for (const h of this.hills) {
      const p = h.mesh.position
      if (!this.hillHitsZone(p.x, p.z, h.radius)) continue
      h.seg = -999999
      h.mesh.position.set(p.x + 20000, -0.3, p.z)
      this.syncHillBody(h)
    }
    for (const k of segs) {
      if (!this.segProps.has(k)) continue
      this.freeSeg(k)
      this.segProps.delete(k)
      const cols = this.segColliders.get(k)
      if (cols && this.physWorld) {
        for (const c of cols) this.physWorld.removeCollider(c, false)
      }
      this.segColliders.delete(k)
    }
  }

  private hillHitsZone(x: number, z: number, radius: number): boolean {
    const r = radius * 1.2 + 12
    for (const c of this.clearZones) {
      const dx = x - c.x
      const dz = z - c.z
      const along = Math.abs(dx * c.ux + dz * c.uz)
      const across = Math.abs(-dx * c.uz + dz * c.ux)
      const ex = Math.max(0, along - c.hl)
      const ez = Math.max(0, across - c.hw)
      if (ex * ex + ez * ez < r * r) return true
    }
    return false
  }

  private inClearZone(x: number, z: number): boolean {
    for (const c of this.clearZones) {
      const dx = x - c.x
      const dz = z - c.z
      if (Math.abs(dx * c.ux + dz * c.uz) < c.hl && Math.abs(-dx * c.uz + dz * c.ux) < c.hw) {
        return true
      }
    }
    return false
  }

  private vegetation = 1

  setVegetation(percent: number) {
    const v = Math.min(100, Math.max(0, percent)) / 100
    if (v === this.vegetation) return
    this.vegetation = v
    for (const k of [...this.segProps.keys()]) {
      this.freeSeg(k)
      this.segProps.delete(k)
    }
    this.primed = false
    for (const hill of this.hills) {
      for (const child of hill.mesh.children) {
        const rank = child.userData?.vegRank as number | undefined
        if (rank === undefined) continue
        const show = rank < v
        child.visible = show
        ;(child.userData.collider as RAPIER.Collider | undefined)?.setEnabled(show)
      }
    }
  }

  setStreetLights(show: boolean, power: boolean) {
    this.streetLightsShown = show
    this.streetLightsPower = power
    this.streetLights?.setEnabled(show)
    this.streetLights?.setLit(power && this.timeOfDay !== "day")
  }

  setFog(enabled: boolean, intensity: number) {
    this.fogEnabled = enabled
    this.fogIntensity = Math.max(0.1, intensity)
    this.applyFogRange()
  }

  private hazedSky(out: THREE.Color, preset: (typeof TIME_OF_DAY_PRESETS)[TimeOfDayMode]) {
    out.setHex(preset.skyColor)
    if (!this.fogEnabled) return out
    const haze = Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7))
    return out.lerp(new THREE.Color(preset.fogColor), haze)
  }

  private syncDome(flash = 0) {
    const scene = this.sceneRef
    const fog = scene?.fog
    if (!this.skyDome || !scene || !(fog instanceof THREE.Fog)) return
    const top = new THREE.Color()
    this.hazedSky(top, TIME_OF_DAY_PRESETS[this.timeOfDay])
    const hor = fog.color.clone()
    if (flash > 0) top.lerp(LIGHTNING_TINT, flash * 0.55)
    this.skyDome.setColors(top, hor)
  }

  private withinFog(d: number): boolean {
    const fog = this.sceneRef?.fog
    return !this.fogEnabled || !(fog instanceof THREE.Fog) || d < fog.far + 20
  }

  private applyStars() {
    const sp = this.starsPoints
    if (!sp) return
    const m = this.timeOfDay
    const haze = this.fogEnabled ? Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7)) : 0
    const a = (m === "night" ? 0.6 : m === "sunrise" || m === "evening" ? 0.6 : 0) * (1 - haze)
    sp.visible = a > 0
    const smat = sp.material as THREE.PointsMaterial
    smat.opacity = a
  }

  private applyFogRange() {
    const fog = this.sceneRef?.fog
    if (!(fog instanceof THREE.Fog)) return
    const preset = TIME_OF_DAY_PRESETS[this.timeOfDay]
    if (this.sceneRef?.background instanceof THREE.Color) this.hazedSky(this.sceneRef.background, preset)
    this.cloudLastCarS = -999999
    this.applyStars()
    if (this.sunVisual) {
      const haze = this.fogEnabled ? Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7)) : 0
      ;(this.sunVisual.material as THREE.MeshBasicMaterial).opacity = 1 - 0.9 * haze * haze
    }
    if (!this.fogEnabled) {
      fog.color.setHex(preset.skyColor)
      fog.near = 1300
      fog.far = 2350
      this.syncDome()
      return
    }
    fog.color.setHex(preset.fogColor)
    fog.near = preset.fogNear / this.fogIntensity
    fog.far = preset.fogFar / this.fogIntensity
    this.syncDome()
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.timeOfDay = mode
    this.streetLights?.setLit(this.streetLightsPower && mode !== "day")
    const preset = TIME_OF_DAY_PRESETS[mode]
    if (!preset) return

    this.puddles?.setSky(preset.fogColor)
    this.puddles?.setRain(preset.rain)

    this.sunOffset.set(
      preset.sunPosition.x,
      preset.sunPosition.y,
      preset.sunPosition.z,
    )

    if (this.sunLight) {
      this.sunLight.color.setHex(preset.sunColor)
      this.sunLight.intensity = preset.sunIntensity
    }

    if (this.hemiLight) {
      this.hemiLight.color.setHex(preset.hemiSkyColor)
      this.hemiLight.groundColor.setHex(preset.hemiGroundColor)
      this.hemiLight.intensity = preset.hemiIntensity
    }

    if (this.sunVisual) {
      const mat = this.sunVisual.material as THREE.MeshBasicMaterial
      this.sunVisual.visible = preset.rain === 0
      const k = SKY_DISK_DISTANCE / this.sunOffset.length()
      if (mode === "night") {
        mat.color.setHex(0xdde6ff)
        this.sunVisual.scale.setScalar(0.55 * k)
      } else {
        mat.color.setHex(preset.sunColor)
        this.sunVisual.scale.setScalar(k)
      }
    }

    if (this.sceneRef) {
      if (this.sceneRef.background instanceof THREE.Color) {
        this.hazedSky(this.sceneRef.background, preset)
      } else {
        this.sceneRef.background = new THREE.Color(preset.skyColor)
      }

      if (this.sceneRef.fog instanceof THREE.Fog) {
        this.sceneRef.fog.color.setHex(this.fogEnabled ? preset.fogColor : preset.skyColor)
        this.applyFogRange()
      }
    }

    if (this.ground && preset.groundColor) {
      const gMat = this.ground.material as THREE.MeshStandardMaterial
      if (gMat && gMat.color) {
        gMat.color.setHex(preset.groundColor)
      }
    }

    this.applyStars()
  }

  private shadowFadeMaterial(): THREE.MeshDepthMaterial {
    if (this.shadowFadeMat) return this.shadowFadeMat
    const mat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    })
    const center = this.carPos
    const radius = this.SHADOW_FADE_RADIUS
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uShadowCenter = { value: center }
      sh.uniforms.uShadowRadius = { value: radius }
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vShadowWpos;",
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          #ifdef USE_INSTANCING
            vShadowWpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vShadowWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif`,
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vShadowWpos;
          uniform vec3 uShadowCenter;
          uniform float uShadowRadius;`,
        )
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          if (distance(vShadowWpos, uShadowCenter) > uShadowRadius) discard;`,
        )
    }
    mat.customProgramCacheKey = () => "propShadowFade"
    this.shadowFadeMat = mat
    return mat
  }

  private applyShadowFade(im: THREE.InstancedMesh) {
    im.customDepthMaterial = this.shadowFadeMaterial()
  }
  private readonly SEGS_PER_FRAME = 2
  private primed = false
  private readonly scratchM = new THREE.Matrix4()
  private readonly scratchQ = new THREE.Quaternion()
  private readonly scratchE = new THREE.Euler()
  private readonly scratchS = new THREE.Vector3()
  private static readonly ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0)
  private R?: typeof RAPIER
  private physWorld?: RAPIER.World
  private segColliders = new Map<number, RAPIER.Collider[]>()
  private segColliderSrc = new Map<number, PropEntry[]>()
  private carPos = new THREE.Vector3()
  private hills: Hill[] = []
  private puddles: Puddles | null = null
  private hillRay = new THREE.Raycaster()
  private get segRange() {
    const fog = this.sceneRef?.fog
    if (!this.fogEnabled || !(fog instanceof THREE.Fog)) return 18
    return Math.min(18, Math.max(5, Math.ceil(fog.far / this.segLen) + 2))
  }
  private readonly ROAD_RIB = RIB_DIV
  private loader = new GLTFLoader()

  private readonly NUM_CLOUDS = 40
  private cloudEntries: CloudEntry[] = []
  private cloudLastCarS = -999999
  private readonly GRASS_ENABLED = true

  travelDir = 1
  private lastCarS = Number.NaN

  async init(scene: THREE.Scene, baseUrl: string) {
    const W = WORLD_CONFIG
    this.sceneRef = scene
    scene.add(this.group)
    this.puddles = new Puddles(this.group, (x, z, r) => this.puddleSurface(x, z, r))
    scene.fog = new THREE.Fog(
      W.environment.fogColor,
      W.environment.fogNear,
      W.environment.fogFar,
    )

    const sun = new THREE.DirectionalLight(W.environment.sunColor, 2.2)
    sun.position.set(120, 180, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    sun.shadow.bias = -0.0002
    sun.shadow.normalBias = 0.015
    sun.shadow.camera.left = -70
    sun.shadow.camera.right = 70
    sun.shadow.camera.top = 70
    sun.shadow.camera.bottom = -70
    sun.shadow.camera.far = 500
    this.group.add(sun)
    this.sunLight = sun

    const hemi = new THREE.HemisphereLight(0xbdd7ff, 0x3d5a2a, 0.9)
    this.group.add(hemi)
    this.hemiLight = hemi
    ;(this.group as any)._sun = sun

    const sunGeo = new THREE.SphereGeometry(14, 24, 24)
    const sunMat = new THREE.MeshBasicMaterial({
      color: W.environment.sunColor,
      fog: false,
      transparent: true,
      depthWrite: false,
    })
    const sunVisual = new THREE.Mesh(sunGeo, sunMat)
    sunVisual.frustumCulled = false
    sunVisual.renderOrder = 1
    this.group.add(sunVisual)
    this.sunVisual = sunVisual
    this.skyDome = new SkyDome(this.group)
    this.syncDome()

    const starGeo = new THREE.BufferGeometry()
    const starCount = 1000
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(1 - Math.random() * 1.02)
      const r = 900 + Math.random() * 200
      starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.cos(phi)
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.6,
      transparent: true,
      opacity: 0,
      sizeAttenuation: false,
      depthWrite: false,
      fog: false,
    })
    this.starsPoints = new THREE.Points(starGeo, starMat)
    this.starsPoints.frustumCulled = false
    this.starsPoints.visible = false
    this.group.add(this.starsPoints)

    const gGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1)
    const gMat = new THREE.MeshStandardMaterial({
      color: 0x44602f,
      roughness: 1,
    })
    this.ground = new THREE.Mesh(gGeo, gMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = 0
    this.ground.receiveShadow = true
    this.group.add(this.ground)

    const hillMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    })
    for (let i = 0; i < 22; i++) {
      const far = i % 3 === 2
      const radius = far
        ? 120 + this.rand(i * 613 + 7) * 100
        : 35 + this.rand(i * 613 + 7) * 35
      const height = Math.min(
        far
          ? 80 + this.rand(i * 977 + 13) * 80
          : 15 + this.rand(i * 977 + 13) * 30,
        radius * 0.32,
      )
      const seed = i * 311 + 3
      const hill = new THREE.Mesh(
        this.makeHillGeometry(radius, height, seed),
        hillMat,
      )
      const rotY = this.rand(seed) * Math.PI * 2
      hill.rotation.y = rotY
      hill.castShadow = true
      hill.receiveShadow = true
      this.group.add(hill)
      const seg = hillResidue(i) + HILL_PERIOD * Math.round(-hillResidue(i) / HILL_PERIOD)
      this.hills.push({ mesh: hill, seg: -999999, rotY, radius, height })
      this.placeHill(this.hills[i], seg)
    }

    const tex = makeAsphaltTexture()
    const count = W.road.segmentsAhead + W.road.segmentsBehind
    const roadMat = new THREE.MeshStandardMaterial({
      map: tex.clone(),
      roughness: 1.0,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.roadSegs = []
    for (let i = 0; i < count; i++) {
      const geo = makeRibbonGeometry(
        this.segLen,
        this.ROAD_RIB,
        W.road.width,
        this.segLen / 14,
      )
      const m = new THREE.Mesh(geo, roadMat.clone())
      m.material.map = tex.clone()
      m.material.map!.repeat.set(1, 1)
      m.material.map!.needsUpdate = true
      m.receiveShadow = true
      m.frustumCulled = true
      this.group.add(m)
      this.roadSegs.push({ mesh: m, s0: -999999 })
    }

    let glbRoot: THREE.Object3D | null = null
    try {
      const glb = await this.loader.loadAsync(
        `${baseUrl}models/low_poly_tree_pack.glb`,
      )
      glbRoot = glb.scene
      glbRoot.updateMatrixWorld(true)
    } catch (e) {
      console.warn("low_poly_tree_pack.glb failed to load, using fallback", e)
    }

    if (glbRoot) {
      const nodeByName = new Map<string, THREE.Object3D>()
      glbRoot.traverse((o) => {
        nodeByName.set(o.name, o)
      })

      const buildVariant = (
        category: PropCategory,
        names: string[],
        targetH: number,
        maxInstances: number,
        opts?: { uniformScale?: number },
      ) => {
        for (const name of names) {
          const node = nodeByName.get(name)
          if (!node) {
            console.warn(`prop node not found: ${name}`)
            continue
          }
          node.updateMatrixWorld(true)
          const im = bakeInstanced(node, maxInstances, targetH, opts)
          if (im) {
            im.castShadow = category !== "cloud" && category !== "grass"
            im.receiveShadow = category !== "cloud"
            im.frustumCulled = false
            if (category === "tree") this.applyShadowFade(im)
            this.group.add(im)
            if (category === "cloud") {
              this.cloudVariants.push({ im, category, targetH })
            } else {
              this.propVariants.push({ im, category, targetH })
            }
          }
        }
      }

      buildVariant("tree", TREE_NODES, 6.5, 150)
      buildVariant("cloud", CLOUD_NODES, 14.0, this.NUM_CLOUDS)

      const bakeNodes = (names: string[]): THREE.Group | null => {
        const g = new THREE.Group()
        let found = false
        for (const nm of names) {
          const n = nodeByName.get(nm)
          if (n) {
            g.add(n.clone())
            found = true
          } else console.warn(`prop node not found: ${nm}`)
        }
        if (!found) return null
        g.updateMatrixWorld(true)
        return g
      }
      const pushIM = (
        im: THREE.InstancedMesh | null,
        category: PropCategory,
        targetH: number,
        shadow: boolean,
      ) => {
        if (!im) return
        im.castShadow = shadow
        im.receiveShadow = category !== "cloud"
        im.frustumCulled = false
        if (category !== "grass") this.applyShadowFade(im)
        this.group.add(im)
        this.propVariants.push({ im, category, targetH })
      }

      const g111 = bakeNodes(["Object_111"])
      if (g111) {
        for (const im of bakeSplit(g111, 6, 150, { uniformScale: 0.012 }))
          pushIM(im, "rock", 0.8, true)
      }
      const barrel = bakeNodes(["Object_113", "Object_114"])
      if (barrel) {
        pushIM(bakeInstanced(barrel, 100, 1.5), "barrel", 1.5, true)
      }
      const log = bakeNodes(["Object_111", "Object_112"])
      if (log) {
        pushIM(
          bakeInstanced(log, 100, 0, { uniformScale: 0.006 }),
          "log",
          0.4,
          true,
        )
      }
    } else {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3a22 }),
      )
      trunk.position.y = 1.2
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 5.5, 7),
        new THREE.MeshStandardMaterial({ color: 0x2d5a22, flatShading: true }),
      )
      top.position.y = 5
      const fallback = new THREE.Group()
      fallback.add(trunk, top)
      fallback.updateMatrixWorld(true)
      const im = bakeInstanced(fallback, this.maxProps, 6.5)
      if (im) {
        im.castShadow = true
        im.frustumCulled = false
        this.applyShadowFade(im)
        this.group.add(im)
        this.propVariants.push({ im, category: "tree", targetH: 6.5 })
      }
    }

    this.hills.forEach((h, i) =>
      this.dressHill(h, i * 311 + 3, h.radius > 90 ? 10 : 20),
    )

    this.streetLights = new StreetLights(this.group, roadCenterX)
    await this.streetLights.load(baseUrl)
    this.streetLights.setEnabled(this.streetLightsShown)
    this.streetLights.setLit(this.streetLightsPower && this.timeOfDay !== "day")

    this.initClouds()
    this.update(0, new THREE.Vector3(0, 0, 0))
  }

  private initClouds() {
    if (this.cloudVariants.length === 0) return
    const nV = this.cloudVariants.length
    for (let i = 0; i < this.NUM_CLOUDS; i++) {
      this.cloudEntries.push({
        pos: new THREE.Vector3(0, 60, 0),
        rot: 0,
        variantIdx: i % nV,
        k: Number.NaN,
      })
    }
    this.updateClouds(0, new THREE.Vector3())
  }

  private flushClouds(carS = this.cloudLastCarS) {
    if (this.cloudVariants.length === 0) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const sc = new THREE.Vector3()
    const counters = this.cloudVariants.map(() => 0)
    for (const c of this.cloudEntries) {
      const vi = c.variantIdx % this.cloudVariants.length
      const pv = this.cloudVariants[vi]
      const idx = counters[vi]++
      if (idx >= pv.im.instanceMatrix.count) continue
      e.set(0, c.rot, 0)
      q.setFromEuler(e)
      const cd = Math.abs(-c.pos.z - carS)
      sc.setScalar(this.withinFog(cd) ? fadeOut(cd, 1000, 1500) : 0)
      m.compose(c.pos, q, sc)
      pv.im.setMatrixAt(idx, m)
    }
    this.cloudVariants.forEach((pv, vi) => {
      pv.im.count = counters[vi]
      pv.im.instanceMatrix.needsUpdate = true
    })
  }

  private updateClouds(carS: number, _carPos: THREE.Vector3) {
    if (this.cloudVariants.length === 0) return
    let dirty = Math.abs(carS - this.cloudLastCarS) > 25
    for (let i = 0; i < this.cloudEntries.length; i++) {
      const c = this.cloudEntries[i]
      const base = i * CLOUD_GAP
      const k = Math.round((carS - base) / CLOUD_RING)
      if (k === c.k) continue
      c.k = k
      const seed = i * 4001 + k * 7919
      const s = base + k * CLOUD_RING + (this.rand(seed * 5) - 0.5) * 60
      c.pos.set(
        roadCenterX(s) + (this.rand(seed) - 0.5) * 700,
        60 + this.rand(seed * 7) * 60,
        -s,
      )
      c.rot = this.rand(seed * 11) * Math.PI * 2
      dirty = true
    }
    if (dirty) {
      this.cloudLastCarS = carS
      this.flushClouds(carS)
    }
  }

  createPhysicsGround(R: typeof RAPIER, world: RAPIER.World) {
    const g = R.RigidBodyDesc.fixed()
    const body = world.createRigidBody(g)
    const col = R.ColliderDesc.cuboid(3000, 5, 3000)
      .setTranslation(0, -4.99, 0)
      .setFriction(1.0)
      .setRestitution(0)
    registerSurface(world, world.createCollider(col, body), groundSurfaceAt)
    this.R = R
    this.physWorld = world
    this.streetLights?.attachPhysics(R, world)
    for (const hill of this.hills) {
      const hb = world.createRigidBody(R.RigidBodyDesc.fixed())
      const hg = hill.mesh.geometry as THREE.BufferGeometry
      const hp = hg.getAttribute("position") as THREE.BufferAttribute
      const verts = new Float32Array(hp.array)
      const hidx = hg.getIndex()!
      const indices = new Uint32Array(hidx.array as Uint32Array)
      registerSurface(
        world,
        world.createCollider(
          R.ColliderDesc.trimesh(verts, indices)
            .setFriction(0.9)
            .setRestitution(0),
          hb,
        ),
        "grass",
      )
      hill.body = hb
      this.syncHillBody(hill)
      for (const child of hill.mesh.children) {
        const cm = child as any
        if (!cm.isMesh) continue
        if (!cm.userData?.collidable) continue
        const geo = cm.geometry as THREE.BufferGeometry
        geo.computeBoundingBox()
        const bb = geo.boundingBox
        if (!bb) continue
        const size = new THREE.Vector3()
        bb.getSize(size)
        const center = new THREE.Vector3()
        bb.getCenter(center)
        const he = new THREE.Vector3(
          (size.x * cm.scale.x) / 2,
          (size.y * cm.scale.y) / 2,
          (size.z * cm.scale.z) / 2,
        )
        if (he.x < 1e-4 || he.y < 1e-4 || he.z < 1e-4) continue
        const localCenter = center
          .clone()
          .multiply(cm.scale)
          .applyQuaternion(cm.quaternion)
          .add(cm.position)
        const q = cm.quaternion
        const col = R.ColliderDesc.cuboid(he.x, he.y, he.z)
          .setTranslation(localCenter.x, localCenter.y, localCenter.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.7)
          .setRestitution(0)
        const made = world.createCollider(col, hb)
        cm.userData.collider = made
        if (!cm.visible) made.setEnabled(false)
      }
    }
    this.syncPropColliders()
    return body
  }

  private syncHillBody(hill: Hill) {
    if (!hill.body) return
    const p = hill.mesh.position
    hill.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      hill.rotY,
    )
    hill.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  }

  private syncPropColliders() {
    if (!this.R || !this.physWorld) return
    const R = this.R
    const world = this.physWorld
    for (const [seg, cols] of [...this.segColliders]) {
      if (this.segProps.get(seg) === this.segColliderSrc.get(seg)) continue
      for (const c of cols) world.removeCollider(c, false)
      this.segColliders.delete(seg)
      this.segColliderSrc.delete(seg)
    }
    for (const [seg, props] of this.segProps) {
      if (this.segColliders.has(seg)) continue
      const cols: RAPIER.Collider[] = []
      for (const t of props) {
        const pv = this.propVariants[t.variantIdx]
        if (!pv || pv.category === "grass" || pv.category === "log") continue
        const dx = t.pos.x - this.carPos.x
        const dz = t.pos.z - this.carPos.z
        if (dx * dx + dz * dz < 16) continue
        const isRock = pv.category === "rock"
        const isBarrel = pv.category === "barrel"
        const hh = isRock ? 0.6 : isBarrel ? 0.75 : 1.8
        const hw = isRock ? 1.2 : isBarrel ? 1.5 : 0.4
        const col = R.ColliderDesc.cuboid(hw, hh, hw)
          .setTranslation(t.pos.x, hh, t.pos.z)
          .setFriction(0.7)
          .setRestitution(0)
        cols.push(world.createCollider(col))
      }
      this.segColliders.set(seg, cols)
      this.segColliderSrc.set(seg, props)
    }
  }

  private rand(seed: number) {
    let t = seed + 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  private hillSpot(hill: Hill, seg: number): { x: number; z: number } {
    const sMid = seg * this.segLen + this.segLen / 2
    const cx = roadCenterX(sMid)
    const side = this.rand(seg * 71 + 5) > 0.5 ? 1 : -1
    const far = hill.radius > 90
    const clearance = hill.radius * 1.4 + 12
    const lateral = clearance + this.rand(seg * 131 + 29) * (far ? 450 : 130)
    return {
      x: cx + side * lateral,
      z: -(sMid + (this.rand(seg * 17 + 3) - 0.5) * this.segLen),
    }
  }

  private placeHill(hill: Hill, seg: number) {
    const { x: nx, z: nz } = this.hillSpot(hill, seg)
    const dx = nx - this.carPos.x
    const dz = nz - this.carPos.z
    if (this.hillHitsZone(nx, nz, hill.radius)) return
    const keepOut = hill.radius + 15
    if (hill.seg !== -999999 && dx * dx + dz * dz < keepOut * keepOut) return
    hill.seg = seg
    hill.mesh.position.set(nx, -0.3, nz)
    this.syncHillBody(hill)
  }

  private makeHillGeometry(
    radius: number,
    height: number,
    seed: number,
  ): THREE.BufferGeometry {
    return makeHillGeometry(radius, height, seed)
  }

  private sampleHillSurface(
    geo: THREE.BufferGeometry,
    seed: number,
    count: number,
  ): { pos: THREE.Vector3; nrm: THREE.Vector3 }[] {
    const out: { pos: THREE.Vector3; nrm: THREE.Vector3 }[] = []
    const posA = geo.getAttribute("position") as THREE.BufferAttribute
    const idx = geo.getIndex()
    if (!idx) return out
    const triCount = Math.floor(idx.count / 3)
    const areas = new Float32Array(triCount)
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      cc = new THREE.Vector3()
    let total = 0
    for (let t = 0; t < triCount; t++) {
      a.fromBufferAttribute(posA, idx.getX(t * 3))
      b.fromBufferAttribute(posA, idx.getX(t * 3 + 1))
      cc.fromBufferAttribute(posA, idx.getX(t * 3 + 2))
      const ar = b.clone().sub(a).cross(cc.clone().sub(a)).length() / 2
      areas[t] = ar
      total += ar
    }
    if (total <= 0) return out
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3(),
      n = new THREE.Vector3()
    for (let k = 0; k < count; k++) {
      let r = this.rand(seed + k * 101) * total
      let t = 0
      while (t < triCount - 1 && (r -= areas[t]) > 0) t++
      a.fromBufferAttribute(posA, idx.getX(t * 3))
      b.fromBufferAttribute(posA, idx.getX(t * 3 + 1))
      cc.fromBufferAttribute(posA, idx.getX(t * 3 + 2))
      let u = this.rand(seed + k * 103 + 1)
      let w = this.rand(seed + k * 107 + 2)
      if (u + w > 1) {
        u = 1 - u
        w = 1 - w
      }
      const p = a
        .clone()
        .multiplyScalar(1 - u - w)
        .addScaledVector(b, u)
        .addScaledVector(cc, w)
      e1.copy(b).sub(a)
      e2.copy(cc).sub(a)
      n.copy(e1.cross(e2))
      if (n.lengthSq() < 1e-10) continue
      n.normalize()
      if (n.y < 0) n.negate()
      out.push({ pos: p, nrm: n.clone() })
    }
    return out
  }

  private dressHill(hill: Hill, seed: number, count: number) {
    const treeVars = this.propVariants.filter((p) => p.category === "tree")
    const rockVars = this.propVariants.filter((p) => p.category === "rock")
    const grassVars = this.propVariants.filter((p) => p.category === "grass")
    if (treeVars.length === 0) return
    const spots = this.sampleHillSurface(
      hill.mesh.geometry as THREE.BufferGeometry,
      seed,
      count,
    )
    const yAxis = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    const qy = new THREE.Quaternion()
    spots.forEach((s, k) => {
      const r = this.rand(seed + k * 13)
      const steep = s.nrm.y < 0.55
      let pv: PropVariant | undefined
      let sc: number
      let sink: number
      if (!steep && r < 0.5) {
        pv =
          treeVars[
            Math.floor(this.rand(seed + k * 17) * treeVars.length) %
              treeVars.length
          ]
        sc = 1.6 + this.rand(seed + k * 19) * 1.2
        sink = 0.15
      } else if (r < 0.75 && rockVars.length > 0) {
        pv =
          rockVars[
            Math.floor(this.rand(seed + k * 29) * rockVars.length) %
              rockVars.length
          ]
        sc = 1.2 + this.rand(seed + k * 31) * 1.0
        sink = 0.1
      } else if (grassVars.length > 0) {
        pv =
          grassVars[
            Math.floor(this.rand(seed + k * 37) * grassVars.length) %
              grassVars.length
          ]
        sc = 1.0 + this.rand(seed + k * 41) * 0.8
        sink = 0.05
      } else {
        return
      }
      const m = new THREE.Mesh(
        pv.im.geometry as THREE.BufferGeometry,
        pv.im.material as THREE.Material | THREE.Material[],
      )
      m.castShadow = pv.im.castShadow
      m.receiveShadow = pv.category !== "cloud"
      q.setFromUnitVectors(yAxis, s.nrm)
      qy.setFromAxisAngle(yAxis, this.rand(seed + k * 43) * Math.PI * 2)
      q.premultiply(qy)
      m.quaternion.copy(q)
      m.position.copy(s.pos).addScaledVector(s.nrm, -sink)
      m.scale.setScalar(sc)
      m.userData.collidable = pv.category === "tree" || pv.category === "rock"
      if (pv.category === "tree" || pv.category === "grass") {
        const rank = this.rand(seed + k * 53)
        m.userData.vegRank = rank
        m.visible = rank < this.vegetation
      }
      hill.mesh.add(m)
    })
  }

  private genSegProps(seg: number): PropEntry[] {
    let all = this.genSegPropsAll(seg)
    if (this.clearZones.length > 0) {
      all = all.filter((t) => !this.inClearZone(t.pos.x, t.pos.z))
    }
    if (this.vegetation >= 1) return all
    return all.filter((t) => {
      const cat = this.propVariants[t.variantIdx]?.category
      if (cat !== "tree" && cat !== "grass") return true
      const rank = this.rand(
        Math.floor(t.pos.x * 7) + Math.floor(t.pos.z * 13) * 10007 + seg * 31,
      )
      return rank < this.vegetation
    })
  }

  private genSegPropsAll(seg: number): PropEntry[] {
    const out: PropEntry[] = []
    if (this.propVariants.length === 0) return out
    const W = WORLD_CONFIG.vegetation
    const treeIdxs = this.propVariants
      .map((p, i) => (p.category === "tree" ? i : -1))
      .filter((i) => i >= 0)
    const rockIdxs = this.propVariants
      .map((p, i) => (p.category === "rock" ? i : -1))
      .filter((i) => i >= 0)
    const grassIdxs = this.propVariants
      .map((p, i) => (p.category === "grass" ? i : -1))
      .filter((i) => i >= 0)
    const barrelIdxs = this.propVariants
      .map((p, i) => (p.category === "barrel" ? i : -1))
      .filter((i) => i >= 0)
    const logIdxs = this.propVariants
      .map((p, i) => (p.category === "log" ? i : -1))
      .filter((i) => i >= 0)
    const s0 = seg * this.segLen
    const ROAD_CLEAR = 9.5

    const pushProp = (
      s: number,
      seed: number,
      i: number,
      minDist: number,
      maxDist: number,
      pool: number[],
      baseScale: number,
      y = 0,
    ) => {
      if (pool.length === 0) return
      const cx = roadCenterX(s)
      const side = this.rand(seed * 7 + i * 131) > 0.5 ? 1 : -1
      const dist = Math.max(
        ROAD_CLEAR,
        minDist + this.rand(seed + i * 17) * (maxDist - minDist),
      )
      const variantIdx =
        pool[
          Math.floor(this.rand(seed * 29 + i * 5) * pool.length) % pool.length
        ]
      const scaleVar =
        W.scaleRange.min +
        this.rand(seed * 3 + i * 7) * (W.scaleRange.max - W.scaleRange.min)
      out.push({
        pos: new THREE.Vector3(
          cx + side * dist,
          y,
          -(s + (this.rand(seed * 13 + i) - 0.5) * 8),
        ),
        rot: this.rand(seed + i) * Math.PI * 2,
        scale: scaleVar * baseScale,
        variantIdx,
      })
    }

    for (let s = s0; s < s0 + this.segLen; s += 8) {
      const seed = Math.floor(s) * 7 + seg * 10007
      const n = 2 + Math.floor(this.rand(seed) * 2)
      for (let i = 0; i < n; i++) {
        const roll = this.rand(seed * 31 + i * 53)
        let pool: number[] = treeIdxs
        let base = 1.4
        let minD: number = W.minDistanceFromRoad
        let maxD: number = W.maxDistanceFromRoad
        if (roll > 0.75 && rockIdxs.length > 0) {
          pool = rockIdxs
          base = 1.0
        } else if (roll > 0.9 && barrelIdxs.length > 0) {
          pool = barrelIdxs
          base = 1.0
          minD = 10
          maxD = 50
        } else if (roll > 0.95 && logIdxs.length > 0) {
          pool = logIdxs
          base = 1.0
          minD = 12
          maxD = 50
        }
        if (pool.length === 0) {
          pool = treeIdxs
          base = 1.4
          minD = W.minDistanceFromRoad
          maxD = W.maxDistanceFromRoad
        }
        pushProp(s, seed, i, minD, maxD, pool, base, -0.15)
        if (out.length > 60) return out
      }
    }

    if (this.GRASS_ENABLED) {
      const bands = [
        { step: 2.0, nMin: 4, nMax: 8, minD: 8, maxD: 45, base: 1.0 },
        { step: 4, nMin: 3, nMax: 6, minD: 45, maxD: 120, base: 1.6 },
        { step: 10, nMin: 2, nMax: 4, minD: 120, maxD: 300, base: 2.8 },
      ]
      let gi = 0
      for (const b of bands) {
        for (let s = s0; s < s0 + this.segLen; s += b.step) {
          const seed = Math.floor(s * 4) * 13 + seg * 30011 + 777 + gi * 7919
          const n = b.nMin + Math.floor(this.rand(seed) * (b.nMax - b.nMin + 1))
          for (let i = 0; i < n; i++) {
            pushProp(
              s,
              seed,
              i + 1000 + gi * 500,
              b.minD,
              b.maxD,
              grassIdxs,
              b.base,
              -0.04,
            )
            if (out.length > 900) return out
          }
        }
        gi++
      }
    }
    return out
  }

  private ensureSegs(minSeg: number, maxSeg: number, carSeg: number) {
    if (this.primed && this.segMax >= minSeg && this.segMin <= maxSeg && this.segMax - this.segMin <= maxSeg - minSeg) {
      let complete = true
      for (let s = minSeg; s <= maxSeg; s++) {
        if (!this.segProps.has(s)) {
          complete = false
          break
        }
      }
      if (complete) return
    }
    for (const k of [...this.segProps.keys()]) {
      if (k < minSeg || k > maxSeg) {
        this.freeSeg(k)
        this.segProps.delete(k)
      }
    }
    let total = 0
    for (const arr of this.segProps.values()) total += arr.length
    const missing: number[] = []
    for (let s = minSeg; s <= maxSeg; s++) {
      if (!this.segProps.has(s)) missing.push(s)
    }
    missing.sort((a, b) => Math.abs(a - carSeg) - Math.abs(b - carSeg))
    const budget = this.primed ? this.SEGS_PER_FRAME : missing.length
    for (let i = 0; i < Math.min(budget, missing.length); i++) {
      const s = missing[i]
      const arr = this.genSegProps(s)
      if (total + arr.length > this.maxProps) break
      total += arr.length
      this.segProps.set(s, arr)
      this.integrateSeg(s, arr)
    }
    this.primed = true
    this.segMin = minSeg
    this.segMax = maxSeg
    if (this.touchedVariants.size === 0) return
    this.syncPropColliders()
    for (const vi of this.touchedVariants) {
      const pv = this.propVariants[vi]
      if (pv) pv.im.instanceMatrix.needsUpdate = true
    }
    this.touchedVariants.clear()
  }

  private integrateSeg(seg: number, arr: PropEntry[]) {
    const slots: { vi: number; idx: number }[] = []
    for (const t of arr) {
      const vi = t.variantIdx
      const pv = this.propVariants[vi]
      if (!pv) continue
      const im = pv.im
      const cap = im.instanceMatrix.count
      const free = this.slotFree.get(vi)
      let idx: number
      if (free && free.length > 0) {
        idx = free.pop()!
      } else {
        idx = this.slotHigh.get(vi) ?? 0
        if (idx >= cap) continue
        this.slotHigh.set(vi, idx + 1)
        im.count = idx + 1
      }
      this.scratchE.set(0, t.rot, 0)
      this.scratchQ.setFromEuler(this.scratchE)
      this.scratchS.set(t.scale, t.scale, t.scale)
      this.scratchM.compose(t.pos, this.scratchQ, this.scratchS)
      im.setMatrixAt(idx, this.scratchM)
      slots.push({ vi, idx })
      this.touchedVariants.add(vi)
    }
    this.segSlots.set(seg, slots)
  }

  private freeSeg(seg: number) {
    const slots = this.segSlots.get(seg)
    this.segSlots.delete(seg)
    if (!slots) return
    for (const { vi, idx } of slots) {
      const pv = this.propVariants[vi]
      if (!pv) continue
      pv.im.setMatrixAt(idx, WorldManager.ZERO_M)
      let free = this.slotFree.get(vi)
      if (!free) {
        free = []
        this.slotFree.set(vi, free)
      }
      free.push(idx)
      this.touchedVariants.add(vi)
    }
  }

  update(carS: number, carPos: THREE.Vector3, grassTarget = 1) {
    const W = WORLD_CONFIG
    this.carPos.copy(carPos)
    this.puddles?.update(carPos)
    if (Number.isFinite(this.lastCarS)) {
      const delta = carS - this.lastCarS
      if (delta > 1e-3) this.travelDir = 1
      else if (delta < -1e-3) this.travelDir = -1
    }
    this.lastCarS = carS
    const startS =
      Math.floor((carS - W.road.segmentsBehind * this.segLen) / this.segLen) *
      this.segLen
    for (let i = 0; i < this.roadSegs.length; i++) {
      const s0 = startS + i * this.segLen
      const seg = this.roadSegs[i]
      if (seg.s0 === s0) continue
      seg.s0 = s0
      writeRibbon(
        seg.mesh.geometry as THREE.BufferGeometry,
        s0,
        this.segLen,
        this.ROAD_RIB,
        W.road.width,
      )
      seg.mesh.position.set(0, 0.02, 0)
    }
    this.ground.position.x = Math.round(carPos.x / 8) * 8
    this.ground.position.z = Math.round(carPos.z / 8) * 8
    const sun =
      this.sunLight ??
      ((this.group as any)._sun as THREE.DirectionalLight | undefined)
    if (sun) {
      const f = this.snapToShadowGrid(carPos)
      sun.position.set(f.x + this.sunOffset.x, f.y + this.sunOffset.y, f.z + this.sunOffset.z)
      sun.target.position.set(f.x, 0, f.z)
      sun.target.updateMatrixWorld()
    }
    if (this.sunVisual) {
      const k = SKY_DISK_DISTANCE / this.sunOffset.length()
      this.sunVisual.position.set(
        carPos.x + this.sunOffset.x * k,
        this.sunOffset.y * k,
        carPos.z + this.sunOffset.z * k,
      )
    }
    this.skyDome?.follow(carPos.x, carPos.z)
    if (this.starsPoints && this.starsPoints.visible) {
      this.starsPoints.position.set(carPos.x, 0, carPos.z)
    }
    const carSeg = Math.floor(carS / this.segLen)
    this.ensureSegs(
      carSeg - this.segRange,
      carSeg + this.segRange,
      carSeg,
    )
    for (let i = 0; i < this.hills.length; i++) {
      const h = this.hills[i]
      const r = hillResidue(i)
      const seg = r + HILL_PERIOD * Math.round((carSeg - r) / HILL_PERIOD)
      if (seg !== h.seg) this.placeHill(h, seg)
      const f = fadeOut(Math.hypot(h.mesh.position.x - carPos.x, h.mesh.position.z - carPos.z), 800, 1050)
      h.mesh.visible = f > 0.01 && this.withinFog(Math.hypot(h.mesh.position.x - carPos.x, h.mesh.position.z - carPos.z) - h.radius)
      const sc = Math.max(f, 0.01)
      if (h.mesh.scale.x !== sc) h.mesh.scale.setScalar(sc)
    }
    this.streetLights?.update(carS, carPos)
    this.updateClouds(carS, carPos)
    this.grassDensity += (grassTarget - this.grassDensity) * 0.08
    if (Math.abs(grassTarget - this.grassDensity) < 0.005) {
      this.grassDensity = grassTarget
    }
    if (this.grassDensity < 0.999) {
      for (let vi = 0; vi < this.propVariants.length; vi++) {
        const pv = this.propVariants[vi]
        if (pv.category !== "grass") continue
        const high = this.slotHigh.get(vi) ?? pv.im.count
        pv.im.count = Math.floor(high * this.grassDensity)
      }
    } else {
      for (let vi = 0; vi < this.propVariants.length; vi++) {
        const pv = this.propVariants[vi]
        if (pv.category !== "grass") continue
        const high = this.slotHigh.get(vi)
        if (high !== undefined && pv.im.count !== high) pv.im.count = high
      }
    }
  }

  static sFromPos(p: THREE.Vector3) {
    return -p.z
  }

  terrainHeightAt(x: number, z: number): number {
    let h = 0
    for (const hill of this.hills) {
      const dx = x - hill.mesh.position.x
      const dz = z - hill.mesh.position.z
      const r = hill.radius * 1.4
      if (dx * dx + dz * dz > r * r) continue
      hill.mesh.updateWorldMatrix(true, false)
      this.hillRay.set(
        new THREE.Vector3(x, 400, z),
        new THREE.Vector3(0, -1, 0),
      )
      const hit = this.hillRay.intersectObject(hill.mesh, false)
      if (hit.length > 0 && hit[0].point.y > h) h = hit[0].point.y
    }
    const g0 = Math.floor(-z / this.segLen)
    const reach = Math.ceil((HILL_MAX_RADIUS * 1.3) / this.segLen)
    for (let g = g0 - reach; g <= g0 + reach; g++) {
      const m = (((g + 2) % HILL_PERIOD) + HILL_PERIOD) % HILL_PERIOD
      if (m % 2) continue
      const hill = this.hills[m / 2]
      if (!hill || hill.seg === g) continue
      const spot = this.hillSpot(hill, g)
      const dx = x - spot.x
      const dz = z - spot.z
      const r = hill.radius * 1.3
      if (dx * dx + dz * dz < r * r && hill.height > h) h = hill.height
    }
    return h
  }
}

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
      THREE.BufferAttribute | undefined
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
      THREE.BufferAttribute | undefined
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
    THREE.BufferAttribute | undefined
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
