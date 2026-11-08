import { LIGHTNING_TINT } from "./constants"
import * as THREE from "three"
import { setSunBlur } from "../sunDisc"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_PRESETS,
} from "../../constants/timeOfDay"
import type { WorldManager } from "../WorldManager"

export function hazedSky(
  this: WorldManager,
  out: THREE.Color,
  preset: (typeof TIME_OF_DAY_PRESETS)[TimeOfDayMode],
) {
  out.setHex(preset.skyColor)
  if (!this.fogEnabled) return out
  const haze = Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7))
  return out.lerp(new THREE.Color(preset.fogColor), haze)
}

export function syncDome(this: WorldManager, flash = 0) {
  const scene = this.sceneRef
  const fog = scene?.fog
  if (!this.skyDome || !scene || !(fog instanceof THREE.Fog)) return
  const top = new THREE.Color()
  this.hazedSky(top, TIME_OF_DAY_PRESETS[this.timeOfDay])
  const hor = fog.color.clone()
  if (flash > 0) top.lerp(LIGHTNING_TINT, flash * 0.55)
  this.skyDome.setColors(top, hor)
}

export function withinFog(this: WorldManager, d: number): boolean {
  const fog = this.sceneRef?.fog
  return !this.fogEnabled || !(fog instanceof THREE.Fog) || d < fog.far + 20
}

export function applyStars(this: WorldManager) {
  const sp = this.starsPoints
  if (!sp) return
  const m = this.timeOfDay
  const haze = this.fogEnabled
    ? Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7))
    : 0
  const a =
    (m === "night" ? 0.95 : m === "sunrise" || m === "evening" ? 0.95 : 0) *
    (1 - haze)
  sp.visible = a > 0
  const smat = sp.material as THREE.PointsMaterial
  smat.opacity = a
}

export function applyFogRange(this: WorldManager) {
  const fog = this.sceneRef?.fog
  if (!(fog instanceof THREE.Fog)) return
  const preset = TIME_OF_DAY_PRESETS[this.timeOfDay]
  if (this.sceneRef?.background instanceof THREE.Color)
    this.hazedSky(this.sceneRef.background, preset)
  this.cloudLastCarS = -999999
  this.applyStars()
  if (this.sunVisual) {
    const haze = this.fogEnabled
      ? Math.min(1, Math.max(0, (this.fogIntensity - 0.5) / 1.7))
      : 0
    ;(this.sunVisual.material as THREE.SpriteMaterial).opacity =
      1 - 0.6 * haze * haze
    setSunBlur(this.sunVisual, haze)
  }
  if (!this.fogEnabled) {
    fog.color.setHex(preset.skyColor)
    const reach = Math.min(this.drawDistance, 2200)
    fog.near = reach * 0.97
    fog.far = reach
    this.syncDome()
    return
  }
  fog.color.setHex(preset.fogColor)
  fog.near = preset.fogNear / this.fogIntensity
  fog.far = preset.fogFar / this.fogIntensity
  this.clampDrawDistance(fog)
  this.syncDome()
}

export function clampDrawDistance(this: WorldManager, fog: THREE.Fog) {
  fog.far = Math.min(fog.far, this.drawDistance)
  fog.near = Math.min(fog.near, this.drawDistance * 0.35)
}

export function shadowFadeMaterial(
  this: WorldManager,
): THREE.MeshDepthMaterial {
  if (this.shadowFadeMat) return this.shadowFadeMat
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  })
  const center = this.carPos
  const radius = this.SHADOW_FADE_RADIUS
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShadowCenter = { value: center }
    sh.uniforms.uShadowRadius = { value: radius }
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vShadowWpos;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vShadowWpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vShadowWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vShadowWpos;
        uniform vec3 uShadowCenter;
        uniform float uShadowRadius;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (distance(vShadowWpos, uShadowCenter) > uShadowRadius) discard;`,
      )
  }
  mat.customProgramCacheKey = () => "propShadowFade"
  this.shadowFadeMat = mat
  return mat
}
