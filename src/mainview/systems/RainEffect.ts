import * as THREE from "three"

const MAX_DROPS = 3200
const BOX = 34
const HEIGHT = 26
const FALL_SPEED = 26
const STREAK = 0.9
const STREAK_PER_SPEED = 0.03
const STREAK_MAX = 4.5
const REFLECTED_SHARE = 0.08

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
  }

  /** Drops for which this returns true are hidden (they are under a roof). */
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
    this.mat.opacity = 0.25 + 0.3 * rain
    this.geo.setDrawRange(0, Math.round(MAX_DROPS * Math.min(1, rain)) * 2)
    this.placed = false
    this.haveLastCam = false
    this.nextBolt = 3 + Math.random() * 5
    this.boltClock = 0
    this.bolt = []
  }

  update(dt: number, cam: THREE.Vector3): number {
    if (this.intensity <= 0) return 0
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
    for (let i = 0; i < MAX_DROPS; i++) {
      const o = i * 6
      let x = p[o] + wind
      let y = p[o + 1] - fall
      let z = p[o + 2]
      if (y < cam.y - 4) y += HEIGHT
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
    return this.lightning ? this.flash(dt) : 0
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
  }
}
