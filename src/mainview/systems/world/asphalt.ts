import * as THREE from "three"

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 256
  c.height = 256
  const g = c.getContext("2d")!
  g.fillStyle = "#33363b"
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2500; i++) {
    const v = 40 + Math.random() * 25
    g.fillStyle = `rgb(${v},${v},${v + 4})`
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  g.fillStyle = "#e8e8e8"
  g.fillRect(8, 0, 5, 256)
  g.fillRect(243, 0, 5, 256)
  g.fillStyle = "#d8b93a"
  g.fillRect(124, 0, 4, 256)
  g.fillRect(132, 0, 4, 256)
  g.fillStyle = "#cfcfcf"
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(70, y, 4, 32)
    g.fillRect(182, y, 4, 32)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
