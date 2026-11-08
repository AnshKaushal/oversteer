import type { ClearZone } from "../Airport"
import type { SurfaceId } from "../../data/surfaces"
import * as THREE from "three"
import { WORLD_CONFIG } from "../../constants/world"
import { roadCenterX } from "../../maps/highway/road"

export function makeRibbonGeometry(
  len: number,
  div: number,
  width: number,
  vRepeat: number,
): THREE.BufferGeometry {
  const rows = div + 1
  const verts = rows * 2
  const pos = new Float32Array(verts * 3)
  const uv = new Float32Array(verts * 2)
  for (let j = 0; j < rows; j++) {
    const v = (j / div) * vRepeat
    uv[j * 2 * 2 + 0] = 0
    uv[j * 2 * 2 + 1] = v
    uv[(j * 2 + 1) * 2 + 0] = 1
    uv[(j * 2 + 1) * 2 + 1] = v
  }
  const idx: number[] = []
  for (let j = 0; j < div; j++) {
    const a = j * 2,
      b = j * 2 + 1,
      c = (j + 1) * 2,
      d = (j + 1) * 2 + 1
    idx.push(a, b, c, b, d, c)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  void len
  void width
  return geo
}

let pavedZones: ClearZone[] = []
export function setPavedZones(z: ClearZone[]) {
  pavedZones = z
}

export function groundSurfaceAt(x: number, z: number): SurfaceId {
  for (const c of pavedZones) {
    const dx = x - c.x
    const dz = z - c.z
    if (
      Math.abs(dx * c.ux + dz * c.uz) < c.hl &&
      Math.abs(-dx * c.uz + dz * c.ux) < c.hw
    )
      return "asphalt"
  }
  const s = -z
  const tx = (roadCenterX(s + 2) - roadCenterX(s - 2)) / 4
  const across = Math.abs(x - roadCenterX(s)) / Math.hypot(tx, 1)
  return across <=
    (WORLD_CONFIG.road.width + 2 * WORLD_CONFIG.road.shoulderWidth) / 2
    ? "asphalt"
    : "grass"
}

export function writeRibbon(
  geo: THREE.BufferGeometry,
  s0: number,
  len: number,
  div: number,
  width: number,
) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute
  const half = width / 2
  for (let j = 0; j <= div; j++) {
    const s = s0 + (len * j) / div
    const cx = roadCenterX(s)
    const h = 0.5
    const tx = (roadCenterX(s + h) - roadCenterX(s - h)) / (2 * h)
    const inv = 1 / Math.hypot(tx, 1)
    const nx = inv
    const nz = -tx * inv
    const z = -s
    const l = j * 2,
      r = j * 2 + 1
    pos.setXYZ(l, cx - nx * half, 0, z - nz * half)
    pos.setXYZ(r, cx + nx * half, 0, z + nz * half)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}
