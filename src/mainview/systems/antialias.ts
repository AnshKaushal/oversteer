import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { FinalPass } from "./finalPass"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
import { MotionBlurPass } from "./motionBlur"
import { UpscalePass } from "./upscalePass"
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
  private blurPass: MotionBlurPass | null = null
  private composer: EffectComposer | null = null
  private finalPass: FinalPass | null = null
  private w = 0
  private h = 0
  private v = new THREE.Vector2()
  /** Diagnostic: first WebGL error seen and the stage that raised it. */
  firstGlError = ""

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {}

  private build(mode: AAMode, blur: boolean, up: boolean) {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.finalPass = null
    this.composer = null
    this.blurPass = null
    this.upPass = null
    this.mode = mode
    this.blurOn = blur
    this.upOn = up
    if (mode === "off" && !blur && !up) return
    this.renderer.getDrawingBufferSize(this.v)
    const iw = Math.max(1, Math.round(this.v.x * this.scale))
    const ih = Math.max(1, Math.round(this.v.y * this.scale))
    const target = new THREE.WebGLRenderTarget(iw, ih, {
      type: THREE.HalfFloatType,
      samples: mode === "msaa" ? 2 : 0,
    })
    if (blur) {
      target.depthTexture = new THREE.DepthTexture(iw, ih)
      target.depthTexture.type = THREE.UnsignedIntType
    }
    const c = new EffectComposer(this.renderer, target)
    c.setPixelRatio(1)
    c.addPass(new RenderPass(this.scene, this.camera))
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
    if (mode === "fxaa") c.addPass(new FXAAPass())
    else if (mode === "smaa") c.addPass(new SMAAPass())
    if (up) {
      this.upPass = new UpscalePass()
      c.addPass(this.upPass)
    }
    this.composer = c
    // Diagnostic: tag the first GL error with the pass that raised it.
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

  /** blur: 0-100; keepSharp: object excluded from the blur (player car) */
  render(
    mode: AAMode,
    blur = 0,
    keepSharp: THREE.Object3D | readonly THREE.Object3D[] | null = null,
    scale = 1,
  ) {
    const on = blur > 0
    const up = scale < 0.995
    this.scale = up ? Math.max(0.4, scale) : 1
    if (mode !== this.mode || on !== this.blurOn || up !== this.upOn)
      this.build(mode, on, up)
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
    }
    if (this.finalPass) {
      // Without the upscaler the canvas is CSS-stretched when the render
      // scale is below 100%: sharpen to compensate. The upscale pass sharpens
      // at output resolution itself.
      const ratio = this.upPass
        ? 1
        : this.renderer.domElement.clientWidth / this.v.x
      this.finalPass.sharpness = this.upPass
        ? 0
        : ratio > 1.02
          ? Math.min(1, 0.25 + (ratio - 1) * 1.5)
          : 0.15
    }
    this.composer.render()
  }

  dispose() {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.upPass?.dispose()
  }
}
