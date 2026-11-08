import * as THREE from "three"

export const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0)
export const RIB_DIV = 16

export const SKY_DISK_DISTANCE = 1200
export const CLOUD_GAP = 80
export const CLOUD_RING = 40 * CLOUD_GAP
export function fadeOut(d: number, from: number, to: number): number {
  const x = Math.min(1, Math.max(0, (d - from) / (to - from)))
  return 1 - x * x * (3 - 2 * x)
}

export const HILL_PERIOD = 44
export const hillResidue = (i: number) => -2 + i * 2
export const HILL_MAX_RADIUS = 220

export const LIGHTNING_TINT = new THREE.Color(0xe4ecff)

export const HILL_FADE_FROM = 800
export const HILL_FADE_TO = 1050
