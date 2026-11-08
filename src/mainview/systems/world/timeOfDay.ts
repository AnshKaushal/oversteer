import type { ClearZone } from "../Airport"
import * as THREE from "three"
import { SUN_SPRITE_SCALE } from "../sunDisc"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_PRESETS,
} from "../../constants/timeOfDay"
import { SKY_DISK_DISTANCE } from "../world/constants"
import { setPavedZones } from "../world/ribbon"
import type { WorldManager } from "../WorldManager"

export function setTimeOfDay(this: WorldManager, mode: TimeOfDayMode) {
  this.timeOfDay = mode
  this.streetLights?.setLit(this.streetLightsPower && mode !== "day")
  const preset = TIME_OF_DAY_PRESETS[mode]
  if (!preset) return

  this.puddles?.setSky(preset.fogColor)
  this.puddles?.setRain(preset.rain)

  this.sunOffset.set(
    preset.sunPosition.x,
    preset.sunPosition.y,
    preset.sunPosition.z,
  )

  if (this.sunLight) {
    this.sunLight.color.setHex(preset.sunColor)
    this.sunLight.intensity = preset.sunIntensity
  }

  if (this.hemiLight) {
    this.hemiLight.color.setHex(preset.hemiSkyColor)
    this.hemiLight.groundColor.setHex(preset.hemiGroundColor)
    this.hemiLight.intensity = preset.hemiIntensity
  }

  if (this.sunVisual) {
    const mat = this.sunVisual.material as THREE.SpriteMaterial
    this.sunVisual.visible = preset.rain === 0
    const k = SKY_DISK_DISTANCE / this.sunOffset.length()
    if (mode === "night") {
      mat.color.setHex(0xdde6ff)
      this.sunVisual.scale.setScalar(SUN_SPRITE_SCALE * 0.55 * k)
    } else {
      mat.color.setHex(preset.sunColor)
      this.sunVisual.scale.setScalar(SUN_SPRITE_SCALE * k)
    }
  }

  if (this.sceneRef) {
    if (this.sceneRef.background instanceof THREE.Color) {
      this.hazedSky(this.sceneRef.background, preset)
    } else {
      this.sceneRef.background = new THREE.Color(preset.skyColor)
    }

    if (this.sceneRef.fog instanceof THREE.Fog) {
      this.sceneRef.fog.color.setHex(
        this.fogEnabled ? preset.fogColor : preset.skyColor,
      )
      this.applyFogRange()
    }
  }

  if (this.ground && preset.groundColor) {
    const gMat = this.ground.material as THREE.MeshStandardMaterial
    if (gMat && gMat.color) {
      gMat.color.setHex(preset.groundColor)
    }
  }

  this.applyStars()
}

export function setShadowQuality(this: WorldManager, pct: number) {
  const sun = this.sunLight
  if (!sun) return
  const q = Math.min(100, Math.max(25, pct)) / 100
  const size = Math.max(1024, Math.round((2048 * q) / 256) * 256)
  const half = 50 + 20 * q
  this.shadowTexel = (2 * half) / size
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

export function setClearZones(this: WorldManager, zones: ClearZone[]) {
  const segs = new Set<number>()
  const mark = (list: ClearZone[]) => {
    for (const z of list) {
      const ext = Math.abs(z.uz) * z.hl + Math.abs(z.ux) * z.hw
      const sLo = -(z.z + ext) - 10
      const sHi = -(z.z - ext) + 10
      for (
        let g = Math.floor(sLo / this.segLen);
        g <= Math.floor(sHi / this.segLen);
        g++
      ) {
        segs.add(g)
      }
    }
  }
  mark(this.clearZones)
  mark(zones)
  this.clearZones = zones
  setPavedZones(zones.filter((z) => z.paved))
  for (const h of this.hills) {
    const p = h.mesh.position
    if (!this.hillHitsZone(p.x, p.z, h.radius)) continue
    h.seg = -999999
    h.mesh.position.set(p.x + 20000, -0.3, p.z)
    this.syncHillBody(h)
  }
  for (const k of segs) {
    if (!this.segProps.has(k)) continue
    this.freeSeg(k)
    this.segProps.delete(k)
    const cols = this.segColliders.get(k)
    if (cols && this.physWorld) {
      for (const c of cols) this.physWorld.removeCollider(c, false)
    }
    this.segColliders.delete(k)
  }
}
