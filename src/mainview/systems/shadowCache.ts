import * as THREE from "three"

const dynamicCasters: WeakRef<THREE.Object3D>[] = []

export function registerDynamicCaster<T extends THREE.Object3D>(o: T): T {
  dynamicCasters.push(new WeakRef(o))
  return o
}

export const SHADOW_CELL_M = 8
const MAX_AGE_MS = 1500
const SUN_ANGLE_DEG = 0.2

export function coarseTexel(texel: number): number {
  return texel * Math.max(1, Math.round(SHADOW_CELL_M / texel))
}

export function syncShadowOffset(
  dst: THREE.Vector3,
  src: THREE.Vector3,
): boolean {
  if (
    dst.lengthSq() > 0 &&
    dst.angleTo(src) < (SUN_ANGLE_DEG * Math.PI) / 180 &&
    Math.abs(dst.length() - src.length()) < 2
  )
    return false
  dst.copy(src)
  return true
}

function attached(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o
  while (p) {
    if (!p.visible) return false
    if ((p as THREE.Scene).isScene) return true
    p = p.parent
  }
  return false
}

export class ShadowCache {
  private sun: THREE.DirectionalLight | null = null
  private readonly cacheLight = new THREE.DirectionalLight(0xffffff, 0)
  private readonly lastPos = new THREE.Vector3(NaN, NaN, NaN)
  private readonly lastTarget = new THREE.Vector3(NaN, NaN, NaN)
  private lastSize = 0
  private lastExtent = ""
  private lastAt = 0
  private dirty = true
  private readonly roots: THREE.Object3D[] = []
  private readonly saved: THREE.Object3D[] = []
  private readonly noop = () => {}
  enabled = true

  constructor() {
    this.cacheLight.castShadow = true
  }

  invalidate() {
    this.dirty = true
  }

  private collectRoots(scene: THREE.Scene) {
    this.roots.length = 0
    for (let i = dynamicCasters.length - 1; i >= 0; i--) {
      const o = dynamicCasters[i].deref()
      if (!o) {
        dynamicCasters.splice(i, 1)
        continue
      }
      if (attached(o) && o.parent) this.roots.push(o)
    }
    void scene
  }

  private syncCacheLight(sun: THREE.DirectionalLight) {
    const c = this.cacheLight
    c.position.copy(sun.position)
    c.target.position.copy(sun.target.position)
    c.updateMatrixWorld()
    c.target.updateMatrixWorld()
    const sc = sun.shadow.camera
    const cc = c.shadow.camera
    const ext = `${sc.left},${sc.right},${sc.top},${sc.bottom},${sc.near},${sc.far}`
    if (ext !== this.lastExtent) {
      cc.left = sc.left
      cc.right = sc.right
      cc.top = sc.top
      cc.bottom = sc.bottom
      cc.near = sc.near
      cc.far = sc.far
      cc.updateProjectionMatrix()
      this.lastExtent = ext
    }
    c.shadow.mapSize.copy(sun.shadow.mapSize)
  }

  private origRender: THREE.WebGLShadowMap["render"] | null = null
  private hooked: THREE.WebGLRenderer | null = null

  install(renderer: THREE.WebGLRenderer) {
    const sm = renderer.shadowMap
    const orig = sm.render.bind(sm)
    this.origRender = orig
    this.hooked = renderer
    sm.render = (lights, scene, camera) => {
      if (this.inside || (!sm.autoUpdate && !sm.needsUpdate)) {
        orig(lights, scene, camera)
        return
      }
      let sun: THREE.DirectionalLight | null = null
      for (const l of lights) {
        const d = l as THREE.DirectionalLight
        if (d.isDirectionalLight && d.castShadow) {
          sun = d
          break
        }
      }
      if (!sun) {
        orig(lights, scene, camera)
        return
      }
      if (sun !== this.sun) {
        this.sun = sun
        this.dirty = true
      }
      this.inside = true
      try {
        if (sun) this.run(renderer, scene, camera, sun, performance.now())
      } finally {
        this.inside = false
      }
      orig(lights, scene, camera)
    }
  }

  private inside = false

  private run(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    sun: THREE.DirectionalLight,
    now: number,
  ) {
    const sm = renderer.shadowMap
    const orig = this.origRender!
    if (!this.enabled || !sm.enabled || !sun.castShadow) {
      sun.shadow.autoUpdate = true
      return
    }

    if (!sun.shadow.map) {
      sun.shadow.autoUpdate = true
      sun.shadow.needsUpdate = true
      this.dirty = true
      return
    }

    const size = sun.shadow.map.width
    if (
      this.dirty ||
      size !== this.lastSize ||
      now - this.lastAt > MAX_AGE_MS ||
      !sun.position.equals(this.lastPos) ||
      !sun.target.position.equals(this.lastTarget)
    ) {
      this.renderStatic(renderer, scene, camera, sun)
      this.lastSize = size
      this.lastAt = now
      this.dirty = false
      this.lastPos.copy(sun.position)
      this.lastTarget.copy(sun.target.position)
    }

    const cacheMap = this.cacheLight.shadow.map
    if (!cacheMap) return
    sun.shadow.autoUpdate = false
    sun.shadow.matrix.copy(this.cacheLight.shadow.matrix)
    renderer.copyTextureToTexture(
      cacheMap.depthTexture!,
      sun.shadow.map.depthTexture!,
    )

    this.collectRoots(scene)
    const realClear = renderer.clear
    renderer.clear = this.noop
    try {
      for (const root of this.roots) {
        root.updateWorldMatrix(true, true)
        sun.shadow.needsUpdate = true
        orig([sun], root as unknown as THREE.Scene, camera)
      }
    } finally {
      renderer.clear = realClear
    }
    sun.shadow.needsUpdate = false
  }

  private renderStatic(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    sun: THREE.DirectionalLight,
  ) {
    this.syncCacheLight(sun)
    this.collectRoots(scene)
    const saved = this.saved
    saved.length = 0
    for (const root of this.roots)
      root.traverse((o) => {
        if (o.castShadow) {
          saved.push(o)
          o.castShadow = false
        }
      })
    this.cacheLight.shadow.needsUpdate = true
    try {
      this.origRender!([this.cacheLight], scene, camera)
    } finally {
      for (const o of saved) o.castShadow = true
      saved.length = 0
    }
  }

  dispose() {
    if (this.hooked && this.origRender) this.hooked.shadowMap.render = this.origRender
    this.hooked = null
    if (this.sun) this.sun.shadow.autoUpdate = true
    this.cacheLight.shadow.map?.dispose()
    this.cacheLight.dispose()
  }
}
