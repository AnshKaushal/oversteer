import * as THREE from "three"

// Surfaces are the in-garage screens that carry the menu. They are defined in
// garage-local space (the model's own units, before the 0.7 group scale).
// `real` surfaces already exist in the model; the others get a mounted frame.
export type SurfaceId = "paint" | "specs" | "tune" | "race" | "drive" | "dyno"

export interface SurfaceDef {
  id: SurfaceId
  label: string
  /** Centre of the screen face, garage-local. */
  center: [number, number, number]
  /** Outward normal (the side the player looks from), garage-local. */
  normal: [number, number, number]
  /** World size in garage units. */
  w: number
  h: number
  /** DOM size in px; keep the same aspect as w:h. */
  px: [number, number]
  real?: boolean
  /** A screen-space overlay anchored on a point rather than a wall screen. */
  hud?: boolean
  /** Fixed camera pose (garage-local) used instead of framing the screen. */
  view?: { pos: [number, number, number]; look: [number, number, number] }
}

export const SURFACES: SurfaceDef[] = [
  {
    id: "paint",
    label: "Paint",
    center: [4.165, 3.98, -10.71],
    normal: [0, 0, 1],
    w: 6.09,
    h: 3.7,
    px: [600, 364],
    real: true,
  },
  {
    id: "drive",
    label: "Drive",
    center: [8.76, 4.4, 0.5],
    normal: [-1, 0, 0],
    w: 2.1,
    h: 2.65,
    px: [300, 379],
  },
  {
    id: "specs",
    label: "Specs",
    center: [-4.9, 4.85, -10.58],
    normal: [0, 0, 1],
    w: 4.9,
    h: 2.97,
    px: [600, 364],
  },
  {
    id: "tune",
    label: "Tuning",
    center: [8.76, 4.55, -4.0],
    normal: [-1, 0, 0],
    w: 5.6,
    h: 3.4,
    px: [880, 534],
  },
  {
    id: "race",
    label: "Race setup",
    center: [-8.76, 3.9, 7.9],
    normal: [1, 0, 0],
    w: 4.7,
    h: 2.85,
    px: [760, 461],
  },
  {
    id: "dyno",
    label: "Dyno",
    // Hovers over the car; the camera swings round to its rear quarter.
    center: [0, 1.75, 0],
    normal: [0, 0, 1],
    w: 0.1,
    h: 0.1,
    px: [1, 1],
    hud: true,
    view: { pos: [4.3, 1.45, -4.6], look: [0, -0.15, -0.3] },
  },
]

export const SURFACE_BY_ID = Object.fromEntries(
  SURFACES.map((s) => [s.id, s]),
) as Record<SurfaceId, SurfaceDef>

const _up = new THREE.Vector3(0, 1, 0)
const _n = new THREE.Vector3()
const _r = new THREE.Vector3()
const _c = new THREE.Vector3()

/** Corners (TL, TR, BR, BL) in the surface's own garage-local frame. */
export function localCorners(def: SurfaceDef, out: THREE.Vector3[]) {
  _n.set(...def.normal)
  _r.crossVectors(_up, _n).normalize()
  _c.set(...def.center)
  const hw = def.w / 2
  const hh = def.h / 2
  const sx = [-1, 1, 1, -1]
  const sy = [1, 1, -1, -1]
  for (let i = 0; i < 4; i++) {
    ;(out[i] ??= new THREE.Vector3())
      .copy(_c)
      .addScaledVector(_r, sx[i] * hw)
      .addScaledVector(_up, sy[i] * hh)
  }
}

const steel = () =>
  new THREE.MeshStandardMaterial({
    color: 0x2a2e35,
    roughness: 0.55,
    metalness: 0.7,
  })

/**
 * A wall-mounted monitor frame for a surface: steel bezel on a bracket, four
 * bolts and an overhead work-light bar. The DOM screen is warped over its face.
 */
export function buildFrame(
  def: SurfaceDef,
  blockSun: (m: THREE.Material) => void,
): THREE.Group {
  const g = new THREE.Group()
  const mats: THREE.Material[] = []
  const mat = (m: THREE.Material) => (mats.push(m), m)
  const body = mat(steel())
  const bolt = mat(
    new THREE.MeshStandardMaterial({
      color: 0x8a9099,
      roughness: 0.4,
      metalness: 0.9,
    }),
  )
  const glow = mat(
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0xffe6b8,
      emissiveIntensity: 2.2,
    }),
  )
  const screenBase = mat(
    new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.3 }),
  )
  const depth = 0.14
  const pad = 0.16
  // Dark glass behind the DOM screen so it still reads as a monitor when the
  // DOM is hidden (edge-on or off-screen).
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(def.w, def.h, 0.02),
    screenBase,
  )
  face.position.z = -0.01
  g.add(face)
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(def.w + pad * 2, def.h + pad * 2, depth),
    body,
  )
  bezel.position.z = -0.02 - depth / 2
  g.add(bezel)
  // Raised lip around the screen.
  const lipT = 0.07
  const lips: [number, number, number, number][] = [
    [def.w + pad * 2, lipT, 0, def.h / 2 + lipT / 2],
    [def.w + pad * 2, lipT, 0, -def.h / 2 - lipT / 2],
    [lipT, def.h, def.w / 2 + lipT / 2, 0],
    [lipT, def.h, -def.w / 2 - lipT / 2, 0],
  ]
  for (const [w, h, x, y] of lips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), body)
    m.position.set(x, y, 0.005)
    g.add(m)
  }
  const boltGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10)
  boltGeo.rotateX(Math.PI / 2)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const b = new THREE.Mesh(boltGeo, bolt)
      b.position.set(
        sx * (def.w / 2 + pad * 0.62),
        sy * (def.h / 2 + pad * 0.62),
        0.012,
      )
      g.add(b)
    }
  }
  // Work light on a short arm above the screen.
  const lightW = Math.min(def.w * 0.6, 2.2)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.34), body)
  arm.position.set(0, def.h / 2 + pad + 0.12, 0.15)
  g.add(arm)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(lightW, 0.07, 0.1), glow)
  bar.position.set(0, def.h / 2 + pad + 0.16, 0.32)
  g.add(bar)
  const l = new THREE.PointLight(0xffe6b8, 1.2, 4, 2)
  l.position.set(0, def.h / 2 + pad + 0.1, 0.55)
  g.add(l)
  for (const m of mats) blockSun(m)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.frustumCulled = false
  })

  // Orient: local +z is the outward normal, +x the screen's right.
  _n.set(...def.normal)
  const yaw = Math.atan2(_n.x, _n.z)
  g.rotation.y = yaw
  g.position.set(...def.center)
  return g
}
