import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"

/**
 * One full-screen pass doing tone mapping + sRGB output + contrast-adaptive
 * sharpening. Replaces OutputPass and removes the need for a separate sharpen
 * pass after a lowered render scale is upscaled by the canvas.
 */
export class FinalPass extends Pass {
  private quad: FullScreenQuad
  private mat: THREE.RawShaderMaterial
  private cs: string | null = null
  private tm: THREE.ToneMapping | null = null

  constructor() {
    super()
    this.mat = new THREE.RawShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        toneMappingExposure: { value: 1 },
        texel: { value: new THREE.Vector2() },
        sharpen: { value: 0 },
      },
      vertexShader: `precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 texel;
        uniform float sharpen;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        vec3 tone(vec3 c){
          #if defined(ACES_FILMIC_TONE_MAPPING)
            return ACESFilmicToneMapping(c);
          #elif defined(AGX_TONE_MAPPING)
            return AgXToneMapping(c);
          #elif defined(NEUTRAL_TONE_MAPPING)
            return NeutralToneMapping(c);
          #elif defined(REINHARD_TONE_MAPPING)
            return ReinhardToneMapping(c);
          #elif defined(CINEON_TONE_MAPPING)
            return CineonToneMapping(c);
          #elif defined(LINEAR_TONE_MAPPING)
            return LinearToneMapping(c);
          #else
            return c;
          #endif
        }
        vec3 fetch(vec2 uv){ return tone(texture2D(tDiffuse, uv).rgb); }
        void main(){
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 c = tone(src.rgb);
          if (sharpen > 0.0) {
            vec3 n = fetch(vUv + vec2(0.0, -texel.y));
            vec3 s = fetch(vUv + vec2(0.0,  texel.y));
            vec3 w = fetch(vUv + vec2(-texel.x, 0.0));
            vec3 e = fetch(vUv + vec2( texel.x, 0.0));
            vec3 mn = min(c, min(min(n, s), min(w, e)));
            vec3 mx = max(c, max(max(n, s), max(w, e)));
            // CAS: weaker where local contrast is already high (no halos)
            vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
            vec3 wgt = -amp * mix(0.125, 0.2, sharpen);
            c = clamp((c + (n + s + w + e) * wgt) / (1.0 + 4.0 * wgt), mn, mx);
          }
          gl_FragColor = vec4(c, src.a);
          #ifdef SRGB_TRANSFER
            gl_FragColor = sRGBTransferOETF(gl_FragColor);
          #endif
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
  }

  /** 0 = off, 1 = strongest. */
  set sharpness(v: number) {
    this.mat.uniforms.sharpen.value = v
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    const u = this.mat.uniforms
    u.tDiffuse.value = readBuffer.texture
    u.toneMappingExposure.value = renderer.toneMappingExposure
    u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height)
    if (this.cs !== renderer.outputColorSpace || this.tm !== renderer.toneMapping) {
      this.cs = renderer.outputColorSpace
      this.tm = renderer.toneMapping
      const d: Record<string, string> = {}
      if (THREE.ColorManagement.getTransfer(this.cs as THREE.ColorSpace) === THREE.SRGBTransfer)
        d.SRGB_TRANSFER = ""
      const names: Partial<Record<number, string>> = {
        [THREE.LinearToneMapping]: "LINEAR_TONE_MAPPING",
        [THREE.ReinhardToneMapping]: "REINHARD_TONE_MAPPING",
        [THREE.CineonToneMapping]: "CINEON_TONE_MAPPING",
        [THREE.ACESFilmicToneMapping]: "ACES_FILMIC_TONE_MAPPING",
        [THREE.AgXToneMapping]: "AGX_TONE_MAPPING",
        [THREE.NeutralToneMapping]: "NEUTRAL_TONE_MAPPING",
      }
      const n = names[this.tm]
      if (n) d[n] = ""
      this.mat.defines = d
      this.mat.needsUpdate = true
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.mat.dispose()
    this.quad.dispose()
  }
}
