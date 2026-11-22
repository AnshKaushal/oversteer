import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { FinalPass } from "./finalPass"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
import { MotionBlurPass } from "./motionBlur"
import { UpscalePass } from "./upscalePass"
import { TemporalUpscalePass } from "./temporalUpscale"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { DepthAOPass } from "./depthAO"
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js"

export type AAMode = "off" | "fxaa" | "smaa" | "msaa"
export const AA_MODES: { id: AAMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "fxaa", label: "FXAA" },
  { id: "smaa", label: "SMAA" },
  { id: "msaa", label: "MSAA" },
]

// Rendering below native resolution makes the GPU pick blurrier texture mips.
// A small negative LOD bias on diffuse maps gives that detail back for free
// (standard practice with temporal upscalers).
const MIP_BIAS = -0.4
THREE.ShaderChunk.map_fragment = THREE.ShaderChunk.map_fragment.replace(
  "texture2D( map, vMapUv )",
  `texture2D( map, vMapUv, ${MIP_BIAS.toFixed(2)} )`,
)

const BLOOM_THRESHOLD = 1.1
const BLOOM_RADIUS = 0.5
const BLOOM_CAP = 2.2

// Pre-filter that only lets lamps bloom. Sunlit diffuse surfaces (white and
// yellow road lines) reach ~2 in HDR, so a plain brightness threshold makes
// them glow. Instead a pixel's bloom source is the larger of:
//  - how far a neutral/white pixel exceeds NEUTRAL_LIFT (headlamps, sun disc,
//    far brighter than any lit surface), and
//  - its red excess (tail lamps, which are saturated and so too dim by
//    brightness alone).
// Output is capped so very bright lamps cannot blow the glow out.
const BLOOM_NEUTRAL_LIFT = 1.7
const BLOOM_PREFILTER = `
uniform sampler2D tDiffuse;
uniform vec3 defaultColor;
uniform float defaultOpacity;
uniform float luminosityThreshold;
uniform float smoothWidth;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tDiffuse, vUv);
  float m = max(t.r, max(t.g, t.b));
  float red = t.r - max(t.g, t.b);
  float v = max(m - ${BLOOM_NEUTRAL_LIFT.toFixed(2)}, red);
  float a = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
  vec4 lit = vec4(t.rgb * (min(m, ${BLOOM_CAP.toFixed(2)}) / max(m, 1e-4)), t.a);
  gl_FragColor = mix(vec4(defaultColor, defaultOpacity), lit, a);
}
`

export interface Effects {
  bloom?: number
  ao?: number
}

export class AntiAlias {
  private bloomOn = false
  private aoOn = false
  private bloomPass: UnrealBloomPass | null = null
  private aoPass: DepthAOPass | null = null
  private mode: AAMode | null = null
  private blurOn = false
  private upOn = false
  private scale = 1
  private upPass: UpscalePass | null = null
  private tPass: TemporalUpscalePass | null = null
  private tOn = false
  private sceneDepth: THREE.DepthTexture | null = null
  private lastCam = new THREE.Vector3()
  private blurPass: MotionBlurPass | null = null
  private composer: EffectComposer | null = null
  private finalPass: FinalPass | null = null
  private w = 0
  private h = 0
  private v = new THREE.Vector2()
  firstGlError = ""

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {}

  private build(
    mode: AAMode,
    blur: boolean,
    up: boolean,
    temporal: boolean,
    bloom: boolean,
    ao: boolean,
  ) {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.finalPass = null
    this.composer = null
    this.blurPass = null
    this.upPass = null
    this.tPass?.dispose()
    this.tPass = null
    this.bloomPass?.dispose()
    this.bloomPass = null
    this.aoPass?.dispose()
    this.aoPass = null
    this.bloomOn = bloom
    this.aoOn = ao
    this.tOn = temporal
    this.mode = mode
    this.blurOn = blur
    this.upOn = up
    if (mode === "off" && !blur && !up && !temporal && !bloom && !ao) return
    this.renderer.getDrawingBufferSize(this.v)
    const iw = Math.max(1, Math.round(this.v.x * this.scale))
    const ih = Math.max(1, Math.round(this.v.y * this.scale))
    const target = new THREE.WebGLRenderTarget(iw, ih, {
      type: THREE.HalfFloatType,
      samples: mode === "msaa" && !temporal ? 2 : 0,
    })
    if (blur || temporal || ao) {
      target.depthTexture = new THREE.DepthTexture(iw, ih)
      target.depthTexture.type = THREE.UnsignedIntType
    }
    const c = new EffectComposer(this.renderer, target)
    c.setPixelRatio(1)
    const rp = new RenderPass(this.scene, this.camera)
    const rpRender = rp.render.bind(rp)
    rp.render = (r, w, rb, ...rest) => {
      this.sceneDepth = rb.depthTexture
      rpRender(r, w, rb, ...rest)
    }
    c.addPass(rp)
    if (ao) {
      this.aoPass = new DepthAOPass(
        this.camera as THREE.PerspectiveCamera,
        () => this.sceneDepth,
      )
      c.addPass(this.aoPass)
    }
    if (blur) {
      this.blurPass = new MotionBlurPass(
        this.scene,
        this.camera,
        target.depthTexture!,
      )
      c.addPass(this.blurPass)
    }
    if (bloom) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(iw, ih),
        0,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      )
      this.bloomPass.materialHighPassFilter.fragmentShader = BLOOM_PREFILTER
      this.bloomPass.materialHighPassFilter.needsUpdate = true
      c.addPass(this.bloomPass)
    }
    this.finalPass = new FinalPass()
    if (this.aoPass) {
      const ao = this.aoPass
      this.finalPass.getAO = () => {
        const tex = ao.texture
        const depth = ao.depthTexture
        return tex && depth ? { tex, depth } : null
      }
    }
    c.addPass(this.finalPass)
    if (temporal) {
      this.tPass = new TemporalUpscalePass(
        this.camera as THREE.PerspectiveCamera,
        () => this.sceneDepth,
      )
      c.addPass(this.tPass)
    } else if (mode === "fxaa") c.addPass(new FXAAPass())
    else if (mode === "smaa") c.addPass(new SMAAPass())
    if (up && !temporal) {
      this.upPass = new UpscalePass()
      c.addPass(this.upPass)
    }
    this.composer = c
    if (import.meta.env.DEV) {
      const gl = this.renderer.getContext()
      for (const pass of c.passes) {
        const orig = pass.render.bind(pass)
        pass.render = (...args: Parameters<typeof pass.render>) => {
          orig(...args)
          const err = gl.getError()
          if (err && !this.firstGlError)
            this.firstGlError = `${pass.constructor.name} -> ${err}`
        }
      }
    }
    this.w = this.h = 0
  }

  render(
    mode: AAMode,
    blur = 0,
    keepSharp: THREE.Object3D | readonly THREE.Object3D[] | null = null,
    scale = 1,
    temporal = false,
    fx: Effects = {},
  ) {
    const on = blur > 0
    const bloomV = fx.bloom ?? 0
    const aoV = fx.ao ?? 0
    const up = scale < 0.995
    this.scale = up ? Math.max(0.4, scale) : 1
    if (
      mode !== this.mode ||
      on !== this.blurOn ||
      up !== this.upOn ||
      temporal !== this.tOn ||
      bloomV > 0 !== this.bloomOn ||
      aoV > 0 !== this.aoOn
    )
      this.build(mode, on, up, temporal, bloomV > 0, aoV > 0)
    if (this.bloomPass) this.bloomPass.strength = (bloomV / 100) * 0.9
    if (this.aoPass) {
      this.aoPass.intensity = aoV / 100
      this.aoPass.animate = temporal
    }
    if (this.blurPass) {
      this.blurPass.strength = (blur / 100) * 1.5
      this.blurPass.maskRoots = !keepSharp
        ? []
        : "isObject3D" in keepSharp
          ? [keepSharp]
          : [...keepSharp]
    }
    if (import.meta.env.DEV && !this.firstGlError) {
      const pre = this.renderer.getContext().getError()
      if (pre) this.firstGlError = `before-frame -> ${pre}`
    }
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.renderer.getDrawingBufferSize(this.v)
    const iw = Math.max(1, Math.round(this.v.x * this.scale))
    const ih = Math.max(1, Math.round(this.v.y * this.scale))
    if (iw !== this.w || ih !== this.h) {
      this.w = iw
      this.h = ih
      this.composer.setSize(iw, ih)
      this.upPass?.setSizes(iw, ih, this.v.x, this.v.y)
      this.tPass?.setSizes(iw, ih, this.v.x, this.v.y)
    }
    if (this.finalPass) {
      const ratio = this.upPass || this.tPass
        ? 1
        : this.renderer.domElement.clientWidth / this.v.x
      this.finalPass.sharpness = this.upPass || this.tPass
        ? 0
        : ratio > 1.02
          ? Math.min(1, 0.25 + (ratio - 1) * 1.5)
          : 0.15
    }
    let restore: (() => void) | undefined
    if (this.tPass) {
      const cam = this.camera.position
      if (cam.distanceToSquared(this.lastCam) > 64) this.tPass.reset()
      this.lastCam.copy(cam)
      restore = this.tPass.beginFrame()
    }
    this.composer.render()
    restore?.()
  }

  compileAsync(o: THREE.Object3D, target: THREE.Object3D): Promise<unknown> {
    const rt = this.composer?.readBuffer
    if (!rt) return this.renderer.compileAsync(o, this.camera, target as THREE.Scene)
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(rt)
    try {
      return this.renderer.compileAsync(o, this.camera, target as THREE.Scene)
    } finally {
      this.renderer.setRenderTarget(prev)
    }
  }

  dispose() {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.upPass?.dispose()
    this.tPass?.dispose()
    this.bloomPass?.dispose()
    this.aoPass?.dispose()
  }
}
