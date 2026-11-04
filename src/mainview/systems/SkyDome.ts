import * as THREE from "three"

export class SkyDome {
  readonly mesh: THREE.Mesh
  private readonly top = { value: new THREE.Color() }
  private readonly horizon = { value: new THREE.Color() }

  constructor(parent: THREE.Object3D) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { top: this.top, horizon: this.horizon },
        vertexShader: `varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: `uniform vec3 top;
uniform vec3 horizon;
varying vec3 vDir;
void main() {
  float t = smoothstep(0.0, 0.55, clamp(vDir.y, 0.0, 1.0));
  gl_FragColor = vec4(mix(horizon, top, t), 1.0);
  #include <colorspace_fragment>
}`,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    parent.add(this.mesh)
  }

  setColors(top: THREE.Color, horizon: THREE.Color) {
    this.top.value.copy(top)
    this.horizon.value.copy(horizon)
  }

  follow(x: number, z: number) {
    this.mesh.position.set(x, 0, z)
  }
}
