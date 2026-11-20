import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"


export const RCAS_SHARPNESS = 0.2

const VERT = `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const EASU_FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tDiffuse;
uniform vec2 srcSize;
uniform vec2 outSize;
out vec4 outColor;

vec4 ld(ivec2 p) {
  return texelFetch(tDiffuse, clamp(p, ivec2(0), ivec2(srcSize) - 1), 0);
}
// FSR luma approximation (2x): g + 0.5 * (r + b)
float lum(vec3 c) { return c.g + 0.5 * (c.r + c.b); }

// One tap of the windowed, anisotropic lanczos-like kernel.
void tap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len,
         float lob, float clp, vec3 c) {
  vec2 v = vec2(off.x * dir.x + off.y * dir.y,
                off.x * -dir.y + off.y * dir.x);
  v *= len;
  float d2 = min(v.x * v.x + v.y * v.y, clp);
  // lanczos2 approximation without sin() or sqrt()
  float wB = 2.0 / 5.0 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

// Accumulates edge direction and length for one of the four bilinear taps.
//    a
//  b c d
//    e
void setDir(inout vec2 dir, inout float len, vec2 pp, float w,
            float lA, float lB, float lC, float lD, float lE) {
  float lenX = max(abs(lD - lC), abs(lC - lB));
  lenX = 1.0 / max(lenX, 1e-6);
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  len += lenX * lenX * w;
  float lenY = max(abs(lE - lC), abs(lC - lA));
  lenY = 1.0 / max(lenY, 1e-6);
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  len += lenY * lenY * w;
}

void main() {
  vec2 ip = gl_FragCoord.xy - 0.5;
  vec2 scale = srcSize / outSize;
  vec2 pp = ip * scale + (0.5 * scale - 0.5);
  vec2 fp = floor(pp);
  pp -= fp;
  ivec2 o = ivec2(fp);

  //    b c
  //  e f g h
  //  i j k l
  //    n o
  vec4 b4 = ld(o + ivec2( 0, -1));
  vec4 c4 = ld(o + ivec2( 1, -1));
  vec4 e4 = ld(o + ivec2(-1,  0));
  vec4 f4 = ld(o + ivec2( 0,  0));
  vec4 g4 = ld(o + ivec2( 1,  0));
  vec4 h4 = ld(o + ivec2( 2,  0));
  vec4 i4 = ld(o + ivec2(-1,  1));
  vec4 j4 = ld(o + ivec2( 0,  1));
  vec4 k4 = ld(o + ivec2( 1,  1));
  vec4 l4 = ld(o + ivec2( 2,  1));
  vec4 n4 = ld(o + ivec2( 0,  2));
  vec4 o4 = ld(o + ivec2( 1,  2));

  float bL = lum(b4.rgb), cL = lum(c4.rgb), eL = lum(e4.rgb), fL = lum(f4.rgb);
  float gL = lum(g4.rgb), hL = lum(h4.rgb), iL = lum(i4.rgb), jL = lum(j4.rgb);
  float kL = lum(k4.rgb), lL = lum(l4.rgb), nL = lum(n4.rgb), oL = lum(o4.rgb);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  setDir(dir, len, pp, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  setDir(dir, len, pp,        pp.x  * (1.0 - pp.y), cL, fL, gL, hL, kL);
  setDir(dir, len, pp, (1.0 - pp.x) *        pp.y,  fL, iL, jL, kL, nL);
  setDir(dir, len, pp,        pp.x  *        pp.y,  gL, jL, kL, lL, oL);

  // Normalise the direction, cleaning up near zero.
  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = inversesqrt(max(dirR, 1.0 / 32768.0));
  dirR = zro ? 1.0 : dirR;
  dir.x = zro ? 1.0 : dir.x;
  dir *= vec2(dirR);

  // Edge strength {0..2} -> {0..1}, shaped with a square.
  len = len * 0.5;
  len *= len;
  // Stretch the kernel {1 on axes, sqrt(2) on diagonals}.
  float stretch = (dir.x * dir.x + dir.y * dir.y) /
                  max(max(abs(dir.x), abs(dir.y)), 1e-6);
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  // Window shifts from +/-sqrt(2) to slightly beyond 2 with edge strength.
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / lob;

  // Clamp range from the four nearest texels (also de-rings the result).
  vec3 min4 = min(min(f4.rgb, g4.rgb), min(j4.rgb, k4.rgb));
  vec3 max4 = max(max(f4.rgb, g4.rgb), max(j4.rgb, k4.rgb));

  vec3 aC = vec3(0.0);
  float aW = 0.0;
  tap(aC, aW, vec2( 0.0, -1.0) - pp, dir, len2, lob, clp, b4.rgb);
  tap(aC, aW, vec2( 1.0, -1.0) - pp, dir, len2, lob, clp, c4.rgb);
  tap(aC, aW, vec2(-1.0,  1.0) - pp, dir, len2, lob, clp, i4.rgb);
  tap(aC, aW, vec2( 0.0,  1.0) - pp, dir, len2, lob, clp, j4.rgb);
  tap(aC, aW, vec2( 0.0,  0.0) - pp, dir, len2, lob, clp, f4.rgb);
  tap(aC, aW, vec2(-1.0,  0.0) - pp, dir, len2, lob, clp, e4.rgb);
  tap(aC, aW, vec2( 1.0,  1.0) - pp, dir, len2, lob, clp, k4.rgb);
  tap(aC, aW, vec2( 2.0,  1.0) - pp, dir, len2, lob, clp, l4.rgb);
  tap(aC, aW, vec2( 2.0,  0.0) - pp, dir, len2, lob, clp, h4.rgb);
  tap(aC, aW, vec2( 1.0,  0.0) - pp, dir, len2, lob, clp, g4.rgb);
  tap(aC, aW, vec2( 1.0,  2.0) - pp, dir, len2, lob, clp, o4.rgb);
  tap(aC, aW, vec2( 0.0,  2.0) - pp, dir, len2, lob, clp, n4.rgb);

  vec3 pix = min(max4, max(min4, aC / max(aW, 1e-6)));
  float a = mix(mix(f4.a, g4.a, pp.x), mix(j4.a, k4.a, pp.x), pp.y);
  outColor = vec4(pix, a);
}
`

const RCAS_FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tDiffuse;
uniform vec2 outSize;
uniform float rcasCon;
out vec4 outColor;

vec4 ld(ivec2 p) {
  return texelFetch(tDiffuse, clamp(p, ivec2(0), ivec2(outSize) - 1), 0);
}
float lum(vec3 c) { return c.g + 0.5 * (c.r + c.b); }

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  //    b
  //  d e f
  //    h
  vec4 e4 = ld(ip);
  vec3 b = ld(ip + ivec2( 0, -1)).rgb;
  vec3 d = ld(ip + ivec2(-1,  0)).rgb;
  vec3 f = ld(ip + ivec2( 1,  0)).rgb;
  vec3 h = ld(ip + ivec2( 0,  1)).rgb;
  vec3 e = e4.rgb;

  float bL = lum(b), dL = lum(d), eL = lum(e), fL = lum(f), hL = lum(h);

  // Noise detection: how far the centre sits from its neighbours' mean,
  // relative to the local range. Noisy pixels get less sharpening.
  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float range = max(max(max(bL, dL), max(eL, fL)), hL) -
                min(min(min(bL, dL), min(eL, fL)), hL);
  nz = clamp(abs(nz) / max(range, 1e-5), 0.0, 1.0);
  nz = 1.0 - 0.5 * nz;

  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  // How negative the lobe can go before the result leaves [0,1].
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
  vec3 lobe3 = max(-hitMin, hitMax);
  // 0.25 - 1/16
  float lobe = max(-0.1875, min(max(max(lobe3.r, lobe3.g), lobe3.b), 0.0)) * rcasCon;
  lobe *= nz;

  vec3 pix = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  outColor = vec4(clamp(pix, 0.0, 1.0), e4.a);
}
`

export class UpscalePass extends Pass {
  private readonly easuMat: THREE.RawShaderMaterial
  private readonly rcasMat: THREE.RawShaderMaterial
  private readonly easuQuad: FullScreenQuad
  private readonly rcasQuad: FullScreenQuad
  private rt: THREE.WebGLRenderTarget | null = null

  constructor() {
    super()
    this.easuMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
        srcSize: { value: new THREE.Vector2(1, 1) },
        outSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: EASU_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.rcasMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
        outSize: { value: new THREE.Vector2(1, 1) },
        rcasCon: { value: Math.pow(2, -RCAS_SHARPNESS) },
      },
      vertexShader: VERT,
      fragmentShader: RCAS_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.easuQuad = new FullScreenQuad(this.easuMat)
    this.rcasQuad = new FullScreenQuad(this.rcasMat)
  }

  setSizes(srcW: number, srcH: number, outW: number, outH: number) {
    this.easuMat.uniforms.srcSize.value.set(srcW, srcH)
    this.easuMat.uniforms.outSize.value.set(outW, outH)
    this.rcasMat.uniforms.outSize.value.set(outW, outH)
    if (!this.rt || this.rt.width !== outW || this.rt.height !== outH) {
      this.rt?.dispose()
      this.rt = new THREE.WebGLRenderTarget(outW, outH, {
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      })
    }
  }

  setSize() {}

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    if (!this.rt) return
    this.easuMat.uniforms.tDiffuse.value = readBuffer.texture
    renderer.setRenderTarget(this.rt)
    this.easuQuad.render(renderer)
    this.rcasMat.uniforms.tDiffuse.value = this.rt.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.rcasQuad.render(renderer)
  }

  dispose() {
    this.rt?.dispose()
    this.easuMat.dispose()
    this.rcasMat.dispose()
    this.easuQuad.dispose()
    this.rcasQuad.dispose()
  }
}
