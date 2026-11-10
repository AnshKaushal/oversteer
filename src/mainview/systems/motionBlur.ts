import * as THREE from "three";
import {
  Pass,
  FullScreenQuad,
} from "three/examples/jsm/postprocessing/Pass.js";

const SAMPLES = 10;

/** Camera-motion blur: reprojects each pixel's depth into the previous frame. */
const MASK_LAYER = 5;

export class MotionBlurPass extends Pass {
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  private prevVP = new THREE.Matrix4();
  private vp = new THREE.Matrix4();
  private hasPrev = false;
  strength = 0;
  /** Objects whose pixels must stay sharp (the player's car, nearby cars). */
  maskRoots: THREE.Object3D[] = [];
  private masked = new Set<THREE.Object3D>();
  private maskTarget = new THREE.WebGLRenderTarget(1, 1);
  private maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private savedLayers = new THREE.Layers();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private depth: THREE.DepthTexture,
  ) {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        tMask: { value: null },
        invVP: { value: new THREE.Matrix4() },
        prevVP: { value: new THREE.Matrix4() },
        strength: { value: 0 },
      },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse, tDepth, tMask;
        uniform mat4 invVP, prevVP;
        uniform float strength;
        varying vec2 vUv;
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          if (texture2D(tMask, vUv).r > 0.5) { gl_FragColor = base; return; }
          float d = texture2D(tDepth, vUv).x;
          vec4 cur = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 w = invVP * cur; w /= w.w;
          vec4 p = prevVP * w; vec2 prevUv = (p.xy / p.w) * 0.5 + 0.5;
          vec2 v = (vUv - prevUv) * strength;
          float len = length(v);
          if (len > 0.08) v *= 0.08 / len;
          vec4 sum = vec4(0.0);
          for (int i = 0; i < ${SAMPLES}; i++) {
            float t = float(i) / float(${SAMPLES - 1}) - 0.5;
            vec2 uv = clamp(vUv + v * t, 0.001, 0.999);
            // don't smear the car into the surroundings
            sum += texture2D(tMask, uv).r > 0.5 ? base : texture2D(tDiffuse, uv);
          }
          gl_FragColor = sum / float(${SAMPLES});
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.camera.updateMatrixWorld();
    this.vp.multiplyMatrices(
      (this.camera as THREE.PerspectiveCamera).projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.renderMask(renderer, readBuffer.width, readBuffer.height);
    const u = this.mat.uniforms;
    u.tMask.value = this.maskTarget.texture;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture ?? this.depth;
    u.invVP.value.copy(this.vp).invert();
    u.prevVP.value.copy(this.hasPrev ? this.prevVP : this.vp);
    u.strength.value = this.strength;
    this.prevVP.copy(this.vp);
    this.hasPrev = true;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  private renderMask(r: THREE.WebGLRenderer, w: number, h: number) {
    if (this.maskTarget.width !== w || this.maskTarget.height !== h)
      this.maskTarget.setSize(w, h);
    const roots = this.maskRoots;
    const next = new Set(roots);
    for (const old of this.masked)
      if (!next.has(old))
        old.traverse((o) => o.layers.disable(MASK_LAYER));
    for (const root of roots)
      root.traverse((o) => {
        if (!o.layers.isEnabled(MASK_LAYER)) o.layers.enable(MASK_LAYER);
      });
    this.masked = next;
    this.savedLayers.mask = this.camera.layers.mask;
    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const sm = r.shadowMap;
    const prevShadowAuto = sm.autoUpdate;
    const prevShadowNeeds = sm.needsUpdate;
    try {
      this.camera.layers.set(MASK_LAYER);
      this.scene.overrideMaterial = this.maskMat;
      this.scene.background = null;
      this.scene.fog = null;
      // The mask is a flat silhouette: it must not re-run the shadow pass, which
      // would rebuild the shadow maps from this one layer and leave them wrong
      // (or consume a pending shadow update) for the real scene.
      sm.autoUpdate = false;
      sm.needsUpdate = false;
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(this.maskTarget);
      r.clear();
      if (roots.length > 0) r.render(this.scene, this.camera);
    } finally {
      sm.autoUpdate = prevShadowAuto;
      sm.needsUpdate = prevShadowNeeds;
      r.setClearColor(prevClear, prevAlpha);
      this.scene.overrideMaterial = prevOverride;
      this.scene.background = prevBg;
      this.scene.fog = prevFog;
      this.camera.layers.mask = this.savedLayers.mask;
    }
  }

  dispose() {
    this.maskTarget.dispose();
    this.maskMat.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
