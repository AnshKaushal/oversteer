import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"

export const FAR_LOD_M = 500

export interface RoadSeg {
  mesh: THREE.Mesh
  s0: number
}

export type PropCategory =
  | "tree"
  | "rock"
  | "cloud"
  | "grass"
  | "barrel"
  | "log"

export interface PropVariant {
  im: THREE.InstancedMesh
  category: PropCategory
  targetH: number
  far?: THREE.InstancedMesh
}

export interface PropEntry {
  pos: THREE.Vector3
  rot: number
  scale: number
  variantIdx: number
}

export interface CloudEntry {
  pos: THREE.Vector3
  rot: number
  variantIdx: number
  k: number
}

export interface Hill {
  mesh: THREE.Mesh
  seg: number
  rotY: number
  radius: number
  height: number
  body?: RAPIER.RigidBody
}
