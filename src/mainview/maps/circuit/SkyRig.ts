import * as THREE from "three"
import {
  createSunDisc,
  setSunBlur,
  SUN_SPRITE_SCALE,
} from "../../systems/sunDisc"
import {
  type TimeOfDayMode,
  type TimeOfDayPreset,
  TIME_OF_DAY_PRESETS,
} from "../../constants/timeOfDay"
import { SkyDome } from "../../systems/SkyDome"

const SKY_DISK_DISTANCE = 1200
const LIGHTNING_TINT = new THREE.Color(0xe4ecff)

export class SkyRig {
  readonly sun = new THREE.DirectionalLight(0xfffaee, 2.2)
  readonly hemi = new THREE.HemisphereLight(0xbdd7ff, 0x3d5a2a, 0.9)
  private sunVisual!: THREE.Sprite
  private stars!: THREE.Points
  private dome!: SkyDome
  private scene: THREE.Scene | null = null
  private mode: TimeOfDayMode = "day"
  private fogEnabled = true
  private fogIntensity = 1
  private drawDistance = 5000
  private readonly sunOffset = new THREE.Vector3(120, 180, 60)
  private shadowTexel = 0.1
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly snapped = new THREE.Vector3()

  constructor(
    private readonly group: THREE.Group,
    private readonly onPreset: (p: TimeOfDayPreset) => void,
  ) {}

  attach(scene: THREE.Scene) {
    this.scene = scene
    scene.fog = new THREE.Fog(0x87ceeb, 100, 900)
    const sun = this.sun
    sun.position.set(120, 180, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0002
    sun.shadow.normalBias = 0.015
    sun.shadow.camera.left = -70
    sun.shadow.camera.right = 70
    sun.shadow.camera.top = 70
    sun.shadow.camera.bottom = -70
    sun.shadow.camera.far = 500
    this.group.add(sun, sun.target, this.hemi)

    this.sunVisual = createSunDisc(0xfffaee)
    this.sunVisual.frustumCulled = false
    this.sunVisual.renderOrder = 1
    this.group.add(this.sunVisual)

    this.dome = new SkyDome(this.group)

    const count = 1000
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(1 - Math.random() * 1.02)
      const r = 900 + Math.random() * 200
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const b = Math.random() < 0.15 ? 1 : 0.45 + Math.random() * 0.4
      col[i * 3] = b
      col[i * 3 + 1] = b
      col[i * 3 + 2] = Math.min(1, b * 1.05)
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: 1.7,
        transparent: true,
        opacity: 0,
        sizeAttenuation: false,
        depthWrite: false,
        fog: false,
      }),
    )
    this.stars.frustumCulled = false
    this.stars.visible = false
    this.group.add(this.stars)
  }

  get direction(): THREE.Vector3 {
    return this.sunOffset
  }

  private haze(): number {
    return this.fogEnabled
      ? Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7))
      : 0
  }

  private hazedSky(out: THREE.Color, p: TimeOfDayPreset) {
    out.setHex(p.skyColor)
    if (!this.fogEnabled) return out
    return out.lerp(new THREE.Color(p.fogColor), this.haze())
  }

  private syncDome(top: THREE.Color, horizon: THREE.Color) {
    this.dome.setColors(top, horizon)
  }

  private applySunHaze() {
    const h = this.haze()
    ;(this.sunVisual.material as THREE.SpriteMaterial).opacity = 1 - 0.6 * h * h
    setSunBlur(this.sunVisual, h)
  }

  private applyStars() {
    const m = this.mode
    const sunrise = m === "sunrise"
    const a =
      (m === "night" || sunrise || m === "evening" ? 1 : 0) *
      (1 - this.haze() * (sunrise ? 0.5 : 1))
    const mat = this.stars.material as THREE.PointsMaterial
    this.stars.visible = a > 0
    mat.opacity = a
    mat.size = sunrise ? 3 : 1.7
    const blend = sunrise ? THREE.AdditiveBlending : THREE.NormalBlending
    if (mat.blending !== blend) {
      mat.blending = blend
      mat.needsUpdate = true
    }
  }

  private applyFogRange() {
    const fog = this.scene?.fog
    if (!(fog instanceof THREE.Fog)) return
    const p = TIME_OF_DAY_PRESETS[this.mode]
    if (this.scene?.background instanceof THREE.Color) {
      this.hazedSky(this.scene.background, p)
    }
    this.applyStars()
    this.applySunHaze()
    if (!this.fogEnabled) {
      fog.color.setHex(p.skyColor)
      const reach = Math.min(this.drawDistance, 2200)
      fog.near = reach * 0.97
      fog.far = reach
      this.syncDome(fog.color, fog.color)
      return
    }
    fog.color.setHex(p.fogColor)
    fog.near = p.fogNear / this.fogIntensity
    fog.far = p.fogFar / this.fogIntensity
    this.clampDrawDistance(fog)
    this.syncDome(this.hazedSky(new THREE.Color(), p), fog.color)
  }

  get fogFar(): number {
    const fog = this.scene?.fog
    return fog instanceof THREE.Fog ? fog.far : 900
  }

  setDrawDistance(percent: number) {
    this.drawDistance = (5000 * Math.min(100, Math.max(20, percent))) / 100
    this.applyFogRange()
  }

  private clampDrawDistance(fog: THREE.Fog) {
    fog.far = Math.min(fog.far, this.drawDistance)
    fog.near = Math.min(fog.near, this.drawDistance * 0.35)
  }

  setFog(enabled: boolean, intensity: number) {
    this.fogEnabled = enabled
    this.fogIntensity = Math.max(0.1, intensity)
    this.applyFogRange()
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.mode = mode
    const p = TIME_OF_DAY_PRESETS[mode]
    if (!p) return
    this.sunOffset.set(p.sunPosition.x, p.sunPosition.y, p.sunPosition.z)
    this.sun.color.setHex(p.sunColor)
    this.sun.intensity = p.sunIntensity
    this.hemi.color.setHex(p.hemiSkyColor)
    this.hemi.groundColor.setHex(p.hemiGroundColor)
    this.hemi.intensity = p.hemiIntensity
    const mat = this.sunVisual.material as THREE.SpriteMaterial
    this.sunVisual.visible = p.rain === 0
    const k = SKY_DISK_DISTANCE / this.sunOffset.length()
    if (mode === "night") {
      mat.color.setHex(0xdde6ff)
      this.sunVisual.scale.setScalar(SUN_SPRITE_SCALE * 0.55 * k)
    } else {
      mat.color.setHex(p.sunColor)
      this.sunVisual.scale.setScalar(SUN_SPRITE_SCALE * k)
    }
    if (this.scene) {
      if (this.scene.background instanceof THREE.Color) {
        this.hazedSky(this.scene.background, p)
      } else {
        this.scene.background = new THREE.Color(p.skyColor)
      }
      this.applyFogRange()
    }
    this.onPreset(p)
    this.applyStars()
  }

  setLightning(f: number) {
    const p = TIME_OF_DAY_PRESETS[this.mode]
    if (!p) return
    this.hemi.intensity = p.hemiIntensity + f * 3.2
    this.sun.intensity = p.sunIntensity + f * 2.5
    const scene = this.scene
    if (!scene) return
    if (scene.background instanceof THREE.Color) {
      this.hazedSky(scene.background, p).lerp(LIGHTNING_TINT, f * 0.55)
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color
        .setHex(this.fogEnabled ? p.fogColor : p.skyColor)
        .lerp(LIGHTNING_TINT, f * 0.5)
      this.syncDome(
        scene.background instanceof THREE.Color
          ? scene.background
          : scene.fog.color,
        scene.fog.color,
      )
    }
  }

  setShadowQuality(pct: number) {
    const q = Math.min(100, Math.max(25, pct)) / 100
    const size = Math.max(1024, Math.round((2048 * q) / 256) * 256)
    const half = 50 + 20 * q
    this.shadowTexel = (2 * half) / size
    const sun = this.sun
    const cam = sun.shadow.camera
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      sun.shadow.mapSize.set(size, size)
      sun.shadow.needsUpdate = true
    }
    sun.shadow.radius = 2.5 + (1 - q) * 2
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.updateProjectionMatrix()
  }

  private snapToShadowGrid(carPos: THREE.Vector3): THREE.Vector3 {
    const dir = this.sunOffset
    const right = this.right.set(0, 1, 0).cross(dir).normalize()
    const up = this.up.copy(dir).cross(right).normalize()
    const t = this.shadowTexel
    const g = this.snapped.set(carPos.x, 0, carPos.z)
    const pr = g.dot(right)
    const pu = g.dot(up)
    return g
      .addScaledVector(right, Math.round(pr / t) * t - pr)
      .addScaledVector(up, Math.round(pu / t) * t - pu)
  }

  update(carPos: THREE.Vector3) {
    const f = this.snapToShadowGrid(carPos)
    this.sun.position.set(
      f.x + this.sunOffset.x,
      f.y + this.sunOffset.y,
      f.z + this.sunOffset.z,
    )
    this.sun.target.position.set(f.x, 0, f.z)
    this.sun.target.updateMatrixWorld()
    const k = SKY_DISK_DISTANCE / this.sunOffset.length()
    this.sunVisual.position.set(
      carPos.x + this.sunOffset.x * k,
      this.sunOffset.y * k,
      carPos.z + this.sunOffset.z * k,
    )
    this.dome.follow(carPos.x, carPos.z)
    if (this.stars.visible)
      this.stars.position.set(carPos.x, carPos.y, carPos.z)
  }
}
