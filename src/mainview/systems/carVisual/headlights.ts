import * as THREE from "three"
import { applyBrakeHeat, lampPartsWithin } from "../carLights"
import { AVENTADOR_HEADLIGHT, BRAKE_LAMP_THRESHOLD } from "../carVisual/shared"
import type { CarVisual } from "../CarVisual"
import { HEADLIGHT_CONE } from "../headlightCutoff"

function makeBeams(
  spacing: number,
  y: number,
  frontZ: number,
  on: boolean,
): { spots: THREE.SpotLight[]; objs: THREE.Object3D[] } {
  const spots: THREE.SpotLight[] = []
  const objs: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(
      0xfff0cc,
      on ? 260 : 0,
      160,
      HEADLIGHT_CONE,
      0.8,
      1.0,
    )
    spot.position.set(side * spacing, y, frontZ - 0.15)
    spot.castShadow = false
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.radius = 3
    spot.shadow.camera.near = 0.4
    spot.shadow.camera.far = 90
    spot.shadow.bias = -0.0003
    spot.shadow.normalBias = 0.015
    spot.target.position.set(side * spacing * 0.9, 0, frontZ - 70)
    spot.visible = true
    spots.push(spot)
    objs.push(spot, spot.target)
  }
  return { spots, objs }
}

export function setupHeadlights(
  this: CarVisual,
  isPlayer: boolean = false,
  headBeams: boolean = false,
) {
  if (this.headlightsConfigured) {
    if (isPlayer && !this.isPlayerCar) {
      this.isPlayerCar = true
      if (this.headlightGroup && this.headlightSpots.length === 0) {
        const box = new THREE.Box3().setFromObject(this.hiBody ?? this.group)
        const size = box.getSize(new THREE.Vector3())
        const halfLen = size.z > 0 ? size.z / 2 : 2.35
        const halfWidth = size.x > 0 ? size.x / 2 : 0.92
        const headlightSpacing = Math.max(0.55, Math.min(0.78, halfWidth * 0.7))
        const headlightY = Math.max(0.55, Math.min(0.72, size.y * 0.48))
        const frontZ = -halfLen * 0.9

        const beams = makeBeams(
          headlightSpacing,
          headlightY,
          frontZ,
          this.headlightsOn,
        )
        this.headlightGroup.add(...beams.objs)
        this.headlightSpots = beams.spots
        this.headlightGroup.visible = true
      }
    }
    return
  }
  this.headlightsConfigured = true
  this.isPlayerCar = isPlayer

  const box = new THREE.Box3().setFromObject(this.hiBody ?? this.group)
  const size = box.getSize(new THREE.Vector3())
  const halfLen = size.z > 0 ? size.z / 2 : 2.35
  const halfWidth = size.x > 0 ? size.x / 2 : 0.92

  let headlightSpacing = Math.max(0.55, Math.min(0.78, halfWidth * 0.7))
  let headlightY = Math.max(0.55, Math.min(0.72, size.y * 0.48))
  let frontZ = -halfLen * 0.9

  if (this.hiBody) {
    const foundY: number[] = []
    const foundZ: number[] = []
    const foundX: number[] = []
    this.hiBody.traverse((o: any) => {
      if (!o.isMesh) return
      const name = (o.name + " " + (o.material?.name || "")).toLowerCase()
      if (
        name.includes("headlight") ||
        name.includes("head_light") ||
        name.includes("front_light") ||
        name.includes("material.019")
      ) {
        const mbox = new THREE.Box3().setFromObject(o)
        const c = mbox.getCenter(new THREE.Vector3())
        this.group.worldToLocal(c)
        if (c.z < -0.5) {
          foundY.push(c.y)
          foundZ.push(c.z)
          if (Math.abs(c.x) > 0.3) foundX.push(Math.abs(c.x))
        }
      }
    })
    if (foundY.length > 0) {
      headlightY = foundY.reduce((a, b) => a + b, 0) / foundY.length
      frontZ = Math.min(...foundZ)
    }
    if (foundX.length > 0) {
      headlightSpacing = foundX.reduce((a, b) => a + b, 0) / foundX.length
    }
  }

  const group = new THREE.Group()
  this.headlightGroup = group

  if (this.hiBody) {
    const lensMeshes: THREE.Object3D[] = []
    this.hiBody.traverse((o: any) => {
      if (o.isMesh && AVENTADOR_HEADLIGHT.test(o.name)) lensMeshes.push(o)
    })
    const lampParts = new Set<THREE.Object3D>(
      lampPartsWithin(this.hiBody, lensMeshes),
    )
    this.hiBody.traverse((o: any) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial
        if (!std || !std.isMeshStandardMaterial) continue

        if (this.tintedMats.includes(std)) continue

        const matName = (std.name || "").toLowerCase()
        const meshName = (o.name || "").toLowerCase()

        const isGWagonHeadlight =
          meshName.includes("carbody") &&
          matName === "body" &&
          !!std.emissiveMap

        const isAventadorHeadlight =
          AVENTADOR_HEADLIGHT.test(o.name) || lampParts.has(o)

        const isDodgeHeadlight =
          meshName.includes("front_light") ||
          meshName.startsWith("pcylinder1_glass_gray") ||
          meshName.startsWith("psphere1_gray_4") ||
          meshName.startsWith("psphere1_orange_1")

        const isCheetahHeadlight = meshName.includes("cheetah84_headlights")

        const isChargerHeadlight = meshName.includes("duke69_headlight")

        const isSpecificHeadlight =
          isGWagonHeadlight ||
          isAventadorHeadlight ||
          isDodgeHeadlight ||
          isCheetahHeadlight ||
          isChargerHeadlight

        if (isSpecificHeadlight) {
          let targetMat = std
          if (!isGWagonHeadlight && !o.userData.__headlightCloned) {
            targetMat = std.clone()
            if (Array.isArray(o.material)) {
              o.material = o.material.map((mat: any) =>
                mat === std ? targetMat : mat,
              )
            } else {
              o.material = targetMat
            }
            o.userData.__headlightCloned = true
          }

          if (!this.headlightMats.some((h) => h.mat === targetMat)) {
            if (
              !targetMat.emissive ||
              (targetMat.emissive.r === 0 &&
                targetMat.emissive.g === 0 &&
                targetMat.emissive.b === 0)
            ) {
              targetMat.emissive = new THREE.Color(0xfff0cc)
            }
            const wasTransparent = targetMat.transparent
            const wasOpacity = targetMat.opacity
            targetMat.transparent = true
            targetMat.opacity = Math.min(wasOpacity, 0.7)
            targetMat.depthWrite = false
            this.headlightMats.push({
              mat: targetMat,
              origIntensity: targetMat.emissiveIntensity ?? 1,
              origTransparent: wasTransparent,
              origOpacity: wasOpacity,
            })
          }
          if (!this.headlightMeshes.includes(o)) {
            this.headlightMeshes.push(o)
          }
          continue
        }

        if (this.tintedMats.includes(std)) continue

        const isExcludedMat =
          matName.includes("paint") ||
          matName.includes("body") ||
          matName.includes("chassis") ||
          matName.includes("caliper") ||
          matName.includes("tire") ||
          matName.includes("wheel") ||
          matName.includes("rim") ||
          matName.includes("interior") ||
          matName.includes("plastic") ||
          matName.includes("carbon") ||
          matName.includes("bottom") ||
          matName.includes("licenseplate") ||
          matName.includes("badge") ||
          matName.includes("logo")
        if (isExcludedMat) continue

        const isExcludedMesh =
          meshName.includes("body") ||
          meshName.includes("carbody") ||
          meshName.includes("chassis") ||
          meshName.includes("panel") ||
          meshName.includes("bumper") ||
          meshName.includes("hood") ||
          meshName.includes("trunk") ||
          meshName.includes("door") ||
          meshName.includes("caliper") ||
          meshName.includes("tire") ||
          meshName.includes("wheel") ||
          meshName.includes("rim") ||
          meshName.includes("window") ||
          meshName.includes("windshield") ||
          meshName.includes("mirror") ||
          meshName.includes("interior") ||
          meshName.includes("steering") ||
          meshName.includes("bottom") ||
          meshName.includes("suspension")
        if (isExcludedMesh) continue

        const isRed =
          (std.emissive &&
            std.emissive.r > 0.12 &&
            std.emissive.r > std.emissive.g * 1.6 &&
            std.emissive.r > std.emissive.b * 1.6) ||
          matName.includes("rear") ||
          matName.includes("tail") ||
          matName.includes("brake") ||
          meshName.includes("rear") ||
          meshName.includes("tail") ||
          meshName.includes("brake")
        if (isRed) continue

        const isHeadlightName =
          matName.includes("headlight") ||
          matName.includes("front_light") ||
          matName.includes("frontlight") ||
          matName.includes("light_d") ||
          matName === "material.019" ||
          meshName.includes("headlight") ||
          meshName.includes("front_light") ||
          meshName.includes("frontlight")

        const hasNativeWhiteEmissive =
          std.emissive &&
          std.emissive.r + std.emissive.g + std.emissive.b > 0.5 &&
          Math.abs(std.emissive.r - std.emissive.g) < 0.2 &&
          Math.abs(std.emissive.r - std.emissive.b) < 0.2

        if (isHeadlightName || hasNativeWhiteEmissive) {
          let targetMat = std
          if (!o.userData.__headlightCloned) {
            targetMat = std.clone()
            if (Array.isArray(o.material)) {
              o.material = o.material.map((mat: any) =>
                mat === std ? targetMat : mat,
              )
            } else {
              o.material = targetMat
            }
            o.userData.__headlightCloned = true
          }

          if (!this.headlightMats.some((h) => h.mat === targetMat)) {
            if (
              !targetMat.emissive ||
              (targetMat.emissive.r === 0 &&
                targetMat.emissive.g === 0 &&
                targetMat.emissive.b === 0)
            ) {
              targetMat.emissive = new THREE.Color(0xfff0cc)
            }
            const wasTransparent = targetMat.transparent
            const wasOpacity = targetMat.opacity
            targetMat.transparent = true
            targetMat.opacity = Math.min(wasOpacity, 0.7)
            targetMat.depthWrite = false
            this.headlightMats.push({
              mat: targetMat,
              origIntensity: targetMat.emissiveIntensity ?? 1,
              origTransparent: wasTransparent,
              origOpacity: wasOpacity,
            })
          }
          if (!this.headlightMeshes.includes(o)) {
            this.headlightMeshes.push(o)
          }
        }
      }
    })
  }

  if (isPlayer || headBeams) {
    const beams = makeBeams(
      headlightSpacing,
      headlightY,
      frontZ,
      this.headlightsOn,
    )
    group.add(...beams.objs)
    this.headlightSpots = beams.spots
  }

  group.visible = true
  this.group.add(group)
}

export function setNpcLightActive(
  this: CarVisual,
  _active: boolean,
  _intensityScale: number = 1.0,
) {}

export function setHeadlights(this: CarVisual, on: boolean) {
  this.headlightsWanted = on
  this.headlightsOn = on
  if (this.headlightGroup) {
    this.headlightGroup.visible = true
  }
  this.applyLamps()
}

export function setPower(this: CarVisual, p: number) {
  if (Math.abs(p - this.power) < 0.004) return
  this.power = p
  this.applyLamps()
}

export function applyLamps(this: CarVisual) {
  const lit = this.headlightsOn && this.power > 0.02
  const p = this.power
  for (const spot of this.headlightSpots) {
    spot.visible = true
    spot.intensity = lit ? 75 * p : 0
  }
  for (const h of this.headlightMats) {
    h.mat.emissiveIntensity = lit
      ? Math.max(h.origIntensity * 4, 8.0) * p * this.headlightDim
      : 0.0
  }
  for (const h of this.loHeadlights) {
    h.visible = lit
  }
  for (const l of this.brakeLights) {
    applyBrakeHeat(l, this.brakeLevel, this.headlightsOn, p)
  }
}

export function hasHeadlights(this: CarVisual): boolean {
  return this.headlightsOn
}

export function setBrake(this: CarVisual, level: number) {
  if (this.brakeLights.length === 0) return
  const want = level > BRAKE_LAMP_THRESHOLD ? 1 : 0
  if (want === this.brakeLevel) return
  this.brakeLevel = want
  for (const l of this.brakeLights)
    applyBrakeHeat(l, want, this.headlightsOn, this.power)
}
