import { fadeWithFog } from "./fogFade"
import * as THREE from "three"


const BEZEL = 0x2b2e33
const UNLIT = 0.28

export interface LampSetOptions {
  pos: Float32Array
  col: Float32Array
  radius: (i: number) => number
  stem: (i: number) => boolean
  flat?: (i: number) => boolean
  glow: THREE.Texture
  haloScale: number
}

export class LampSet {
  readonly group = new THREE.Group()
  readonly fadeMats: THREE.Material[] = []
  readonly geoms: THREE.BufferGeometry[] = []
  private readonly count: number
  private readonly base: Float32Array
  private readonly level: Float32Array
  private readonly lens: THREE.InstancedMesh
  private readonly lensColor = new THREE.Color()
  private readonly halo: THREE.Points
  private readonly haloMat: THREE.PointsMaterial
  private readonly haloColors: THREE.BufferAttribute

  constructor(o: LampSetOptions) {
    const n = (this.count = o.pos.length / 3)
    this.base = o.col.slice()
    this.level = new Float32Array(n).fill(1)
    const flat = o.flat ?? (() => false)
    const pos = o.pos.slice()
    for (let i = 0; i < n; i++) if (flat(i)) pos[i * 3 + 1] = 0.03

    const bezelGeo = new THREE.CylinderGeometry(1.0, 1.25, 0.5, 16)
    const lensGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    lensGeo.scale(1, 0.7, 1)
    const stemGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    this.geoms.push(bezelGeo, lensGeo, stemGeo)

    const bezelMat = new THREE.MeshStandardMaterial({ color: BEZEL, roughness: 0.55, metalness: 0.5, transparent: true })
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true })
    this.fadeMats.push(bezelMat, lensMat)

    const stems: number[] = []
    for (let i = 0; i < n; i++) if (o.stem(i)) stems.push(i)

    const bezel = new THREE.InstancedMesh(bezelGeo, bezelMat, n)
    this.lens = new THREE.InstancedMesh(lensGeo, lensMat, n)
    const stem = new THREE.InstancedMesh(stemGeo, bezelMat, Math.max(1, stems.length))
    stem.count = stems.length

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const r = o.radius(i)
      const x = pos[i * 3]
      const y = pos[i * 3 + 1]
      const z = pos[i * 3 + 2]
      p.set(x, y, z)
      if (flat(i)) {
        s.set(r * 1.05, 0.02, r * 1.05)
        bezel.setMatrixAt(i, m.compose(p, q, s))
        p.set(x, y + 0.008, z)
        s.set(r * 0.9, 0.06, r * 0.9)
      } else {
        s.set(r, r * 0.5, r)
        bezel.setMatrixAt(i, m.compose(p, q, s))
        p.set(x, y + r * 0.12, z)
        s.set(r * 0.88, r * 0.88, r * 0.88)
      }
      this.lens.setMatrixAt(i, m.compose(p, q, s))
    }
    stems.forEach((i, k) => {
      const r = o.radius(i)
      const y = pos[i * 3 + 1] - r * 0.25
      p.set(pos[i * 3], y / 2, pos[i * 3 + 2])
      s.set(0.05, y, 0.05)
      stem.setMatrixAt(k, m.compose(p, q, s))
    })
    for (const im of [bezel, this.lens, stem]) {
      im.frustumCulled = false
      this.group.add(im)
    }
    const hg = new THREE.BufferGeometry()
    hg.setAttribute("position", new THREE.BufferAttribute(pos.slice(), 3))
    this.haloColors = new THREE.BufferAttribute(o.col.slice(), 3)
    hg.setAttribute("color", this.haloColors)
    this.geoms.push(hg)
    let rs = 0
    for (let i = 0; i < n; i++) rs += o.radius(i)
    this.haloMat = new THREE.PointsMaterial({
      size: Math.max(0.5, (rs / Math.max(1, n)) * o.haloScale),
      map: o.glow,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    fadeWithFog(this.haloMat)
    this.halo = new THREE.Points(hg, this.haloMat)
    this.halo.frustumCulled = false
    this.halo.visible = false
    this.group.add(this.halo)
    this.paint(false)
  }

  setLevel(i: number, k: number) {
    this.level[i] = k
  }

  update(lit: boolean, alpha: number) {
    this.haloMat.opacity = 0.55 * alpha
    this.halo.visible = lit
    this.paint(lit)
  }

  private paint(lit: boolean) {
    const hc = this.haloColors.array as Float32Array
    for (let i = 0; i < this.count; i++) {
      const k = lit ? this.level[i] : 0
      const v = UNLIT + (1 - UNLIT) * k
      this.lensColor.setRGB(this.base[i * 3] * v, this.base[i * 3 + 1] * v, this.base[i * 3 + 2] * v)
      this.lens.setColorAt(i, this.lensColor)
      for (let j = 0; j < 3; j++) hc[i * 3 + j] = this.base[i * 3 + j] * k
    }
    if (this.lens.instanceColor) this.lens.instanceColor.needsUpdate = true
    this.haloColors.needsUpdate = true
  }

  dispose() {
    this.group.removeFromParent()
    this.haloMat.dispose()
    this.lens.dispose()
    for (const g of this.geoms) g.dispose()
    for (const m of this.fadeMats) m.dispose()
  }
}
