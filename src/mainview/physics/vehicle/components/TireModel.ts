import type { Wheels } from "../../../data/schema"
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface PacejkaShape {
  B: number
  C: number
  D: number
  E: number
}

export interface TireParams {
  mu: number
  referenceLoad: number
  loadExpLong: number
  loadExpLat: number
  rollingResist: number
  rollingV0: number
  camberThrust: number
  trail: number
  long: PacejkaShape
  lat: PacejkaShape
  aligning: PacejkaShape
}

export interface TireContact {
  grounded: boolean
  normalLoad: number
  normal: Vec3
  patchVel: Vec3
  wheelOmega: number
  slipRatio: number
  slipTan: number
  wheelHeading: Vec3
  bodyForward: Vec3
  camber?: number
  gripScale?: number
  rollingScale?: number
}

export interface TireResult {
  fx: number
  fy: number
  force: Vec3
  t: Vec3
  l: Vec3
  sx: number
  slipAngle: number
  vx: number
  vy: number
  muX: number
  muY: number
  fmax: number
  usage: number
  rollingForce: number
  mz: number
  slopeX: number
}

export function magicFormula(
  s: number,
  B: number,
  C: number,
  D: number,
  E: number,
): number {
  const Bs = B * s
  return D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))))
}

function trailFactor(sa: number, s: PacejkaShape): number {
  const Bs = s.B * sa
  return s.D * Math.cos(s.C * Math.atan(Bs - s.E * (Bs - Math.atan(Bs))))
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k }
}

function norm(a: Vec3): Vec3 {
  const m = Math.hypot(a.x, a.y, a.z)
  if (!(m > 1e-9)) return { x: 0, y: 1, z: 0 }
  return scale(a, 1 / m)
}

export function tireParamsFrom(w: Wheels): TireParams {
  const shape = (c: { B: number; C: number; D: number; E: number }) => ({
    B: c.B,
    C: c.C,
    D: c.D,
    E: c.E,
  })
  return {
    mu: w.frictionMu,
    referenceLoad: w.referenceLoad,
    loadExpLong: w.pacejka.longitudinal.loadSensitivity,
    loadExpLat: w.pacejka.lateral.loadSensitivity,
    rollingResist: w.rollingResist,
    rollingV0: w.tire.rollingV0,
    camberThrust: w.alignment.camberThrust,
    trail: w.steering.pneumaticTrail,
    aligning: shape(w.pacejka.aligning),
    long: shape(w.pacejka.longitudinal),
    lat: shape(w.pacejka.lateral),
  }
}

function peakSlip(s: PacejkaShape): number {
  return Math.tan(Math.PI / (2 * s.C)) / s.B
}

export class TireModel {
  private readonly peakSlipX: number
  private readonly peakSlipY: number

  constructor(
    readonly params: TireParams,
    readonly radius: number,
  ) {
    this.peakSlipX = peakSlip(params.long)
    this.peakSlipY = peakSlip(params.lat)
  }

  basis(c: Pick<TireContact, "normal" | "wheelHeading" | "bodyForward">): {
    t: Vec3
    l: Vec3
  } {
    const n = norm(c.normal)
    let t = sub(c.wheelHeading, scale(n, dot(c.wheelHeading, n)))
    if (Math.hypot(t.x, t.y, t.z) < 1e-4) {
      t = sub(c.bodyForward, scale(n, dot(c.bodyForward, n)))
      if (Math.hypot(t.x, t.y, t.z) < 1e-4) {
        t = sub({ x: 0, y: 0, z: -1 }, scale(n, -n.z))
        if (Math.hypot(t.x, t.y, t.z) < 1e-4) t = { x: 0, y: 0, z: -1 }
      }
    }
    t = norm(t)
    const l = norm({
      x: n.y * t.z - n.z * t.y,
      y: n.z * t.x - n.x * t.z,
      z: n.x * t.y - n.y * t.x,
    })
    return { t, l }
  }

  eval(c: TireContact): TireResult {
    const zero = (t: Vec3, l: Vec3): TireResult => ({
      fx: 0,
      fy: 0,
      force: { x: 0, y: 0, z: 0 },
      t,
      l,
      sx: 0,
      slipAngle: 0,
      vx: 0,
      vy: 0,
      muX: this.params.mu,
      muY: this.params.mu,
      fmax: 0,
      usage: 0,
      rollingForce: 0,
      mz: 0,
      slopeX: 0,
    })

    const { t, l } = this.basis(c)

    const Fz = c.grounded ? Math.max(0, c.normalLoad) : 0
    if (Fz <= 1) return zero(t, l)

    const vx = dot(c.patchVel, t)
    const vy = dot(c.patchVel, l)
    const sx = c.slipRatio
    const tanA = c.slipTan - this.params.camberThrust * (c.camber ?? 0)
    const sa = Math.atan(tanA)

    const P = this.params
    const loadRatio = Fz / P.referenceLoad
    const grip = c.gripScale ?? 1
    const muX = P.mu * grip * Math.pow(loadRatio, P.loadExpLong - 1)
    const muY = P.mu * grip * Math.pow(loadRatio, P.loadExpLat - 1)
    const Dx = P.long.D * muX * Fz
    const Dy = P.lat.D * muY * Fz

    const kx = sx / this.peakSlipX
    const ky = sa / this.peakSlipY
    const k = Math.hypot(kx, ky)
    let fx = 0
    let fy = 0
    if (k > 0) {
      fx =
        (magicFormula(k * this.peakSlipX, P.long.B, P.long.C, Dx, P.long.E) *
          kx) /
        k
      fy =
        (-magicFormula(k * this.peakSlipY, P.lat.B, P.lat.C, Dy, P.lat.E) *
          ky) /
        k
    }
    const rollingForce =
      -P.rollingResist *
      (c.rollingScale ?? 1) *
      Fz *
      Math.tanh(vx / P.rollingV0)
    fx += rollingForce

    const m = Math.hypot(fx / Dx, fy / Dy)
    if (m > 1) {
      fx /= m
      fy /= m
    }

    return {
      fx,
      fy,
      force: {
        x: t.x * fx + l.x * fy,
        y: t.y * fx + l.y * fy,
        z: t.z * fx + l.z * fy,
      },
      t,
      l,
      sx,
      slipAngle: sa,
      vx,
      vy,
      muX,
      muY,
      fmax: P.mu * grip * Fz,
      usage: m,
      rollingForce,
      mz: P.trail * trailFactor(sa, P.aligning) * fy,
      slopeX: (P.long.B * P.long.C * Dx) / (1 + (sx / this.peakSlipX) ** 2),
    }
  }
}
