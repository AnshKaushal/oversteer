import * as THREE from "three"

export const HEADLIGHT_CONE = Math.PI / 3.2
export const NPC_HEADLIGHT_CONE = Math.PI / 3.0

const FULL_BELOW = Math.sin((1 * Math.PI) / 180)
const NONE_ABOVE = Math.sin((6 * Math.PI) / 180)

const MARK = "// headlight-cutoff"

const glsl = (n: number) => n.toFixed(6)

export function installHeadlightCutoff() {
  const chunk = THREE.ShaderChunk.lights_pars_begin
  if (chunk.includes(MARK)) return
  const needle =
    "float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );"
  if (!chunk.includes(needle)) {
    console.warn("headlight cutoff: spot light shader changed, not patched")
    return
  }
  const isHeadlight = [HEADLIGHT_CONE, NPC_HEADLIGHT_CONE]
    .map((a) => `abs( spotLight.coneCos - ${glsl(Math.cos(a))} ) < 0.001`)
    .join(" || ")
  THREE.ShaderChunk.lights_pars_begin = chunk.replace(
    needle,
    `${needle}
		${MARK}
		if ( ${isHeadlight} ) {
			vec3 upView = viewMatrix[ 1 ].xyz;
			vec3 upPerp = normalize( upView - spotLight.direction * dot( upView, spotLight.direction ) );
			float elevation = - dot( light.direction, upPerp );
			spotAttenuation *= 1.0 - smoothstep( ${glsl(FULL_BELOW)}, ${glsl(NONE_ABOVE)}, elevation );
		}`,
  )
}

installHeadlightCutoff()
