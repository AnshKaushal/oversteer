import * as THREE from "three"

const SIZE = 2048
const S = SIZE / 256

/** Paints the road's asphalt (base, worn patches, grain) over a w×h canvas. */
export function paintAsphalt(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale = S,
) {
  const density = (w * h) / (SIZE * SIZE)
  g.fillStyle = "#33363b"
  g.fillRect(0, 0, w, h)
  // low-frequency tonal patches (worn / patched asphalt)
  for (let i = 0, n = Math.round(260 * density); i < n; i++) {
    const v = 46 + Math.random() * 10
    g.fillStyle = `rgba(${v},${v},${v + 4},0.22)`
    const r = (6 + Math.random() * 22) * scale
    g.beginPath()
    g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2)
    g.fill()
  }
  // fine aggregate grain
  for (let i = 0, n = Math.round(260000 * density); i < n; i++) {
    const v = 32 + Math.random() * 40
    g.fillStyle = `rgb(${v},${v},${v + 4})`
    const s = Math.random() < 0.8 ? 1.5 : 3
    g.fillRect(Math.random() * w, Math.random() * h, s, s)
  }
}

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = SIZE
  c.height = SIZE
  const g = c.getContext("2d")!
  paintAsphalt(g, SIZE, SIZE)
  g.fillStyle = "#e8e8e8"
  g.fillRect(8 * S, 0, 5 * S, SIZE)
  g.fillRect(243 * S, 0, 5 * S, SIZE)
  g.fillStyle = "#d8b93a"
  g.fillRect(124 * S, 0, 4 * S, SIZE)
  g.fillRect(132 * S, 0, 4 * S, SIZE)
  g.fillStyle = "#cfcfcf"
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(70 * S, y * S, 4 * S, 32 * S)
    g.fillRect(182 * S, y * S, 4 * S, 32 * S)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 16
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
