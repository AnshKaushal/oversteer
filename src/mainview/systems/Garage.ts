import * as THREE from "three"
import { createGLTFLoader } from "./gltf"
import type { CarVisual } from "./CarVisual"
import {
  SURFACES,
  SURFACE_BY_ID,
  buildFrame,
  localCorners,
  type SurfaceId,
} from "./garageSurfaces"

const DUMMY_CAR = "mobil_15"
const HALF_DEPTH = 10.74
const ROOF_Y = 6.93
const SCALE = 0.7
const CAR_SCALE = 1.15
const SIDE_OFFSET = HALF_DEPTH * SCALE + 18

export const GARAGE_CAM = {
  minDist: 3.8,
  maxDist: 5.6,
  defaultDist: 5.0,
  minPitch: 0.03,
  maxPitch: 0.7,
}

const HOLE_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000,
  opacity: 0,
  blending: THREE.NoBlending,
  toneMapped: false,
})

const _fwd = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)

const NO_SUN = THREE.ShaderChunk.lights_fragment_begin.replace(
  "getDirectionalLightInfo( directionalLight, directLight );",
  "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color = vec3( 0.0 );",
)

function blockSun(mat: THREE.Material) {
  mat.shadowSide = THREE.DoubleSide
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      NO_SUN,
    )
  }
  mat.customProgramCacheKey = () => "garage-no-sun"
  mat.needsUpdate = true
}

const DYNO = { stage: 0.2, offset: 0.27 }
const ROLLER_R = 0.2
const dynoLift = (wheels: { baseY: number }[]) =>
  Math.max(
    ...wheels.map((w) => {
      const cy = w.baseY * CAR_SCALE
      return (
        DYNO.stage + Math.sqrt((cy + ROLLER_R) ** 2 - DYNO.offset ** 2) - cy
      )
    }),
  )

const _n = new THREE.Vector3()
const _lc: THREE.Vector3[] = []

export class Garage {
  readonly group = new THREE.Group()
  readonly carPos = new THREE.Vector3()
  carYaw = 0
  readonly lights: THREE.PointLight[] = []
  readonly holes = new Map<SurfaceId, THREE.Mesh>()
  private dynoGroup = new THREE.Group()
  private dynoFor: CarVisual | null = null
  private rollers: { mesh: THREE.Mesh; ratio: number }[] = []
  private liftFor = 0
  private lift = 0
  private snapLift = false
  private shake = 0

  static async load(baseUrl: string): Promise<Garage> {
    const glb = await createGLTFLoader().loadAsync(`${baseUrl}models/garage.glb`)
    const g = new Garage()
    const root = glb.scene
    const dummy = root.getObjectByName(DUMMY_CAR)
    dummy?.removeFromParent()
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        blockSun(mat)
      }
    })
    g.group.add(root)
    const apronStart = HALF_DEPTH
    const apronEnd = 30
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.6, apronEnd - apronStart),
      new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.95 }),
    )
    slab.position.set(0, -0.3, (apronStart + apronEnd) / 2)
    slab.receiveShadow = true
    g.group.add(slab)
    for (const def of SURFACES) {
      if (!def.real && !def.hud) g.group.add(buildFrame(def, blockSun))
      if (!def.hud) {
        const hole = new THREE.Mesh(
          new THREE.PlaneGeometry(def.w, def.h),
          HOLE_MAT,
        )
        const n = new THREE.Vector3(...def.normal)
        hole.position.set(...def.center).addScaledVector(n, 0.04)
        hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
        hole.renderOrder = 10
        hole.visible = false
        hole.frustumCulled = false
        g.group.add(hole)
        g.holes.set(def.id, hole)
      }
    }
    g.dynoGroup.visible = false
    g.dynoGroup.scale.setScalar(1 / SCALE)
    g.group.add(g.dynoGroup)
    g.group.scale.setScalar(SCALE)
    for (const z of [-3.5, 3.5]) {
      const l = new THREE.PointLight(0xfff1dc, 14, 14, 2)
      l.position.set(0, 5.6, z)
      g.group.add(l)
      g.lights.push(l)
    }
    return g
  }

  place(
    spawnX: number,
    spawnZ: number,
    fwd: THREE.Vector3,
    groundAt: (x: number, z: number) => number,
  ) {
    _fwd.copy(fwd).setY(0).normalize()
    const rx = -_fwd.z
    const rz = _fwd.x
    const cx = spawnX + rx * SIDE_OFFSET
    const cz = spawnZ + rz * SIDE_OFFSET
    let y = groundAt(cx, cz)
    for (const dx of [-9 * SCALE, 9 * SCALE]) {
      for (const dz of [-10.7 * SCALE, 10.7 * SCALE]) {
        y = Math.max(y, groundAt(cx + dx, cz + dz))
      }
    }
    this.group.position.set(cx, y + 0.02, cz)
    this.group.rotation.y = Math.atan2(-rx, -rz)
    this.carPos.set(cx, y + 0.02, cz)
    this.carYaw = Math.atan2(rx, rz)
  }

  surfaceCorners(id: SurfaceId, out: THREE.Vector3[]): THREE.Vector3 {
    const def = SURFACE_BY_ID[id]
    this.group.updateMatrixWorld()
    localCorners(def, _lc)
    for (let i = 0; i < 4; i++) {
      ;(out[i] ??= new THREE.Vector3())
        .copy(_lc[i])
        .applyMatrix4(this.group.matrixWorld)
    }
    return _n.set(...def.normal).transformDirection(this.group.matrixWorld)
  }

  surfaceView(id: SurfaceId, pos: THREE.Vector3, look: THREE.Vector3): boolean {
    const v = SURFACE_BY_ID[id].view
    if (!v) return false
    this.group.updateMatrixWorld()
    pos.set(...v.pos).applyMatrix4(this.group.matrixWorld)
    look.set(...v.look).applyMatrix4(this.group.matrixWorld)
    return true
  }

  holdCar(visual: CarVisual) {
    visual.group.position.copy(this.carPos)
    visual.group.position.y += this.lift
    if (this.shake > 0) {
      const t = performance.now()
      visual.group.position.y +=
        Math.sin(t * (0.06 + this.shake * 0.12)) * 0.004 * this.shake
    }
    visual.group.quaternion.setFromAxisAngle(_UP, this.carYaw)
    visual.group.scale.setScalar(CAR_SCALE)
  }

  updateDyno(
    visual: CarVisual,
    d: {
      active: boolean
      omega: number
      rpm01: number
      front: boolean
      rear: boolean
      tyreWidth: number
    },
    dt: number,
  ) {
    const wheels = visual.wheels
    const ok = wheels.length === 4
    const target = d.active && ok ? dynoLift(wheels) : 0
    if (this.snapLift) {
      this.snapLift = false
      this.lift = target
    }
    this.lift += (target - this.lift) * (1 - Math.exp(-dt * 2.4))
    if (Math.abs(this.lift - target) < 0.001) this.lift = target
    this.shake = d.active && this.lift > target * 0.9 ? d.rpm01 : 0
    const show = this.lift > 0.004
    this.dynoGroup.visible = show
    if (!show) {
      if (!d.active) this.dynoFor = null
      return
    }
    if (this.dynoFor !== visual) this.buildDyno(visual, d.tyreWidth)
    for (const r of this.rollers) {
      r.mesh.rotation.x -= d.omega * (r.ratio * dt)
    }
    if (ok && visual.hiDetail) {
      const driven = [d.front, d.front, d.rear, d.rear]
      visual.spinWheels(
        driven.map((on) => (on ? d.omega : 0)),
        dt,
      )
    }
  }

  snapDynoLift() {
    this.snapLift = true
  }

  private buildDyno(visual: CarVisual, tyreW: number) {
    for (const c of [...this.dynoGroup.children]) {
      this.dynoGroup.remove(c)
      const m = c as THREE.Mesh
      m.geometry?.dispose()
    }
    this.rollers = []
    this.dynoFor = visual
    this.liftFor = dynoLift(visual.wheels)
    const steel = new THREE.MeshStandardMaterial({
      color: 0x6a717b,
      roughness: 0.3,
      metalness: 0.95,
    })
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x23272e,
      roughness: 0.55,
      metalness: 0.6,
    })
    const slotMat = new THREE.MeshStandardMaterial({
      color: 0x050607,
      roughness: 0.9,
    })
    const markMat = new THREE.MeshStandardMaterial({
      color: 0xffb020,
      roughness: 0.5,
    })
    for (const m of [steel, stageMat, slotMat, markMat]) blockSun(m)
    const spots = visual.wheels.map((w) => ({
      x: -w.mesh.position.x * CAR_SCALE,
      z: -w.mesh.position.z * CAR_SCALE,
      cy: w.baseY * CAR_SCALE,
    }))
    const W = Math.max(0.2, tyreW * CAR_SCALE)
    const S = DYNO.stage
    const reach = DYNO.offset + ROLLER_R
    const maxX = Math.max(...spots.map((p) => Math.abs(p.x))) + W / 2 + 0.45
    const zMin = Math.min(...spots.map((p) => p.z)) - reach - 0.7
    const zMax = Math.max(...spots.map((p) => p.z)) + reach + 0.7
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(maxX * 2, S, zMax - zMin),
      stageMat,
    )
    stage.position.set(0, S / 2, (zMin + zMax) / 2)
    stage.receiveShadow = true
    this.dynoGroup.add(stage)
    const rampLen = 1.1
    for (const sgn of [-1, 1]) {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(maxX * 2, 0.03, rampLen),
        stageMat,
      )
      ramp.position.set(
        0,
        S / 2,
        sgn < 0 ? zMin - rampLen / 2 + 0.01 : zMax + rampLen / 2 - 0.01,
      )
      ramp.rotation.x = sgn * Math.atan2(S, rampLen)
      this.dynoGroup.add(ramp)
    }
    const geo = new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, W + 0.3, 36)
    geo.rotateZ(Math.PI / 2)
    const band = new THREE.CylinderGeometry(
      ROLLER_R * 1.01,
      ROLLER_R * 1.01,
      0.04,
      36,
    )
    band.rotateZ(Math.PI / 2)
    const slot = new THREE.BoxGeometry(W + 0.4, 0.004, 2 * reach + 0.12)
    for (const p of spots) {
      const sl = new THREE.Mesh(slot, slotMat)
      sl.position.set(p.x, S + 0.003, p.z)
      this.dynoGroup.add(sl)
      const dy = Math.sqrt((p.cy + ROLLER_R) ** 2 - DYNO.offset ** 2)
      const rollerY = p.cy + this.liftFor - dy
      for (const sgn of [-1, 1]) {
        const r = new THREE.Mesh(geo, steel)
        r.position.set(p.x, rollerY, p.z + sgn * DYNO.offset)
        r.castShadow = true
        const mark = new THREE.Mesh(band, markMat)
        mark.position.x = W / 2 + 0.06
        r.add(mark)
        this.dynoGroup.add(r)
        this.rollers.push({ mesh: r, ratio: p.cy / ROLLER_R })
      }
    }
    this.dynoGroup.traverse((o) => {
      ;(o as THREE.Mesh).frustumCulled = false
    })
  }

  clampInside(p: THREE.Vector3, margin = 1): THREE.Vector3 {
    const gp = this.group.position
    const a = this.group.rotation.y
    const c = Math.cos(a)
    const s = Math.sin(a)
    const dx = p.x - gp.x
    const dz = p.z - gp.z
    let lx = (dx * c - dz * s) / SCALE
    let lz = (dx * s + dz * c) / SCALE
    const m = margin / SCALE
    lx = Math.max(-9 + m, Math.min(9 - m, lx))
    lz = Math.max(-HALF_DEPTH + m, Math.min(HALF_DEPTH - m, lz))
    p.x = gp.x + (lx * c + lz * s) * SCALE
    p.z = gp.z + (-lx * s + lz * c) * SCALE
    return p
  }

  shelters = (x: number, y: number, z: number): boolean => {
    const gp = this.group.position
    if (y > gp.y + ROOF_Y * SCALE) return false
    const dx = x - gp.x
    const dz = z - gp.z
    const a = this.group.rotation.y
    const c = Math.cos(a)
    const s = Math.sin(a)
    const lx = (dx * c - dz * s) / SCALE
    const lz = (dx * s + dz * c) / SCALE
    return Math.abs(lx) < 9 && Math.abs(lz) < HALF_DEPTH + 0.1
  }

  dispose() {
    this.group.removeFromParent()
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) mat?.dispose()
    })
  }
}
