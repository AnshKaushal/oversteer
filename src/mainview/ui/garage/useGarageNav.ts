import { useEffect } from "react"
import { SURFACES, type SurfaceId } from "../../systems/garageSurfaces"
import { getBoardElement, getPillElement, pillPositions } from "../../systems/garageBoard"
import { getFocus, getHot, setFocus, setHot } from "../../systems/garageFocus"
import { dyno } from "../../systems/dyno"

type Dir = "up" | "down" | "left" | "right"
const VEC: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}
const PAD_ATTR = "data-pad-focus"
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), summary, a[href], [tabindex="0"]'

interface Pt {
  key: string | Element
  x: number
  y: number
}

/**
 * Pick the neighbour of `from` in direction `dir`. Candidates in that
 * direction are scored by distance plus a penalty for drifting sideways; with
 * none ahead the choice wraps to the far side so every item is reachable.
 */
function pick(from: Pt | null, pts: Pt[], dir: Dir, ox: number, oy: number) {
  const [dx, dy] = VEC[dir]
  const sx = from?.x ?? ox
  const sy = from?.y ?? oy
  let best: Pt | null = null
  let bestScore = Infinity
  for (const p of pts) {
    if (p.key === from?.key) continue
    const rx = p.x - sx
    const ry = p.y - sy
    const along = rx * dx + ry * dy
    if (along < 6) continue
    const perp = Math.abs(rx * dy - ry * dx)
    const score = along + perp * 2
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  if (best) return best
  // Wrap: the candidate furthest back against the direction of travel.
  let far: Pt | null = null
  let farAlong = Infinity
  for (const p of pts) {
    if (p.key === from?.key) continue
    const along = (p.x - sx) * dx + (p.y - sy) * dy
    if (along < farAlong) {
      farAlong = along
      far = p
    }
  }
  return far
}

function clearPadFocus() {
  document.querySelectorAll(`[${PAD_ATTR}]`).forEach((n) => {
    n.removeAttribute(PAD_ATTR)
  })
}

// The < > car arrows are part of the orbit-view navigation too.
let arrowFocus: HTMLElement | null = null
const ARROWS = "[data-car-arrow]"
const liveArrow = () => (arrowFocus?.isConnected ? arrowFocus : null)
function clearArrow() {
  arrowFocus?.removeAttribute(PAD_ATTR)
  arrowFocus = null
}

function navigateOrbit(dir: Dir) {
  const pts: Pt[] = SURFACES.map((s) => pillPositions.get(s.id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ key: p.id, x: p.x, y: p.y }))
  for (const el of document.querySelectorAll<HTMLElement>(ARROWS)) {
    const r = el.getBoundingClientRect()
    if (r.width > 1 && r.height > 1)
      pts.push({ key: el, x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  if (!pts.length) return
  const arrow = liveArrow()
  const cur = getHot()
  const from = (arrow && pts.find((p) => p.key === arrow)) ||
    pts.find((p) => p.key === cur) || null
  const next = pick(
    from,
    pts,
    dir,
    window.innerWidth / 2,
    window.innerHeight / 2,
  )
  if (!next) return
  for (const s of SURFACES) {
    getPillElement(s.id)?.removeAttribute(PAD_ATTR)
  }
  clearArrow()
  if (typeof next.key === "string") {
    setHot(next.key as SurfaceId)
    getPillElement(next.key as SurfaceId)?.setAttribute(PAD_ATTR, "")
  } else {
    arrowFocus = next.key as HTMLElement
    arrowFocus.setAttribute(PAD_ATTR, "")
    setHot(null)
  }
}

function navigateBoard(id: SurfaceId, dir: Dir) {
  const root = getBoardElement(id)
  if (!root) return
  const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (e) => {
      const r = e.getBoundingClientRect()
      return r.width > 1 && r.height > 1
    },
  )
  if (!els.length) return
  const active = document.activeElement as HTMLElement | null
  const cur = active && root.contains(active) ? active : null
  // Sliders: left/right adjust the value, up/down move between rows.
  if (cur instanceof HTMLInputElement && cur.type === "range") {
    if (dir === "left" || dir === "right") {
      const step = Number(cur.step) || 1
      const v = Number(cur.value) + (dir === "right" ? step : -step) * 2
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!
      setter.call(
        cur,
        String(Math.min(Number(cur.max), Math.max(Number(cur.min), v))),
      )
      cur.dispatchEvent(new Event("input", { bubbles: true }))
      return
    }
  }
  const pts: Pt[] = els.map((e) => {
    const r = e.getBoundingClientRect()
    return { key: e, x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  let next: Pt | null
  if (!cur) {
    // First press: start at the top-left-most control.
    next = [...pts].sort((a, b) => a.y - b.y || a.x - b.x)[0]
  } else {
    const r = cur.getBoundingClientRect()
    next = pick(
      { key: cur, x: r.left + r.width / 2, y: r.top + r.height / 2 },
      pts,
      dir,
      0,
      0,
    )
  }
  if (!next) return
  clearPadFocus()
  const el = next.key as HTMLElement
  el.setAttribute(PAD_ATTR, "")
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: "nearest" })
}

function activate() {
  const f = getFocus()
  if (!f) {
    const a = liveArrow()
    if (a) {
      a.click()
      return
    }
    const h = getHot()
    if (h) {
      clearArrow()
      setFocus(h)
    }
    return
  }
  const a = document.activeElement as HTMLElement | null
  const root = getBoardElement(f)
  if (a && root?.contains(a)) {
    if (a instanceof HTMLInputElement && a.type === "range") return
    a.click()
  }
}

function back() {
  if (getFocus()) {
    clearPadFocus()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setFocus(null)
    const h = getHot()
    if (h) getPillElement(h)?.setAttribute(PAD_ATTR, "")
  }
}

/**
 * Gamepad control for the garage: d-pad or left stick moves between hotspots
 * (or between controls on a focused screen), A selects, B steps back and the
 * bumpers cycle cars.
 */
export function useGarageNav(open: boolean, onCar: (d: 1 | -1) => void) {
  useEffect(() => {
    if (!open) return
    let raf = 0
    const prev: Record<number, boolean> = {}
    let stickDir: Dir | null = null
    let nextRepeat = 0
    let lastStep = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(
        (p) => p && p.connected && p.mapping === "standard",
      )
      if (!pad) return
      const edge = (i: number) => {
        const now = !!pad.buttons[i]?.pressed
        const e = now && !prev[i]
        prev[i] = now
        return e
      }
      const eUp = edge(12)
      const eDown = edge(13)
      const eLeft = edge(14)
      const eRight = edge(15)
      const eA = edge(0)
      const eB = edge(1)
      const eLB = edge(4)
      const eRB = edge(5)
      let dir: Dir | null = eUp
        ? "up"
        : eDown
          ? "down"
          : eLeft
            ? "left"
            : eRight
              ? "right"
              : null
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      let sd: Dir | null = null
      if (Math.hypot(ax, ay) > (stickDir ? 0.4 : 0.65))
        sd =
          Math.abs(ax) > Math.abs(ay)
            ? ax > 0
              ? "right"
              : "left"
            : ay > 0
              ? "down"
              : "up"
      const now = performance.now()
      // First tilt moves at once, then a slow repeat; a minimum gap stops
      // jitter around the threshold or a direction flip from double-firing.
      if (sd && now > nextRepeat && now - lastStep > 170) {
        if (!dir) dir = sd
        nextRepeat = now + (sd === stickDir ? 330 : 480)
        lastStep = now
      }
      if (!sd) nextRepeat = 0
      stickDir = sd
      if (dir) {
        const f = getFocus()
        if (f) navigateBoard(f, dir)
        else navigateOrbit(dir)
      }
      if (eA) activate()
      if (eB) back()
      if (getFocus() === "dyno") {
        // RT throttle, LT brake, bumpers change gear.
        dyno.setPad(pad.buttons[7]?.value ?? 0, pad.buttons[6]?.value ?? 0)
        if (eLB) dyno.shift(-1)
        if (eRB) dyno.shift(1)
      } else {
        if (getFocus() === null) {
          if (eLB) onCar(-1)
          if (eRB) onCar(1)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      dyno.setPad(0, 0)
    }
  }, [open, onCar])
}
