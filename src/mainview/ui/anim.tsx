import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import gsap from "gsap"

gsap.ticker.lagSmoothing(0)

export const EASE = {
  out: "expo.out",
  soft: "power3.out",
  in: "power2.in",
  inOut: "power3.inOut",
} as const

const CLEAN = "opacity,visibility,will-change"

const MOTION_KEYS = [
  "x",
  "y",
  "z",
  "xPercent",
  "yPercent",
  "scale",
  "scaleX",
  "scaleY",
  "rotation",
  "rotate",
  "skewX",
  "skewY",
  "transformOrigin",
  "transformPerspective",
]
const still = (v?: gsap.TweenVars, motion = false) => {
  if (!v || motion) return v
  const out = { ...v }
  for (const k of MOTION_KEYS) delete out[k]
  return out
}

export type StaggerSpec = {
  selector: string
  from?: gsap.TweenVars
  to?: gsap.TweenVars
  each?: number
  delay?: number
}

export type ScreenProps = {
  open: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
  from?: gsap.TweenVars
  to?: gsap.TweenVars
  exit?: gsap.TweenVars
  /** Opt in to x/y/scale motion on enter, and slide-out of staggered items on exit. */
  motion?: boolean
  /** Blue slash sweeps across the screen; staggered items are wiped in behind it. */
  slash?: boolean
  stagger?: StaggerSpec | StaggerSpec[]
  onClosed?: () => void
  onClick?: () => void
}

export function Screen({
  open,
  children,
  className = "",
  style,
  from,
  to,
  exit,
  motion = false,
  slash = false,
  stagger,
  onClosed,
  onClick,
}: ScreenProps) {
  const ref = useRef<HTMLDivElement>(null)
  const slashRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  const exitTl = useRef<gsap.core.Timeline | null>(null)

  const slashKids = () =>
    Array.from(ref.current?.children ?? []).filter(
      (c) => c !== slashRef.current?.parentElement,
    )

  useLayoutEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !mounted) return
    const el = ref.current
    if (!el) return
    el.style.pointerEvents = ""
    const ctx = gsap.context(() => {
      if (slash) {
        gsap.fromTo(
          el,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.2, ease: "none", clearProps: CLEAN },
        )
        // No UI until the slash has fully left the screen.
        const kids = slashKids()
        gsap.set(kids, { autoAlpha: 0 })
        const reveal = () => {
          gsap.to(kids, {
            autoAlpha: 1,
            duration: 0.25,
            ease: "none",
            clearProps: CLEAN,
          })
          const list = stagger
            ? Array.isArray(stagger)
              ? stagger
              : [stagger]
            : []
          for (const s of list) {
            if (!el.querySelector(s.selector)) continue
            wipeIn(s.selector, {
              stagger: s.each ?? 0.05,
              delay: s.delay ?? 0.04,
            })
          }
        }
        if (slashRef.current)
          gsap.fromTo(
            slashRef.current,
            { x: "-30vw", autoAlpha: 1 },
            {
              x: "130vw",
              duration: 0.7,
              ease: "power3.inOut",
              onComplete: () => {
                gsap.set(slashRef.current, { autoAlpha: 0 })
                reveal()
              },
            },
          )
        else reveal()
        return
      }
      gsap.fromTo(
        el,
        { autoAlpha: 0, ...still(from, motion) },
        {
          autoAlpha: 1,
          duration: 0.45,
          ease: EASE.soft,
          clearProps: motion ? `${CLEAN},transform` : CLEAN,
          ...still(to, motion),
        },
      )
      const specs = stagger
        ? Array.isArray(stagger)
          ? stagger
          : [stagger]
        : []
      for (const s of specs) {
        if (!el.querySelector(s.selector)) continue
        gsap.fromTo(
          s.selector,
          { autoAlpha: 0, ...still(s.from, motion) },
          {
            autoAlpha: 1,
            duration: 0.55,
            ease: EASE.out,
            stagger: s.each ?? 0.05,
            delay: s.delay ?? 0.04,
            clearProps: motion ? `${CLEAN},transform` : CLEAN,
            ...still(s.to, motion),
          },
        )
      }
    }, el)
    return () => ctx.revert()
  }, [open, mounted])

  useLayoutEffect(() => {
    if (open || !mounted) return
    const el = ref.current
    if (!el) {
      setMounted(false)
      onClosed?.()
      return
    }
    exitTl.current?.kill()
    el.style.pointerEvents = "none"
    const tl = gsap.timeline({
      onComplete: () => {
        exitTl.current = null
        setMounted(false)
        onClosed?.()
      },
    })
    if (slash && slashRef.current) {
      tl.to(slashKids(), { autoAlpha: 0, duration: 0.08, ease: "none" }, 0)
      tl.fromTo(
        slashRef.current,
        { x: "-30vw", autoAlpha: 1 },
        { x: "130vw", duration: 0.5, ease: "power3.inOut" },
        0,
      ).to(el, { autoAlpha: 0, duration: 0.15, ease: "none" }, 0.28)
    } else {
      tl.to(el, {
        autoAlpha: 0,
        duration: 0.3,
        ease: EASE.in,
        ...still(exit, motion),
      })
    }
    if (motion && !slash) {
      const specs = stagger
        ? Array.isArray(stagger)
          ? stagger
          : [stagger]
        : []
      for (const s of specs) {
        if (!el.querySelector(s.selector)) continue
        tl.to(
          el.querySelectorAll(s.selector),
          {
            autoAlpha: 0,
            x: -16,
            force3D: true,
            duration: 0.22,
            ease: EASE.in,
            stagger: 0.025,
          },
          0,
        )
      }
    }
    exitTl.current = tl
    return () => {
      tl.kill()
    }
  }, [open, mounted])

  if (!mounted) return null
  return (
    <div ref={ref} className={className} style={style} onClick={onClick}>
      {children}
      {slash && (
        <div className="pointer-events-none absolute inset-0 z-[200] overflow-hidden">
          <div
            ref={slashRef}
            className="invisible absolute inset-y-[-10%] left-0 w-[22vw] -skew-x-[14deg] bg-[#51a7d5]"
          />
        </div>
      )}
    </div>
  )
}

// Slanted wipe: the clip's leading edge is skewed like the slash that sweeps
// across the screen. Paint-only, so it stays cheap over the 3D scene.
const CLIP_HIDDEN = "polygon(0% 0%, 0% 0%, -14% 100%, 0% 100%)"
const CLIP_SHOWN = "polygon(0% 0%, 114% 0%, 100% 100%, 0% 100%)"
export function wipeIn(targets: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  return gsap.fromTo(
    targets,
    { clipPath: CLIP_HIDDEN },
    {
      clipPath: CLIP_SHOWN,
      duration: 0.55,
      ease: "power3.out",
      clearProps: "clipPath",
      ...vars,
    },
  )
}

export function usePresence(open: boolean, ms = 320) {
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) {
      setShown(true)
      return
    }
    const t = window.setTimeout(() => setShown(false), ms)
    return () => window.clearTimeout(t)
  }, [open, ms])
  return shown
}

const FADE_EASE = "ease-in-out"
// Never hold the cover forever if a load never reports back.
const WIPE_MAX_HOLD = 30000

/**
 * Loading cover: fades a black screen with the app icon in, holds while
 * `busy`, then fades out. Driven by Web Animations (compositor) so the
 * main-thread stalls of scene loading can't freeze the fade.
 */
export function Wipe({
  token,
  busy,
  onCovered,
}: {
  token: number
  busy: boolean
  /** Fires once the cover is fully opaque. */
  onCovered?: () => void
  /** Kept for call-site compatibility. */
  label?: string
  tone?: "blue" | "red"
}) {
  const coverRef = useRef<HTMLDivElement>(null)
  const [covering, setCovering] = useState(false)
  const inDone = useRef<Promise<unknown>>(Promise.resolve())
  const onCoveredRef = useRef(onCovered)
  onCoveredRef.current = onCovered
  const busyRef = useRef(busy)
  busyRef.current = busy

  // The 30 s safety timer must die with the cover it belongs to; left armed it
  // fires mid-game and flashes the cover (opacity 1 -> 0) for 400 ms.
  const holdTimer = useRef(0)
  const isCovering = useRef(false)

  const fadeOut = () => {
    window.clearTimeout(holdTimer.current)
    const el = coverRef.current
    if (!el || !isCovering.current) return
    isCovering.current = false
    setCovering(false)
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 400,
      easing: FADE_EASE,
    })
    out.onfinish = () => {
      el.getAnimations().forEach((a) => a.cancel())
    }
  }

  useLayoutEffect(() => {
    const el = coverRef.current
    if (!el || !token) return
    el.getAnimations().forEach((a) => a.cancel())
    isCovering.current = true
    setCovering(true)
    const inAnim = el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 350,
      easing: FADE_EASE,
      fill: "forwards",
    })
    inDone.current = inAnim.finished.catch(() => {})
    void inDone.current.then(() => {
      if (inAnim.playState === "finished") onCoveredRef.current?.()
    })
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      busyRef.current = false
      void inDone.current.then(fadeOut)
    }, WIPE_MAX_HOLD)
    return () => window.clearTimeout(holdTimer.current)
  }, [token])

  useEffect(() => {
    if (busy || !token) return
    let cancelled = false
    void inDone.current.then(() => {
      if (!cancelled && !busyRef.current) fadeOut()
    })
    return () => {
      cancelled = true
    }
  }, [busy, token])

  return (
    <div
      className={`absolute inset-0 z-[300] ${
        covering ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        ref={coverRef}
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black opacity-0 will-change-[opacity]"
      >
        <img
          src={`${import.meta.env.BASE_URL || "./"}icon-new.png`}
          alt=""
          draggable={false}
          className="h-[min(48vh,460px)] w-auto mix-blend-screen"
        />
        <div className="flex items-baseline gap-1 text-[26px] font-extrabold uppercase italic tracking-[0.14em] text-white md:text-[38px]">
          Loading
          <span className="os-dot">.</span>
          <span className="os-dot">.</span>
          <span className="os-dot">.</span>
        </div>
      </div>
    </div>
  )
}

export function usePop<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = [],
) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.fromTo(
      el,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.42, ease: EASE.soft, clearProps: CLEAN },
    )
  }, deps)
  return ref
}

export function useStaggerIn<T extends HTMLElement>(
  ref: RefObject<T>,
  selector: string,
  deps: unknown[],
  skip = false,
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || skip) return
    const nodes = el.querySelectorAll(selector)
    if (nodes.length === 0) return
    const tween = gsap.fromTo(
      nodes,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: 0.5,
        ease: EASE.out,
        stagger: 0.05,
        clearProps: CLEAN,
      },
    )
    return () => {
      tween.kill()
    }
  }, deps)
}
