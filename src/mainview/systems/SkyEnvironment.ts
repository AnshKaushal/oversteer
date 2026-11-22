import * as THREE from "three"

const GRADIENT_VS = `varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const GRADIENT_FS = `uniform vec3 top;
uniform vec3 horizon;
uniform vec3 ground;
varying vec3 vDir;
void main() {
  float up = smoothstep(0.0, 0.6, vDir.y);
  float down = smoothstep(0.0, -0.35, vDir.y);
  vec3 c = mix(horizon, top, up);
  c = mix(c, ground, down);
  gl_FragColor = vec4(c, 1.0);
}`

export class SkyEnvironment {
  private readonly pmrem: THREE.PMREMGenerator
  private readonly bake = new THREE.Scene()
  private readonly uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color() },
  }
  private readonly sunMesh: THREE.Mesh
  private readonly sunMat: THREE.MeshBasicMaterial
  private readonly cache = new Map<string, THREE.WebGLRenderTarget>()
  private key = ""
  private sun: THREE.DirectionalLight | null = null
  private readonly dir = new THREE.Vector3()
  private readonly white = new THREE.Color(0xffffff)

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: GRADIENT_VS,
        fragmentShader: GRADIENT_FS,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.bake.add(dome)
    this.sunMat = new THREE.MeshBasicMaterial({ toneMapped: false })
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), this.sunMat)
    this.bake.add(this.sunMesh)
  }

  refresh(scene: THREE.Scene) {
    const bg =
      scene.background instanceof THREE.Color ? scene.background : null
    const fog = scene.fog?.color ?? bg
    if (!bg || !fog) return
    let s = this.sun
    if (!s || !s.parent) {
      s = null
      scene.traverse((o) => {
        if (!s && (o as THREE.DirectionalLight).isDirectionalLight)
          s = o as THREE.DirectionalLight
      })
      this.sun = s
    }
    const dir = this.dir
    if (s) dir.copy(s.position).sub(s.target.position).normalize()
    const key = [
      bg.getHex(),
      fog.getHex(),
      s ? s.color.getHex() : "",
      s ? Math.round(s.intensity * 100) : "",
      s ? `${Math.round(dir.x * 100)},${Math.round(dir.y * 100)},${Math.round(dir.z * 100)}` : "",
    ].join("|")
    if (key === this.key) return
    this.key = key

    let target = this.cache.get(key)
    if (target) {
      this.cache.delete(key)
      this.cache.set(key, target)
    } else {
      this.uniforms.top.value.copy(bg)
      this.uniforms.horizon.value
        .copy(fog)
        .lerp(this.white, 0.25)
      this.uniforms.ground.value.copy(fog).multiplyScalar(0.35)
      if (s) {
        this.sunMesh.position.copy(dir).multiplyScalar(40)
        this.sunMat.color
          .copy(s.color)
          .multiplyScalar(Math.max(1, s.intensity) * 6)
        this.sunMesh.visible = s.intensity > 0.05
      } else this.sunMesh.visible = false
      target = this.pmrem.fromScene(this.bake, 0.02)
      this.cache.set(key, target)
      if (this.cache.size > 8) {
        const oldest = this.cache.keys().next().value!
        this.cache.get(oldest)!.dispose()
        this.cache.delete(oldest)
      }
    }
    scene.environment = target.texture
    scene.environmentIntensity = 0.55
  }

  dispose() {
    for (const t of this.cache.values()) t.dispose()
    this.cache.clear()
    this.pmrem.dispose()
  }
}
