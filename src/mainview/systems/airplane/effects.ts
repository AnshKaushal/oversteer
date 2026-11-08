import { fadeWithFog } from "../fogFade"
import * as THREE from "three"
import { makeGlowTexture } from "../GlowTexture"

export function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 128
  c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(255,255,255,0.95)")
  grad.addColorStop(0.5, "rgba(255,255,255,0.5)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

let sharedGlowTexture: THREE.Texture | null = null

export function getAirplaneLightGlowTexture(): THREE.Texture {
  sharedGlowTexture ??= makeGlowTexture([
    [0, 1],
    [0.1, 0.9],
    [0.28, 0.32],
    [0.55, 0.08],
    [1, 0],
  ])
  return sharedGlowTexture
}

export function buildAircraftLights(
  model: THREE.Object3D,
  span: number,
): {
  lightsRoot: THREE.Group
  strobes: THREE.Mesh[]
  beacons: THREE.Mesh[]
  geoms: THREE.BufferGeometry[]
  mats: THREE.Material[]
} {
  const lightsRoot = new THREE.Group()
  lightsRoot.name = "aircraftLights"
  const strobes: THREE.Mesh[] = []
  const beacons: THREE.Mesh[] = []
  const geoms: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxY = -Infinity
  let minY = Infinity
  const leftTip = new THREE.Vector3()
  const rightTip = new THREE.Vector3()
  const tailTip = new THREE.Vector3()
  const topFin = new THREE.Vector3()
  const tempV = new THREE.Vector3()

  model.updateMatrixWorld(true)
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.attributes.position
    if (!pos) return
    const step = pos.count > 5000 ? Math.ceil(pos.count / 2000) : 1
    for (let i = 0; i < pos.count; i += step) {
      tempV.fromBufferAttribute(pos, i)
      tempV.applyMatrix4(mesh.matrixWorld)
      if (tempV.x < minX) {
        minX = tempV.x
        leftTip.copy(tempV)
      }
      if (tempV.x > maxX) {
        maxX = tempV.x
        rightTip.copy(tempV)
      }
      if (tempV.z < minZ) {
        minZ = tempV.z
        tailTip.copy(tempV)
      }
      if (tempV.y > maxY) {
        maxY = tempV.y
        topFin.copy(tempV)
      }
      if (tempV.y < minY) {
        minY = tempV.y
      }
    }
  })

  const navRadius = Math.max(0.12, span * 0.009)
  const strobeRadius = navRadius * 1.35
  const beaconRadius = navRadius * 1.45

  const lens = (r: number) => {
    const g = new THREE.SphereGeometry(r, 20, 12)
    g.scale(1, 0.8, 1)
    return g
  }
  const navGeo = lens(navRadius)
  const strobeGeo = lens(strobeRadius)
  const beaconGeo = lens(beaconRadius)
  geoms.push(navGeo, strobeGeo, beaconGeo)

  const redMat = new THREE.MeshBasicMaterial({
    color: 0xff1818,
    toneMapped: false,
  })
  const greenMat = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    toneMapped: false,
  })
  const whiteMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  })
  const strobeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  })
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xff2800,
    toneMapped: false,
  })
  mats.push(redMat, greenMat, whiteMat, strobeMat, beaconMat)

  const glowTex = getAirplaneLightGlowTexture()
  const redGlowMat = fadeWithFog(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xff2020,
      toneMapped: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  const greenGlowMat = fadeWithFog(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x00ff66,
      toneMapped: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  const whiteGlowMat = fadeWithFog(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffffff,
      toneMapped: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  const beaconGlowMat = fadeWithFog(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xff2200,
      toneMapped: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  for (const m of [redGlowMat, greenGlowMat, whiteGlowMat, beaconGlowMat])
    m.color.multiplyScalar(2.2)
  for (const m of [redMat, greenMat, whiteMat, strobeMat, beaconMat])
    m.color.multiplyScalar(1.6)
  mats.push(redGlowMat, greenGlowMat, whiteGlowMat, beaconGlowMat)

  const navGlowScale = Math.max(1.6, span * 0.07)
  const strobeGlowScale = Math.max(3, span * 0.13)
  const beaconGlowScale = Math.max(2.6, span * 0.11)

  const portNav = new THREE.Mesh(navGeo, redMat)
  portNav.position.copy(leftTip)
  const portNavGlow = new THREE.Sprite(redGlowMat)
  portNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  portNav.add(portNavGlow)
  lightsRoot.add(portNav)

  const stbdNav = new THREE.Mesh(navGeo, greenMat)
  stbdNav.position.copy(rightTip)
  const stbdNavGlow = new THREE.Sprite(greenGlowMat)
  stbdNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  stbdNav.add(stbdNavGlow)
  lightsRoot.add(stbdNav)

  const tailNav = new THREE.Mesh(navGeo, whiteMat)
  tailNav.position.copy(tailTip)
  const tailNavGlow = new THREE.Sprite(whiteGlowMat)
  tailNavGlow.scale.set(navGlowScale, navGlowScale, 1)
  tailNav.add(tailNavGlow)
  lightsRoot.add(tailNav)

  const portStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  portStrobe.position.set(leftTip.x * 1.01, leftTip.y, leftTip.z - 0.1)
  const portStrobeGlow = new THREE.Sprite(whiteGlowMat)
  portStrobeGlow.scale.set(strobeGlowScale, strobeGlowScale, 1)
  portStrobe.add(portStrobeGlow)
  lightsRoot.add(portStrobe)
  strobes.push(portStrobe)

  const stbdStrobe = new THREE.Mesh(strobeGeo, strobeMat)
  stbdStrobe.position.set(rightTip.x * 1.01, rightTip.y, rightTip.z - 0.1)
  const stbdStrobeGlow = new THREE.Sprite(whiteGlowMat)
  stbdStrobeGlow.scale.set(strobeGlowScale, strobeGlowScale, 1)
  stbdStrobe.add(stbdStrobeGlow)
  lightsRoot.add(stbdStrobe)
  strobes.push(stbdStrobe)

  const topBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  topBeacon.position.copy(topFin)
  const topBeaconGlow = new THREE.Sprite(beaconGlowMat)
  topBeaconGlow.scale.set(beaconGlowScale, beaconGlowScale, 1)
  topBeacon.add(topBeaconGlow)
  lightsRoot.add(topBeacon)
  beacons.push(topBeacon)

  const bellyBeacon = new THREE.Mesh(beaconGeo, beaconMat)
  bellyBeacon.position.set(0, minY + 0.15, (leftTip.z + tailTip.z) * 0.45)
  const bellyBeaconGlow = new THREE.Sprite(beaconGlowMat)
  bellyBeaconGlow.scale.set(beaconGlowScale, beaconGlowScale, 1)
  bellyBeacon.add(bellyBeaconGlow)
  lightsRoot.add(bellyBeacon)
  beacons.push(bellyBeacon)

  return { lightsRoot, strobes, beacons, geoms, mats }
}
