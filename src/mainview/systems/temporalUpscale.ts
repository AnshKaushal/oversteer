import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"
import { RCAS_SHARPNESS } from "./upscalePass"


const VERT = `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const RESOLVE_FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tCur, tDepth, tHist;
uniform vec2 srcSize, outSize, jitter;
uniform mat4 invVPu, prevVPu;
uniform float histOn, motionK;
out vec4 outColor;

vec4 cur(ivec2 p) {
  return texelFetch(tCur, clamp(p, ivec2(0), ivec2(srcSize) - 1), 0);
}
float dep(ivec2 p) {
  return texelFetch(tDepth, clamp(p, ivec2(0), ivec2(srcSize) - 1), 0).x;
}
// Catmull-Rom history fetch (5 bilinear taps) keeps accumulated detail sharp.
vec4 histCR(vec2 uv) {
  vec2 pos = uv * outSize;
  vec2 tc1 = floor(pos - 0.5) + 0.5;
  vec2 f = pos - tc1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (tc1 - 1.0) / outSize, t3 = (tc1 + 2.0) / outSize;
  vec2 t12 = (tc1 + w2 / w12) / outSize;
  vec4 r = texture(tHist, vec2(t12.x, t0.y)) * (w12.x * w0.y)
         + texture(tHist, vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + texture(tHist, vec2(t12.x, t12.y)) * (w12.x * w12.y)
         + texture(tHist, vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + texture(tHist, vec2(t12.x, t3.y)) * (w12.x * w3.y);
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / ws, 0.0);
}

void main() {
  // This output pixel's centre, in unjittered internal-pixel units. Internal
  // texel i holds the scene at (i + 0.5 + jitter).
  vec2 q = gl_FragCoord.xy * (srcSize / outSize);
  ivec2 c0 = ivec2(floor(q - jitter));

  float accA = 0.0;
  vec3 acc = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 mn = vec3(1e9), mx = vec3(-1e9);
  float wsum = 0.0, nearest = 2.0;
  ivec2 nearestP = c0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 p = c0 + ivec2(x, y);
      vec4 c4 = cur(p);
      vec3 c = c4.rgb;
      vec2 d = (vec2(p) + 0.5 + jitter) - q;
      // Gaussian reconstruction, radius tied to the upscale ratio.
      float w = exp(-3.2 * dot(d, d));
      acc += c * w; accA += c4.a * w; wsum += w;
      m1 += c; m2 += c * c;
      mn = min(mn, c); mx = max(mx, c);
      float dz = dep(p);
      if (dz < nearest) { nearest = dz; nearestP = p; }
    }
  }
  vec3 curC = acc / max(wsum, 1e-5);
  float curA = accA / max(wsum, 1e-5);
  vec3 mean = m1 / 9.0;
  vec3 sd = sqrt(max(m2 / 9.0 - mean * mean, 0.0));

  float a = 1.0;
  vec3 res = curC;
  float resA = curA;
  if (histOn > 0.5) {
    // Reproject this output pixel's own (unjittered) position, using the
    // closest neighbouring depth so edges follow the foreground. Using the
    // nearest texel's position instead makes the sample point hop around with
    // the jitter and the whole image wiggles.
    vec2 ndc = gl_FragCoord.xy / outSize * 2.0 - 1.0;
    vec4 w = invVPu * vec4(ndc, nearest * 2.0 - 1.0, 1.0);
    w /= w.w;
    vec4 pc = prevVPu * w;
    vec2 puv = (pc.xy / pc.w) * 0.5 + 0.5;
    if (all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0))) && pc.w > 0.0) {
      vec4 h4 = histCR(puv);
      vec3 h = h4.rgb;
      // Clamp to the local colour range (variance box inside min/max).
      vec3 lo = mean - 2.0 * sd, hi = mean + 2.0 * sd;
      lo = min(lo, curC); hi = max(hi, curC);
      lo = max(lo, mn - 0.04); hi = min(hi, mx + 0.04);
      vec3 hc = clamp(h, min(lo, hi), max(lo, hi));
      float clipped = clamp(length(h - hc) * 4.0, 0.0, 1.0);
      float motion = length((puv - gl_FragCoord.xy / outSize) * outSize);
      // Less history when it was clamped hard or the pixel moved a lot.
      a = clamp(0.07 + clipped * 0.35 + motion * motionK, 0.07, 1.0);
      res = mix(hc, curC, a);
      resA = mix(h4.a, curA, a);
    }
  }
  outColor = vec4(res, resA);
}
`

const RCAS_FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tDiffuse;
uniform vec2 outSize;
uniform float rcasCon;
out vec4 outColor;
vec3 ld(ivec2 p) {
  return texelFetch(tDiffuse, clamp(p, ivec2(0), ivec2(outSize) - 1), 0).rgb;
}
float ldA(ivec2 p) {
  return texelFetch(tDiffuse, clamp(p, ivec2(0), ivec2(outSize) - 1), 0).a;
}
float lum(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 e = ld(ip), b = ld(ip + ivec2(0, -1)), d = ld(ip + ivec2(-1, 0));
  vec3 f = ld(ip + ivec2(1, 0)), h = ld(ip + ivec2(0, 1));
  float bL = lum(b), dL = lum(d), eL = lum(e), fL = lum(f), hL = lum(h);
  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float range = max(max(max(bL, dL), max(eL, fL)), hL) - min(min(min(bL, dL), min(eL, fL)), hL);
  nz = 1.0 - 0.5 * clamp(abs(nz) / max(range, 1e-5), 0.0, 1.0);
  vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
  vec3 l3 = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(max(l3.r, l3.g), l3.b), 0.0)) * rcasCon * nz;
  outColor = vec4(clamp((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 0.0, 1.0), ldA(ip));
}
`

const halton = (i: number, b: number) => {
  let f = 1,
    r = 0
  for (let n = i; n > 0; n = Math.floor(n / b)) {
    f /= b
    r += f * (n % b)
  }
  return r
}
const PHASES = 16
const JITTER_SCALE = 0.6

export class TemporalUpscalePass extends Pass {
  private readonly resMat: THREE.RawShaderMaterial
  private readonly rcasMat: THREE.RawShaderMaterial
  private readonly resQuad: FullScreenQuad
  private readonly rcasQuad: FullScreenQuad
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null
  private cur = 0
  private frame = 0
  private hasHist = false
  private readonly unjVP = new THREE.Matrix4()
  private readonly prevVP = new THREE.Matrix4()
  private readonly proj = new THREE.Matrix4()
  private srcW = 1
  private srcH = 1
  readonly jitter = new THREE.Vector2()

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly getDepth: () => THREE.DepthTexture | null,
  ) {
    super()
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms,
        vertexShader: VERT,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
      })
    this.resMat = mk(RESOLVE_FRAG, {
      tCur: { value: null },
      tDepth: { value: null },
      tHist: { value: null },
      srcSize: { value: new THREE.Vector2(1, 1) },
      outSize: { value: new THREE.Vector2(1, 1) },
      jitter: { value: this.jitter },
      invVPu: { value: new THREE.Matrix4() },
      prevVPu: { value: new THREE.Matrix4() },
      histOn: { value: 0 },
      motionK: { value: 0.01 },
    })
    this.rcasMat = mk(RCAS_FRAG, {
      tDiffuse: { value: null },
      outSize: { value: new THREE.Vector2(1, 1) },
      rcasCon: { value: Math.pow(2, -(RCAS_SHARPNESS + 0.6)) },
    })
    this.resQuad = new FullScreenQuad(this.resMat)
    this.rcasQuad = new FullScreenQuad(this.rcasMat)
  }

  setSizes(srcW: number, srcH: number, outW: number, outH: number) {
    this.srcW = srcW
    this.srcH = srcH
    this.resMat.uniforms.srcSize.value.set(srcW, srcH)
    this.resMat.uniforms.outSize.value.set(outW, outH)
    this.rcasMat.uniforms.outSize.value.set(outW, outH)
    if (!this.hist || this.hist[0].width !== outW || this.hist[0].height !== outH) {
      this.hist?.forEach((t) => t.dispose())
      const mk = () =>
        new THREE.WebGLRenderTarget(outW, outH, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
        })
      this.hist = [mk(), mk()]
      this.hasHist = false
    }
  }

  setSize() {}

  reset() {
    this.hasHist = false
  }

  beginFrame(): () => void {
    const i = this.frame % PHASES
    this.jitter.set(
      (halton(i + 1, 2) - 0.5) * JITTER_SCALE,
      (halton(i + 1, 3) - 0.5) * JITTER_SCALE,
    )
    const e = this.camera.projectionMatrix.elements
    const e8 = e[8],
      e9 = e[9]
    this.proj.copy(this.camera.projectionMatrix)
    e[8] += (this.jitter.x * 2) / this.srcW
    e[9] += (this.jitter.y * 2) / this.srcH
    this.camera.updateMatrixWorld()
    const view = this.camera.matrixWorldInverse
    this.unjVP.multiplyMatrices(this.proj, view)
    return () => {
      e[8] = e8
      e[9] = e9
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    if (!this.hist) return
    const rd = this.hist[this.cur]
    const wr = this.hist[1 - this.cur]
    const u = this.resMat.uniforms
    u.tCur.value = readBuffer.texture
    u.tDepth.value = this.getDepth()
    if (!u.tDepth.value) return
    u.tHist.value = rd.texture
    u.invVPu.value.copy(this.unjVP).invert()
    u.prevVPu.value.copy(this.prevVP)
    u.histOn.value = this.hasHist ? 1 : 0
    renderer.setRenderTarget(wr)
    this.resQuad.render(renderer)
    this.rcasMat.uniforms.tDiffuse.value = wr.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.rcasQuad.render(renderer)
    this.cur = 1 - this.cur
    this.prevVP.copy(this.unjVP)
    this.hasHist = true
    this.frame++
  }

  dispose() {
    this.hist?.forEach((t) => t.dispose())
    this.resMat.dispose()
    this.rcasMat.dispose()
    this.resQuad.dispose()
    this.rcasQuad.dispose()
  }
}
