import { useSyncExternalStore } from "react"
import type { SurfaceId } from "./garageSurfaces"

// Which garage screen the camera is focused on (null = free orbit around the
// car), plus the gamepad-highlighted hotspot while orbiting.
let focus: SurfaceId | null = null
let hot: SurfaceId | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => (subs.add(f), () => void subs.delete(f))

export const getFocus = () => focus
export const getHot = () => hot
export function setFocus(id: SurfaceId | null) {
  if (focus === id) return
  focus = id
  if (id) hot = id
  emit()
}
export function setHot(id: SurfaceId | null) {
  if (hot === id) return
  hot = id
  emit()
}
export const useFocus = () => useSyncExternalStore(sub, getFocus)
export const useHot = () => useSyncExternalStore(sub, getHot)
