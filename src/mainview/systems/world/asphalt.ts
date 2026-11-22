import * as THREE from "three"

const SIZE = 2048
const S = SIZE / 256

export function paintAsphalt(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale = S,
) {
  const density = (w * h) / (SIZE * SIZE)
  g.fillStyle = "#33363b"
  g.fillRect(0, 0, w, h)
  for (let i = 0, n = Math.round(260 * density); i < n; i++) {
    const v = 46 + Math.random() * 10
    g.fillStyle = `rgba(${v},${v},${v + 4},0.22)`
    const r = (6 + Math.random() * 22) * scale
    g.beginPath()
    g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2)
    g.fill()
  }
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
  const edge = "#a4a4a1"
  const yellow = "#a38526"
  const dash = "#9a9a98"
  g.fillStyle = edge
  g.fillRect(8 * S, 0, 5 * S, SIZE)
  g.fillRect(243 * S, 0, 5 * S, SIZE)
  g.fillStyle = yellow
  g.fillRect(124 * S, 0, 4 * S, SIZE)
  g.fillRect(132 * S, 0, 4 * S, SIZE)
  g.fillStyle = dash
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(70 * S, y * S, 4 * S, 32 * S)
    g.fillRect(182 * S, y * S, 4 * S, 32 * S)
  }
  const lines: [number, number][] = [
    [8, 5],
    [243, 5],
    [124, 4],
    [132, 4],
    [70, 4],
    [182, 4],
  ]
  for (const [x, w] of lines) {
    for (let i = 0; i < 2600; i++) {
      const v = 38 + Math.random() * 30
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.35 + Math.random() * 0.4})`
      const sz = Math.random() < 0.85 ? 1.5 : 3
      g.fillRect((x + Math.random() * w) * S, Math.random() * SIZE, sz, sz)
    }
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
