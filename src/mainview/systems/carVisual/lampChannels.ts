import * as THREE from "three"

export interface LampChannels {
  head: { value: number }
  tail: { value: number }
}

const REVERSE_U = 0.135

const FRAGMENT =  `
#ifdef USE_EMISSIVEMAP
	vec3 lampTexel = texture2D( emissiveMap, vEmissiveMapUv ).rgb;
	float lampLow = min( lampTexel.r, min( lampTexel.g, lampTexel.b ) );
	float lampWhite = smoothstep( 0.35, 0.65, lampLow );
	float lampRed = smoothstep( 0.35, 0.65, lampTexel.r ) * ( 1.0 - smoothstep( 0.2, 0.5, max( lampTexel.g, lampTexel.b ) ) );
	float lampReverse = 1.0 - step( ${REVERSE_U.toFixed(3)}, vEmissiveMapUv.x );
	float lampGain = uLampHead * lampWhite * ( 1.0 - lampReverse ) + uLampTail * lampRed;
	totalEmissiveRadiance *= lampTexel * lampGain;
#endif
`

export function enableLampChannels(
  mat: THREE.MeshStandardMaterial,
): LampChannels {
  const existing = mat.userData.lampChannels as LampChannels | undefined
  if (existing) return existing
  const ch: LampChannels = { head: { value: 0 }, tail: { value: TAIL_IDLE } }
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    shader.uniforms.uLampHead = ch.head
    shader.uniforms.uLampTail = ch.tail
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform float uLampHead;\nuniform float uLampTail;\nvoid main() {",
      )
      .replace("#include <emissivemap_fragment>", FRAGMENT)
  }
  mat.customProgramCacheKey = () => "lampChannels"
  mat.userData.lampChannels = ch
  mat.needsUpdate = true
  return ch
}

const HEAD_GAIN = 6
const TAIL_IDLE = 0.3
const TAIL_ON = 0.6
const BRAKE_GAIN = 2

export function setLampChannels(
  ch: LampChannels,
  lit: boolean,
  power: number,
  dim: number,
  brake: number,
) {
  ch.head.value = lit ? HEAD_GAIN * power * dim : 0
  ch.tail.value = Math.max(
    lit ? TAIL_ON * power : TAIL_IDLE,
    BRAKE_GAIN * brake,
  )
}
