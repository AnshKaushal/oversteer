import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
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
  private composer: EffectComposer | null = null
  private w = 0
  private h = 0
  private v = new THREE.Vector2()

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {}

  private build(mode: AAMode) {
    this.composer?.dispose()
    this.composer = null
    this.mode = mode
    if (mode === "off") return
    this.renderer.getDrawingBufferSize(this.v)
    const target = new THREE.WebGLRenderTarget(this.v.x, this.v.y, {
      type: THREE.HalfFloatType,
      samples: mode === "msaa" ? 4 : 0,
    })
    const c = new EffectComposer(this.renderer, target)
    c.setPixelRatio(1)
    c.addPass(new RenderPass(this.scene, this.camera))
    c.addPass(new OutputPass())
    if (mode === "fxaa") c.addPass(new FXAAPass())
    else if (mode === "smaa") c.addPass(new SMAAPass())
    this.composer = c
    this.w = this.h = 0
  }

  render(mode: AAMode) {
    if (mode !== this.mode) this.build(mode)
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
  }
}
