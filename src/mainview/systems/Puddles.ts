import * as THREE from "three"

const CELL = 12
const REACH = 7
const MAX = (REACH * 2 + 1) ** 2
const DRY_SECONDS = 75
const DRY_METRES = 1200
const WET_RATE = 0.14
const MAX_CHANCE = 0.52

const ROAD_Y = 0.018
const GRASS_Y = -0.055
const MIRROR_Y = 0
const REFLECT_SCALE = 0.5
const REFLECT_FAR = 700
const REFLECT_MIN_WET = 0.05

export type PuddleSurface = "road" | "grass" | null

export type PuddleSurfaceFn = (x: number, z: number, r: number) => PuddleSurface

function hash(a: number, b: number, salt: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(salt, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function makeSoftDisc(): THREE.DataTexture {
  const size = 128
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1
      const dy = ((y + 0.5) / size) * 2 - 1
      const ang = Math.atan2(dy, dx)
      const rim = 0.8 + 0.1 * Math.sin(ang * 3 + 1.3) + 0.06 * Math.sin(ang * 5 + 0.4) + 0.04 * Math.sin(ang * 9)
      const d = Math.hypot(dx, dy) / rim
      const v = Math.round(Math.max(0, Math.min(1, (1 - d) / 0.22)) * 255)
      const i = (y * size + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.colorSpace = THREE.NoColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

interface Spot {
  x: number
  z: number
  r: number
  stretch: number
  yaw: number
  y: number
  road: boolean
  rank: number
}

export class Puddles {
  private readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshStandardMaterial
  private readonly alpha = makeSoftDisc()
  private spots: Spot[] = []
  private cellX = Number.NaN
  private cellZ = Number.NaN
  private dirty = true
  private wet = 0
  private target = 0
  private shown = -1
  private haveRain = false
  private baseGlow = 0.45
  private readonly lastPos = new THREE.Vector3()
  private haveLastPos = false
  private lastClock = 0
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly pos = new THREE.Vector3()
  private readonly scl = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly col = new THREE.Color()
  private reflTarget: THREE.WebGLRenderTarget | null = null
  private readonly reflCam = new THREE.PerspectiveCamera()
  private readonly reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MIRROR_Y)
  private readonly reflUniforms = {
    uRefl: { value: null as THREE.Texture | null },
    uReflMat: { value: new THREE.Matrix4() },
    uReflOn: { value: 0 },
    uTime: { value: 0 },
    uRainAmt: { value: 0 },
    uCar: { value: new THREE.Vector3() },
  }
  private clock = 0
  private carSpeed = 0
  private readonly camPos = new THREE.Vector3()
  private readonly camDir = new THREE.Vector3()
  private readonly camUp = new THREE.Vector3()
  private readonly size = new THREE.Vector2()

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly surfaceAt: PuddleSurfaceFn,
  ) {
    const geo = new THREE.PlaneGeometry(2, 2)
    geo.rotateX(-Math.PI / 2)
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x10161b,
      roughness: 0.04,
      metalness: 0,
      emissive: 0x555e66,
      emissiveIntensity: this.baseGlow,
      transparent: true,
      opacity: 0.88,
      alphaMap: this.alpha,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.reflUniforms)
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform mat4 uReflMat;\nvarying vec4 vReflUv;\nvarying vec2 vWorldXZ;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvec4 pwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\nvReflUv = uReflMat * pwp;\nvWorldXZ = pwp.xz;",
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uRefl;\nuniform float uReflOn;\nvarying vec4 vReflUv;\nvarying vec2 vWorldXZ;\nuniform float uTime;\nuniform float uRainAmt;\nuniform vec3 uCar;\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nvec2 rainRipples(vec2 p, float t) {\n  vec2 acc = vec2(0.0);\n  for (int k = 0; k < 2; k++) {\n    float sc = k == 0 ? 1.7 : 2.9;\n    vec2 q = p * sc + float(k) * 17.0;\n    vec2 id = floor(q);\n    vec2 f = fract(q) - 0.5;\n    float r = h21(id);\n    vec2 off = vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5;\n    float ph = fract(t * (0.7 + r * 0.6) + r * 9.0);\n    vec2 d = f - off * 0.5;\n    float len = length(d);\n    float ring = ph * 0.45;\n    float w = exp(-pow((len - ring) * 22.0, 2.0)) * (1.0 - ph) * step(r, uRainAmt);\n    acc += (len > 0.0001 ? d / len : vec2(0.0)) * w * sin((len - ring) * 60.0);\n  }\n  return acc;\n}\nvec2 carWake(vec2 p, float t) {\n  vec2 d = p - uCar.xy;\n  float len = length(d);\n  float reach = 3.0 + uCar.z * 0.25;\n  float env = smoothstep(reach, 0.3, len) * clamp(uCar.z * 0.15, 0.0, 1.0);\n  float wave = sin(len * 7.0 - t * 14.0) + 0.5 * sin(len * 13.0 - t * 22.0);\n  return (len > 0.0001 ? d / len : vec2(0.0)) * wave * env;\n}",
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          if (uReflOn > 0.5) {
            vec4 ruv = vReflUv;
            vec2 dist = rainRipples(vWorldXZ, uTime) * 0.9 + carWake(vWorldXZ, uTime) * 1.4;
            dist += vec2(sin(vWorldXZ.x * 3.0 + uTime * 1.3), cos(vWorldXZ.y * 3.3 - uTime * 1.1)) * 0.04 * uRainAmt;
            float disturb = clamp(length(dist) * 2.0, 0.0, 1.0);
            ruv.xy += dist * 0.035 * ruv.w;
            vec3 refl = texture2DProj(uRefl, ruv).rgb;
            float ndv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
            float fres = 0.55 + 0.45 * pow(1.0 - ndv, 3.0);
            fres *= 1.0 - 0.45 * disturb;
            refl = mix(refl, refl * 0.6 + totalEmissiveRadiance * 0.4, 0.3 * disturb);
            totalEmissiveRadiance = mix(totalEmissiveRadiance * 0.3, refl, fres);
          }`,
        )
    }
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.mesh.receiveShadow = false
    this.mesh.visible = false
    parent.add(this.mesh)
  }

  setSky(fogColor: number) {
    this.mat.emissive.setHex(fogColor).multiplyScalar(1.6)
  }

  setRain(rain: number) {
    this.target = rain
    if (!this.haveRain) {
      this.haveRain = true
      this.wet = rain
    }
  }

  setFlash(f: number) {
    this.mat.emissiveIntensity = this.baseGlow + f * 2.2
  }

  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, around?: (on: boolean) => void) {
    this.reflUniforms.uReflOn.value = 0
    if (!this.mesh.visible || this.mesh.count === 0 || this.wet < REFLECT_MIN_WET) return
    renderer.getDrawingBufferSize(this.size)
    const w = Math.max(2, Math.floor(this.size.x * REFLECT_SCALE))
    const h = Math.max(2, Math.floor(this.size.y * REFLECT_SCALE))
    if (!this.reflTarget || this.reflTarget.width !== w || this.reflTarget.height !== h) {
      this.reflTarget?.dispose()
      this.reflTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 })
      this.reflUniforms.uRefl.value = this.reflTarget.texture
    }

    camera.updateMatrixWorld()
    camera.getWorldPosition(this.camPos)
    camera.getWorldDirection(this.camDir)
    this.camUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const rc = this.reflCam
    rc.position.set(this.camPos.x, 2 * MIRROR_Y - this.camPos.y, this.camPos.z)
    rc.up.set(this.camUp.x, -this.camUp.y, this.camUp.z)
    rc.lookAt(
      this.camPos.x + this.camDir.x,
      2 * MIRROR_Y - (this.camPos.y + this.camDir.y),
      this.camPos.z + this.camDir.z,
    )
    rc.fov = camera.fov
    rc.aspect = camera.aspect
    rc.near = camera.near
    rc.far = Math.min(camera.far, REFLECT_FAR)
    rc.updateProjectionMatrix()
    rc.updateMatrixWorld()

    const tm = this.reflUniforms.uReflMat.value
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse)

    const prevTarget = renderer.getRenderTarget()
    const prevClip = renderer.clippingPlanes
    const prevAuto = renderer.shadowMap.autoUpdate
    this.mesh.visible = false
    renderer.shadowMap.autoUpdate = false
    renderer.clippingPlanes = [this.reflPlane]
    renderer.setRenderTarget(this.reflTarget)
    renderer.clear()
    around?.(true)
    renderer.render(scene, rc)
    around?.(false)
    renderer.setRenderTarget(prevTarget)
    renderer.clippingPlanes = prevClip
    renderer.shadowMap.autoUpdate = prevAuto
    this.mesh.visible = true
    this.reflUniforms.uReflOn.value = 1
  }

  update(carPos: THREE.Vector3, dt?: number) {
    if (dt === undefined) {
      const now = performance.now() / 1000
      dt = this.lastClock ? Math.min(0.25, now - this.lastClock) : 0
      this.lastClock = now
    }
    let dist = 0
    if (this.haveLastPos) dist = this.lastPos.distanceTo(carPos)
    this.lastPos.copy(carPos)
    this.haveLastPos = true
    if (dist > 60) dist = 0
    this.clock += dt
    const spd = dt > 0 ? dist / dt : 0
    this.carSpeed += (spd - this.carSpeed) * Math.min(1, dt * 6)
    this.reflUniforms.uTime.value = this.clock
    this.reflUniforms.uRainAmt.value = Math.min(1, this.target * this.wet * 1.5)
    this.reflUniforms.uCar.value.set(carPos.x, carPos.z, this.carSpeed)

    if (this.wet < this.target) this.wet = Math.min(this.target, this.wet + WET_RATE * dt)
    else if (this.wet > this.target) {
      const drain = Math.max(dt / DRY_SECONDS, dist / DRY_METRES)
      this.wet = Math.max(this.target, this.wet - drain)
    }

    if (this.wet <= 0) {
      this.mesh.visible = false
      this.shown = 0
      return
    }
    this.mesh.visible = true

    const cx = Math.floor(carPos.x / CELL)
    const cz = Math.floor(carPos.z / CELL)
    const moved = cx !== this.cellX || cz !== this.cellZ
    if (moved || this.dirty) {
      this.cellX = cx
      this.cellZ = cz
      this.dirty = false
      this.rebuild(cx, cz)
    } else if (this.wet === this.shown) return
    this.place()
  }

  private rebuild(cx: number, cz: number) {
    const spots: Spot[] = []
    for (let i = cx - REACH; i <= cx + REACH; i++) {
      for (let j = cz - REACH; j <= cz + REACH; j++) {
        const rank = hash(i, j, 1)
        if (rank > MAX_CHANCE) continue
        const r = 0.9 + hash(i, j, 2) * 2.4
        const x = (i + 0.15 + hash(i, j, 3) * 0.7) * CELL
        const z = (j + 0.15 + hash(i, j, 4) * 0.7) * CELL
        const stretch = 1 + hash(i, j, 5) * 0.9
        let surf = this.surfaceAt(x, z, r * 1.25 * 1.3)
        if (surf === "grass" && this.surfaceAt(x, z, r * stretch * 1.3) !== "grass") surf = null
        if (!surf) continue
        const road = surf === "road"
        spots.push({
          x,
          z,
          r,
          stretch: road ? stretch * 1.5 : stretch,
          yaw: road ? (hash(i, j, 6) - 0.5) * 0.5 : hash(i, j, 6) * Math.PI,
          y: road ? ROAD_Y : GRASS_Y,
          road,
          rank,
        })
      }
    }
    this.spots = spots
  }

  coverageAt(x: number, z: number): number {
    if (this.wet <= 0 || !this.mesh.visible) return 0
    const w = this.wet
    const chance = MAX_CHANCE * Math.sqrt(w)
    const grow = 0.85 + 0.45 * w
    for (const sp of this.spots) {
      const dx = x - sp.x
      if (dx > 12 || dx < -12) continue
      const dz = z - sp.z
      const k = Math.max(0, Math.min(1, (chance - sp.rank) / 0.05))
      if (k <= 0) continue
      const r = sp.r * grow * (0.35 + 0.65 * k)
      const c = Math.cos(sp.yaw)
      const s = Math.sin(sp.yaw)
      const lx = c * dx - s * dz
      const lz = s * dx + c * dz
      const ex = r * 0.85
      const ez = r * sp.stretch * 0.85
      if ((lx * lx) / (ex * ex) + (lz * lz) / (ez * ez) < 1) return 1
    }
    return 0
  }

  private place() {
    const w = this.wet
    this.shown = w
    const chance = MAX_CHANCE * Math.sqrt(w)
    const grow = 0.85 + 0.45 * w
    let n = 0
    for (const sp of this.spots) {
      const k = Math.max(0, Math.min(1, (chance - sp.rank) / 0.05))
      if (k <= 0) continue
      const r = sp.r * grow * (0.35 + 0.65 * k)
      this.q.setFromAxisAngle(this.up, sp.yaw)
      this.pos.set(sp.x, sp.y, sp.z)
      this.scl.set(r, 1, r * sp.stretch)
      this.m.compose(this.pos, this.q, this.scl)
      this.mesh.setMatrixAt(n, this.m)
      this.col.setHex(sp.road ? 0x10161b : 0x3a3a2c)
      this.mesh.setColorAt(n, this.col)
      n++
      if (n >= MAX) break
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.parent.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.alpha.dispose()
    this.reflTarget?.dispose()
  }
}
