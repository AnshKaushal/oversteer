let paused = false
export const isPaused = () => paused
export function setPausedFlag(p: boolean) {
  paused = p
  try {
    document.documentElement.toggleAttribute("data-paused", p)
  } catch {}
}
