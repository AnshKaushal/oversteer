import * as THREE from "three"

/** Cone half-angles (radians) of car headlight spots. */
export const HEADLIGHT_CONE = Math.PI / 4.2
export const NPC_HEADLIGHT_CONE = Math.PI / 3.0

/**
 * A real low beam has a sharp cutoff just above the horizon: wide to the
 * sides and down, almost no light thrown upward. A three.js spot is a plain
 * cone, so it lights anything up to its full half-angle above the axis.
 * Elevation is the sine of the angle above the beam axis, so the cutoff
 * follows the car's pitch and uphill roads stay lit.
 */
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
