import { useSyncExternalStore } from "react"

export interface Store<T> {
  get: () => T
  set: (v: T) => void
  subscribe: (f: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set: (v) => {
      value = v
      subs.forEach((f) => f())
    },
    subscribe: (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}

export function useStore<T>(s: Store<T>): T {
  return useSyncExternalStore(s.subscribe, s.get)
}
