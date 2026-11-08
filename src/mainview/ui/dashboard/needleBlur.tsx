import type { SVGProps } from "react"

/** Number of trailing copies drawn behind a moving needle. */
export const BLUR_GHOSTS = 5
/** Simulated shutter time: the smear spans this much of the needle's travel. */
const EXPOSURE_S = 0.05
const MAX_TRAIL_DEG = 16
const MIN_TRAIL_DEG = 0.25
const MAX_OPACITY = 0.38
const SPEED_SMOOTH = 30

interface BlurState {
  prev: number
  omega: number
}

const states = new WeakMap<SVGGElement, BlurState>()

/**
 * Ghost copies of the needle shape, drawn first inside the needle group.
 * `blurNeedle` rotates them back along the direction of travel.
 */
export function NeedleGhosts({
  render,
}: {
  render: (props: SVGProps<SVGGElement>, i: number) => JSX.Element
}) {
  return (
    <>
      {Array.from({ length: BLUR_GHOSTS }, (_, i) =>
        render(
          {
            // hidden until the needle actually moves
            opacity: 0,
            ...({ "data-ghost": "" } as object),
          } as SVGProps<SVGGElement>,
          i,
        ),
      )}
    </>
  )
}

/**
 * Motion blur for a needle group. Call after setting its rotation.
 * `rotation` is the group's current SVG rotate() angle in degrees and
 * (cx, cy) its pivot. Trailing ghosts fade out and lengthen with speed.
 */
export function blurNeedle(
  group: SVGGElement | null,
  rotation: number,
  cx: number,
  cy: number,
  dt: number,
) {
  if (!group) return
  let st = states.get(group)
  if (!st) {
    st = { prev: rotation, omega: 0 }
    states.set(group, st)
  }
  const inst = dt > 0 ? (rotation - st.prev) / dt : 0
  st.prev = rotation
  st.omega += (inst - st.omega) * (1 - Math.exp(-dt * SPEED_SMOOTH))

  const trail = Math.max(
    -MAX_TRAIL_DEG,
    Math.min(MAX_TRAIL_DEG, st.omega * EXPOSURE_S),
  )
  const mag = Math.abs(trail)
  const ghosts = group.querySelectorAll<SVGElement>("[data-ghost]")
  const strength = Math.min(1, mag / 4)
  ghosts.forEach((g, i) => {
    if (mag < MIN_TRAIL_DEG) {
      g.setAttribute("opacity", "0")
      return
    }
    const f = (i + 1) / ghosts.length
    g.setAttribute("transform", `rotate(${-trail * f} ${cx} ${cy})`)
    g.setAttribute("opacity", String(MAX_OPACITY * strength * (1 - f * 0.85)))
  })
}
