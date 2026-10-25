import * as THREE from "three"

export interface BrakeLight {
  mat: THREE.MeshStandardMaterial
  idle: number
  glow: THREE.Color
}

export const BRAKE_HEAT = new THREE.Color(0xff3d38)

const LAMP_RANGE = 10
const LAMP_IDLE = 0.5
const LAMP_BRAKE = 3.4
const HEAT_MIX = 1.8

export function applyBrakeHeat(
  l: BrakeLight,
  heat: number,
  headlightsOn: boolean = false,
) {
  const base = headlightsOn ? 1.0 : 0.0
  const brakeGain = 9.0
  l.mat.emissiveIntensity = base + brakeGain * heat
  l.mat.emissive.copy(l.glow).lerp(BRAKE_HEAT, heat * HEAT_MIX)
}

export function brakeGlowIsBlown(l: BrakeLight): boolean {
  const c = l.mat.emissive.clone().multiplyScalar(l.mat.emissiveIntensity)
  return c.g > c.r * 0.6
}

function isRed(c: THREE.Color): boolean {
  return c.r > 0.12 && c.r > c.g * 1.7 && c.r > c.b * 1.7
}

function isBrakeLamp(mat: THREE.Material): boolean {
  const std = mat as THREE.MeshStandardMaterial
  if (!std.emissive || !std.color) return false
  if (std.emissive.r + std.emissive.g + std.emissive.b <= 0.02) return false
  // The glowing colour is what makes a lamp a lamp. The base colour is
  // not: a red-painted car is red too, and taking the paint for a lamp
  // made the whole body glow when the brakes came on — on the G-Wagon
  // that meant the headlights and the indicators turned red as well,
  // because the shell, the glass and the lights all share one material.
  return isRed(std.emissive)
}

export function collectBrakeLights(root: THREE.Object3D): BrakeLight[] {
  const bySource = new Map<string, BrakeLight>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    let changed = false
    const next = src.map((mat) => {
      if (!isBrakeLamp(mat)) return mat
      changed = true
      const key = mat.uuid
      let entry = bySource.get(key)
      if (!entry) {
        const clone = (mat as THREE.MeshStandardMaterial).clone()
        clone.emissiveIntensity = 0.0
        entry = { mat: clone, idle: 0.0, glow: clone.emissive.clone() }
        bySource.set(key, entry)
      }
      return entry.mat
    })
    if (!changed) return
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
  return [...bySource.values()]
}
