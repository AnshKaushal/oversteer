import type { CircuitConfig } from "./config"
import { generateCenterline } from "./generate"

export interface Projection {
  s: number
  dist: number
  lateral: number
  x: number
  z: number
  tx: number
  tz: number
}

export class Track {
  readonly cell: number
  private readonly hit: Projection = {
    s: 0,
    dist: 0,
    lateral: 0,
    x: 0,
    z: 0,
    tx: 0,
    tz: 1,
  }

  readonly n: number
  readonly lengthM: number
  readonly ds: number
  readonly xs: Float64Array
  readonly zs: Float64Array
  readonly tx: Float64Array
  readonly tz: Float64Array
  readonly kappa: Float64Array
  private readonly grid = new Map<number, number[]>()

  constructor(readonly config: CircuitConfig) {
    this.cell = Math.max(48, config.widthM / 2 + config.runoffM + 12)
    const line = generateCenterline(config)
    let xs = line.xs
    let zs = line.zs
    const n = xs.length
    let area = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += xs[i] * zs[j] - xs[j] * zs[i]
    }
    const flip = (config.seed & 1) === 1
    if (area > 0 !== flip) {
      xs = Float64Array.from(xs).reverse()
      zs = Float64Array.from(zs).reverse()
    }
    this.n = n
    this.lengthM = line.lengthM
    this.ds = line.lengthM / n
    this.tx = new Float64Array(n)
    this.tz = new Float64Array(n)
    this.kappa = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n
      const b = (i + 1) % n
      const dx = xs[b] - xs[a]
      const dz = zs[b] - zs[a]
      const l = Math.hypot(dx, dz) || 1
      this.tx[i] = dx / l
      this.tz[i] = dz / l
    }
    for (let i = 0; i < n; i++) {
      const b = (i + 1) % n
      const cross = this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b]
      const dot = this.tx[i] * this.tx[b] + this.tz[i] * this.tz[b]
      this.kappa[i] = Math.atan2(cross, dot) / this.ds
    }
    const window = Math.max(2, Math.round(200 / this.ds))
    let bestI = 0
    let bestScore = Infinity
    for (let i = 0; i < n; i += 2) {
      let sum = 0
      for (let k = -window; k <= window; k += 2) {
        sum += Math.abs(this.kappa[(i + k + n * 4) % n])
      }
      if (sum < bestScore) {
        bestScore = sum
        bestI = i
      }
    }
    const rx = new Float64Array(n)
    const rz = new Float64Array(n)
    const rtx = new Float64Array(n)
    const rtz = new Float64Array(n)
    const rk = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const src = (i + bestI) % n
      rx[i] = xs[src]
      rz[i] = zs[src]
      rtx[i] = this.tx[src]
      rtz[i] = this.tz[src]
      rk[i] = this.kappa[src]
    }
    this.xs = rx
    this.zs = rz
    this.tx.set(rtx)
    this.tz.set(rtz)
    this.kappa.set(rk)
    for (let i = 0; i < n; i++) {
      const key = this.cellKey(
        Math.floor(rx[i] / this.cell),
        Math.floor(rz[i] / this.cell),
      )
      const list = this.grid.get(key)
      if (list) list.push(i)
      else this.grid.set(key, [i])
    }
  }

  private cellKey(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768)
  }

  wrap(s: number): number {
    const L = this.lengthM
    return ((s % L) + L) % L
  }

  at(s: number): { x: number; z: number; tx: number; tz: number } {
    const f = this.wrap(s) / this.ds
    const i = Math.floor(f) % this.n
    const j = (i + 1) % this.n
    const t = f - Math.floor(f)
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t
    const l = Math.hypot(tx, tz) || 1
    return {
      x: this.xs[i] + (this.xs[j] - this.xs[i]) * t,
      z: this.zs[i] + (this.zs[j] - this.zs[i]) * t,
      tx: tx / l,
      tz: tz / l,
    }
  }

  private bestD2 = Infinity
  private found = false

  private seg(x: number, z: number, a: number, b: number) {
    const ax = this.xs[a]
    const az = this.zs[a]
    const ex = this.xs[b] - ax
    const ez = this.zs[b] - az
    const len2 = ex * ex + ez * ez || 1
    let t = ((x - ax) * ex + (z - az) * ez) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const px = ax + ex * t
    const pz = az + ez * t
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz)
    if (d2 >= this.bestD2) return
    this.bestD2 = d2
    this.found = true
    const el = Math.sqrt(len2)
    const h = this.hit
    h.x = px
    h.z = pz
    h.tx = ex / el
    h.tz = ez / el
    h.s = a * this.ds + t * this.ds
  }

  private scanPoint(x: number, z: number, i: number) {
    const n = this.n
    this.seg(x, z, i, (i + 1) % n)
    this.seg(x, z, (i + n - 1) % n, i)
  }

  private finish(x: number, z: number): Projection | null {
    if (!this.found) return null
    const h = this.hit
    h.dist = Math.sqrt(this.bestD2)
    h.lateral = (x - h.x) * -h.tz + (z - h.z) * h.tx
    return h
  }

  nearby(x: number, z: number): Projection | null {
    this.bestD2 = Infinity
    this.found = false
    const cx = Math.floor(x / this.cell)
    const cz = Math.floor(z / this.cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.grid.get(this.cellKey(cx + dx, cz + dz))
        if (!list) continue
        for (let k = 0; k < list.length; k++) this.scanPoint(x, z, list[k])
      }
    }
    return this.finish(x, z)
  }

  project(x: number, z: number): Projection {
    const near = this.nearby(x, z)
    if (near) return near
    this.bestD2 = Infinity
    this.found = false
    for (let i = 0; i < this.n; i++) this.scanPoint(x, z, i)
    return this.finish(x, z)!
  }
}
