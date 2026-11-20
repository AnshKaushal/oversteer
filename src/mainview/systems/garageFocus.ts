import { useSyncExternalStore } from "react"
import type { SurfaceId } from "./garageSurfaces"

let focus: SurfaceId | null = null
let hot: SurfaceId | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => (subs.add(f), () => void subs.delete(f))

export const getFocus = () => focus
export const getHot = () => hot
let coverHook: ((apply: () => void) => void) | null = null
export const setDynoCoverHook = (f: typeof coverHook) => void (coverHook = f)
let covering = false

export function setFocus(id: SurfaceId | null) {
  if (focus === id) return
  const apply = () => {
    focus = id
    if (id) hot = id
    emit()
  }
  if (coverHook && !covering && (id === "dyno") !== (focus === "dyno")) {
    covering = true
    coverHook(() => {
      covering = false
      dynoSnap.pending = true
      apply()
    })
    return
  }
  apply()
}
export function setHot(id: SurfaceId | null) {
  if (hot === id) return
  hot = id
  emit()
}
export const dynoSnap = { pending: false, release: 0 }

export const useFocus = () => useSyncExternalStore(sub, getFocus)
export const useHot = () => useSyncExternalStore(sub, getHot)
