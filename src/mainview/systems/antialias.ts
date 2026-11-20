import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { FinalPass } from "./finalPass"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
import { MotionBlurPass } from "./motionBlur"
import { UpscalePass } from "./upscalePass"
import { TemporalUpscalePass } from "./temporalUpscale"
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js"

export type AAMode = "off" | "fxaa" | "smaa" | "msaa"
export const AA_MODES: { id: AAMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "fxaa", label: "FXAA" },
  { id: "smaa", label: "SMAA" },
  { id: "msaa", label: "MSAA" },
]

export class AntiAlias {
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

  private build(mode: AAMode, blur: boolean, up: boolean, temporal: boolean) {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.finalPass = null
    this.composer = null
    this.blurPass = null
    this.upPass = null
    this.tPass?.dispose()
    this.tPass = null
    this.tOn = temporal
    this.mode = mode
    this.blurOn = blur
    this.upOn = up
    if (mode === "off" && !blur && !up && !temporal) return
    this.renderer.getDrawingBufferSize(this.v)
    const iw = Math.max(1, Math.round(this.v.x * this.scale))
    const ih = Math.max(1, Math.round(this.v.y * this.scale))
    const target = new THREE.WebGLRenderTarget(iw, ih, {
      type: THREE.HalfFloatType,
      samples: mode === "msaa" && !temporal ? 2 : 0,
    })
    if (blur || temporal) {
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
    if (blur) {
      this.blurPass = new MotionBlurPass(
        this.scene,
        this.camera,
        target.depthTexture!,
      )
      c.addPass(this.blurPass)
    }
    this.finalPass = new FinalPass()
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
    this.w = this.h = 0
  }

  render(
    mode: AAMode,
    blur = 0,
    keepSharp: THREE.Object3D | readonly THREE.Object3D[] | null = null,
    scale = 1,
    temporal = false,
  ) {
    const on = blur > 0
    const up = scale < 0.995
    this.scale = up ? Math.max(0.4, scale) : 1
    if (
      mode !== this.mode ||
      on !== this.blurOn ||
      up !== this.upOn ||
      temporal !== this.tOn
    )
      this.build(mode, on, up, temporal)
    if (this.blurPass) {
      this.blurPass.strength = (blur / 100) * 1.5
      this.blurPass.maskRoots = !keepSharp
        ? []
        : "isObject3D" in keepSharp
          ? [keepSharp]
          : [...keepSharp]
    }
    if (!this.firstGlError) {
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

  dispose() {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.upPass?.dispose()
    this.tPass?.dispose()
  }
}
