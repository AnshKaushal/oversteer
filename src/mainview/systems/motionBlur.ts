import * as THREE from "three";
import {
  Pass,
  FullScreenQuad,
} from "three/examples/jsm/postprocessing/Pass.js";

const SAMPLES = 10;

const MASK_LAYER = 5;

export class MotionBlurPass extends Pass {
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  private prevVP = new THREE.Matrix4();
  private vp = new THREE.Matrix4();
  private hasPrev = false;
  strength = 0;
  maskRoots: THREE.Object3D[] = [];
  private masked: THREE.Object3D[] = [];
  private maskAge = 0;
  private prevClear = new THREE.Color();
  private footGeo = new THREE.PlaneGeometry(1, 1);
  private foot: THREE.Mesh[] = [];
  private footDims: { w: number; l: number }[] = [];
  private box = new THREE.Box3();
  private bsize = new THREE.Vector3();
  private fq = new THREE.Quaternion();
  private fq0 = new THREE.Quaternion();
  private fe = new THREE.Euler();
  private fp = new THREE.Vector3();
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
    if (this.hasPrev) {
      const a = this.vp.elements,
        b = this.prevVP.elements
      let d = 0
      for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(a[i] - b[i]))
      if (d < 1e-6) {
        this.needsSwap = false
        return
      }
    }
    this.needsSwap = true
    this.renderMask(
      renderer,
      Math.max(1, readBuffer.width >> 1),
      Math.max(1, readBuffer.height >> 1),
    );
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
    let same = roots.length === this.masked.length
    for (let i = 0; same && i < roots.length; i++)
      if (roots[i] !== this.masked[i]) same = false
    if (!same || ++this.maskAge >= 60) {
      this.maskAge = 0
      for (const old of this.masked)
        if (!roots.includes(old))
          old.traverse((o) => o.layers.disable(MASK_LAYER))
      for (const root of roots)
        root.traverse((o) => {
          if (!o.layers.isEnabled(MASK_LAYER)) o.layers.enable(MASK_LAYER)
        })
      this.masked = roots.slice()
      this.measure(roots)
    }
    this.savedLayers.mask = this.camera.layers.mask;
    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevClear = r.getClearColor(this.prevClear);
    const prevAlpha = r.getClearAlpha();
    const sm = r.shadowMap;
    const prevShadowAuto = sm.autoUpdate;
    const prevShadowNeeds = sm.needsUpdate;
    try {
      this.camera.layers.set(MASK_LAYER);
      this.placeFootprints(roots);
      this.scene.overrideMaterial = this.maskMat;
      this.scene.background = null;
      this.scene.fog = null;
      sm.autoUpdate = false;
      sm.needsUpdate = false;
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(this.maskTarget);
      r.clear();
      if (roots.length > 0) r.render(this.scene, this.camera);
    } finally {
      for (const f of this.foot) f.removeFromParent();
      sm.autoUpdate = prevShadowAuto;
      sm.needsUpdate = prevShadowNeeds;
      r.setClearColor(prevClear, prevAlpha);
      this.scene.overrideMaterial = prevOverride;
      this.scene.background = prevBg;
      this.scene.fog = prevFog;
      this.camera.layers.mask = this.savedLayers.mask;
    }
  }

  private measure(roots: THREE.Object3D[]) {
    this.footDims.length = 0;
    for (const root of roots) {
      this.fq0.copy(root.quaternion);
      root.quaternion.identity();
      root.updateMatrixWorld(true);
      this.box.setFromObject(root);
      root.quaternion.copy(this.fq0);
      root.updateMatrixWorld(true);
      this.box.getSize(this.bsize);
      const ok =
        Number.isFinite(this.bsize.x) &&
        this.bsize.x > 0.5 &&
        this.bsize.z > 0.5 &&
        this.bsize.x < 12 &&
        this.bsize.z < 20;
      this.footDims.push({
        w: ok ? this.bsize.x : 2,
        l: ok ? this.bsize.z : 4.5,
      });
    }
  }

  private placeFootprints(roots: THREE.Object3D[]) {
    while (this.foot.length < roots.length) {
      const m = new THREE.Mesh(this.footGeo, this.maskMat);
      m.rotation.order = "YXZ";
      m.layers.set(MASK_LAYER);
      m.frustumCulled = false;
      this.foot.push(m);
    }
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      const f = this.foot[i];
      const d = this.footDims[i] ?? { w: 2, l: 4.5 };
      root.getWorldPosition(this.fp);
      root.getWorldQuaternion(this.fq);
      const yaw = this.fe.setFromQuaternion(this.fq, "YXZ").y;
      f.position.set(this.fp.x, this.fp.y + 0.05, this.fp.z);
      f.rotation.set(-Math.PI / 2, yaw, 0);
      f.scale.set(d.w * 1.6, d.l * 1.8, 1);
      this.scene.add(f);
    }
  }

  dispose() {
    this.footGeo.dispose();
    this.maskTarget.dispose();
    this.maskMat.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
