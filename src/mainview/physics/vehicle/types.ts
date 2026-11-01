import type * as THREE from "three"
import type { CarDashConfig } from "../../data/schema"

export type Gear = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface CarTelemetry {
  speedKmh: number
  rpm: number
  gear: Gear
  gearLabel: string
  autoMode: boolean
  throttle: number
  brake: number
  steer: number
  shifting: boolean
  launchArmed: boolean
  launching: boolean
  parkingBrake: boolean
  cruiseOn: boolean
  cruiseTargetKmh: number | null
  slipRatio: number
  drift: boolean
  dash: CarDashConfig
  aggression?: number
  safetyAids?: boolean
  tractionControl?: boolean
  stabilityControl?: boolean
  absOn?: boolean
  tractionActive?: boolean
  stabilityActive?: boolean
  absActive?: boolean
  steerFeedback?: number
  engineOn?: boolean
}

export interface GearAccess {
  gear: Gear
  shiftTimer: number
}

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface Kinematics {
  dt: number
  fwdSpeed: number
  speedKmh: number
  beta: number
  linvel: Vec3Like
  angvel: Vec3Like
  pos: THREE.Vector3
  com: THREE.Vector3
  quat: THREE.Quaternion
  fwd: THREE.Vector3
  right: THREE.Vector3
}
