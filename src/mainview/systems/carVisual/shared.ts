import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { trackLoad } from "../loadProgress"
import type { WheelDef } from "../../physics/vehicle/components/Suspension"
import { type PaintTextureRule } from "../carTint"

export const CAR_MODEL_YAW = Math.PI

export const SUSP_VISUAL_REF = 0.074

export interface CarVisualOptions {
  modelFile?: string
  targetLength: number
  pivots?: { pattern?: string; names?: string[] }
  wheelSpots?: readonly WheelDef[]
  wheelRadius: number
  paintMatch?: string[]
  paintTexture?: PaintTextureRule
  tailLampMeshes?: string[]
  isPlayer?: boolean
  headBeams?: boolean
}

export const MIN_PIVOT_FRAC = 0.025

export const AVENTADOR_HEADLIGHT = /^glasses_glass0(17|18|20|24)/i
export const BRAKE_LAMP_THRESHOLD = 0.04
export const DEFAULT_MODEL = "models/bmw_m3.glb"
export const DEFAULT_PIVOT_PATTERN = "^Plane00[3-6]$"

export const modelCache = new Map<
  string,
  THREE.Object3D | Promise<THREE.Object3D | null>
>()

export const _poseOff = new THREE.Vector3()

let loBodyGeo: THREE.BufferGeometry | null = null
let loCabinGeo: THREE.BufferGeometry | null = null
export const loWheelGeos = new Map<number, THREE.BufferGeometry>()
export const loWheelMat = new THREE.MeshStandardMaterial({
  color: 0x141414,
  roughness: 0.9,
})

export function loGeos(wheelRadius: number): {
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

export async function loadSharedModel(
  baseUrl: string,
  modelFile: string,
): Promise<THREE.Object3D | null> {
  const key = `${baseUrl}${modelFile}`
  const hit = modelCache.get(key)
  if (hit) return hit
  const load = new GLTFLoader()
    .loadAsync(key, (e) => trackLoad(key, e))
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
