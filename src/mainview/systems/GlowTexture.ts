import * as THREE from "three"

export function makeGlowTexture(
  stops: [number, number][],
  size = 128,
  srgb = false,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  const alphaAt = (r: number) => {
    if (r >= 1) return 0
    for (let i = 1; i < stops.length; i++) {
      if (r <= stops[i][0]) {
        const [r0, a0] = stops[i - 1]
        const [r1, a1] = stops[i]
        const u = (r - r0) / Math.max(r1 - r0, 1e-6)
        const k = u * u * (3 - 2 * u)
        return a0 + (a1 - a0) * (0.5 * u + 0.5 * k)
      }
    }
    return 0
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(alphaAt(r) * 255)
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.flipY = false
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
