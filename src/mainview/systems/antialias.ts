import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
import { MotionBlurPass } from "./motionBlur"
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js"

export type AAMode = "off" | "fxaa" | "smaa" | "msaa"
export const AA_MODES: { id: AAMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Fastest, jagged edges" },
  { id: "fxaa", label: "FXAA", hint: "Cheap post-process, slightly soft" },
  { id: "smaa", label: "SMAA", hint: "Sharper post-process, moderate cost" },
  { id: "msaa", label: "MSAA 4x", hint: "Best edges, highest GPU cost" },
]

export class AntiAlias {
  private mode: AAMode | null = null
  private blurOn = false
  private blurPass: MotionBlurPass | null = null
  private composer: EffectComposer | null = null
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

  private build(mode: AAMode, blur: boolean) {
    this.composer?.dispose()
    this.blurPass?.dispose()
    this.composer = null
    this.blurPass = null
    this.mode = mode
    this.blurOn = blur
    if (mode === "off" && !blur) return
    this.renderer.getDrawingBufferSize(this.v)
    const target = new THREE.WebGLRenderTarget(this.v.x, this.v.y, {
      type: THREE.HalfFloatType,
      samples: mode === "msaa" ? 4 : 0,
    })
    if (blur) {
      target.depthTexture = new THREE.DepthTexture(this.v.x, this.v.y)
      target.depthTexture.type = THREE.UnsignedIntType
    }
    const c = new EffectComposer(this.renderer, target)
    c.setPixelRatio(1)
    c.addPass(new RenderPass(this.scene, this.camera))
    if (blur) {
      this.blurPass = new MotionBlurPass(this.scene, this.camera, target.depthTexture!)
      c.addPass(this.blurPass)
    }
    c.addPass(new OutputPass())
    if (mode === "fxaa") c.addPass(new FXAAPass())
    else if (mode === "smaa") c.addPass(new SMAAPass())
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
  ) {
    const on = blur > 0
    if (mode !== this.mode || on !== this.blurOn) this.build(mode, on)
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
    if (this.v.x !== this.w || this.v.y !== this.h) {
      this.w = this.v.x
      this.h = this.v.y
      this.composer.setSize(this.w, this.h)
    }
    this.composer.render()
  }

  dispose() {
    this.composer?.dispose()
    this.blurPass?.dispose()
  }
}
