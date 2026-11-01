import * as THREE from "three"

const CAP = 260
const SPRAY_CAP = 420
const TURF_CAP = 360
const WET_SMOKE_LEFT = 0.15
const GRAVITY = 9.8

export type WetnessFn = (x: number, z: number) => number

export type GrassFn = (x: number, z: number) => boolean

export class TireSmoke {
  points = new THREE.Group()
  wetnessAt: WetnessFn | null = null
  grassAt: GrassFn | null = null
  private turf = new Turf()
  private smokePoints: THREE.Points
  private spray = new Spray()
  private pos: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private span: Float32Array
  private size: Float32Array
  private alphaAttr: THREE.BufferAttribute
  private posAttr: THREE.BufferAttribute
  private sizeAttr: THREE.BufferAttribute
  private cursor = 0
  private geo = new THREE.BufferGeometry()

  constructor() {
    this.pos = new Float32Array(CAP * 3)
    this.vel = new Float32Array(CAP * 3)
    this.life = new Float32Array(CAP)
    this.span = new Float32Array(CAP)
    this.size = new Float32Array(CAP)
    const alpha = new Float32Array(CAP)
    for (let i = 0; i < CAP; i++) this.pos[i * 3 + 1] = -100

    this.posAttr = new THREE.BufferAttribute(this.pos, 3)
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1)
    this.alphaAttr = new THREE.BufferAttribute(alpha, 1)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage)
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute("position", this.posAttr)
    this.geo.setAttribute("aSize", this.sizeAttr)
    this.geo.setAttribute("aAlpha", this.alphaAttr)

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float soft = smoothstep(0.5, 0.12, d);
          gl_FragColor = vec4(vec3(0.82, 0.82, 0.84), soft * vAlpha);
        }`,
    })
    this.smokePoints = new THREE.Points(this.geo, mat)
    this.smokePoints.frustumCulled = false
    this.smokePoints.renderOrder = 5
    this.points.add(this.smokePoints, this.spray.points, this.turf.points)
  }

  spawn(p: THREE.Vector3, strength: number) {
    if (this.grassAt?.(p.x, p.z)) {
      this.turf.spawn(p, strength)
      if (Math.random() < 0.7) return
    }
    const wet = this.wetnessAt ? Math.max(0, Math.min(1, this.wetnessAt(p.x, p.z))) : 0
    if (wet > 0) this.spray.spawn(p, strength, wet)
    const smokeShare = 1 - wet * (1 - WET_SMOKE_LEFT)
    const n = 1 + Math.floor(strength * 2.99)
    for (let k = 0; k < n; k++) {
      if (wet > 0 && Math.random() > smokeShare) continue
      const i = this.cursor
      this.cursor = (this.cursor + 1) % CAP
      const i3 = i * 3
      this.pos[i3] = p.x + (Math.random() - 0.5) * 0.5
      this.pos[i3 + 1] = p.y + Math.random() * 0.25
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * 0.5
      this.vel[i3] = (Math.random() - 0.5) * 1.6
      this.vel[i3 + 1] = 1.0 + Math.random() * 1.8 + strength * 1.2
      this.vel[i3 + 2] = (Math.random() - 0.5) * 1.6
      this.span[i] = 0.9 + Math.random() * 0.8
      this.life[i] = this.span[i]
      this.size[i] = (0.9 + Math.random() * 0.7) * (0.7 + strength * 0.8)
    }
  }

  update(dt: number) {
    this.spray.update(dt)
    this.turf.update(dt)
    const damp = Math.exp(-dt * 1.6)
    const alpha = this.alphaAttr.array as Float32Array
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const i3 = i * 3
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -100
        alpha[i] = 0
        continue
      }
      this.vel[i3] *= damp
      this.vel[i3 + 2] *= damp
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp + dt * 1.4
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      const f = this.life[i] / this.span[i]
      alpha[i] = 0.5 * f
      this.size[i] += dt * 1.6
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
  }
}

class Spray {
  points: THREE.Points
  private pos = new Float32Array(SPRAY_CAP * 3)
  private vel = new Float32Array(SPRAY_CAP * 3)
  private life = new Float32Array(SPRAY_CAP)
  private span = new Float32Array(SPRAY_CAP)
  private size = new Float32Array(SPRAY_CAP)
  private alpha = new Float32Array(SPRAY_CAP)
  private posAttr = new THREE.BufferAttribute(this.pos, 3)
  private sizeAttr = new THREE.BufferAttribute(this.size, 1)
  private alphaAttr = new THREE.BufferAttribute(this.alpha, 1)
  private cursor = 0

  constructor() {
    for (let i = 0; i < SPRAY_CAP; i++) this.pos[i * 3 + 1] = -100
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage)
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", this.posAttr)
    geo.setAttribute("aSize", this.sizeAttr)
    geo.setAttribute("aAlpha", this.alphaAttr)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float soft = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vec3(0.82, 0.9, 0.98), soft * vAlpha);
        }`,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 6
  }

  spawn(p: THREE.Vector3, strength: number, wet: number) {
    const want = wet * (1.5 + strength * 5)
    let n = Math.floor(want)
    if (Math.random() < want - n) n++
    for (let k = 0; k < n; k++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % SPRAY_CAP
      const i3 = i * 3
      this.pos[i3] = p.x + (Math.random() - 0.5) * 0.5
      this.pos[i3 + 1] = p.y + Math.random() * 0.1
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * 0.5
      const kick = 1.2 + strength * 2.4 + wet * 0.8
      this.vel[i3] = (Math.random() - 0.5) * 2 * kick
      this.vel[i3 + 1] = 1.8 + Math.random() * 2.4 + strength * 2
      this.vel[i3 + 2] = (Math.random() - 0.5) * 2 * kick
      this.span[i] = 0.45 + Math.random() * 0.5
      this.life[i] = this.span[i]
      this.size[i] = 0.22 + Math.random() * 0.2
    }
  }

  update(dt: number) {
    for (let i = 0; i < SPRAY_CAP; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const i3 = i * 3
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -100
        this.alpha[i] = 0
        continue
      }
      this.vel[i3 + 1] -= GRAVITY * dt
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1] + this.vel[i3 + 1] * dt)
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.alpha[i] = 0.8 * Math.min(1, (this.life[i] / this.span[i]) * 1.6)
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
  }
}

class Turf {
  points: THREE.Points
  private pos = new Float32Array(TURF_CAP * 3)
  private vel = new Float32Array(TURF_CAP * 3)
  private col = new Float32Array(TURF_CAP * 3)
  private life = new Float32Array(TURF_CAP)
  private size = new Float32Array(TURF_CAP)
  private alpha = new Float32Array(TURF_CAP)
  private posAttr = new THREE.BufferAttribute(this.pos, 3)
  private colAttr = new THREE.BufferAttribute(this.col, 3)
  private sizeAttr = new THREE.BufferAttribute(this.size, 1)
  private alphaAttr = new THREE.BufferAttribute(this.alpha, 1)
  private cursor = 0

  constructor() {
    for (let i = 0; i < TURF_CAP; i++) this.pos[i * 3 + 1] = -100
    for (const a of [this.posAttr, this.colAttr, this.sizeAttr, this.alphaAttr]) a.setUsage(THREE.DynamicDrawUsage)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", this.posAttr)
    geo.setAttribute("aColor", this.colAttr)
    geo.setAttribute("aSize", this.sizeAttr)
    geo.setAttribute("aAlpha", this.alphaAttr)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, vAlpha);
        }`,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 6
  }

  spawn(p: THREE.Vector3, strength: number) {
    const n = 2 + Math.floor(strength * 5)
    for (let k = 0; k < n; k++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % TURF_CAP
      const i3 = i * 3
      this.pos[i3] = p.x + (Math.random() - 0.5) * 0.5
      this.pos[i3 + 1] = p.y + Math.random() * 0.1
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * 0.5
      const kick = 1.5 + strength * 3
      this.vel[i3] = (Math.random() - 0.5) * 2 * kick
      this.vel[i3 + 1] = 2 + Math.random() * 3 + strength * 2.5
      this.vel[i3 + 2] = (Math.random() - 0.5) * 2 * kick
      const green = Math.random() < 0.6
      this.col[i3] = green ? 0.2 + Math.random() * 0.1 : 0.32 + Math.random() * 0.08
      this.col[i3 + 1] = green ? 0.4 + Math.random() * 0.15 : 0.22 + Math.random() * 0.06
      this.col[i3 + 2] = green ? 0.12 : 0.1
      this.life[i] = 0.5 + Math.random() * 0.6
      this.size[i] = 0.14 + Math.random() * 0.16
      this.alpha[i] = 1
    }
    this.colAttr.needsUpdate = true
  }

  update(dt: number) {
    for (let i = 0; i < TURF_CAP; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const i3 = i * 3
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -100
        this.alpha[i] = 0
        continue
      }
      this.vel[i3 + 1] -= GRAVITY * dt
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] = Math.max(0.03, this.pos[i3 + 1] + this.vel[i3 + 1] * dt)
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.alpha[i] = Math.min(1, this.life[i] * 3)
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
  }
}
