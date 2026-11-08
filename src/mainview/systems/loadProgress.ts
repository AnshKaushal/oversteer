const files = new Map<string, { loaded: number; total: number }>()
const subs = new Set<(p: number) => void>()

export function trackLoad(key: string, e: ProgressEvent) {
  if (!e.lengthComputable) return
  files.set(key, { loaded: e.loaded, total: e.total })
  const p = loadFraction()
  subs.forEach((f) => f(p))
}

export function loadFraction(): number {
  let l = 0
  let t = 0
  files.forEach((f) => {
    l += f.loaded
    t += f.total
  })
  return t > 0 ? l / t : 0
}

export function onLoadProgress(f: (p: number) => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}
