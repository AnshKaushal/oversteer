import type * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import type { SurfaceId } from "../data/surfaces"
import type { TimeOfDayMode } from "../constants/timeOfDay"
import type { ClearZone } from "../systems/Airport"
import type { AIProfile, RaceDriver } from "../systems/AIDriver"

export interface Pose {
  x: number
  z: number
  yaw: number
}

export interface RoadModel {
  spawnPose(s: number, lateral: number): Pose
  nearestPose(x: number, z: number): Pose
}

export interface LinearRoad extends RoadModel {
  centerX(s: number): number
  yaw(s: number): number
  dirYaw(s: number): number
  arcLength(s: number): number
  gapM(a: number, b: number): number
}

export interface CircuitInfo {
  readonly lengthM: number
  readonly seed: number
  progressAt(x: number, z: number): number
  progressTracker(): (x: number, z: number) => number
}

export interface MapWorld {
  readonly group: THREE.Group
  readonly travelDir: number
  init(scene: THREE.Scene, baseUrl: string): Promise<void>
  update(carS: number, carPos: THREE.Vector3, grassTarget?: number): void
  createPhysicsGround(R: typeof RAPIER, world: RAPIER.World): RAPIER.RigidBody
  terrainHeightAt(x: number, z: number): number
  surfaceAt(x: number, z: number): SurfaceId
  puddleAt(x: number, z: number): number
  sunDirection(): { x: number; y: number; z: number }
  setTimeOfDay(mode: TimeOfDayMode): void
  setShadowQuality(pct: number): void
  setPropShadows(on: boolean): void
  setVegetation(percent: number): void
  setStreetLights(show: boolean, power: boolean): void
  setFog(enabled: boolean, intensity: number): void
  setDrawDistance(percent: number): void
  setLightning(f: number): void
  setClearZones(zones: ClearZone[]): void
  renderReflections?(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    around?: (on: boolean) => void,
  ): void
}

export interface MapFeatures {
  airport: boolean
  traffic: boolean
  races: boolean
  multiplayer: boolean
}

export interface MapInstance {
  readonly map: GameMap
  readonly road: RoadModel
  readonly linear: LinearRoad | null
  readonly circuit: CircuitInfo | null
  readonly world: MapWorld
  rivalDriver?(profile: AIProfile): RaceDriver
}

export interface GameMap {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly features: MapFeatures
  gapM?(a: number, b: number): number
  create(options?: unknown): MapInstance
}
