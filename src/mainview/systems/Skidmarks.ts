import * as THREE from "three"

const MAX_SEGMENTS = 3000
const HALF_WIDTH = 0.15
const MIN_STEP = 0.12
const MAX_STEP = 3

export class Skidmarks {
  readonly mesh: THREE.Mesh
  private readonly pos: THREE.BufferAttribute
  private readonly col: THREE.BufferAttribute
  private head = 0
  private count = 0
  private last = new Map<
    number,
    { x: number; y: number; z: number; edgeX: number; edgeZ: number }
  >()
  lift = 0.025

  constructor() {
    const g = new THREE.BufferGeometry()
    this.pos = new THREE.BufferAttribute(
      new Float32Array(MAX_SEGMENTS * 4 * 3),
      3,
    )
    this.col = new THREE.BufferAttribute(
      new Float32Array(MAX_SEGMENTS * 4 * 4),
      4,
    )
    this.pos.setUsage(THREE.DynamicDrawUsage)
    this.col.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute("position", this.pos)
    g.setAttribute("color", this.col)
    const idx = new Uint32Array(MAX_SEGMENTS * 6)
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const v = i * 4
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6)
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.setDrawRange(0, 0)
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        fog: true,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
  }

  mark(id: number, x: number, y: number, z: number, alpha: number | null) {
    const prev = this.last.get(id)
    if (alpha === null || alpha <= 0.02) {
      this.last.delete(id)
      return
    }
    if (!prev) {
      this.last.set(id, { x, y, z, edgeX: 0, edgeZ: 0 })
      return
    }
    const dx = x - prev.x
    const dz = z - prev.z
    const d = Math.hypot(dx, dz)
    if (d < MIN_STEP) return
    if (d > MAX_STEP) {
      this.last.set(id, { x, y, z, edgeX: 0, edgeZ: 0 })
      return
    }
    const nx = (-dz / d) * HALF_WIDTH
    const nz = (dx / d) * HALF_WIDTH
    const s = this.head
    const p = this.pos.array as Float32Array
    const c = this.col.array as Float32Array
    const o = s * 12
    const y0 = prev.y + this.lift
    const y1 = y + this.lift
    const ax = prev.edgeX || nx
    const az = prev.edgeZ || nz
    p.set(
      [
        prev.x - ax,
        y0,
        prev.z - az,
        prev.x + ax,
        y0,
        prev.z + az,
        x - nx,
        y1,
        z - nz,
        x + nx,
        y1,
        z + nz,
      ],
      o,
    )
    const a = Math.min(0.75, alpha * 0.75)
    for (let k = 0; k < 4; k++) c.set([0.02, 0.02, 0.02, a], s * 16 + k * 4)
    this.head = (this.head + 1) % MAX_SEGMENTS
    this.count = Math.min(MAX_SEGMENTS, this.count + 1)
    this.pos.needsUpdate = true
    this.col.needsUpdate = true
    this.mesh.geometry.setDrawRange(0, this.count * 6)
    this.last.set(id, { x, y, z, edgeX: nx, edgeZ: nz })
  }

  endAll() {
    this.last.clear()
  }

  clear() {
    this.head = 0
    this.count = 0
    this.last.clear()
    this.mesh.geometry.setDrawRange(0, 0)
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
