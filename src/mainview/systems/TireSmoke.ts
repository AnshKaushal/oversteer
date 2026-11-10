import * as THREE from "three"

const CAP = 800
const SPRAY_CAP = 420
const TURF_CAP = 360
const WET_SMOKE_LEFT = 0.15
const GRAVITY = 9.8

export type WetnessFn = (x: number, z: number) => number

export type GrassFn = (x: number, z: number) => boolean

export interface SmokeVel {
  x: number
  y: number
  z: number
}

let smokeTex: THREE.Texture | null = null
function getSmokeTexture(): THREE.Texture {
  if (smokeTex) return smokeTex
  const cell = 128
  const c = document.createElement("canvas")
  c.width = c.height = cell * 2
  const g = c.getContext("2d")!
  let seed = 1337
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cell
    const oy = Math.floor(v / 2) * cell
    const cx = ox + cell / 2
    const cy = oy + cell / 2
    g.save()
    g.beginPath()
    g.rect(ox, oy, cell, cell)
    g.clip()
    const blobs = 16 + Math.floor(rnd() * 8)
    for (let b = 0; b < blobs; b++) {
      const a = rnd() * Math.PI * 2
      const d = Math.pow(rnd(), 0.7) * cell * 0.26
      const x = cx + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      const r = cell * (0.1 + rnd() * 0.14)
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      const al = 0.1 + rnd() * 0.14
      grad.addColorStop(0, `rgba(255,255,255,${al})`)
      grad.addColorStop(1, "rgba(255,255,255,0)")
      g.fillStyle = grad
      g.fillRect(ox, oy, cell, cell)
    }
    g.globalCompositeOperation = "destination-in"
    const mask = g.createRadialGradient(
      cx,
      cy,
      cell * 0.12,
      cx,
      cy,
      cell * 0.48,
    )
    mask.addColorStop(0, "rgba(255,255,255,1)")
    mask.addColorStop(1, "rgba(255,255,255,0)")
    g.fillStyle = mask
    g.fillRect(ox, oy, cell, cell)
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  smokeTex = t
  return t
}

export class TireSmoke {
  points = new THREE.Group()
  wetnessAt: WetnessFn | null = null
  grassAt: GrassFn | null = null
  private turf = new Turf()
  private smokePoints: THREE.Points
  private spray = new Spray()
  private pos = new Float32Array(CAP * 3)
  private vel = new Float32Array(CAP * 3)
  private life = new Float32Array(CAP)
  private span = new Float32Array(CAP)
  private size = new Float32Array(CAP)
  private size0 = new Float32Array(CAP)
  private grow = new Float32Array(CAP)
  private maxA = new Float32Array(CAP)
  private rot = new Float32Array(CAP)
  private rotSpd = new Float32Array(CAP)
  private variant = new Float32Array(CAP)
  private kind = new Uint8Array(CAP)
  private phase = new Float32Array(CAP)
  private floorY = new Float32Array(CAP)
  private alpha = new Float32Array(CAP)
  private posAttr = new THREE.BufferAttribute(this.pos, 3)
  private sizeAttr = new THREE.BufferAttribute(this.size, 1)
  private alphaAttr = new THREE.BufferAttribute(this.alpha, 1)
  private rotAttr = new THREE.BufferAttribute(this.rot, 1)
  private varAttr = new THREE.BufferAttribute(this.variant, 1)
  private cursor = 0
  private geo = new THREE.BufferGeometry()
  private uniforms = {
    uMap: { value: null as THREE.Texture | null },
    uLight: { value: 1 },
  }
  private time = 0
  private burn = 0
  private stillSpawn = false
  private dragK = new Float32Array(CAP)

  constructor() {
    for (let i = 0; i < CAP; i++) this.pos[i * 3 + 1] = -100
    for (const a of [
      this.posAttr,
      this.sizeAttr,
      this.alphaAttr,
      this.rotAttr,
      this.varAttr,
    ])
      a.setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute("position", this.posAttr)
    this.geo.setAttribute("aSize", this.sizeAttr)
    this.geo.setAttribute("aAlpha", this.alphaAttr)
    this.geo.setAttribute("aRot", this.rotAttr)
    this.geo.setAttribute("aVar", this.varAttr)
    this.uniforms.uMap.value = getSmokeTexture()

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRot;
        attribute float aVar;
        varying float vAlpha;
        varying float vRot;
        varying float vVar;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          vAlpha = aAlpha * smoothstep(0.6, 3.0, dist);
          vRot = aRot;
          vVar = aVar;
          gl_PointSize = aSize * (240.0 / max(1.0, dist));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uLight;
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
          vec3 col = vec3(0.86, 0.85, 0.83) * uLight;
          gl_FragColor = vec4(col, a);
        }`,
    })
    this.smokePoints = new THREE.Points(this.geo, mat)
    this.smokePoints.frustumCulled = false
    this.smokePoints.renderOrder = 5
    this.points.add(this.smokePoints, this.spray.points, this.turf.points)
  }

  setLight(v: number) {
    this.uniforms.uLight.value = v
  }

  private emit(
    p: THREE.Vector3,
    strength: number,
    cv: SmokeVel | undefined,
    cloud: boolean,
  ) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % CAP
    const i3 = i * 3
    const burn = this.burn
    const spread = (cloud ? 0.7 : 0.3) * (1 + burn * 2.5)
    this.pos[i3] = p.x + (Math.random() - 0.5) * spread
    this.pos[i3 + 1] = p.y + 0.05 + Math.random() * 0.15
    this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * spread
    this.floorY[i] = p.y - 0.02
    const inh = cloud ? 0.25 : 0.45
    const cx = cv ? cv.x * inh : 0
    const cz = cv ? cv.z * inh : 0
    const kick =
      (cloud ? 0.8 : 2.2) * (0.5 + strength) * (1 + burn * (cloud ? 2.5 : 1))
    const ang = Math.random() * Math.PI * 2
    const rr = Math.random()
    this.vel[i3] = cx + Math.cos(ang) * kick * rr
    this.vel[i3 + 1] = (cloud ? 0.15 : 0.35) + Math.random() * 0.5
    this.vel[i3 + 2] = cz + Math.sin(ang) * kick * rr
    this.kind[i] = cloud ? 1 : 0
    this.span[i] =
      (cloud ? 2.2 + Math.random() * 2.0 : 0.8 + Math.random() * 0.7) *
      (1 + burn * (cloud ? 1.0 : 0.4))
    this.dragK[i] = (cloud ? 1.3 : 2.6) * (1 - burn * (cloud ? 0.55 : 0.3))
    this.life[i] = this.span[i]
    this.size0[i] = cloud
      ? (1.1 + Math.random() * 0.8) * (0.7 + strength * 0.6) * (1 + burn * 1.2)
      : (0.5 + Math.random() * 0.4) * (0.7 + strength * 0.6)
    this.size[i] = this.size0[i]
    this.grow[i] =
      (cloud ? 2.8 + Math.random() * 1.4 : 2.0 + Math.random()) *
      (1 + burn * 0.8)
    this.maxA[i] =
      (cloud ? 0.2 : 0.38) * (0.45 + strength * 0.7) * (1 + burn * 0.5)
    this.rot[i] = Math.random() * Math.PI * 2
    this.rotSpd[i] = (Math.random() - 0.5) * (cloud ? 0.6 : 1.4)
    this.variant[i] = Math.floor(Math.random() * 4)
    this.phase[i] = Math.random() * 6.28
  }

  spawn(p: THREE.Vector3, strength: number, carVel?: SmokeVel) {
    if (this.grassAt?.(p.x, p.z)) {
      this.turf.spawn(p, strength)
      if (Math.random() < 0.7) return
    }
    const wet = this.wetnessAt
      ? Math.max(0, Math.min(1, this.wetnessAt(p.x, p.z)))
      : 0
    if (wet > 0) this.spray.spawn(p, strength, wet)
    const smokeShare = 1 - wet * (1 - WET_SMOKE_LEFT)
    if (wet > 0 && Math.random() > smokeShare) return
    if (carVel && Math.hypot(carVel.x, carVel.z) < 5) this.stillSpawn = true
    this.emit(p, strength, carVel, false)
    if (Math.random() < 0.3 + strength * 0.25 + this.burn * 0.35)
      this.emit(p, strength, carVel, true)
  }

  update(dt: number) {
    this.spray.update(dt)
    this.turf.update(dt)
    this.time += dt
    this.burn = this.stillSpawn
      ? Math.min(1, this.burn + dt / 6)
      : Math.max(0, this.burn - dt / 2.5)
    this.stillSpawn = false
    for (let i = 0; i < CAP; i++) {
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
      const age = this.span[i] - this.life[i]
      const t = age / this.span[i]
      const cloud = this.kind[i] === 1
      const dragH = Math.exp(-dt * this.dragK[i])
      const dragV = Math.exp(-dt * 2.0)
      const buoy = (cloud ? 0.35 : 0.6) * Math.exp(-age / 0.6)
      const w = Math.sin(this.time * 1.7 + this.phase[i]) * (cloud ? 0.9 : 0.4)
      this.vel[i3] = this.vel[i3] * dragH + w * dt * 0.6
      this.vel[i3 + 2] =
        this.vel[i3 + 2] * dragH +
        Math.cos(this.time * 1.3 + this.phase[i]) *
          (cloud ? 0.9 : 0.4) *
          dt *
          0.6
      this.vel[i3 + 1] = this.vel[i3 + 1] * dragV + buoy * dt
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] = Math.max(
        this.floorY[i],
        this.pos[i3 + 1] + this.vel[i3 + 1] * dt,
      )
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.rot[i] += this.rotSpd[i] * dt
      const fadeIn = Math.min(1, t / 0.12)
      const fadeOut = Math.pow(1 - t, 1.5)
      this.alpha[i] = this.maxA[i] * fadeIn * fadeOut
      const e = 1 - (1 - t) * (1 - t)
      this.size[i] = this.size0[i] * (1 + this.grow[i] * e)
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
    this.rotAttr.needsUpdate = true
    this.varAttr.needsUpdate = true
  }
}

let turfTex: THREE.Texture | null = null
function getTurfTexture(): THREE.Texture {
  if (turfTex) return turfTex
  const cell = 64
  const c = document.createElement("canvas")
  c.width = c.height = cell * 2
  const g = c.getContext("2d")!
  let seed = 4242
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const blade = (x: number, y: number, len: number, ang: number, w: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(ang)
    g.beginPath()
    g.moveTo(-w, 0)
    g.quadraticCurveTo(-w * 0.6, -len * 0.6, (rnd() - 0.5) * len * 0.3, -len)
    g.quadraticCurveTo(w * 0.6, -len * 0.5, w, 0)
    g.closePath()
    g.fill()
    g.restore()
  }
  g.fillStyle = "#fff"
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cell
    const oy = Math.floor(v / 2) * cell
    const cx = ox + cell / 2
    const cy = oy + cell / 2
    g.save()
    g.beginPath()
    g.rect(ox, oy, cell, cell)
    g.clip()
    if (v === 0) {
      for (let k = 0; k < 7; k++)
        blade(
          cx + (rnd() - 0.5) * 8,
          cy + 18,
          30 + rnd() * 10,
          (k - 3) * 0.28 + (rnd() - 0.5) * 0.15,
          3,
        )
    } else if (v === 1) {
      blade(cx, cy + 20, 44, (rnd() - 0.5) * 0.5, 4.5)
    } else if (v === 2) {
      g.beginPath()
      const pts = 9
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2
        const r = 14 + rnd() * 9
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      g.closePath()
      g.fill()
      for (let k = 0; k < 5; k++)
        blade(
          cx + (rnd() - 0.5) * 20,
          cy + 6,
          14 + rnd() * 8,
          (rnd() - 0.5) * 2.4,
          2,
        )
    } else {
      g.beginPath()
      const pts = 6
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2 + rnd() * 0.4
        const r = 9 + rnd() * 8
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8)
      }
      g.closePath()
      g.fill()
    }
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  turfTex = t
  return t
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
      this.pos[i3 + 1] = Math.max(
        0.02,
        this.pos[i3 + 1] + this.vel[i3 + 1] * dt,
      )
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
  private rot = new Float32Array(TURF_CAP)
  private rotSpd = new Float32Array(TURF_CAP)
  private variant = new Float32Array(TURF_CAP)
  private posAttr = new THREE.BufferAttribute(this.pos, 3)
  private colAttr = new THREE.BufferAttribute(this.col, 3)
  private sizeAttr = new THREE.BufferAttribute(this.size, 1)
  private alphaAttr = new THREE.BufferAttribute(this.alpha, 1)
  private rotAttr = new THREE.BufferAttribute(this.rot, 1)
  private varAttr = new THREE.BufferAttribute(this.variant, 1)
  private cursor = 0

  constructor() {
    for (let i = 0; i < TURF_CAP; i++) this.pos[i * 3 + 1] = -100
    for (const a of [
      this.posAttr,
      this.colAttr,
      this.sizeAttr,
      this.alphaAttr,
      this.rotAttr,
      this.varAttr,
    ])
      a.setUsage(THREE.DynamicDrawUsage)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", this.posAttr)
    geo.setAttribute("aColor", this.colAttr)
    geo.setAttribute("aSize", this.sizeAttr)
    geo.setAttribute("aAlpha", this.alphaAttr)
    geo.setAttribute("aRot", this.rotAttr)
    geo.setAttribute("aVar", this.varAttr)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: getTurfTexture() } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRot;
        attribute float aVar;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        varying float vVar;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vRot = aRot;
          vVar = aVar;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRot;
        varying float vVar;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
          vec2 cell = vec2(mod(vVar, 2.0), floor(vVar / 2.0));
          float a = texture2D(uMap, (cell + q) * 0.5).a;
          if (a < 0.4) discard;
          gl_FragColor = vec4(vColor * (0.8 + 0.4 * q.y), vAlpha);
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
      const v = Math.floor(Math.random() * 4)
      this.variant[i] = v
      const j = Math.random() * 0.12
      if (v <= 1) {
        this.col[i3] = 0.2 + j
        this.col[i3 + 1] = 0.45 + j
        this.col[i3 + 2] = 0.13
      } else if (v === 2) {
        this.col[i3] = 0.26 + j
        this.col[i3 + 1] = 0.3 + j
        this.col[i3 + 2] = 0.12
      } else {
        this.col[i3] = 0.3 + j
        this.col[i3 + 1] = 0.21 + j * 0.5
        this.col[i3 + 2] = 0.11
      }
      this.rot[i] = Math.random() * Math.PI * 2
      this.rotSpd[i] = (Math.random() - 0.5) * 16
      this.life[i] = 0.5 + Math.random() * 0.6
      this.size[i] = (v === 3 ? 0.16 : 0.26) + Math.random() * 0.16
      this.alpha[i] = 1
    }
    this.colAttr.needsUpdate = true
    this.varAttr.needsUpdate = true
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
      const ny = this.pos[i3 + 1] + this.vel[i3 + 1] * dt
      if (ny < 0.03) {
        this.pos[i3 + 1] = 0.03
        this.vel[i3] *= 0.5
        this.vel[i3 + 2] *= 0.5
        this.vel[i3 + 1] = 0
        this.rotSpd[i] *= 0.3
      } else this.pos[i3 + 1] = ny
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.rot[i] += this.rotSpd[i] * dt
      this.alpha[i] = Math.min(1, this.life[i] * 3)
    }
    this.posAttr.needsUpdate = true
    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
    this.rotAttr.needsUpdate = true
  }
}
