import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import gsap from "gsap"
import { EASE, Screen } from "../anim"
import { quitApp } from "../../systems/updater"
import { useMenuGamepadNav } from "../useMenuGamepadNav"

function MenuItem({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      data-intro-cta
      onClick={onClick}
      className={`group relative flex items-center overflow-hidden py-3 pl-5 pr-6 text-left font-semibold uppercase tracking-[0.12em] outline-none transition-colors focus-visible:bg-white/10 ${
        primary
          ? "text-[22px] text-white"
          : "text-[15px] text-white/60 hover:text-white focus-visible:text-white"
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] origin-center scale-y-0 bg-[#51a7d5] transition-transform duration-200 group-hover:scale-y-100 group-focus-visible:scale-y-100" />
      <span className="absolute inset-0 -translate-x-full bg-white/[0.07] transition-transform duration-300 group-hover:translate-x-0 group-focus-visible:translate-x-0" />
      <span className="relative transition-transform duration-200 group-hover:translate-x-1.5 group-focus-visible:translate-x-1.5">
        {children}
      </span>
    </button>
  )
}

export function IntroScreen({
  open,
  onEnter,
  onOptions,
  gamepadNav = true,
}: {
  open: boolean
  onEnter: () => void
  onOptions: () => void
  gamepadNav?: boolean
}) {
  const [credits, setCredits] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useMenuGamepadNav(open && gamepadNav, rootRef)
  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[70] bg-[#0a0a0a]/20 p-6 md:p-10 w-full"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.5 }}
      exit={{ duration: 0.45, ease: EASE.in }}
      slash
      stagger={[
        {
          selector: "[data-intro-title]",
          from: { autoAlpha: 0, x: -30 },
          to: { duration: 0.6, ease: EASE.soft, force3D: true },
        },
        { selector: "[data-intro-sub]", from: { autoAlpha: 0, x: -20 } },
        {
          selector: "[data-intro-cta]",
          from: { autoAlpha: 0, x: -20 },
          each: 0.08,
          delay: 0.2,
        },
      ]}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-[60%]"
        style={{
          background:
            "linear-gradient(90deg, rgba(11,14,20,0.92) 0%, rgba(11,14,20,0.6) 55%, rgba(11,14,20,0) 100%)",
        }}
      />
      <div ref={rootRef} className="absolute inset-0">
        {/* corner brackets */}
        <span className="pointer-events-none absolute left-5 top-5 h-5 w-5 border-l-2 border-t-2 border-white/30 md:left-8 md:top-8" />
        <span className="pointer-events-none absolute bottom-5 right-5 h-5 w-5 border-b-2 border-r-2 border-white/30 md:bottom-8 md:right-8" />
        <span className="pointer-events-none absolute left-5 bottom-5 h-5 w-5 border-l-2 border-b-2 border-white/30 md:left-8 md:bottom-8" />
        <span className="pointer-events-none absolute top-5 right-5 h-5 w-5 border-t-2 border-r-2 border-white/30 md:top-8 md:right-8" />

        <div className="relative flex h-full w-full flex-col justify-center px-8 md:px-20">
          <div data-intro-title>
            <h1
              className="underline underline-offset-4 decoration-6 decoration-[#51a7d5] font-extrabold italic leading-[0.85] tracking-tighter text-white"
              style={{ fontSize: "clamp(48px, 9vw, 150px)" }}
            >
              OverSteer
            </h1>
          </div>

          <nav className="mt-10 flex w-full max-w-[320px] flex-col gap-1 md:mt-14">
            <MenuItem primary onClick={onEnter}>
              Start game
            </MenuItem>
            <MenuItem onClick={onOptions}>Options</MenuItem>
            <MenuItem onClick={() => setCredits(true)}>Credits</MenuItem>
            <MenuItem onClick={() => setConfirmQuit(true)}>Quit game</MenuItem>
          </nav>
        </div>
        <Dialog open={confirmQuit} onClose={() => setConfirmQuit(false)}>
          <h2 className="text-lg font-bold">Quit game?</h2>
          <p className="mt-1 text-[13px] text-white/60">
            Are you sure you want to exit?
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmQuit(false)}
              className="bg-white/10 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/20 active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              onClick={() => void quitApp()}
              className="bg-[#e30613] py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#ff1a27] active:scale-[0.98]"
            >
              Quit
            </button>
          </div>
        </Dialog>
        <Dialog open={credits} onClose={() => setCredits(false)}>
          <h2 className="text-lg font-bold">Credits</h2>
          <p className="mt-1 text-[13px] text-white/60">OverSteer</p>
          <button
            onClick={() => setCredits(false)}
            className="mt-4 w-full bg-[#51a7d5] py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#51a7d5]/90 active:scale-[0.98]"
          >
            Close
          </button>
        </Dialog>
      </div>
    </Screen>
  )
}

function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const backdrop = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    const b = backdrop.current
    const c = card.current
    if (!mounted || !b || !c) return
    gsap.killTweensOf([b, c])
    if (open) {
      gsap.fromTo(b, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 })
      gsap.fromTo(
        c,
        { autoAlpha: 0, y: 24, scale: 0.94 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: EASE.out },
      )
    } else {
      gsap.to(c, {
        autoAlpha: 0,
        y: 12,
        scale: 0.96,
        duration: 0.22,
        ease: EASE.in,
      })
      gsap.to(b, {
        autoAlpha: 0,
        duration: 0.25,
        delay: 0.05,
        onComplete: () => setMounted(false),
      })
    }
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!mounted) return null
  return (
    <div
      ref={backdrop}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6"
      style={{ visibility: "hidden" }}
      onClick={onClose}
    >
      <div
        ref={card}
        className="w-full max-w-xs bg-[#0b0e14] p-4 text-white"
        style={{ visibility: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
