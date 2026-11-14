import { useEffect, type RefObject } from "react"

type Dir = "up" | "down" | "left" | "right"
const VEC: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}
const PAD_ATTR = "data-pad-focus"
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

interface Pt {
  key: HTMLElement
  x: number
  y: number
}

function clearPadFocus(root?: HTMLElement | null) {
  const scope = root ?? document
  scope.querySelectorAll(`[${PAD_ATTR}]`).forEach((n) => n.removeAttribute(PAD_ATTR))
}

function pick(from: Pt | null, pts: Pt[], dir: Dir) {
  const [dx, dy] = VEC[dir]
  const sx = from?.x ?? 0
  const sy = from?.y ?? 0
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

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 1 && r.height > 1
}

export function useMenuGamepadNav(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onBack?: () => void,
) {
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
      if (Math.hypot(ax, ay) > (stickDir ? 0.4 : 0.65)) {
        sd =
          Math.abs(ax) > Math.abs(ay)
            ? ax > 0
              ? "right"
              : "left"
            : ay > 0
              ? "down"
              : "up"
      }
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

      const root = containerRef.current
      if (!root) return

      if (dir) {
        const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          visible,
        )
        if (els.length) {
          const active = document.activeElement as HTMLElement | null
          const cur =
            active && root.contains(active) ? active : null
          // slider handling
          if (
            cur instanceof HTMLInputElement &&
            cur.type === "range" &&
            (dir === "left" || dir === "right")
          ) {
            const step = Number(cur.step) || 1
            const v =
              Number(cur.value) + (dir === "right" ? step : -step) * 2
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )!.set!
            setter.call(
              cur,
              String(Math.min(Number(cur.max), Math.max(Number(cur.min), v))),
            )
            cur.dispatchEvent(new Event("input", { bubbles: true }))
          } else {
            const pts: Pt[] = els.map((e) => {
              const r = e.getBoundingClientRect()
              return { key: e, x: r.left + r.width / 2, y: r.top + r.height / 2 }
            })
            let next: Pt | null
            if (!cur) {
              next = [...pts].sort((a, b) => a.y - b.y || a.x - b.x)[0]
            } else {
              const r = cur.getBoundingClientRect()
              next = pick(
                { key: cur, x: r.left + r.width / 2, y: r.top + r.height / 2 },
                pts,
                dir,
              )
            }
            if (next) {
              clearPadFocus(root)
              next.key.setAttribute(PAD_ATTR, "")
              next.key.focus({ preventScroll: true })
              next.key.scrollIntoView({ block: "nearest" })
            }
          }
        }
      }

      if (eA) {
        const a = document.activeElement as HTMLElement | null
        if (a && root.contains(a)) {
          if (a instanceof HTMLInputElement && a.type === "range") return
          if (
            a instanceof HTMLInputElement &&
            (a.type === "text" ||
              a.type === "password" ||
              a.type === "search" ||
              a.type === "email" ||
              a.type === "number")
          ) {
            // don't click; keep focus for typing (keyboard still needed)
          } else {
            a.click()
          }
        }
      }
      if (eB && onBack) onBack()
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      clearPadFocus(containerRef.current)
    }
  }, [open, containerRef, onBack])
}
