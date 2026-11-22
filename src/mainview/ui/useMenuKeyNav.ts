import { useEffect, type RefObject } from "react"

export function useMenuKeyNav(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const items = () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        ) ?? [],
      ).filter((el) => el.getBoundingClientRect().width > 1)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const list = items()
      if (!list.length) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      const d = e.key === "ArrowDown" ? 1 : -1
      const next = i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length
      e.preventDefault()
      list[next].focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, containerRef])
}
