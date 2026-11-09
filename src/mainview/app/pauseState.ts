/** Whether the game is paused; read by UI animation loops that run on their own rAF. */
let paused = false
export const isPaused = () => paused
export function setPausedFlag(p: boolean) {
  paused = p
  try {
    document.documentElement.toggleAttribute("data-paused", p)
  } catch {}
}
