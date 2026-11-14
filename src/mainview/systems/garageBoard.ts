import { getFocus } from "./garageFocus"
import * as THREE from "three"
import { SURFACES, type SurfaceId } from "./garageSurfaces"

// DOM screens pinned onto the garage's walls. Every frame the session projects
// each screen's corners and warps its element onto them (a homography), so the
// UI really sits in the room and follows the camera.
interface Entry {
  el: HTMLElement | null
  pill: HTMLElement | null
}
const entries = new Map<SurfaceId, Entry>()
const entry = (id: SurfaceId) => {
  let e = entries.get(id)
  if (!e) entries.set(id, (e = { el: null, pill: null }))
  return e
}

export function setBoardElement(id: SurfaceId, e: HTMLElement | null) {
  entry(id).el = e
}
export const getBoardElement = (id: SurfaceId) => entries.get(id)?.el ?? null
export function setPillElement(id: SurfaceId, e: HTMLElement | null) {
  entry(id).pill = e
}
export const getPillElement = (id: SurfaceId) =>
  entries.get(id)?.pill ?? null

export interface PillPos {
  id: SurfaceId
  x: number
  y: number
}
/** Latest on-screen hotspot positions (px), used for gamepad navigation. */
export const pillPositions = new Map<SurfaceId, PillPos>()

/** Solve the 3x3 homography taking the panel rect to the screen quad. */
function homography(W: number, H: number, q: number[]): number[] | null {
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
const MARGIN = 64
const _c3 = new THREE.Vector3()

/**
 * Place one screen over its wall surface. `corners` are world-space TL, TR, BR,
 * BL; `normal` points out of the front face. Also positions its hotspot pill
 * (clamped to the screen edge when the surface is off-view).
 */
export function placeSurface(
  id: SurfaceId,
  corners: THREE.Vector3[],
  normal: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  showPill: boolean,
): boolean {
  const e = entries.get(id)
  if (!e) return false
  const def = SURFACES.find((s) => s.id === id)!
  const [W, H] = def.px
  camera.updateMatrixWorld()
  const toCam = camera.position.clone().sub(corners[0])
  let ok = toCam.dot(normal) > 0
  const q: number[] = []
  let cx = 0
  let cy = 0
  let behind = false
  for (let i = 0; i < 4; i++) {
    const v = (_v[i] ??= corners[0].clone()).copy(corners[i]).project(camera)
    if (v.z > 1 || v.z < -1) {
      ok = false
      behind = true
    }
    const px = (v.x * 0.5 + 0.5) * width
    const py = (-v.y * 0.5 + 0.5) * height
    q.push(px, py)
    cx += px / 4
    cy += py / 4
  }
  // While a screen is focused it is the only one shown, so nothing can draw
  // over it (the DOM has no depth buffer).
  const focus = getFocus()
  if (focus && focus !== id) ok = false
  const h = ok ? homography(W, H, q) : null
  if (e.el && !def.hud) {
    if (!h) {
      e.el.style.visibility = "hidden"
    } else {
      e.el.style.transform = `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`
      e.el.style.visibility = "visible"
      // Nearer screens draw over farther ones (the DOM has no depth buffer).
      const d = camera.position.distanceTo(
        _c3.copy(corners[0]).lerp(corners[2], 0.5),
      )
      e.el.style.zIndex = String(
        focus === id ? 1950 : Math.max(1, 1900 - Math.round(d * 40)),
      )
    }
  }
  // Hotspot: project the centre; if behind the camera, mirror it so the pill
  // points the way to turn.
  const c = _v[4] ?? (_v[4] = corners[0].clone())
  c.copy(corners[0]).add(corners[2]).multiplyScalar(0.5).project(camera)
  let px = (c.x * 0.5 + 0.5) * width
  let py = (-c.y * 0.5 + 0.5) * height
  if (c.z > 1 || behind) {
    px = width - px
    py = height - py
  }
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    px = width / 2
    py = height / 2
  }
  px = Math.max(MARGIN, Math.min(width - MARGIN, px))
  py = Math.max(MARGIN, Math.min(height - MARGIN, py))
  pillPositions.set(id, { id, x: px, y: py })
  if (e.pill) {
    e.pill.style.transform = `translate3d(${px}px,${py}px,0) translate(-50%,-50%)`
    e.pill.style.visibility = showPill ? "visible" : "hidden"
  }
  return !!h && !def.hud
}

/**
 * Nudge hotspot pills apart so none covers another. Run once per frame after
 * every surface is placed; positions are recomputed from scratch each frame so
 * the result is stable, and gamepad navigation sees the nudged positions.
 */
export function resolvePills(width: number, height: number) {
  const items: { p: PillPos; hw: number; hh: number; e: Entry }[] = []
  for (const s of SURFACES) {
    const p = pillPositions.get(s.id)
    const e = entries.get(s.id)
    if (!p || !e?.pill || e.pill.style.visibility === "hidden") continue
    items.push({
      p,
      e,
      hw: e.pill.offsetWidth / 2 + 6,
      hh: e.pill.offsetHeight / 2 + 6,
    })
  }
  if (items.length < 2) return
  for (let it = 0; it < 12; it++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const dx = b.p.x - a.p.x
        const dy = b.p.y - a.p.y
        const ox = a.hw + b.hw - Math.abs(dx)
        const oy = a.hh + b.hh - Math.abs(dy)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        // Separate along the shallower axis; prefer vertical (pills are wide).
        if (oy <= ox * 1.5) {
          const s = (dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy)) * (oy / 2 + 0.5)
          a.p.y -= s
          b.p.y += s
        } else {
          const s = (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx)) * (ox / 2 + 0.5)
          a.p.x -= s
          b.p.x += s
        }
      }
    }
    for (const { p, hw, hh } of items) {
      p.x = Math.max(hw, Math.min(width - hw, p.x))
      p.y = Math.max(hh, Math.min(height - hh, p.y))
    }
    if (!moved) break
  }
  for (const { p, e } of items)
    e.pill!.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%)`
}

let mx = -1
let my = -1
let down = false
let tracking = false
function trackPointer() {
  if (tracking || typeof window === "undefined") return
  tracking = true
  window.addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX
      my = e.clientY
    },
    true,
  )
  window.addEventListener("pointerdown", () => (down = true), true)
  window.addEventListener("pointerup", () => (down = false), true)
  window.addEventListener("pointercancel", () => (down = false), true)
}
let lastOver = false
/**
 * True while the pointer is over the always-clickable Color board. The canvas
 * sits above the boards, so the session lets clicks fall through it then. Held
 * steady during a drag so orbiting never gets interrupted.
 */
export function pointerOverOpenBoard(): boolean {
  trackPointer()
  if (down) return lastOver
  const el = entries.get("paint")?.el
  if (!el || el.style.visibility === "hidden" || mx < 0) return (lastOver = false)
  return (lastOver = document
    .elementsFromPoint(mx, my)
    .some((n) => el.contains(n)))
}
