import type { ClearZone } from "./Airport"
import { Puddles } from "./Puddles"
import { makeHillGeometry } from "./Hills"
import { StreetLights } from "./StreetLights"
import type { SurfaceId } from "../data/surfaces"
import * as THREE from "three"
import { createGLTFLoader } from "./gltf"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { WORLD_CONFIG } from "../constants/world"
import { SkyDome } from "./SkyDome"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_PRESETS,
  type TimeOfDayPreset,
} from "../constants/timeOfDay"
import {
  roadCenterX,
  roadYaw,
  roadDirYaw,
  ROAD_PERIOD,
  roadArcLength,
  roadGapM,
} from "../maps/highway/road"
import { HILL_FADE_TO, LIGHTNING_TINT, RIB_DIV } from "./world/constants"
import { groundSurfaceAt } from "./world/ribbon"
import {
  RoadSeg,
  PropVariant,
  PropEntry,
  CloudEntry,
  Hill,
} from "./world/types"
import {
  addFarTwin,
  genSegProps,
  genSegPropsAll,
  ensureSegs,
  integrateSeg,
  freeSeg,
  applyFarLod,
  syncPropColliders,
} from "./world/propStreaming"
import { addShadowProxy, syncShadowCasters } from "./world/shadowCasters"
import {
  hillSpot,
  placeHill,
  dressHill,
  hillHitsZone,
  syncHillBody,
  inClearZone,
} from "./world/hills"
import { initClouds, flushClouds, updateClouds } from "./world/clouds"
import {
  hazedSky,
  syncDome,
  withinFog,
  applyStars,
  applyFogRange,
  clampDrawDistance,
  shadowFadeMaterial,
} from "./world/environment"
import { init } from "./world/init"
import { update, terrainHeightAt } from "./world/update"
import { createPhysicsGround } from "./world/physics"
import {
  setTimeOfDay,
  setSkyPreset,
  setShadowQuality,
  setClearZones,
} from "./world/timeOfDay"

export {
  roadCenterX,
  roadYaw,
  roadDirYaw,
  ROAD_PERIOD,
  roadArcLength,
  roadGapM,
}

export class WorldManager {
  init = init
  update = update
  addShadowProxy = addShadowProxy
  syncShadowCasters = syncShadowCasters
  shadowSyncX = Number.NaN
  shadowSyncZ = Number.NaN
  terrainHeightAt = terrainHeightAt
  createPhysicsGround = createPhysicsGround
  setTimeOfDay = setTimeOfDay
  setSkyPreset = setSkyPreset
  setShadowQuality = setShadowQuality
  setClearZones = setClearZones
  addFarTwin = addFarTwin
  genSegProps = genSegProps
  genSegPropsAll = genSegPropsAll
  ensureSegs = ensureSegs
  integrateSeg = integrateSeg
  freeSeg = freeSeg
  applyFarLod = applyFarLod
  syncPropColliders = syncPropColliders
  hillSpot = hillSpot
  placeHill = placeHill
  dressHill = dressHill
  hillHitsZone = hillHitsZone
  syncHillBody = syncHillBody
  inClearZone = inClearZone
  initClouds = initClouds
  flushClouds = flushClouds
  updateClouds = updateClouds
  hazedSky = hazedSky
  syncDome = syncDome
  withinFog = withinFog
  applyStars = applyStars
  applyFogRange = applyFogRange
  clampDrawDistance = clampDrawDistance
  shadowFadeMaterial = shadowFadeMaterial
  group = new THREE.Group()
  roadSegs: RoadSeg[] = []
  segLen = WORLD_CONFIG.road.segmentLength
  ground!: THREE.Mesh
  propVariants: PropVariant[] = []
  cloudVariants: PropVariant[] = []
  segProps = new Map<number, PropEntry[]>()
  segMin = 0
  segMax = -1
  maxProps = 36000
  slotFree = new Map<number, number[]>()
  slotHigh = new Map<number, number>()
  segSlots = new Map<number, { vi: number; idx: number; t: PropEntry }[]>()
  segFar = new Map<number, boolean>()
  touchedVariants = new Set<number>()
  grassDensity = 1
  private readonly reflSkip: THREE.InstancedMesh[] = []
  private readonly reflSkipState: boolean[] = []
  propShadows = true
  readonly SHADOW_FADE_RADIUS = 70
  shadowFadeMat: THREE.MeshDepthMaterial | null = null
  timeOfDay: TimeOfDayMode = "day"
  preset: TimeOfDayPreset = TIME_OF_DAY_PRESETS.day
  lampsLit = false
  streetLights: StreetLights | null = null
  streetLightsShown = true
  streetLightsPower = true
  fogEnabled = true
  fogIntensity = 1
  sunLight: THREE.DirectionalLight | null = null
  hemiLight: THREE.HemisphereLight | null = null
  sunVisual: THREE.Sprite | null = null
  skyDome: SkyDome | null = null
  sunOffset = new THREE.Vector3(120, 180, 60)
  readonly shadowOffset = new THREE.Vector3(120, 180, 60)
  sceneRef: THREE.Scene | null = null
  starsPoints: THREE.Points | null = null

  sunDirection(): { x: number; y: number; z: number } {
    return this.sunOffset
  }

  shadowTexel = 0.1
  shadowAhead = 0
  shadowDirX = 0
  shadowDirZ = 0
  readonly shadowFocusPos = new THREE.Vector3()
  setShadowFocus(dirX: number, dirZ: number) {
    this.shadowDirX = dirX
    this.shadowDirZ = dirZ
  }
  readonly lightRight = new THREE.Vector3()
  readonly lightUp = new THREE.Vector3()
  readonly snapped = new THREE.Vector3()

  snapToShadowGrid(carPos: THREE.Vector3): THREE.Vector3 {
    const dir = this.shadowOffset
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
      ;(pv.shadowIm ?? pv.im).castShadow = on
    }
  }

  setLightning(f: number) {
    const preset = this.preset
    if (!preset) return
    this.puddles?.setFlash(f)
    if (this.hemiLight)
      this.hemiLight.intensity = preset.hemiIntensity + f * 3.2
    if (this.sunLight) this.sunLight.intensity = preset.sunIntensity + f * 2.5
    const scene = this.sceneRef
    if (!scene) return
    const white = LIGHTNING_TINT
    if (scene.background instanceof THREE.Color) {
      this.hazedSky(scene.background, preset).lerp(white, f * 0.55)
    }
    if (scene.fog instanceof THREE.Fog)
      scene.fog.color
        .setHex(this.fogEnabled ? preset.fogColor : preset.skyColor)
        .lerp(white, f * 0.5)
    this.syncDome(f)
  }

  surfaceAt(x: number, z: number): SurfaceId {
    return groundSurfaceAt(x, z)
  }

  prewarmReflections(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.puddles?.prewarmReflection(renderer, scene, camera)
  }

  async prewarmReflectionsAsync(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    await this.puddles?.prewarmReflectionAsync(renderer, scene, camera)
  }

  renderReflections(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    around?: (on: boolean) => void,
    quality?: number,
    internalScale?: number,
  ) {
    const skip = this.reflSkip
    skip.length = 0
    for (const pv of this.propVariants)
      if (
        pv.category === "grass" ||
        pv.category === "rock" ||
        pv.category === "log" ||
        pv.category === "barrel"
      ) {
        skip.push(pv.im)
        if (pv.far) skip.push(pv.far)
      }
    const wrapped = (on: boolean) => {
      if (on) {
        this.reflSkipState.length = 0
        for (const im of skip) {
          this.reflSkipState.push(im.visible)
          im.visible = false
        }
      } else {
        for (let i = 0; i < skip.length; i++)
          skip[i].visible = this.reflSkipState[i]
      }
      around?.(on)
    }
    this.puddles?.renderReflection(
      renderer,
      scene,
      camera,
      wrapped,
      quality,
      internalScale,
    )
  }

  puddleAt(x: number, z: number): number {
    return this.puddles?.coverageAt(x, z) ?? 0
  }

  puddleSurface(
    x: number,
    z: number,
    r: number,
  ): "road" | "edge" | "grass" | null {
    const road = WORLD_CONFIG.road
    const s = -z
    const tx = (roadCenterX(s + 2) - roadCenterX(s - 2)) / 4
    const across = Math.abs(x - roadCenterX(s)) / Math.hypot(tx, 1)
    if (across + r <= road.width / 2) return "road"
    if (across - r < road.width / 2 && across + r > road.width / 2) {
      if (across + r > road.width / 2 + road.shoulderWidth + 2.5) return null
      for (const hill of this.hills) {
        const dx = x - hill.mesh.position.x
        const dz = z - hill.mesh.position.z
        const reach = hill.radius * 1.4 + r + 2
        if (dx * dx + dz * dz < reach * reach) return null
      }
      return "edge"
    }
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

  clearZones: ClearZone[] = []

  vegetation = 1

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
        ;(child.userData.collider as RAPIER.Collider | undefined)?.setEnabled(
          show,
        )
      }
    }
  }

  setStreetLights(show: boolean, power: boolean) {
    this.streetLightsShown = show
    this.streetLightsPower = power
    this.streetLights?.setEnabled(show)
    this.streetLights?.setLit(power && this.lampsLit)
  }

  drawDistance = 5000

  setDrawDistance(percent: number) {
    this.drawDistance = (5000 * Math.min(100, Math.max(20, percent))) / 100
    this.applyFogRange()
  }

  setFog(enabled: boolean, intensity: number) {
    this.fogEnabled = enabled
    this.fogIntensity = Math.max(0.1, intensity)
    this.applyFogRange()
  }

  applyShadowFade(im: THREE.InstancedMesh) {
    im.customDepthMaterial = this.shadowFadeMaterial()
  }
  readonly SEGS_PER_FRAME = 2
  primed = false
  readonly scratchM = new THREE.Matrix4()
  readonly scratchQ = new THREE.Quaternion()
  readonly scratchE = new THREE.Euler()
  readonly scratchS = new THREE.Vector3()
  R?: typeof RAPIER
  physWorld?: RAPIER.World
  segColliders = new Map<number, RAPIER.Collider[]>()
  segColliderSrc = new Map<number, PropEntry[]>()
  carPos = new THREE.Vector3()
  hills: Hill[] = []
  puddles: Puddles | null = null
  roadWetShown = -1
  hillRay = new THREE.Raycaster()
  get segRange() {
    const fog = this.sceneRef?.fog
    const cap = Math.ceil(HILL_FADE_TO / this.segLen) + 2
    if (!(fog instanceof THREE.Fog)) return Math.min(18, cap)
    return Math.min(cap, Math.max(5, Math.ceil(fog.far / this.segLen) + 2))
  }
  readonly ROAD_RIB = RIB_DIV
  loader = createGLTFLoader()

  readonly NUM_CLOUDS = 40
  cloudEntries: CloudEntry[] = []
  cloudLastCarS = -999999
  readonly GRASS_ENABLED = true

  travelDir = 1
  lastCarS = Number.NaN

  rand(seed: number) {
    let t = seed + 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  makeHillGeometry(
    radius: number,
    height: number,
    seed: number,
  ): THREE.BufferGeometry {
    return makeHillGeometry(radius, height, seed)
  }

  sampleHillSurface(
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

  static sFromPos(p: THREE.Vector3) {
    return -p.z
  }
}

export { TREE_NODES, CLOUD_NODES } from "./world/nodes"
export { bakeInstanced, bakeSplit } from "./world/bake"
export { groundSurfaceAt } from "./world/ribbon"
