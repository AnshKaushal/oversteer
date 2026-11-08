import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { WheelDef } from "../physics/vehicle/components/Suspension"
import { CARS } from "../data/cars"
import { tintCar, whitenRims } from "./carTint"
import {
  collectBrakeLights,
  liftLampsOverGlass,
  type BrakeLight,
  authorTailLamps,
} from "./carLights"
import {
  buildIndicators,
  planIndicators,
  setIndicator,
  toggleIndicator,
  updateIndicators,
  type IndicatorMode,
} from "./carVisual/indicators"
import {
  CAR_MODEL_YAW,
  SUSP_VISUAL_REF,
  CarVisualOptions,
  MIN_PIVOT_FRAC,
  DEFAULT_MODEL,
  _poseOff,
  loadSharedModel,
  pivotMatches,
} from "./carVisual/shared"
import {
  setupHeadlights,
  setNpcLightActive,
  setHeadlights,
  setPower,
  applyLamps,
  hasHeadlights,
  setBrake,
} from "./carVisual/headlights"
import {
  buildImposter,
  setDetail,
  mergeStatic,
  mergeInto,
} from "./carVisual/lod"

export class CarVisual {
  setupHeadlights = setupHeadlights
  setNpcLightActive = setNpcLightActive
  setHeadlights = setHeadlights
  setPower = setPower
  applyLamps = applyLamps
  hasHeadlights = hasHeadlights
  setBrake = setBrake
  buildIndicators = buildIndicators
  planIndicators = planIndicators
  indicatorPlan: {
    x: number
    y: number
    z: number
    w: number
    h: number
    left: boolean
    front: boolean
  }[] = []
  setIndicator = setIndicator
  toggleIndicator = toggleIndicator
  updateIndicators = updateIndicators
  indicatorOverlays: {
    mesh: THREE.Mesh
    left: boolean
    front: boolean
    amber: boolean
  }[] = []
  indicatorOverlayMat: THREE.MeshStandardMaterial | null = null
  headlightDim = 1
  indicatorMode: IndicatorMode = "off"
  indicatorClock = 0
  indicatorLamps: {
    mesh: THREE.Mesh
    mat: THREE.MeshStandardMaterial
    left: boolean
  }[] = []
  buildImposter = buildImposter
  setDetail = setDetail
  mergeStatic = mergeStatic
  mergeInto = mergeInto
  group = Object.assign(new THREE.Group(), { name: "car" })
  wheels: {
    mesh: THREE.Object3D
    front: boolean
    left: boolean
    baseY: number
  }[] = []
  spinAngles = [0, 0, 0, 0]
  castShadow = true
  hiBody: THREE.Object3D | null = null
  loGroup: THREE.Group | null = null
  hiDetail = true
  tintedMats: THREE.MeshStandardMaterial[] = []
  loPaint: THREE.MeshStandardMaterial | null = null
  lastTint: number | undefined = undefined
  hiMerged: THREE.Object3D[] = []
  brakeLights: BrakeLight[] = []
  brakeMeshes: THREE.Object3D[] = []
  brakeLevel = 0
  headlightsOn = false
  headlightsWanted = false
  power = 1
  headlightGroup: THREE.Group | null = null
  headlightMeshes: THREE.Object3D[] = []
  headlightSpots: THREE.SpotLight[] = []
  headlightMats: {
    mat: THREE.MeshStandardMaterial
    origIntensity: number
    origTransparent: boolean
    origOpacity: number
  }[] = []
  isPlayerCar = false
  headlightsConfigured = false
  loHeadlights: THREE.Mesh[] = []

  async load(
    baseUrl: string,
    tint: number | undefined,
    opts: CarVisualOptions,
  ): Promise<void> {
    const modelFile = opts.modelFile ?? DEFAULT_MODEL
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
    model.traverse((o: any) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (m && m.isMeshStandardMaterial && m.metalness > 0.6) {
            const name = `${m.name} ${o.name}`.toLowerCase()
            if (
              name.includes("body") ||
              name.includes("paint") ||
              (opts?.paintMatch &&
                opts.paintMatch.some((p) => new RegExp(p, "i").test(m.name)))
            ) {
              m.metalness = 0.25
              m.roughness = 0.32
            }
          }
        }
      }
    })
    authorTailLamps(model, opts.tailLampMeshes)
    const flatLamps = CARS.some(
      (c) => c.modelFile === modelFile && c.flatTailLamps,
    )
    this.brakeLights = collectBrakeLights(model, flatLamps)
    this.brakeMeshes = []
    model.traverse((o: any) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        if (mats.some((m: any) => this.brakeLights.some((b) => b.mat === m))) {
          this.brakeMeshes.push(o)
        }
      }
    })
    if (flatLamps) liftLampsOverGlass(model, this.brakeMeshes)
    model.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = this.castShadow
        o.receiveShadow = true
      }
    })

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const targetLen = opts.targetLength
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
    this.planIndicators(model, modelFile)
    this.buildImposter(
      this.lastTint ?? tint,
      opts?.wheelSpots,
      opts.wheelRadius,
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
      const wr = opts.wheelRadius
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
        w.receiveShadow = true
        const rim = new THREE.Mesh(rimG, rimM)
        rim.castShadow = this.castShadow
        rim.receiveShadow = true
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
    this.setupHeadlights(opts?.isPlayer ?? false, opts?.headBeams ?? false)
    this.mergeStatic()
    this.setHeadlights(this.headlightsWanted)
  }

  setCastShadow(on: boolean) {
    if (on === this.castShadow) return
    this.castShadow = on
    this.group.traverse((o: any) => {
      if (
        o.isMesh &&
        !this.headlightMeshes.includes(o) &&
        !this.loHeadlights.includes(o)
      ) {
        o.castShadow = on
      }
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

    if (!this.hiDetail) return

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
export * from "./carVisual/shared"
