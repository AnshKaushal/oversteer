import * as THREE from "three"
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"

const VERT = `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tDepth;
uniform vec4 proj;
uniform vec2 size;
uniform float radius, intensity, phase;
uniform int taps;
out vec4 outColor;

vec3 viewPos(ivec2 p, out bool sky) {
  p = clamp(p, ivec2(0), ivec2(size) - 1);
  float d = texelFetch(tDepth, p, 0).x;
  sky = d >= 0.99999;
  float zv = -proj.w / (d * 2.0 - 1.0 + proj.z);
  vec2 ndc = (vec2(p) + 0.5) / size * 2.0 - 1.0;
  return vec3(ndc / proj.xy * (-zv), zv);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy) * 2;
  bool sky, s;
  vec3 p = viewPos(ip, sky);
  float dist = -p.z;
  if (sky || dist > 80.0) { outColor = vec4(1.0); return; }
  float rpx = radius * proj.y * size.y * 0.5 / dist;
  if (rpx < 1.5) { outColor = vec4(1.0); return; }
  rpx = min(rpx, 48.0);

  vec3 pl = viewPos(ip + ivec2(-1, 0), s), pr = viewPos(ip + ivec2(1, 0), s);
  vec3 pu = viewPos(ip + ivec2(0, 1), s), pd = viewPos(ip + ivec2(0, -1), s);
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  if (n.z < 0.0) n = -n;

  // Interleaved gradient noise. phase = 0 gives a fixed pattern (no upscaler);
  // with the temporal upscaler phase changes every frame so the noise is
  // averaged through the history instead of sitting fixed on the screen while
  // the scene moves underneath it.
  float ign = fract(52.9829189 * fract(dot(vec2(ip) + phase * 5.588238, vec2(0.06711056, 0.00583715))));
  float a0 = ign * 6.2831853;
  float occ = 0.0;
  int N = taps;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    float ang = a0 + t * 6.2831853 * 3.0;
    float r = (0.15 + 0.85 * t) * rpx;
    ivec2 q = ip + ivec2(floor(vec2(cos(ang), sin(ang)) * r + 0.5));
    vec3 sp = viewPos(q, s);
    vec3 v = sp - p;
    float d2 = dot(v, v);
    float vn = dot(v, n) - 0.03 * dist * 0.1;
    occ += max(vn, 0.0) / (d2 + 0.01 * radius * radius) * radius
         * (1.0 - clamp(d2 / (4.0 * radius * radius), 0.0, 1.0));
  }
  float ao = 1.0 - clamp(intensity * occ / float(N) * 2.0, 0.0, 0.85);
  ao = mix(1.0, ao, 1.0 - smoothstep(40.0, 80.0, dist));
  outColor = vec4(ao, 0.0, 0.0, 1.0);
}
`

const COPY_FRAG = `
precision highp float;
precision highp int;
uniform highp sampler2D tDepth;
out vec4 outColor;
void main() {
  outColor = vec4(texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).x);
}
`

export class DepthAOPass extends Pass {
  private readonly mat: THREE.RawShaderMaterial
  private readonly quad: FullScreenQuad
  private ao: THREE.WebGLRenderTarget | null = null
  private depthCopy: THREE.WebGLRenderTarget | null = null
  private readonly copyMat: THREE.RawShaderMaterial
  private readonly copyQuad: FullScreenQuad

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly getDepth: () => THREE.DepthTexture | null,
  ) {
    super()
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDepth: { value: null },
        proj: { value: new THREE.Vector4() },
        size: { value: new THREE.Vector2(1, 1) },
        radius: { value: 0.6 },
        intensity: { value: 0 },
        phase: { value: 0 },
        taps: { value: 12 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.copyMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tDepth: { value: null } },
      vertexShader: VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
    this.copyQuad = new FullScreenQuad(this.copyMat)
  }

  animate = false
  private frame = 0

  set intensity(v: number) {
    this.mat.uniforms.intensity.value = v
  }

  setSize() {}

  get depthTexture(): THREE.Texture | null {
    return this.depthCopy ? this.depthCopy.texture : null
  }

  get texture(): THREE.Texture | null {
    return this.ao ? this.ao.texture : null
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    const depth = this.getDepth()
    this.needsSwap = false
    if (!depth) return
    const w = readBuffer.width,
      h = readBuffer.height
    const aw = Math.max(1, (w + 1) >> 1),
      ah = Math.max(1, (h + 1) >> 1)
    if (!this.ao || this.ao.width !== aw || this.ao.height !== ah) {
      this.ao?.dispose()
      this.ao = new THREE.WebGLRenderTarget(aw, ah, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
      })
    }
    if (
      !this.depthCopy ||
      this.depthCopy.width !== w ||
      this.depthCopy.height !== h
    ) {
      this.depthCopy?.dispose()
      this.depthCopy = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.FloatType,
        format: THREE.RedFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
      })
    }
    this.copyMat.uniforms.tDepth.value = depth
    renderer.setRenderTarget(this.depthCopy)
    this.copyQuad.render(renderer)
    const u = this.mat.uniforms
    u.tDepth.value = depth
    const e = this.camera.projectionMatrix.elements
    u.proj.value.set(e[0], e[5], e[10], e[14])
    u.size.value.set(w, h)
    u.phase.value = this.animate ? this.frame++ % 16 : 0
    u.taps.value = this.animate ? 8 : 12
    renderer.setRenderTarget(this.ao)
    this.quad.render(renderer)
  }

  dispose() {
    this.ao?.dispose()
    this.depthCopy?.dispose()
    this.copyMat.dispose()
    this.copyQuad.dispose()
    this.mat.dispose()
    this.quad.dispose()
  }
}
