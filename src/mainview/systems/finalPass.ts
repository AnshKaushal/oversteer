import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"

export class FinalPass extends Pass {
  private quad: FullScreenQuad
  private mat: THREE.RawShaderMaterial
  private cs: string | null = null
  private tm: THREE.ToneMapping | null = null
  private hasAO = false
  getAO: () => { tex: THREE.Texture; depth: THREE.Texture } | null = () => null

  constructor() {
    super()
    this.mat = new THREE.RawShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        toneMappingExposure: { value: 1 },
        texel: { value: new THREE.Vector2() },
        sharpen: { value: 0 },
        tAO: { value: null },
        tDepth: { value: null },
        size: { value: new THREE.Vector2(1, 1) },
        aoSize: { value: new THREE.Vector2(1, 1) },
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
        #ifdef USE_AO
        uniform sampler2D tAO, tDepth;
        uniform vec2 size, aoSize;
        float aoFactor(vec2 uv){
          vec2 ip = floor(uv * size);
          float d0 = texture2D(tDepth, (ip + 0.5) / size).x;
          vec2 hp = (ip + 0.5) * 0.5 - 0.5;
          vec2 c = floor(hp + 0.5);
          float sum = 0.0, ws = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 q = clamp(c + vec2(float(x), float(y)), vec2(0.0), aoSize - 1.0);
              vec2 fp = min(q * 2.0, size - 1.0);
              float d = texture2D(tDepth, (fp + 0.5) / size).x;
              vec2 o = q - hp;
              float w = exp(-dot(o, o) * 0.9) * exp(-abs(d - d0) * 6000.0);
              sum += texture2D(tAO, (q + 0.5) / aoSize).r * w;
              ws += w;
            }
          }
          return sum / max(ws, 1e-5);
        }
        #endif
        float gAO = 1.0;
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
        vec3 fetch(vec2 uv){ return tone(texture2D(tDiffuse, uv).rgb * gAO); }
        void main(){
          vec4 src = texture2D(tDiffuse, vUv);
          #ifdef USE_AO
            gAO = aoFactor(vUv);
            src.rgb *= gAO;
          #endif
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
    const ao = this.getAO()
    if (ao) {
      u.tAO.value = ao.tex
      u.tDepth.value = ao.depth
      u.size.value.set(readBuffer.width, readBuffer.height)
      u.aoSize.value.set(
        Math.max(1, (readBuffer.width + 1) >> 1),
        Math.max(1, (readBuffer.height + 1) >> 1),
      )
    }
    if (
      this.cs !== renderer.outputColorSpace ||
      this.tm !== renderer.toneMapping ||
      this.hasAO !== !!ao
    ) {
      this.hasAO = !!ao
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
      if (this.hasAO) d.USE_AO = ""
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
