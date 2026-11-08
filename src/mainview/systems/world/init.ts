import { Puddles } from "../Puddles"
import { StreetLights } from "../StreetLights"
import * as THREE from "three"
import {
  USE_CUSTOM_PROPS,
  cloudMaterial,
  makeCloudGeometries,
  makeRockGeometries,
  makeTreeGeometries,
  propMaterial,
} from "../lowPolyProps"
import { createSunDisc } from "../sunDisc"
import { WORLD_CONFIG } from "../../constants/world"
import { SkyDome } from "../SkyDome"
import { roadCenterX } from "../../maps/highway/road"
import {
  HILL_PERIOD,
  hillResidue,
  HILL_FADE_FROM,
  HILL_FADE_TO,
} from "../world/constants"
import { makeRibbonGeometry } from "../world/ribbon"
import { makeAsphaltTexture } from "../world/asphalt"
import { PropCategory, PropVariant } from "../world/types"
import { TREE_NODES, CLOUD_NODES } from "../world/nodes"
import { bakeInstanced, bakeSplit } from "../world/bake"
import type { WorldManager } from "../WorldManager"

export async function init(
  this: WorldManager,
  scene: THREE.Scene,
  baseUrl: string,
) {
  const W = WORLD_CONFIG
  this.sceneRef = scene
  scene.add(this.group)
  this.puddles = new Puddles(this.group, (x, z, r) =>
    this.puddleSurface(x, z, r),
  )
  scene.fog = new THREE.Fog(
    W.environment.fogColor,
    W.environment.fogNear,
    W.environment.fogFar,
  )

  const sun = new THREE.DirectionalLight(W.environment.sunColor, 2.2)
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
  this.group.add(sun)
  this.sunLight = sun

  const hemi = new THREE.HemisphereLight(0xbdd7ff, 0x3d5a2a, 0.9)
  this.group.add(hemi)
  this.hemiLight = hemi
  ;(this.group as any)._sun = sun

  const sunVisual = createSunDisc(W.environment.sunColor)
  sunVisual.frustumCulled = false
  sunVisual.renderOrder = 1
  this.group.add(sunVisual)
  this.sunVisual = sunVisual
  this.skyDome = new SkyDome(this.group)
  this.syncDome()

  const starGeo = new THREE.BufferGeometry()
  const starCount = 1000
  const starPos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(1 - Math.random() * 1.02)
    const r = 900 + Math.random() * 200
    starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    starPos[i * 3 + 1] = r * Math.cos(phi)
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3))
  const starCol = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const b = Math.random() < 0.15 ? 1 : 0.45 + Math.random() * 0.4
    starCol[i * 3] = b
    starCol[i * 3 + 1] = b
    starCol[i * 3 + 2] = Math.min(1, b * 1.05)
  }
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size: 1.7,
    transparent: true,
    opacity: 0,
    sizeAttenuation: false,
    depthWrite: false,
    fog: false,
  })
  this.starsPoints = new THREE.Points(starGeo, starMat)
  this.starsPoints.frustumCulled = false
  this.starsPoints.visible = false
  this.group.add(this.starsPoints)

  const gGeo = new THREE.PlaneGeometry(12000, 12000, 1, 1)
  const gMat = new THREE.MeshStandardMaterial({
    color: 0x44602f,
    roughness: 1,
  })
  this.ground = new THREE.Mesh(gGeo, gMat)
  this.ground.rotation.x = -Math.PI / 2
  this.ground.position.y = 0
  this.ground.receiveShadow = true
  this.group.add(this.ground)

  const hillMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  })
  // Distance dissolve (screen-door dither) so hills fade in at the draw
  // limit instead of growing; fog hides them first whenever it is on.
  hillMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `void main() {
  {
    float d = length( vViewPosition );
    float keep = 1.0 - smoothstep( ${HILL_FADE_FROM.toFixed(1)}, ${HILL_FADE_TO.toFixed(1)}, d );
    vec2 p = floor( mod( gl_FragCoord.xy, 4.0 ) );
    float bayer = mod( p.x * 4.0 + p.y * 7.0 + mod( p.y, 2.0 ) * p.x * 3.0, 16.0 ) / 16.0 + 0.03;
    if ( keep < bayer ) discard;
  }`,
    )
  }
  hillMat.customProgramCacheKey = () => "hillDissolve"
  for (let i = 0; i < 22; i++) {
    const far = i % 3 === 2
    const radius = far
      ? 120 + this.rand(i * 613 + 7) * 100
      : 35 + this.rand(i * 613 + 7) * 35
    const height = Math.min(
      far
        ? 80 + this.rand(i * 977 + 13) * 80
        : 15 + this.rand(i * 977 + 13) * 30,
      radius * 0.32,
    )
    const seed = i * 311 + 3
    const hill = new THREE.Mesh(
      this.makeHillGeometry(radius, height, seed),
      hillMat,
    )
    const rotY = this.rand(seed) * Math.PI * 2
    hill.rotation.y = rotY
    hill.castShadow = true
    hill.receiveShadow = true
    this.group.add(hill)
    const seg =
      hillResidue(i) + HILL_PERIOD * Math.round(-hillResidue(i) / HILL_PERIOD)
    this.hills.push({ mesh: hill, seg: -999999, rotY, radius, height })
    this.placeHill(this.hills[i], seg)
  }

  const tex = makeAsphaltTexture()
  const count = W.road.segmentsAhead + W.road.segmentsBehind
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.clone(),
    roughness: 1.0,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  this.roadSegs = []
  for (let i = 0; i < count; i++) {
    const geo = makeRibbonGeometry(
      this.segLen,
      this.ROAD_RIB,
      W.road.width,
      this.segLen / 14,
    )
    const m = new THREE.Mesh(geo, roadMat.clone())
    m.material.map = tex.clone()
    m.material.map!.repeat.set(1, 1)
    m.material.map!.needsUpdate = true
    m.receiveShadow = true
    m.frustumCulled = true
    this.group.add(m)
    this.roadSegs.push({ mesh: m, s0: -999999 })
  }

  let glbRoot: THREE.Object3D | null = null
  try {
    const glb = await this.loader.loadAsync(
      `${baseUrl}models/low_poly_tree_pack.glb`,
    )
    glbRoot = glb.scene
    glbRoot.updateMatrixWorld(true)
  } catch (e) {
    console.warn("low_poly_tree_pack.glb failed to load, using fallback", e)
  }

  if (glbRoot) {
    const nodeByName = new Map<string, THREE.Object3D>()
    glbRoot.traverse((o) => {
      nodeByName.set(o.name, o)
    })

    const buildVariant = (
      category: PropCategory,
      names: string[],
      targetH: number,
      maxInstances: number,
      opts?: { uniformScale?: number },
    ) => {
      if (USE_CUSTOM_PROPS && (category === "tree" || category === "cloud")) {
        const mat = category === "cloud" ? cloudMaterial() : propMaterial()
        const geos =
          category === "tree" ? makeTreeGeometries() : makeCloudGeometries()
        for (const g of geos) {
          const im = new THREE.InstancedMesh(g, mat, maxInstances)
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          im.count = 0
          im.castShadow = category !== "cloud"
          im.name = `prop-${category}`
          im.receiveShadow = category !== "cloud"
          im.frustumCulled = false
          if (category === "tree") this.applyShadowFade(im)
          this.group.add(im)
          if (category === "cloud")
            this.cloudVariants.push({ im, category, targetH })
          else {
            const pv: PropVariant = { im, category, targetH }
            if (category === "tree") this.addFarTwin(pv)
            this.propVariants.push(pv)
          }
        }
        return
      }
      for (const name of names) {
        const node = nodeByName.get(name)
        if (!node) {
          console.warn(`prop node not found: ${name}`)
          continue
        }
        node.updateMatrixWorld(true)
        const im = bakeInstanced(node, maxInstances, targetH, opts)
        if (im) {
          im.castShadow = category !== "cloud" && category !== "grass"
          im.name = `prop-${category}`
          im.receiveShadow = category !== "cloud"
          im.frustumCulled = false
          if (category === "tree") this.applyShadowFade(im)
          this.group.add(im)
          if (category === "cloud") {
            this.cloudVariants.push({ im, category, targetH })
          } else {
            const pv: PropVariant = { im, category, targetH }
            if (category === "tree") this.addFarTwin(pv)
            this.propVariants.push(pv)
          }
        }
      }
    }

    buildVariant("tree", TREE_NODES, 6.5, 150)
    buildVariant("cloud", CLOUD_NODES, 14.0, this.NUM_CLOUDS)

    const bakeNodes = (names: string[]): THREE.Group | null => {
      const g = new THREE.Group()
      let found = false
      for (const nm of names) {
        const n = nodeByName.get(nm)
        if (n) {
          g.add(n.clone())
          found = true
        } else console.warn(`prop node not found: ${nm}`)
      }
      if (!found) return null
      g.updateMatrixWorld(true)
      return g
    }
    const pushIM = (
      im: THREE.InstancedMesh | null,
      category: PropCategory,
      targetH: number,
      shadow: boolean,
    ) => {
      if (!im) return
      im.castShadow = shadow
      im.name = `prop-${category}`
      im.receiveShadow = category !== "cloud"
      im.frustumCulled = false
      if (category !== "grass") this.applyShadowFade(im)
      this.group.add(im)
      this.propVariants.push({ im, category, targetH })
    }

    const g111 = bakeNodes(["Object_111"])
    if (g111) {
      if (USE_CUSTOM_PROPS) {
        const rmat = propMaterial()
        for (const g of makeRockGeometries()) {
          const im = new THREE.InstancedMesh(g, rmat, 150)
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          im.count = 0
          pushIM(im, "rock", 0.8, true)
        }
      } else
        for (const im of bakeSplit(g111, 6, 150, { uniformScale: 0.012 }))
          pushIM(im, "rock", 0.8, true)
    }
    const barrel = bakeNodes(["Object_113", "Object_114"])
    if (barrel) {
      pushIM(bakeInstanced(barrel, 100, 1.5), "barrel", 1.5, true)
    }
    const log = bakeNodes(["Object_111", "Object_112"])
    if (log) {
      pushIM(
        bakeInstanced(log, 100, 0, { uniformScale: 0.006 }),
        "log",
        0.4,
        true,
      )
    }
  } else {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22 }),
    )
    trunk.position.y = 1.2
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 5.5, 7),
      new THREE.MeshStandardMaterial({ color: 0x2d5a22, flatShading: true }),
    )
    top.position.y = 5
    const fallback = new THREE.Group()
    fallback.add(trunk, top)
    fallback.updateMatrixWorld(true)
    const im = bakeInstanced(fallback, this.maxProps, 6.5)
    if (im) {
      im.castShadow = true
      im.frustumCulled = false
      this.applyShadowFade(im)
      this.group.add(im)
      this.propVariants.push({ im, category: "tree", targetH: 6.5 })
    }
  }

  this.hills.forEach((h, i) =>
    this.dressHill(h, i * 311 + 3, h.radius > 90 ? 10 : 20),
  )

  this.streetLights = new StreetLights(this.group, roadCenterX)
  await this.streetLights.load(baseUrl)
  this.streetLights.setEnabled(this.streetLightsShown)
  this.streetLights.setLit(this.streetLightsPower && this.timeOfDay !== "day")

  this.initClouds()
  this.update(0, new THREE.Vector3(0, 0, 0))
}
