import * as THREE from "three"

export interface BrakeLight {
  mat: THREE.MeshStandardMaterial
  idle: number
  glow: THREE.Color
  /** Scales the brightness, for lamps with a lot of lit area. */
  gain?: number
  /** Keep the authored colour instead of heating it toward the brake red. */
  flat?: boolean
}

export const BRAKE_HEAT = new THREE.Color(0xff3d38)

const HEAT_MIX = 1.8
const LAMP_PEAK = 2.0

export function applyBrakeHeat(
  l: BrakeLight,
  heat: number,
  headlightsOn: boolean = false,
) {
  const base = headlightsOn ? 1.0 : 0.0
  const brakeGain = 9.0
  l.mat.emissiveIntensity = (base + brakeGain * heat) * (l.gain ?? 1)
  l.mat.emissive.copy(l.glow)
  if (!l.flat) l.mat.emissive.lerp(BRAKE_HEAT, heat * HEAT_MIX)
  const e = l.mat.emissive
  const peak = Math.max(e.r, e.g, e.b) * l.mat.emissiveIntensity
  if (peak > LAMP_PEAK) l.mat.emissiveIntensity *= LAMP_PEAK / peak
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
  return isRed(std.emissive)
}

const TAIL_LAMP_EMISSIVE = new THREE.Color(0xff0a0a)
const AUTHORED_LAMP_GAIN = 0.25

/**
 * Pulls the triangles of `mesh` whose centres fall inside `boxes` (world
 * space) out into a new sibling mesh, leaving the rest behind. On a lot of
 * models the lamp interior is just part of one big detail mesh, so there is
 * nothing separate to make glow until it is split off.
 */
function carveTriangles(mesh: THREE.Mesh, boxes: THREE.Box3[]): THREE.Mesh | null {
  if (Array.isArray(mesh.material) || !mesh.parent) return null
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const pos = src.getAttribute("position")
  const keep: number[] = []
  const take: number[] = []
  const v = new THREE.Vector3()
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const inside = [0, 1, 2].every((k) => {
      v.fromBufferAttribute(pos, t + k).applyMatrix4(mesh.matrixWorld)
      return boxes.some((b) => b.containsPoint(v))
    })
    ;(inside ? take : keep).push(t)
  }
  if (take.length === 0) return null
  const build = (starts: number[]) => {
    const g = new THREE.BufferGeometry()
    for (const name of Object.keys(src.attributes)) {
      const a = src.getAttribute(name)
      const out = new Float32Array(starts.length * 3 * a.itemSize)
      starts.forEach((t, i) => {
        for (let k = 0; k < 3; k++)
          for (let c = 0; c < a.itemSize; c++)
            out[(i * 3 + k) * a.itemSize + c] = a.getComponent(t + k, c)
      })
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
    }
    return g
  }
  const lamp = new THREE.Mesh(build(take), mesh.material)
  lamp.name = `${mesh.name}__lamp`
  lamp.position.copy(mesh.position)
  lamp.quaternion.copy(mesh.quaternion)
  lamp.scale.copy(mesh.scale)
  mesh.parent.add(lamp)
  mesh.geometry = build(keep)
  lamp.updateWorldMatrix(true, false)
  return lamp
}

/**
 * Meshes that make up a lamp behind its lens: the reflector, bars and
 * bezels, including surfaces carved out of larger meshes. On models where
 * the lens is a thin clear shell or just a trim ring, these are the
 * surfaces you actually see, so they are what has to glow. Each lens box is
 * grown by its own depth; a whole part counts when its centre is inside and
 * it is no bigger than the lens, and anything larger contributes only the
 * triangles that lie entirely inside the box.
 */
export function lampPartsWithin(root: THREE.Object3D, lenses: THREE.Object3D[]): THREE.Mesh[] {
  root.updateWorldMatrix(true, true)
  const boxes = lenses.map((l) => {
    const box = new THREE.Box3().setFromObject(l)
    const size = box.getSize(new THREE.Vector3())
    return { tight: box.clone(), box: box.expandByScalar(Math.min(size.x, size.y, size.z) / 2), reach: Math.max(size.x, size.y, size.z) }
  })
  const parts: THREE.Mesh[] = []
  const carve: THREE.Mesh[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || lenses.includes(mesh)) return
    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const big = Math.max(size.x, size.y, size.z)
    if (!boxes.some((b) => b.box.intersectsBox(box))) return
    const centre = box.getCenter(new THREE.Vector3())
    if (boxes.some((b) => b.box.containsPoint(centre) && big <= b.reach)) parts.push(mesh)
    else carve.push(mesh)
  })
  for (const mesh of carve) {
    const lamp = carveTriangles(mesh, boxes.map((b) => b.tight))
    if (lamp) parts.push(lamp)
  }
  return parts
}

function lampMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
  const clone = (mat as THREE.MeshStandardMaterial).clone()
  clone.emissive = TAIL_LAMP_EMISSIVE.clone()
  clone.emissiveMap = null
  clone.userData.authoredTailLamp = true
  return clone
}

/**
 * Gives a car whose tail lenses are plain glass (no red emissive of their
 * own) a lamp material, so `collectBrakeLights` finds and lights them. The
 * named lens meshes and every part inside them get their own clone: the
 * material is often shared with windows, paint or other lamps.
 */
export function authorTailLamps(root: THREE.Object3D, meshPatterns?: string[]) {
  if (!meshPatterns?.length) return
  const regs = meshPatterns.map((p) => new RegExp(p, "i"))
  const lenses: THREE.Mesh[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.material && regs.some((r) => r.test(mesh.name))) lenses.push(mesh)
  })
  for (const mesh of [...lenses, ...lampPartsWithin(root, lenses)]) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(lampMaterial) : lampMaterial(mesh.material)
  }
}

export function collectBrakeLights(root: THREE.Object3D, flatLamps = false): BrakeLight[] {
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
        if (flatLamps) {
          clone.emissiveMap = null
          clone.color.setHex(0x000000)
        }
        const authored = !!clone.userData.authoredTailLamp
        entry = {
          mat: clone,
          idle: 0.0,
          glow: clone.emissive.clone(),
          gain: authored ? AUTHORED_LAMP_GAIN : undefined,
          flat: authored,
        }
        bySource.set(key, entry)
      }
      return entry.mat
    })
    if (!changed) return
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
  return [...bySource.values()]
}

/**
 * Some models wrap their tail lenses in a dark see-through glass shell that
 * is drawn over them, hiding the glow. Draws the lamps after that glass.
 */
export function liftLampsOverGlass(root: THREE.Object3D, lampMeshes: THREE.Object3D[]) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || lampMeshes.includes(mesh)) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) if (m.transparent && m.opacity < 1) m.depthWrite = false
  })
  for (const l of lampMeshes) {
    l.renderOrder = 1
    const mesh = l as THREE.Mesh
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) m.transparent = true
  }
}
