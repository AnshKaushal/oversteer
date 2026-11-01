import { type CircuitConfig, mulberry32 } from "./config"

export interface Centerline {
  xs: Float64Array
  zs: Float64Array
  lengthM: number
}

const MIN_RADIUS_M = 32

function arcResample(
  px: Float64Array,
  pz: Float64Array,
  n: number,
): { xs: Float64Array; zs: Float64Array; length: number } {
  const m = px.length
  const cum = new Float64Array(m + 1)
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m
    cum[i + 1] = cum[i] + Math.hypot(px[j] - px[i], pz[j] - pz[i])
  }
  const length = cum[m]
  const xs = new Float64Array(n)
  const zs = new Float64Array(n)
  let k = 0
  for (let i = 0; i < n; i++) {
    const target = (i / n) * length
    while (k < m - 1 && cum[k + 1] < target) k++
    const span = cum[k + 1] - cum[k] || 1
    const t = (target - cum[k]) / span
    const j = (k + 1) % m
    xs[i] = px[k] + (px[j] - px[k]) * t
    zs[i] = pz[k] + (pz[j] - pz[k]) * t
  }
  return { xs, zs, length }
}

export function minRadius(xs: Float64Array, zs: Float64Array): number {
  const n = xs.length
  let worst = Infinity
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n
    const b = (i + 1) % n
    const ax = xs[i] - xs[a]
    const az = zs[i] - zs[a]
    const bx = xs[b] - xs[i]
    const bz = zs[b] - zs[i]
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz))
    if (turn < 1e-9) continue
    worst = Math.min(worst, (0.5 * (la + lb)) / turn)
  }
  return worst
}

export function minClearance(
  xs: Float64Array,
  zs: Float64Array,
  lengthM: number,
  minSepM: number,
): number {
  const n = xs.length
  const ds = lengthM / n
  const skip = Math.ceil(minSepM / ds)
  const stride = Math.max(1, Math.floor(n / 700))
  let best = Infinity
  for (let i = 0; i < n; i += stride) {
    for (let j = i + skip; j < n; j += stride) {
      if (n - (j - i) < skip) continue
      const d = Math.hypot(xs[i] - xs[j], zs[i] - zs[j])
      if (d < best) best = d
    }
  }
  return best
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function sharpen(c: Centerline, straightFrac: number): Centerline | null {
  const n = c.xs.length
  const ds = c.lengthM / n
  const psi = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    psi[i] = Math.atan2(c.zs[j] - c.zs[i], c.xs[j] - c.xs[i])
  }
  const kap = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    kap[i] = wrapPi(psi[(i + 1) % n] - psi[i]) / ds
    total += kap[i] * ds
  }
  const abs = Array.from(kap, Math.abs).sort((a, b) => a - b)
  const thr = abs[Math.floor(straightFrac * (n - 1))]
  let shaped = 0
  for (let i = 0; i < n; i++) {
    const m = Math.max(0, Math.abs(kap[i]) - thr)
    kap[i] = Math.sign(kap[i]) * m
    shaped += kap[i] * ds
  }
  if (Math.abs(shaped) < 1e-6) return null
  const scale = total / shaped
  const h = new Float64Array(n)
  h[0] = psi[0]
  for (let i = 0; i + 1 < n; i++) h[i + 1] = h[i] + kap[i] * scale * ds
  let a = 0
  let b = 0
  const cs = new Float64Array(n)
  const sn = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    cs[i] = Math.cos((2 * Math.PI * i) / n)
    sn[i] = Math.sin((2 * Math.PI * i) / n)
  }
  let gx = 0
  let gz = 0
  for (let it = 0; it < 40; it++) {
    gx = 0
    gz = 0
    let jaa = 0
    let jab = 0
    let jba = 0
    let jbb = 0
    for (let i = 0; i < n; i++) {
      const p = h[i] + a * cs[i] + b * sn[i]
      const c0 = Math.cos(p)
      const s0 = Math.sin(p)
      gx += c0 * ds
      gz += s0 * ds
      jaa += -s0 * cs[i] * ds
      jab += -s0 * sn[i] * ds
      jba += c0 * cs[i] * ds
      jbb += c0 * sn[i] * ds
    }
    if (Math.hypot(gx, gz) < 1e-3) break
    const det = jaa * jbb - jab * jba
    if (Math.abs(det) < 1e-9) return null
    a -= (gx * jbb - gz * jab) / det
    b -= (jaa * gz - jba * gx) / det
  }
  if (Math.hypot(gx, gz) > 0.5) return null
  const xs = new Float64Array(n)
  const zs = new Float64Array(n)
  let x = 0
  let z = 0
  for (let i = 0; i < n; i++) {
    xs[i] = x
    zs[i] = z
    const p = h[i] + a * cs[i] + b * sn[i]
    x += Math.cos(p) * ds
    z += Math.sin(p) * ds
  }
  return { xs, zs, lengthM: c.lengthM }
}

function candidate(
  cfg: CircuitConfig,
  rng: () => number,
  rough: number,
  n: number,
): Centerline | null {
  const dense = 2048
  const harmonics: { k: number; amp: number; phase: number }[] = []
  for (let k = 2; k <= 9; k++) {
    harmonics.push({
      k,
      amp: (rough * (0.35 + rng() * 0.65)) / Math.pow(k, 0.85),
      phase: rng() * Math.PI * 2,
    })
  }
  const stretch = 1 + rng() * (0.5 + rough * 0.7)
  const rot = rng() * Math.PI * 2
  const px = new Float64Array(dense)
  const pz = new Float64Array(dense)
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  for (let i = 0; i < dense; i++) {
    const th = (i / dense) * Math.PI * 2
    let r = 1
    for (const h of harmonics) r += h.amp * Math.cos(h.k * th + h.phase)
    if (r < 0.3) return null
    const x = r * Math.cos(th) * stretch
    const z = (r * Math.sin(th)) / stretch
    px[i] = x * cr - z * sr
    pz[i] = x * sr + z * cr
  }
  const raw = arcResample(px, pz, dense)
  const k = cfg.lengthM / raw.length
  for (let i = 0; i < dense; i++) {
    px[i] *= k
    pz[i] *= k
  }
  const out = arcResample(px, pz, n)
  const base = { xs: out.xs, zs: out.zs, lengthM: out.length }
  return sharpen(base, 0.62 - 0.3 * rough)
}

function ellipse(cfg: CircuitConfig, n: number): Centerline {
  const dense = 1024
  const px = new Float64Array(dense)
  const pz = new Float64Array(dense)
  for (let i = 0; i < dense; i++) {
    const th = (i / dense) * Math.PI * 2
    px[i] = Math.cos(th) * 1.6
    pz[i] = Math.sin(th)
  }
  const raw = arcResample(px, pz, dense)
  const k = cfg.lengthM / raw.length
  for (let i = 0; i < dense; i++) {
    px[i] *= k
    pz[i] *= k
  }
  const out = arcResample(px, pz, n)
  return { xs: out.xs, zs: out.zs, lengthM: out.length }
}

export function generateCenterline(cfg: CircuitConfig): Centerline {
  const rng = mulberry32(cfg.seed)
  const n = Math.max(240, Math.min(4000, Math.round(cfg.lengthM / 4)))
  const need = cfg.barriers
    ? cfg.widthM + 2 * cfg.runoffM + 6
    : cfg.widthM * 2 + 10
  const minSep = Math.max(need * 2.5, 80)
  let rough = 0.15 + cfg.twistiness * 0.85
  for (let attempt = 0; attempt < 80; attempt++) {
    const c = candidate(cfg, rng, rough, n)
    rough *= 0.97
    if (!c) continue
    if (minRadius(c.xs, c.zs) < MIN_RADIUS_M) continue
    if (minClearance(c.xs, c.zs, c.lengthM, minSep) < need) continue
    return c
  }
  return ellipse(cfg, n)
}
