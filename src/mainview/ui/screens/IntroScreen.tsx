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

const BTN =
  "min-w-[130px] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors"

export function IntroScreen({
  open,
  onEnter,
  onOptions,
}: {
  open: boolean
  onEnter: () => void
  onOptions: () => void
}) {
  const [credits, setCredits] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)
  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[70] bg-[#0b0e14]/30 p-6 md:p-10 w-full"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.5 }}
      exit={{ duration: 0.45, ease: EASE.in }}
      stagger={[
        {
          selector: "[data-intro-title]",
          from: { autoAlpha: 0 },
          to: { duration: 0.8, ease: EASE.soft },
        },
        { selector: "[data-intro-sub]", from: { autoAlpha: 0 } },
        {
          selector: "[data-intro-cta]",
          from: { autoAlpha: 0 },
          each: 0.08,
          delay: 0.2,
        },
      ]}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-8 md:gap-12">
        <h1
          data-intro-title
          className="w-full text-center font-bold leading-[0.85] tracking-tight text-white"
          style={{ fontSize: "clamp(56px, 14vw, 260px)" }}
        >
          OverSteer
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            data-intro-cta
            onClick={onOptions}
            className={`${BTN} bg-white/10 hover:bg-white/20`}
          >
            Options
          </button>
          <button
            data-intro-cta
            onClick={onEnter}
            className={`${BTN} bg-[#51a7d5] hover:bg-[#51a7d5]/90`}
          >
            Start game
          </button>
          <button
            data-intro-cta
            onClick={() => setCredits(true)}
            className={`${BTN} bg-white/10 hover:bg-white/20`}
          >
            Credits
          </button>
        </div>
        <button
          data-intro-cta
          onClick={() => setConfirmQuit(true)}
          className="px-6 py-2 text-[14px] font-semibold text-white/60 transition-colors hover:text-white"
        >
          Quit game
        </button>
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
