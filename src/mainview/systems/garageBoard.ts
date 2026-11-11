import type * as THREE from "three"

// A DOM panel that is pinned onto the garage's wall board. The session
// projects the board's corners every frame and we warp the panel onto them.
let el: HTMLElement | null = null

export const BOARD_W = 600
export const BOARD_H = 364

export function setBoardElement(e: HTMLElement | null) {
  el = e
}

/** Solve the 3x3 homography taking the panel rect to the screen quad. */
function homography(q: number[]): number[] | null {
  const W = BOARD_W
  const H = BOARD_H
  const src = [0, 0, W, 0, W, H, 0, H]
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const x = src[i * 2]
    const y = src[i * 2 + 1]
    const u = q[i * 2]
    const v = q[i * 2 + 1]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++)
      if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-9) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  return A.map((row, i) => row[8] / row[i])
}

const _v: THREE.Vector3[] = []

/**
 * Place the panel over the board. `corners` are world-space TL, TR, BR, BL;
 * `normal` points out of the board's front face.
 */
export function placeBoard(
  corners: THREE.Vector3[],
  normal: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  if (!el) return
  camera.updateMatrixWorld()
  const toCam = camera.position.clone().sub(corners[0])
  let ok = toCam.dot(normal) > 0
  const q: number[] = []
  for (let i = 0; i < 4 && ok; i++) {
    const v = (_v[i] ??= corners[0].clone()).copy(corners[i]).project(camera)
    if (v.z > 1 || v.z < -1) ok = false
    q.push((v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height)
  }
  const h = ok ? homography(q) : null
  if (!h) {
    el.style.visibility = "hidden"
    return
  }
  el.style.transform = `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`
  el.style.visibility = "visible"
}
