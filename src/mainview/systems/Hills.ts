import * as THREE from "three"

export function hillNoise(seed: number, x: number, z: number): number {
  const h2 = (ix: number, iz: number) => {
    let h = Math.imul(
      seed + Math.imul(ix, 374761393) + Math.imul(iz, 668265263),
      1274126177,
    )
    h ^= h >>> 13
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const oct = (fx: number, fz: number) => {
    const ix = Math.floor(fx),
      iz = Math.floor(fz)
    const tx = smooth(fx - ix),
      tz = smooth(fz - iz)
    const a = h2(ix, iz),
      b = h2(ix + 1, iz)
    const c = h2(ix, iz + 1),
      d = h2(ix + 1, iz + 1)
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
  }
  return (
    oct(x * 0.02, z * 0.02) * 0.65 +
    oct(x * 0.06 + 13.7, z * 0.06 + 7.1) * 0.35
  )
}

export function makeHillGeometry(
  radius: number,
  height: number,
  seed: number,
): THREE.BufferGeometry {
  const NR = 12
  const NS = 36
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  const green = new THREE.Color(0x44602f)
  const dark = new THREE.Color(0x2f4a24)
  const rock = new THREE.Color(0x6e6e68)
  const snow = new THREE.Color(0xdfe8ee)
  const c = new THREE.Color()
  const smooth = (t: number) => {
    const x = Math.min(1, Math.max(0, t))
    return x * x * (3 - 2 * x)
  }

  const nr = Math.min(radius, 60)
  const nTop = hillNoise(seed, 0, 0)
  positions.push(0, height + nTop * height * 0.05, 0)
  c.copy(green).lerp(rock, 0.55)
  colors.push(c.r, c.g, c.b)

  for (let i = 1; i <= NR; i++) {
    const rho = i / NR
    const prof = 1 - smooth(rho)
    const apron = 1 + (1 - smooth(Math.min(1, rho / 0.35))) * 0.35
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2
      const dx = Math.cos(th)
      const dz = Math.sin(th)
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0.02, rho)))
      const n = hillNoise(seed, dx * rho * nr, dz * rho * nr)
      const rr = radius * rho * apron * (1 + 0.1 * n * env)
      const h = Math.max(0, height * prof + n * height * 0.06 * env)
      positions.push(dx * rr, h, dz * rr)
      const rockiness = Math.min(
        1,
        Math.max(0, (prof - 0.35) * 1.5 + Math.max(0, n) * 0.3),
      )
      c.copy(green)
        .lerp(dark, Math.max(0, -n) * 0.5)
        .lerp(rock, rockiness)
      if (height > 60) {
        const t = Math.min(1, Math.max(0, (h / height - 0.62) / 0.2))
        const s = t * t * (3 - 2 * t)
        c.lerp(snow, s)
      }
      colors.push(c.r, c.g, c.b)
    }
  }
  const ring = (i: number, j: number) =>
    1 + (i - 1) * NS + (((j % NS) + NS) % NS)
  for (let j = 0; j < NS; j++) index.push(0, ring(1, j + 1), ring(1, j))
  for (let i = 1; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      index.push(ring(i, j), ring(i, j + 1), ring(i + 1, j + 1))
      index.push(ring(i, j), ring(i + 1, j + 1), ring(i + 1, j))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  )
  geo.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3),
  )
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

export function hash01(seed: number): number {
  let t = seed + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function sampleSurface(
  geo: THREE.BufferGeometry,
  seed: number,
  count: number,
): { pos: THREE.Vector3; nrm: THREE.Vector3 }[] {
  const out: { pos: THREE.Vector3; nrm: THREE.Vector3 }[] = []
  const posA = geo.getAttribute("position") as THREE.BufferAttribute
  const idx = geo.getIndex()
  if (!idx) return out
  const triCount = Math.floor(idx.count / 3)
  const areas = new Float32Array(triCount)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const cc = new THREE.Vector3()
  let total = 0
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(posA, idx.getX(t * 3))
    b.fromBufferAttribute(posA, idx.getX(t * 3 + 1))
    cc.fromBufferAttribute(posA, idx.getX(t * 3 + 2))
    const ar = b.clone().sub(a).cross(cc.clone().sub(a)).length() / 2
    areas[t] = ar
    total += ar
  }
  if (total <= 0) return out
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let k = 0; k < count; k++) {
    let r = hash01(seed + k * 101) * total
    let t = 0
    while (t < triCount - 1 && (r -= areas[t]) > 0) t++
    a.fromBufferAttribute(posA, idx.getX(t * 3))
    b.fromBufferAttribute(posA, idx.getX(t * 3 + 1))
    cc.fromBufferAttribute(posA, idx.getX(t * 3 + 2))
    let u = hash01(seed + k * 103 + 1)
    let w = hash01(seed + k * 107 + 2)
    if (u + w > 1) {
      u = 1 - u
      w = 1 - w
    }
    const p = a
      .clone()
      .multiplyScalar(1 - u - w)
      .addScaledVector(b, u)
      .addScaledVector(cc, w)
    e1.copy(b).sub(a)
    e2.copy(cc).sub(a)
    n.copy(e1.cross(e2))
    if (n.lengthSq() < 1e-10) continue
    n.normalize()
    if (n.y < 0) n.negate()
    out.push({ pos: p, nrm: n.clone() })
  }
  return out
}
