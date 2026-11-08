import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { makeGlowTexture } from "./GlowTexture"
import type * as RAPIER from "@dimforge/rapier3d-compat"

const SPACING = 50
const SCALE = 0.9
const SIDE_OFFSET = 9.4
const HEAD_REACH = 3.7 * SCALE
const SINK = 0.6
const HEAD_HEIGHT = 16.1 * SCALE - SINK
const AIM_REACH = 3
const RANGE = 700
const MAX_LAMPS = Math.ceil((RANGE * 2) / SPACING) + 4
const LIGHTS = 6
const FULL_BY = 55
const GONE_BY = 120

const GLOW = 0xffd9a0

export type RoadXFn = (s: number) => number

export class StreetLights {
  private poles: THREE.InstancedMesh | null = null
  private heads: THREE.InstancedMesh | null = null
  private pools: THREE.InstancedMesh | null = null
  private headMat: THREE.MeshStandardMaterial | null = null
  private poolMat: THREE.MeshBasicMaterial | null = null
  private spots: THREE.SpotLight[] = []
  private enabled = true
  private lit = false
  private firstK = Number.NaN
  private count = 0
  private readonly head = new Float32Array(MAX_LAMPS * 3)
  private readonly aim = new Float32Array(MAX_LAMPS * 3)
  private colliders: RAPIER.Collider[] = []
  private readonly group = new THREE.Group()

  constructor(
    parent: THREE.Group,
    private readonly roadX: RoadXFn,
  ) {
    this.group.visible = false
    parent.add(this.group)
  }

  async load(baseUrl: string) {
    try {
      const glb = await new GLTFLoader().loadAsync(
        `${baseUrl}models/street_light.glb`,
      )
      glb.scene.updateMatrixWorld(true)
      let pole: THREE.BufferGeometry | null = null
      let glass: THREE.BufferGeometry | null = null
      glb.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld)
        const name = (m.material as THREE.Material).name
        if (name === "Glass") glass = g
        else pole = g
      })
      if (!pole || !glass) return
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x6d7076,
        roughness: 0.7,
        metalness: 0.4,
      })
      this.headMat = new THREE.MeshStandardMaterial({
        color: 0xcfc8b8,
        emissive: GLOW,
        emissiveIntensity: 0,
        roughness: 0.4,
      })
      this.poles = new THREE.InstancedMesh(pole, poleMat, MAX_LAMPS)
      this.heads = new THREE.InstancedMesh(glass, this.headMat, MAX_LAMPS)
      for (const im of [this.poles, this.heads]) {
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        im.frustumCulled = false
        im.castShadow = im === this.poles
        im.count = 0
        this.group.add(im)
      }

      this.poolMat = new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: GLOW,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
      const quad = new THREE.PlaneGeometry(1, 1)
      quad.rotateX(-Math.PI / 2)
      this.pools = new THREE.InstancedMesh(quad, this.poolMat, MAX_LAMPS)
      this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.pools.frustumCulled = false
      this.pools.count = 0
      this.pools.renderOrder = 2
      this.group.add(this.pools)

      for (let i = 0; i < LIGHTS; i++) {
        const s = new THREE.SpotLight(GLOW, 0, GONE_BY, 0.6, 0.9, 1.1)
        s.castShadow = i < 2
        s.shadow.mapSize.set(1024, 1024)
        s.shadow.radius = 3
        s.shadow.camera.near = 0.5
        s.shadow.camera.far = 70
        s.shadow.bias = -0.0005
        s.shadow.normalBias = 0.03
        this.spots.push(s)
        this.group.add(s, s.target)
      }
      this.apply()
    } catch (e) {
      console.warn("street_light.glb failed to load, no street lights", e)
    }
  }

  attachPhysics(R: typeof RAPIER, world: RAPIER.World) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed())
    for (let i = 0; i < MAX_LAMPS; i++) {
      const c = world.createCollider(
        R.ColliderDesc.cuboid(0.3, HEAD_HEIGHT / 2, 0.3)
          .setTranslation(0, -200, 0)
          .setFriction(0.4),
        body,
      )
      this.colliders.push(c)
    }
    this.firstK = Number.NaN
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return
    this.enabled = on
    this.firstK = Number.NaN
    this.apply()
  }

  setLit(on: boolean) {
    if (on === this.lit) return
    this.lit = on
    this.apply()
  }

  private apply() {
    this.group.visible = this.enabled && !!this.poles
    if (this.headMat) this.headMat.emissiveIntensity = this.lit ? 2 : 0
    if (this.poolMat) this.poolMat.opacity = this.lit ? 0.25 : 0
    if (!this.enabled || !this.lit) for (const s of this.spots) s.intensity = 0
    for (const s of this.spots) {
      s.shadow.autoUpdate = this.enabled && this.lit
      if (!s.shadow.autoUpdate) s.shadow.needsUpdate = true
    }
    if (!this.enabled) this.park()
  }

  private park() {
    this.count = 0
    for (const c of this.colliders) c.setTranslation({ x: 0, y: -200, z: 0 })
  }

  update(carS: number, carPos: THREE.Vector3) {
    if (!this.poles || !this.heads || !this.pools || !this.enabled) return
    const first = Math.floor((carS - RANGE) / SPACING)
    if (first !== this.firstK) {
      this.firstK = first
      this.place(first)
    }
    if (!this.lit) return
    this.assignLights(carPos)
  }

  private place(first: number) {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const one = new THREE.Vector3(SCALE, SCALE, SCALE)
    const p = new THREE.Vector3()
    const y = new THREE.Vector3(0, 1, 0)
    const poolScale = new THREE.Vector3(12, 1, 12)
    const n = Math.min(MAX_LAMPS, Math.ceil((RANGE * 2) / SPACING) + 2)
    for (let i = 0; i < n; i++) {
      const k = first + i
      const s = k * SPACING + SPACING / 2
      const side = k % 2 === 0 ? 1 : -1
      const cx = this.roadX(s)
      const tx = (this.roadX(s + 2) - this.roadX(s - 2)) / 4
      const len = Math.hypot(tx, 1)
      const nx = 1 / len
      const nz = tx / len
      const px = cx + side * SIDE_OFFSET * nx
      const pz = -s + side * SIDE_OFFSET * nz
      const dx = -side * nx
      const dz = -side * nz
      q.setFromAxisAngle(y, Math.atan2(dx, dz))
      p.set(px, -SINK, pz)
      m.compose(p, q, one)
      this.poles!.setMatrixAt(i, m)
      this.heads!.setMatrixAt(i, m)
      const hx = px + dx * HEAD_REACH
      const hz = pz + dz * HEAD_REACH
      this.head[i * 3] = hx
      this.head[i * 3 + 1] = HEAD_HEIGHT
      this.head[i * 3 + 2] = hz
      const reach = AIM_REACH
      this.aim[i * 3] = hx + dx * reach
      this.aim[i * 3 + 1] = 0
      this.aim[i * 3 + 2] = hz + dz * reach
      m.compose(
        p.set(this.aim[i * 3], 0.03, this.aim[i * 3 + 2]),
        q.identity(),
        poolScale,
      )
      this.pools!.setMatrixAt(i, m)
      this.colliders[i]?.setTranslation({ x: px, y: HEAD_HEIGHT / 2, z: pz })
    }
    for (let i = n; i < this.colliders.length; i++)
      this.colliders[i].setTranslation({ x: 0, y: -200, z: 0 })
    this.count = n
    for (const im of [this.poles!, this.heads!, this.pools!]) {
      im.count = n
      im.instanceMatrix.needsUpdate = true
    }
  }

  private readonly pick: { i: number; d: number }[] = []

  private assignLights(car: THREE.Vector3) {
    const pick = this.pick
    pick.length = 0
    for (let i = 0; i < this.count; i++) {
      const dx = this.head[i * 3] - car.x
      const dz = this.head[i * 3 + 2] - car.z
      pick.push({ i, d: Math.hypot(dx, dz) })
    }
    pick.sort((a, b) => a.d - b.d)
    for (let k = 0; k < this.spots.length; k++) {
      const s = this.spots[k]
      const c = pick[k]
      if (!c) {
        s.intensity = 0
        continue
      }
      const i = c.i
      s.position.set(
        this.head[i * 3],
        this.head[i * 3 + 1],
        this.head[i * 3 + 2],
      )
      s.target.position.set(
        this.aim[i * 3],
        this.aim[i * 3 + 1],
        this.aim[i * 3 + 2],
      )
      const f = 1 - smooth((c.d - FULL_BY) / (GONE_BY - FULL_BY))
      s.intensity = 260 * f
    }
  }
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function glowTexture(): THREE.Texture {
  return makeGlowTexture(
    [
      [0, 1],
      [0.35, 0.45],
      [1, 0],
    ],
    128,
    true,
  )
}
