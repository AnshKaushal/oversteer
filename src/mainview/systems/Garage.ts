import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { CarVisual } from "./CarVisual"

// The garage model is open on its local +z side. Its dummy car is the node
// named DUMMY_CAR; it is dropped so the player's own car can stand in its place.
const DUMMY_CAR = "mobil_15"
const HALF_DEPTH = 10.74
const ROOF_Y = 6.93
// Distance from the spawn point to the garage centre, so the opening sits
// well clear of the widest road.
// The model is shrunk so the car fills more of the room.
const SCALE = 0.7
// Showroom scale-up of the displayed car (visual only).
const CAR_SCALE = 1.15
const SIDE_OFFSET = HALF_DEPTH * SCALE + 18

export const GARAGE_CAM = {
  minDist: 3.8,
  maxDist: 5.6,
  defaultDist: 5.0,
  minPitch: 0.03,
  maxPitch: 0.7,
}

const _fwd = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)

const NO_SUN = THREE.ShaderChunk.lights_fragment_begin.replace(
  "getDirectionalLightInfo( directionalLight, directLight );",
  "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color = vec3( 0.0 );",
)

// The sun never reaches the inside of the garage. Shadow maps leak at wall and
// floor seams and through the window panes, so the garage's own surfaces simply
// ignore the directional light (the lamps and sky light still apply).
function blockSun(mat: THREE.Material) {
  mat.shadowSide = THREE.DoubleSide
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      NO_SUN,
    )
  }
  mat.customProgramCacheKey = () => "garage-no-sun"
  mat.needsUpdate = true
}

const BOARD = { x0: 1.12, x1: 7.21, y0: 2.13, y1: 5.83, z: -10.71 }
const _n = new THREE.Vector3()

export class Garage {
  readonly group = new THREE.Group()
  /** World position of the car spot (floor level). */
  readonly carPos = new THREE.Vector3()
  /** Yaw that points the car's nose out of the garage. */
  carYaw = 0
  private lights: THREE.PointLight[] = []

  static async load(baseUrl: string): Promise<Garage> {
    const glb = await new GLTFLoader().loadAsync(`${baseUrl}models/garage.glb`)
    const g = new Garage()
    const root = glb.scene
    const dummy = root.getObjectByName(DUMMY_CAR)
    dummy?.removeFromParent()
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        blockSun(mat)
      }
    })
    g.group.add(root)
    // Concrete apron from the garage mouth out to the road shoulder. Sized in
    // garage-local units (the group is scaled by SCALE). It is a thick slab so
    // it still meets the ground on uneven terrain.
    const apronStart = HALF_DEPTH
    const apronEnd = 30
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.6, apronEnd - apronStart),
      new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.95 }),
    )
    slab.position.set(0, -0.3, (apronStart + apronEnd) / 2)
    slab.receiveShadow = true
    g.group.add(slab)
    g.group.scale.setScalar(SCALE)
    // Warm lamps under the ceiling; the roof blocks the sun and sky light.
    for (const z of [-3.5, 3.5]) {
      const l = new THREE.PointLight(0xfff1dc, 14, 14, 2)
      l.position.set(0, 5.6, z)
      g.group.add(l)
      g.lights.push(l)
    }
    return g
  }

  /**
   * Put the garage beside the road at the spawn point, opening toward it.
   * `fwd` is the spawn heading; the garage goes on its right-hand side.
   */
  place(
    spawnX: number,
    spawnZ: number,
    fwd: THREE.Vector3,
    groundAt: (x: number, z: number) => number,
  ) {
    _fwd.copy(fwd).setY(0).normalize()
    const rx = -_fwd.z
    const rz = _fwd.x
    const cx = spawnX + rx * SIDE_OFFSET
    const cz = spawnZ + rz * SIDE_OFFSET
    let y = groundAt(cx, cz)
    for (const dx of [-9 * SCALE, 9 * SCALE]) {
      for (const dz of [-10.7 * SCALE, 10.7 * SCALE]) {
        // Corners in garage space are close enough to world axes for a
        // conservative "floor at or above the terrain" estimate.
        y = Math.max(y, groundAt(cx + dx, cz + dz))
      }
    }
    this.group.position.set(cx, y + 0.02, cz)
    this.group.rotation.y = Math.atan2(-rx, -rz)
    this.carPos.set(cx, y + 0.02, cz)
    this.carYaw = Math.atan2(rx, rz)
  }

  /** World-space corners of the wall board (TL, TR, BR, BL) and its normal. */
  boardCorners(out: THREE.Vector3[]): THREE.Vector3 {
    this.group.updateMatrixWorld()
    const pts: [number, number][] = [
      [BOARD.x0, BOARD.y1],
      [BOARD.x1, BOARD.y1],
      [BOARD.x1, BOARD.y0],
      [BOARD.x0, BOARD.y0],
    ]
    pts.forEach(([x, y], i) => {
      ;(out[i] ??= new THREE.Vector3())
        .set(x, y, BOARD.z)
        .applyMatrix4(this.group.matrixWorld)
    })
    return _n.set(0, 0, 1).transformDirection(this.group.matrixWorld)
  }

  /** Hold the (non-driving) player car on the garage floor. */
  holdCar(visual: CarVisual) {
    visual.group.position.copy(this.carPos)
    visual.group.quaternion.setFromAxisAngle(_UP, this.carYaw)
    visual.group.scale.setScalar(CAR_SCALE)
  }

  /** True for a world point inside the garage and under its roof. */
  shelters = (x: number, y: number, z: number): boolean => {
    const gp = this.group.position
    if (y > gp.y + ROOF_Y * SCALE) return false
    const dx = x - gp.x
    const dz = z - gp.z
    const a = this.group.rotation.y
    const c = Math.cos(a)
    const s = Math.sin(a)
    const lx = (dx * c - dz * s) / SCALE
    const lz = (dx * s + dz * c) / SCALE
    return Math.abs(lx) < 9 && Math.abs(lz) < HALF_DEPTH + 0.1
  }

  dispose() {
    this.group.removeFromParent()
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) mat?.dispose()
    })
  }
}
