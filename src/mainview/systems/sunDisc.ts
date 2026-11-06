import * as THREE from "three"

const SIZE = 256
export const SUN_SPRITE_SCALE = 56

export function createSunDisc(color: number): THREE.Sprite {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, fog: false, transparent: true, depthWrite: false }),
  )
  sprite.userData.blur = -1
  setSunBlur(sprite, 0)
  return sprite
}

export function setSunBlur(sprite: THREE.Sprite, haze: number) {
  const blur = Math.round(Math.min(1, Math.max(0, haze)) * 50) / 50
  if (sprite.userData.blur === blur) return
  sprite.userData.blur = blur
  const mat = sprite.material as THREE.SpriteMaterial
  const tex = mat.map as THREE.CanvasTexture
  const ctx = (tex.image as HTMLCanvasElement).getContext("2d")!
  const c = SIZE / 2
  ctx.clearRect(0, 0, SIZE, SIZE)
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.48 * (1 - 0.8 * blur), "rgba(255,255,255,1)")
  g.addColorStop(0.5, `rgba(255,255,255,${1 - 0.85 * blur})`)
  g.addColorStop(0.52 + 0.45 * blur, "rgba(255,255,255,0)")
  g.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
  tex.needsUpdate = true
}
