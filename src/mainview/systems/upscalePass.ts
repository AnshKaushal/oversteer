import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"

/**
 * Last pass of the chain when the scene is rendered below the canvas size.
 * Catmull-Rom bicubic reconstruction (5 bilinear taps) followed by a
 * contrast-adaptive sharpen at output resolution. Much crisper than the
 * canvas' own bilinear stretch, so a 70% internal scale reads close to native.
 * Input is the tone-mapped sRGB image, so this pass does no colour work.
 */
export class UpscalePass extends Pass {
  private quad: FullScreenQuad
  private mat: THREE.RawShaderMaterial

  constructor() {
    super()
    this.mat = new THREE.RawShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        srcSize: { value: new THREE.Vector2(1, 1) },
        outTexel: { value: new THREE.Vector2(1, 1) },
        sharpen: { value: 0.5 },
      },
      vertexShader: `precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 srcSize;
        uniform vec2 outTexel;
        uniform float sharpen;
        varying vec2 vUv;
        vec4 catmull(vec2 uv) {
          vec2 pos = uv * srcSize;
          vec2 tc1 = floor(pos - 0.5) + 0.5;
          vec2 f = pos - tc1;
          vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
          vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
          vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
          vec2 w3 = f * f * (-0.5 + 0.5 * f);
          vec2 w12 = w1 + w2;
          vec2 tc0 = (tc1 - 1.0) / srcSize;
          vec2 tc3 = (tc1 + 2.0) / srcSize;
          vec2 tc12 = (tc1 + w2 / w12) / srcSize;
          vec4 r =
            texture2D(tDiffuse, vec2(tc12.x, tc0.y)) * (w12.x * w0.y) +
            texture2D(tDiffuse, vec2(tc0.x, tc12.y)) * (w0.x * w12.y) +
            texture2D(tDiffuse, vec2(tc12.x, tc12.y)) * (w12.x * w12.y) +
            texture2D(tDiffuse, vec2(tc3.x, tc12.y)) * (w3.x * w12.y) +
            texture2D(tDiffuse, vec2(tc12.x, tc3.y)) * (w12.x * w3.y);
          float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
          return r / wsum;
        }
        void main(){
          vec4 s = catmull(vUv);
          vec3 c = max(s.rgb, 0.0);
          if (sharpen > 0.0) {
            vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, -outTexel.y)).rgb;
            vec3 so = texture2D(tDiffuse, vUv + vec2(0.0,  outTexel.y)).rgb;
            vec3 w = texture2D(tDiffuse, vUv + vec2(-outTexel.x, 0.0)).rgb;
            vec3 e = texture2D(tDiffuse, vUv + vec2( outTexel.x, 0.0)).rgb;
            vec3 mn = min(c, min(min(n, so), min(w, e)));
            vec3 mx = max(c, max(max(n, so), max(w, e)));
            // CAS: weaker where local contrast is already high (no halos)
            vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
            vec3 wgt = -amp * mix(0.125, 0.2, sharpen);
            c = clamp((c + (n + so + w + e) * wgt) / (1.0 + 4.0 * wgt), mn, mx);
          }
          gl_FragColor = vec4(c, clamp(s.a, 0.0, 1.0));
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
  }

  /** src: internal render size; out: canvas drawing-buffer size. */
  setSizes(srcW: number, srcH: number, outW: number, outH: number) {
    const u = this.mat.uniforms
    u.srcSize.value.set(srcW, srcH)
    u.outTexel.value.set(1 / outW, 1 / outH)
    // The further we stretch, the more the sharpen has to restore.
    const ratio = outW / srcW
    u.sharpen.value = Math.min(1, 0.3 + (ratio - 1) * 1.2)
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.mat.dispose()
    this.quad.dispose()
  }
}
