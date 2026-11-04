import type * as THREE from "three"

// For additive glows: fog fades the light out instead of tinting it toward the fog colour,
// so lamps and beacons disappear into fog like real distant lights.
export function fadeWithFog<T extends THREE.Material & { fog: boolean }>(m: T): T {
  m.fog = true
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
#endif`,
    )
  }
  m.customProgramCacheKey = () => "fogFade"
  return m
}
