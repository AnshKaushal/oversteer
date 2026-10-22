import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { CAR_PHYSICS } from "../constants/physics"
import type { WheelDef } from "./Suspension"
import { tintCar, whitenRims, type PaintTextureRule } from "./carTint"
import {
  applyBrakeHeat,
  collectBrakeLights,
  type BrakeLight,
} from "./carLights"

export const CAR_MODEL_YAW = Math.PI

export const SUSP_VISUAL_REF = 0.074

export interface CarVisualOptions {
  modelFile?: string
  targetLength?: number
  pivots?: { pattern?: string; names?: string[] }
  wheelSpots?: readonly WheelDef[]
  wheelRadius?: number
  paintMatch?: string[]
  paintTexture?: PaintTextureRule
  isPlayer?: boolean
}

export const MIN_PIVOT_FRAC = 0.025

const DEFAULT_MODEL = "models/bmw_m3.glb"
const DEFAULT_PIVOT_PATTERN = "^Plane00[3-6]$"

const modelCache = new Map<
  string,
  THREE.Object3D | Promise<THREE.Object3D | null>
>()

const _poseOff = new THREE.Vector3()

let loBodyGeo: THREE.BufferGeometry | null = null
let loCabinGeo: THREE.BufferGeometry | null = null
const loWheelGeos = new Map<number, THREE.BufferGeometry>()
const loWheelMat = new THREE.MeshStandardMaterial({
  color: 0x141414,
  roughness: 0.9,
})

function loGeos(wheelRadius: number): {
  body: THREE.BufferGeometry
  cabin: THREE.BufferGeometry
  wheel: THREE.BufferGeometry
} {
  if (!loBodyGeo || !loCabinGeo) {
    loBodyGeo = new THREE.BoxGeometry(1.8, 0.55, 4.7)
    loCabinGeo = new THREE.BoxGeometry(1.6, 0.5, 2.1)
  }
  let wheel = loWheelGeos.get(wheelRadius)
  if (!wheel) {
    const w = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.26, 8)
    w.rotateZ(Math.PI / 2)
    wheel = w
    loWheelGeos.set(wheelRadius, wheel)
  }
  return { body: loBodyGeo, cabin: loCabinGeo, wheel }
}

async function loadSharedModel(
  baseUrl: string,
  modelFile: string,
): Promise<THREE.Object3D | null> {
  const key = `${baseUrl}${modelFile}`
  const hit = modelCache.get(key)
  if (hit) return hit
  const load = new GLTFLoader()
    .loadAsync(key)
    .then((glb) => {
      const scene = glb.scene
      modelCache.set(key, scene)
      return scene as THREE.Object3D | null
    })
    .catch((e) => {
      modelCache.delete(key)
      throw e
    })
  modelCache.set(key, load)
  return load
}

export function pivotMatches(
  name: string,
  pivots?: { pattern?: string; names?: string[] },
): boolean {
  if (pivots?.names) return pivots.names.includes(name)
  return new RegExp(pivots?.pattern ?? DEFAULT_PIVOT_PATTERN, "i").test(name)
}

let sharedBeamGeo: THREE.PlaneGeometry | null = null
let sharedBeamMat: THREE.MeshBasicMaterial | null = null

function getSharedBeamMesh(): THREE.Mesh {
  if (!sharedBeamGeo) {
    sharedBeamGeo = new THREE.PlaneGeometry(4.2, 22)
    sharedBeamGeo.rotateX(-Math.PI / 2)
  }
  if (!sharedBeamMat) {
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 512
    const ctx = canvas.getContext("2d")!
    const imgData = ctx.createImageData(256, 512)
    const data = imgData.data

    for (let py = 0; py < 512; py++) {
      // v runs from 0 (bumper, py=511) to 1 (far distance, py=0)
      const v = (511 - py) / 511

      let longAtten = 0
      if (v < 0.05) {
        longAtten = v / 0.05
      } else {
        longAtten = Math.pow(1 - (v - 0.05) / 0.95, 1.8)
      }

      const leftCenter = 0.38 - v * 0.12
      const rightCenter = 0.62 + v * 0.12
      const beamRadius = 0.18 + v * 0.22

      for (let px = 0; px < 256; px++) {
        const u = px / 255
        const dLeft = Math.abs(u - leftCenter) / beamRadius
        const dRight = Math.abs(u - rightCenter) / beamRadius

        const attenLeft = dLeft < 1 ? Math.cos(dLeft * Math.PI * 0.5) : 0
        const attenRight = dRight < 1 ? Math.cos(dRight * Math.PI * 0.5) : 0

        const latAtten = Math.min(
          1,
          Math.pow(attenLeft, 1.5) + Math.pow(attenRight, 1.5),
        )
        const brightness = Math.max(0, Math.min(1, longAtten * latAtten))

        const idx = (py * 256 + px) * 4
        data[idx] = Math.round(255 * brightness)
        data[idx + 1] = Math.round(248 * brightness)
        data[idx + 2] = Math.round(225 * brightness)
        data[idx + 3] = Math.round(255 * brightness)
      }
    }
    ctx.putImageData(imgData, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true

    sharedBeamMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      toneMapped: false,
      opacity: 0.82,
    })
  }

  return new THREE.Mesh(sharedBeamGeo, sharedBeamMat)
}

export class CarVisual {
  group = new THREE.Group()
  wheels: {
    mesh: THREE.Object3D
    front: boolean
    left: boolean
    baseY: number
  }[] = []
  private spinAngles = [0, 0, 0, 0]
  castShadow = true
  private hiBody: THREE.Object3D | null = null
  private loGroup: THREE.Group | null = null
  private hiDetail = true
  private tintedMats: THREE.MeshStandardMaterial[] = []
  private loPaint: THREE.MeshStandardMaterial | null = null
  private lastTint: number | undefined = undefined
  private hiMerged: THREE.Object3D[] = []
  private brakeLights: BrakeLight[] = []
  private brakeLevel = 0
  private headlightsOn = false
  private headlightsWanted = false
  private headlightGroup: THREE.Group | null = null
  private headlightMeshes: THREE.Object3D[] = []
  private headlightSpots: THREE.SpotLight[] = []
  private headlightMats: { mat: THREE.MeshStandardMaterial; origIntensity: number }[] = []
  private isPlayerCar = false
  private headlightsConfigured = false

  async load(
    baseUrl: string,
    tint?: number,
    opts?: CarVisualOptions,
  ): Promise<void> {
    const modelFile = opts?.modelFile ?? DEFAULT_MODEL
    const source = await loadSharedModel(baseUrl, modelFile)
    if (!source) throw new Error("Model not loaded")
    const effective = this.lastTint ?? tint
    const model = source.clone(true)
    this.tintedMats =
      effective !== undefined
        ? tintCar(model, effective, {
            match: opts?.paintMatch,
            texture: opts?.paintTexture,
          })
        : []
    whitenRims(model)
    this.brakeLights = collectBrakeLights(model)
    model.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = this.castShadow
        o.receiveShadow = false
      }
    })

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const targetLen = opts?.targetLength ?? CAR_PHYSICS.dimensions.length
    const longest = Math.max(size.x, size.y, size.z)
    const s = longest > 0 ? targetLen / longest : 1
    model.scale.multiplyScalar(s)

    let boxA = new THREE.Box3().setFromObject(model)
    const sx0 = boxA.max.x - boxA.min.x
    const sz0 = boxA.max.z - boxA.min.z
    let alignYaw = 0
    if (sx0 > sz0) alignYaw = Math.PI / 2
    model.rotation.y = alignYaw + CAR_MODEL_YAW
    boxA = new THREE.Box3().setFromObject(model)
    model.position.x -= (boxA.min.x + boxA.max.x) / 2
    model.position.z -= (boxA.min.z + boxA.max.z) / 2
    model.position.y -= boxA.min.y
    this.group.add(model)
    this.hiBody = model
    this.buildImposter(
      this.lastTint ?? tint,
      opts?.wheelSpots,
      opts?.wheelRadius ?? CAR_PHYSICS.wheels.radius,
    )

    this.group.updateMatrixWorld(true)
    const wheelGroups: THREE.Object3D[] = []
    const pivotBox = new THREE.Box3()
    const pivotSize = new THREE.Vector3()
    const minPivot = longest * s * MIN_PIVOT_FRAC
    model.traverse((o: any) => {
      if (
        !o.isMesh &&
        o.children.length > 0 &&
        pivotMatches(o.name, opts?.pivots)
      ) {
        pivotBox.setFromObject(o)
        pivotBox.getSize(pivotSize)
        if (
          pivotSize.x < minPivot ||
          pivotSize.y < minPivot ||
          pivotSize.z < minPivot
        ) {
          return
        }
        wheelGroups.push(o)
      }
    })

    if (wheelGroups.length === 4) {
      const wbox = new THREE.Box3()
      const center = new THREE.Vector3()
      for (const wg of wheelGroups) {
        wbox.setFromObject(wg)
        wbox.getCenter(center)
        this.group.worldToLocal(center)
        const pivot = new THREE.Group()
        pivot.position.copy(center)
        pivot.rotation.order = "YXZ"
        this.group.add(pivot)
        pivot.attach(wg)
        const front = center.z < 0
        this.wheels.push({
          mesh: pivot,
          front,
          left: center.x < 0,
          baseY: pivot.position.y,
        })
      }
    }

    if (this.wheels.length !== 4) {
      this.wheels = []
      const wr = opts?.wheelRadius ?? CAR_PHYSICS.wheels.radius
      const geo = new THREE.CylinderGeometry(wr, wr, 0.26, 18)
      geo.rotateZ(Math.PI / 2)
      const mat = new THREE.MeshStandardMaterial({
        color: 0x141414,
        roughness: 0.9,
      })
      const rimG = new THREE.CylinderGeometry(wr * 0.58, wr * 0.58, 0.27, 8)
      rimG.rotateZ(Math.PI / 2)
      const rimM = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.4,
      })
      const spots: readonly WheelDef[] = opts?.wheelSpots ?? [
        { x: -0.76, z: -1.51, front: true, left: true },
        { x: 0.76, z: -1.51, front: true, left: false },
        { x: -0.76, z: 1.31, front: false, left: true },
        { x: 0.76, z: 1.31, front: false, left: false },
      ]
      for (const sp of spots) {
        const pivot = new THREE.Group()
        pivot.position.set(sp.x, wr, sp.z)
        pivot.rotation.order = "YXZ"
        const w = new THREE.Mesh(geo, mat)
        w.castShadow = this.castShadow
        const rim = new THREE.Mesh(rimG, rimM)
        pivot.add(w, rim)
        this.group.add(pivot)
        this.wheels.push({
          mesh: pivot,
          front: sp.front,
          left: sp.left,
          baseY: pivot.position.y,
        })
      }
    }
    this.wheels.sort(
      (a, b) =>
        (a.front ? 0 : 2) +
        (a.left ? 0 : 1) -
        ((b.front ? 0 : 2) + (b.left ? 0 : 1)),
    )
    this.mergeStatic()
    this.setupHeadlights(opts?.isPlayer ?? false)
    if (this.headlightsWanted) {
      this.setHeadlights(this.headlightsWanted)
    }
  }

  private buildImposter(
    tint?: number,
    wheelSpots?: readonly WheelDef[],
    wheelRadius?: number,
  ) {
    const wr = wheelRadius ?? CAR_PHYSICS.wheels.radius
    const g = loGeos(wr)
    const lo = new THREE.Group()
    const paint = new THREE.MeshStandardMaterial({
      color: tint ?? 0x8a8f96,
      roughness: 0.6,
      metalness: 0.3,
    })
    this.loPaint = paint
    const glass = new THREE.MeshStandardMaterial({
      color: 0x101418,
      roughness: 0.25,
      metalness: 0.6,
    })
    const bodyM = new THREE.Mesh(g.body, paint)
    bodyM.position.y = 0.55
    const cabinM = new THREE.Mesh(g.cabin, glass)
    cabinM.position.set(0, 1.05, 0.25)
    lo.add(bodyM, cabinM)
    const spots = (wheelSpots ?? [
      { x: -0.76, z: -1.51 },
      { x: 0.76, z: -1.51 },
      { x: -0.76, z: 1.31 },
      { x: 0.76, z: 1.31 },
    ]) as readonly { x: number; z: number }[]
    for (const { x, z } of spots) {
      const w = new THREE.Mesh(g.wheel, loWheelMat)
      w.position.set(x, wr, z)
      lo.add(w)
    }
    lo.visible = false
    this.group.add(lo)
    this.loGroup = lo
  }

  setDetail(hi: boolean) {
    if (hi === this.hiDetail) return
    if (!this.hiBody || !this.loGroup) return
    this.hiDetail = hi
    this.hiBody.visible = hi
    for (const w of this.wheels) w.mesh.visible = hi
    for (const m of this.hiMerged) m.visible = hi
    this.loGroup.visible = !hi
  }

  private mergeStatic() {
    if (!this.hiBody) return
    this.group.updateMatrixWorld(true)
    const skip = new Set<THREE.Object3D>()
    if (this.loGroup) skip.add(this.loGroup)
    for (const w of this.wheels) {
      w.mesh.traverse((o) => skip.add(o))
    }
    this.mergeInto([this.hiBody], this.group, null, skip)
    for (const w of this.wheels) {
      const inv = w.mesh.matrixWorld.clone().invert()
      this.mergeInto([w.mesh], w.mesh, inv, new Set())
    }
  }

  private mergeInto(
    roots: THREE.Object3D[],
    target: THREE.Object3D,
    toLocal: THREE.Matrix4 | null,
    exclude: Set<THREE.Object3D>,
  ) {
    const buckets = new Map<
      string,
      { mat: THREE.Material; geos: THREE.BufferGeometry[]; src: THREE.Mesh[] }
    >()
    const visit = (o: THREE.Object3D) => {
      if (exclude.has(o)) return
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && !(mesh as any).isSkinnedMesh) {
        const mat = mesh.material as THREE.Material | THREE.Material[]
        const g = mesh.geometry as THREE.BufferGeometry | undefined
        if (
          mat &&
          !Array.isArray(mat) &&
          g &&
          g.getAttribute("position") &&
          Object.keys(g.morphAttributes ?? {}).length === 0 &&
          !(mat as any).vertexColors
        ) {
          const needsUv = !!(mat as any).map
          if (!needsUv || g.getAttribute("uv")) {
            let b = buckets.get(mat.uuid)
            if (!b) {
              b = { mat, geos: [], src: [] }
              buckets.set(mat.uuid, b)
            }
            b.geos.push(g)
            b.src.push(mesh)
          }
        }
      }
      for (const c of o.children) visit(c)
    }
    for (const r of roots) visit(r)
    for (const { mat, geos, src } of buckets.values()) {
      if (geos.length < 2) continue
      const hasUv = geos.every((g) => !!g.getAttribute("uv"))
      const prepped: THREE.BufferGeometry[] = []
      for (let i = 0; i < geos.length; i++) {
        const g = geos[i].clone()
        if (toLocal)
          g.applyMatrix4(toLocal.clone().multiply(src[i].matrixWorld))
        else g.applyMatrix4(src[i].matrixWorld)
        const ng = g.index ? g.toNonIndexed() : g
        if (!hasUv) ng.deleteAttribute("uv")
        ng.deleteAttribute("tangent")
        ng.deleteAttribute("uv1")
        ng.deleteAttribute("uv2")
        ng.deleteAttribute("uv3")
        ng.deleteAttribute("color")
        prepped.push(ng)
      }
      let merged: THREE.BufferGeometry | null = null
      try {
        merged = mergeGeometries(prepped, false)
      } catch {
        merged = null
      }
      for (const g of prepped) g.dispose()
      if (!merged) continue
      for (const m of src) m.visible = false
      const out = new THREE.Mesh(merged, mat)
      out.castShadow = this.castShadow
      out.receiveShadow = false
      target.add(out)
      this.hiMerged.push(out)
    }
  }

  setBrake(level: number) {
    if (this.brakeLights.length === 0) return
    const want = Math.max(0, Math.min(1, level))
    if (want === this.brakeLevel) return
    this.brakeLevel = want
    for (const l of this.brakeLights) applyBrakeHeat(l, want)
  }

  setupHeadlights(isPlayer: boolean = false) {
    if (this.headlightsConfigured) {
      if (isPlayer && !this.isPlayerCar) {
        this.isPlayerCar = true
        if (this.headlightGroup) {
          const existingBeam = this.headlightGroup.getObjectByName("groundBeam")
          if (existingBeam) {
            this.headlightGroup.remove(existingBeam)
          }
        }
        if (this.headlightGroup && this.headlightSpots.length === 0) {
          const box = new THREE.Box3().setFromObject(this.hiBody ?? this.group)
          const size = box.getSize(new THREE.Vector3())
          const halfLen = size.z > 0 ? size.z / 2 : 2.35
          const halfWidth = size.x > 0 ? size.x / 2 : 0.92
          const headlightSpacing = Math.max(0.55, Math.min(0.78, halfWidth * 0.70))
          const headlightY = Math.max(0.55, Math.min(0.72, size.y * 0.48))
          const frontZ = -halfLen * 0.90

          const leftSpot = new THREE.SpotLight(
            0xfffaee,
            this.headlightsOn ? 28 : 0,
            65,
            Math.PI / 4.2,
            0.85,
            1.1,
          )
          leftSpot.position.set(-headlightSpacing, headlightY, frontZ)
          leftSpot.castShadow = false
          leftSpot.target.position.set(-headlightSpacing * 0.75, 0, frontZ - 18)
          leftSpot.visible = this.headlightsOn

          const rightSpot = new THREE.SpotLight(
            0xfffaee,
            this.headlightsOn ? 28 : 0,
            65,
            Math.PI / 4.2,
            0.85,
            1.1,
          )
          rightSpot.position.set(headlightSpacing, headlightY, frontZ)
          rightSpot.castShadow = false
          rightSpot.target.position.set(headlightSpacing * 0.75, 0, frontZ - 18)
          rightSpot.visible = this.headlightsOn

          this.headlightGroup.add(leftSpot.target, rightSpot.target)
          this.headlightGroup.add(leftSpot, rightSpot)
          this.headlightSpots = [leftSpot, rightSpot]
        }
      }
      return
    }
    this.headlightsConfigured = true
    this.isPlayerCar = isPlayer

    const box = new THREE.Box3().setFromObject(this.hiBody ?? this.group)
    const size = box.getSize(new THREE.Vector3())
    const halfLen = size.z > 0 ? size.z / 2 : 2.35
    const halfWidth = size.x > 0 ? size.x / 2 : 0.92

    let headlightSpacing = Math.max(0.55, Math.min(0.78, halfWidth * 0.70))
    let headlightY = Math.max(0.55, Math.min(0.72, size.y * 0.48))
    let frontZ = -halfLen * 0.90

    if (this.hiBody) {
      const foundY: number[] = []
      const foundZ: number[] = []
      const foundX: number[] = []
      this.hiBody.traverse((o: any) => {
        if (!o.isMesh) return
        const name = (o.name + " " + (o.material?.name || "")).toLowerCase()
        if (
          name.includes("headlight") ||
          name.includes("head_light") ||
          name.includes("front_light") ||
          name.includes("material.019")
        ) {
          const mbox = new THREE.Box3().setFromObject(o)
          const c = mbox.getCenter(new THREE.Vector3())
          this.group.worldToLocal(c)
          if (c.z < -0.5) {
            foundY.push(c.y)
            foundZ.push(c.z)
            if (Math.abs(c.x) > 0.3) foundX.push(Math.abs(c.x))
          }
        }
      })
      if (foundY.length > 0) {
        headlightY = foundY.reduce((a, b) => a + b, 0) / foundY.length
        frontZ = Math.min(...foundZ)
      }
      if (foundX.length > 0) {
        headlightSpacing = foundX.reduce((a, b) => a + b, 0) / foundX.length
      }
    }

    const group = new THREE.Group()
    this.headlightGroup = group

    // Scan for actual headlight meshes / materials on the car model
    if (this.hiBody) {
      this.hiBody.traverse((o: any) => {
        if (!o.isMesh || !o.material) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial
          if (!std || !std.isMeshStandardMaterial) continue

          // NEVER illuminate car body paint or materials in tintedMats
          if (this.tintedMats.includes(std)) continue

          const matName = (std.name || "").toLowerCase()
          const meshName = (o.name || "").toLowerCase()

          // Exclude body panels, chassis, interior, wheels, calipers, glass
          const isExcludedMat =
            matName.includes("paint") ||
            matName.includes("body") ||
            matName.includes("chassis") ||
            matName.includes("caliper") ||
            matName.includes("tire") ||
            matName.includes("wheel") ||
            matName.includes("rim") ||
            matName.includes("interior") ||
            matName.includes("plastic") ||
            matName.includes("carbon") ||
            matName.includes("bottom") ||
            matName.includes("licenseplate") ||
            matName.includes("badge") ||
            matName.includes("logo")
          if (isExcludedMat) continue

          const isExcludedMesh =
            meshName.includes("body") ||
            meshName.includes("carbody") ||
            meshName.includes("chassis") ||
            meshName.includes("panel") ||
            meshName.includes("bumper") ||
            meshName.includes("hood") ||
            meshName.includes("trunk") ||
            meshName.includes("door") ||
            meshName.includes("caliper") ||
            meshName.includes("tire") ||
            meshName.includes("wheel") ||
            meshName.includes("rim") ||
            meshName.includes("window") ||
            meshName.includes("windshield") ||
            meshName.includes("mirror") ||
            meshName.includes("interior") ||
            meshName.includes("steering") ||
            meshName.includes("bottom") ||
            meshName.includes("suspension")
          if (isExcludedMesh) continue

          // Exclude red taillights and brakelights
          const isRed =
            (std.emissive &&
              std.emissive.r > 0.12 &&
              std.emissive.r > std.emissive.g * 1.6 &&
              std.emissive.r > std.emissive.b * 1.6) ||
            matName.includes("rear") ||
            matName.includes("tail") ||
            matName.includes("brake") ||
            meshName.includes("rear") ||
            meshName.includes("tail") ||
            meshName.includes("brake")
          if (isRed) continue

          const isHeadlightName =
            matName.includes("headlight") ||
            matName.includes("front_light") ||
            matName.includes("frontlight") ||
            matName.includes("light_d") ||
            matName === "material.019" ||
            meshName.includes("headlight") ||
            meshName.includes("front_light") ||
            meshName.includes("frontlight")

          const hasNativeWhiteEmissive =
            std.emissive &&
            std.emissive.r + std.emissive.g + std.emissive.b > 0.5 &&
            Math.abs(std.emissive.r - std.emissive.g) < 0.2 &&
            Math.abs(std.emissive.r - std.emissive.b) < 0.2

          if (isHeadlightName || hasNativeWhiteEmissive) {
            // Clone material on the specific mesh to isolate it from non-light meshes sharing this material
            let targetMat = std
            if (!o.userData.__headlightCloned) {
              targetMat = std.clone()
              if (Array.isArray(o.material)) {
                o.material = o.material.map((mat: any) =>
                  mat === std ? targetMat : mat,
                )
              } else {
                o.material = targetMat
              }
              o.userData.__headlightCloned = true
            }

            if (!this.headlightMats.some((h) => h.mat === targetMat)) {
              if (
                !targetMat.emissive ||
                (targetMat.emissive.r === 0 &&
                  targetMat.emissive.g === 0 &&
                  targetMat.emissive.b === 0)
              ) {
                targetMat.emissive = new THREE.Color(0xfffaea)
              }
              this.headlightMats.push({
                mat: targetMat,
                origIntensity: targetMat.emissiveIntensity ?? 1,
              })
            }
          }
        }
      })
    }

    // Ground light beam throw mesh for NPC cars ONLY
    // Projects a soft dual-beam pool on the road in front of the car with 0 dynamic lights and 0 FPS drop
    if (!isPlayer) {
      const groundBeam = getSharedBeamMesh()
      groundBeam.name = "groundBeam"
      groundBeam.position.set(0, 0.04, frontZ - 11)
      group.add(groundBeam)
    }

    // ONLY the player car gets real-time dynamic SpotLights for 3D obstacles ahead
    if (isPlayer) {
      const leftSpot = new THREE.SpotLight(
        0xfffaee,
        this.headlightsOn ? 28 : 0,
        65,
        Math.PI / 4.2,
        0.85,
        1.1,
      )
      leftSpot.position.set(-headlightSpacing, headlightY, frontZ)
      leftSpot.castShadow = false
      leftSpot.target.position.set(-headlightSpacing * 0.75, 0, frontZ - 18)
      leftSpot.visible = this.headlightsOn

      const rightSpot = new THREE.SpotLight(
        0xfffaee,
        this.headlightsOn ? 28 : 0,
        65,
        Math.PI / 4.2,
        0.85,
        1.1,
      )
      rightSpot.position.set(headlightSpacing, headlightY, frontZ)
      rightSpot.castShadow = false
      rightSpot.target.position.set(headlightSpacing * 0.75, 0, frontZ - 18)
      rightSpot.visible = this.headlightsOn

      group.add(leftSpot.target, rightSpot.target)
      group.add(leftSpot, rightSpot)
      this.headlightSpots = [leftSpot, rightSpot]
    }

    group.visible = this.headlightsOn
    this.group.add(group)
  }

  setHeadlights(on: boolean) {
    this.headlightsWanted = on
    this.headlightsOn = on
    if (this.headlightGroup) {
      this.headlightGroup.visible = on
    }
    for (const spot of this.headlightSpots) {
      spot.visible = on
      spot.intensity = on ? (spot.distance < 30 ? 64 : 72) : 0
    }
    for (const h of this.headlightMats) {
      h.mat.emissiveIntensity = on ? Math.max(h.origIntensity * 4, 8.0) : 0.0
    }
  }

  hasHeadlights(): boolean {
    return this.headlightsOn
  }

  setCastShadow(on: boolean) {
    if (on === this.castShadow) return
    this.castShadow = on
    this.group.traverse((o: any) => {
      if (o.isMesh) o.castShadow = on
    })
  }

  setTint(color: number) {
    this.lastTint = color
    const c = new THREE.Color(color)
    for (const m of this.tintedMats) m.color.copy(c)
    this.loPaint?.color.copy(c)
  }

  hasTint(): boolean {
    return this.tintedMats.length > 0
  }

  wheelContactPositions(
    includeFront: boolean,
    out: THREE.Vector3[],
  ): THREE.Vector3[] {
    out.length = 0
    const p = new THREE.Vector3()
    for (const w of this.wheels) {
      if (!includeFront && w.front) continue
      w.mesh.getWorldPosition(p)
      out.push(new THREE.Vector3(p.x, 0.12, p.z))
    }
    return out
  }
  syncFromBody(
    body: RAPIER.RigidBody,
    steerAngle: number,
    wheelOmegas: readonly number[],
    dt: number,
    compressions?: readonly number[],
  ) {
    const t = body.translation()
    const r = body.rotation()
    this.syncFromPose(t, r, steerAngle, wheelOmegas, dt, compressions)
  }

  syncFromPose(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; w: number },
    steerAngle: number,
    wheelOmegas: readonly number[],
    dt: number,
    compressions?: readonly number[],
  ) {
    this.group.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    _poseOff.set(0, -0.72, 0).applyQuaternion(this.group.quaternion)
    this.group.position.set(
      pos.x + _poseOff.x,
      pos.y + _poseOff.y,
      pos.z + _poseOff.z,
    )

    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i]
      const pivot = w.mesh
      pivot.rotation.y = w.front ? steerAngle : 0
      this.spinAngles[i] -= (wheelOmegas[i] ?? 0) * dt
      pivot.rotation.x = this.spinAngles[i]
      if (compressions && i < compressions.length) {
        const c = compressions[i] ?? SUSP_VISUAL_REF
        pivot.position.y =
          w.baseY + Math.max(-0.06, Math.min(0.18, c - SUSP_VISUAL_REF))
      }
    }
  }
}
