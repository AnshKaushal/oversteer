import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { EASE } from "../anim"

export function useSettingsAnimation(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(open)
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<gsap.core.Timeline | null>(null)

  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!mounted) return

    const overlay = overlayRef.current
    const modal = modalRef.current
    if (!overlay || !modal) return

    animRef.current?.kill()

    if (open) {
      const tl = gsap.timeline({ defaults: { ease: EASE.out } })
      animRef.current = tl

      tl.set(overlay, { autoAlpha: 0 })
        .set(modal, { autoAlpha: 0, y: 14 })
        .to(overlay, { autoAlpha: 1, duration: 0.28, ease: "power2.out" })
        .to(
          modal,
          { autoAlpha: 1, y: 0, duration: 0.34, ease: EASE.soft },
          "-=0.18",
        )
        .fromTo(
          modal.querySelectorAll("[data-anim-item]").length
            ? modal.querySelectorAll("[data-anim-item]")
            : modal,
          { autoAlpha: 0, y: 12 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.32,
            stagger: 0.04,
            ease: "power2.out",
          },
          "-=0.22",
        )
    } else {
      const tl = gsap.timeline({
        onComplete: () => {
          setMounted(false)
        },
      })
      animRef.current = tl

      tl.to(modal, {
        autoAlpha: 0,
        y: 10,
        duration: 0.22,
        ease: EASE.in,
      }).to(
        overlay,
        { autoAlpha: 0, duration: 0.18, ease: "power2.in" },
        "-=0.12",
      )
    }

    return () => {
      animRef.current?.kill()
    }
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [open, onClose])
  return { mounted, overlayRef, modalRef }
}
