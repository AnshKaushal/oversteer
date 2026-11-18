import * as THREE from "three"
import { getSprayTexture } from "./TireSmoke"

const MAX_DROPS = 3200
const BOX = 34
const HEIGHT = 26
const FALL_SPEED = 26
const STREAK = 0.9
const STREAK_PER_SPEED = 0.03
const STREAK_MAX = 4.5
const REFLECTED_SHARE = 0.08
const SPLAT_CAP = 600
const SPLAT_LIFE = 0.5

export class RainEffect {
  private readonly pos = new Float32Array(MAX_DROPS * 6)
  private readonly geo = new THREE.BufferGeometry()
  private readonly mat = new THREE.LineBasicMaterial({
    color: 0xb4c8dc,
    transparent: true,
    opacity: 0.4,
    fog: false,
    depthWrite: false,
  })
  private readonly lines: THREE.LineSegments
  private intensity = 0
  private lightning = false
  private placed = false
  private nextBolt = 0
  private boltClock = 0
  private bolt: number[] = []
  private readonly lastCam = new THREE.Vector3()
  private readonly camVel = new THREE.Vector3()
  private haveLastCam = false
  private shelter: ((x: number, y: number, z: number) => boolean) | null = null

  // splatter pool
  private readonly splatPos = new Float32Array(SPLAT_CAP * 3)
  private readonly splatVel = new Float32Array(SPLAT_CAP * 3)
  private readonly splatLife = new Float32Array(SPLAT_CAP)
  private readonly splatSpan = new Float32Array(SPLAT_CAP)
  private readonly splatSize = new Float32Array(SPLAT_CAP)
  private readonly splatRot = new Float32Array(SPLAT_CAP)
  private readonly splatVar = new Float32Array(SPLAT_CAP)
  private readonly splatAlpha = new Float32Array(SPLAT_CAP)
  private readonly splatPosAttr = new THREE.BufferAttribute(this.splatPos, 3)
  private readonly splatSizeAttr = new THREE.BufferAttribute(this.splatSize, 1)
  private readonly splatRotAttr = new THREE.BufferAttribute(this.splatRot, 1)
  private readonly splatVarAttr = new THREE.BufferAttribute(this.splatVar, 1)
  private readonly splatAlphaAttr = new THREE.BufferAttribute(this.splatAlpha, 1)
  private splatCursor = 0
  private readonly splats: THREE.Points

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.lines = new THREE.LineSegments(this.geo, this.mat)
    this.lines.frustumCulled = false
    this.lines.renderOrder = 10
    this.lines.visible = false
    scene.add(this.lines)

    for (let i = 0; i < SPLAT_CAP; i++) this.splatPos[i * 3 + 1] = -100
    for (const a of [
      this.splatPosAttr,
      this.splatSizeAttr,
      this.splatRotAttr,
      this.splatVarAttr,
      this.splatAlphaAttr,
    ])
      a.setUsage(THREE.DynamicDrawUsage)
    const splatGeo = new THREE.BufferGeometry()
    splatGeo.setAttribute("position", this.splatPosAttr)
    splatGeo.setAttribute("aSize", this.splatSizeAttr)
    splatGeo.setAttribute("aRot", this.splatRotAttr)
    splatGeo.setAttribute("aVar", this.splatVarAttr)
    splatGeo.setAttribute("aAlpha", this.splatAlphaAttr)
    const splatMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: getSprayTexture() } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRot;
        attribute float aVar;
        varying float vAlpha;
        varying float vRot;
        varying float vVar;
        void main() {
          vAlpha = aAlpha;
          vRot = aRot;
          vVar = aVar;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vRot;
        varying float vVar;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
          vec2 cell = vec2(mod(vVar, 2.0), floor(vVar / 2.0));
          float a = texture2D(uMap, (cell + q) * 0.5).a * vAlpha;
          gl_FragColor = vec4(vec3(0.82, 0.9, 0.98), a);
        }`,
    })
    this.splats = new THREE.Points(splatGeo, splatMat)
    this.splats.frustumCulled = false
    this.splats.renderOrder = 9
    this.splats.visible = false
    scene.add(this.splats)
  }

  setShelter(fn: ((x: number, y: number, z: number) => boolean) | null) {
    this.shelter = fn
  }

  setReflectionPass(on: boolean) {
    const share = on ? REFLECTED_SHARE : 1
    this.geo.setDrawRange(
      0,
      Math.round(MAX_DROPS * Math.min(1, this.intensity) * share) * 2,
    )
  }

  setConditions(rain: number, lightning: boolean) {
    this.intensity = rain
    this.lightning = lightning
    this.lines.visible = rain > 0
    this.splats.visible = rain > 0
    this.geo.setDrawRange(0, Math.round(MAX_DROPS * Math.min(1, rain)) * 2)
    this.placed = false
    this.haveLastCam = false
    this.nextBolt = 3 + Math.random() * 5
    this.boltClock = 0
    this.bolt = []
  }

  update(dt: number, cam: THREE.Vector3): number {
    if (this.intensity <= 0) {
      this.lines.visible = false
      this.splats.visible = false
      return 0
    }
    const p = this.pos
    this.trackCamera(dt, cam)
    if (!this.placed) {
      for (let i = 0; i < MAX_DROPS; i++) {
        const o = i * 6
        p[o] = cam.x + (Math.random() * 2 - 1) * BOX
        p[o + 1] = cam.y - 4 + Math.random() * HEIGHT
        p[o + 2] = cam.z + (Math.random() * 2 - 1) * BOX
      }
      this.placed = true
    }
    const fallSpeed = FALL_SPEED * (0.9 + 0.3 * this.intensity)
    const fall = fallSpeed * dt
    const windSpeed = this.lightning ? 7 : 3
    const wind = windSpeed * dt
    const rx = windSpeed - this.camVel.x
    const ry = -fallSpeed - this.camVel.y
    const rz = -this.camVel.z
    const rl = Math.hypot(rx, ry, rz) || 1
    const len = Math.min(STREAK_MAX, STREAK + rl * STREAK_PER_SPEED)
    const tx = (-rx / rl) * len
    const ty = (-ry / rl) * len
    const tz = (-rz / rl) * len
    const shelter = this.shelter
    const bottom = cam.y - 4
    for (let i = 0; i < MAX_DROPS; i++) {
      const o = i * 6
      let x = p[o] + wind
      let y = p[o + 1] - fall
      let z = p[o + 2]
      if (y < bottom) {
        this.spawnSplat(x, bottom, z)
        y += HEIGHT
        x = cam.x + (Math.random() * 2 - 1) * BOX
        z = cam.z + (Math.random() * 2 - 1) * BOX
      }
      if (x - cam.x > BOX) x -= 2 * BOX
      else if (x - cam.x < -BOX) x += 2 * BOX
      if (z - cam.z > BOX) z -= 2 * BOX
      else if (z - cam.z < -BOX) z += 2 * BOX
      p[o] = x
      p[o + 1] = y
      p[o + 2] = z
      if (shelter && shelter(x, y, z)) {
        p[o + 3] = x
        p[o + 4] = y
        p[o + 5] = z
      } else {
        p[o + 3] = x + tx
        p[o + 4] = y + ty
        p[o + 5] = z + tz
      }
    }
    this.geo.attributes.position.needsUpdate = true
    this.updateSplats(dt, bottom)
    return this.lightning ? this.flash(dt) : 0
  }

  private spawnSplat(x: number, y: number, z: number) {
    const n = 3 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const i = this.splatCursor
      this.splatCursor = (this.splatCursor + 1) % SPLAT_CAP
      const i3 = i * 3
      this.splatPos[i3] = x + (Math.random() - 0.5) * 0.4
      this.splatPos[i3 + 1] = y + 0.02
      this.splatPos[i3 + 2] = z + (Math.random() - 0.5) * 0.4
      const a = Math.random() * Math.PI * 2
      const sp = 1.2 + Math.random() * 1.6
      this.splatVel[i3] = Math.cos(a) * sp
      this.splatVel[i3 + 1] = 1.0 + Math.random() * 1.4
      this.splatVel[i3 + 2] = Math.sin(a) * sp
      this.splatLife[i] = SPLAT_LIFE * (0.6 + Math.random() * 0.6)
      this.splatSpan[i] = this.splatLife[i]
      this.splatSize[i] = 0.22 + Math.random() * 0.18
      this.splatRot[i] = Math.random() * Math.PI * 2
      this.splatVar[i] = Math.floor(Math.random() * 4)
      this.splatAlpha[i] = 1
    }
  }

  private updateSplats(dt: number, groundY: number) {
    const GRAVITY = 9.8
    for (let i = 0; i < SPLAT_CAP; i++) {
      if (this.splatLife[i] <= 0) {
        if (this.splatAlpha[i] !== 0) this.splatAlpha[i] = 0
        continue
      }
      this.splatLife[i] -= dt
      const i3 = i * 3
      if (this.splatLife[i] <= 0) {
        this.splatPos[i3 + 1] = -100
        this.splatAlpha[i] = 0
        continue
      }
      this.splatVel[i3 + 1] -= GRAVITY * dt
      this.splatPos[i3] += this.splatVel[i3] * dt
      const ny = this.splatPos[i3 + 1] + this.splatVel[i3 + 1] * dt
      if (ny < groundY + 0.02) {
        this.splatPos[i3 + 1] = groundY + 0.02
        this.splatVel[i3] *= 0.4
        this.splatVel[i3 + 2] *= 0.4
        this.splatVel[i3 + 1] = 0
      } else {
        this.splatPos[i3 + 1] = ny
      }
      this.splatPos[i3 + 2] += this.splatVel[i3 + 2] * dt
      this.splatRot[i] += 0.5 * dt
      const t = 1 - this.splatLife[i] / this.splatSpan[i]
      this.splatAlpha[i] = (1 - t) * 0.7
    }
    this.splatPosAttr.needsUpdate = true
    this.splatSizeAttr.needsUpdate = true
    this.splatRotAttr.needsUpdate = true
    this.splatVarAttr.needsUpdate = true
    this.splatAlphaAttr.needsUpdate = true
  }

  private trackCamera(dt: number, cam: THREE.Vector3) {
    if (this.haveLastCam && dt > 0) {
      const raw = cam.clone().sub(this.lastCam).divideScalar(dt)
      if (raw.length() < 150) this.camVel.lerp(raw, 1 - Math.exp(-dt * 8))
      else this.camVel.set(0, 0, 0)
    }
    this.lastCam.copy(cam)
    this.haveLastCam = true
  }

  private flash(dt: number): number {
    this.boltClock += dt
    if (this.bolt.length === 0 && this.boltClock >= this.nextBolt) {
      this.bolt = [1, 0.15, 0.85, 0.35]
      this.boltClock = 0
      this.nextBolt = 4 + Math.random() * 9
    }
    if (this.bolt.length === 0) return 0
    const level = this.bolt[0]
    this.bolt[0] -= dt * 14
    if (this.bolt[0] <= 0.02) this.bolt.shift()
    return Math.max(0, Math.min(1, level))
  }

  dispose() {
    this.lines.removeFromParent()
    this.geo.dispose()
    this.mat.dispose()
    this.splats.removeFromParent()
    this.splats.geometry.dispose()
    ;(this.splats.material as THREE.Material).dispose()
  }
}
