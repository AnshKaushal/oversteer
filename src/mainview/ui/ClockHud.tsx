import { useEffect, useState } from "react"
import { formatClock, skyClock } from "../systems/sky/SkyClock"

export function ClockHud({ active }: { active: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [active])
  if (!active) return null
  const s = skyClock.state
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm">
      {formatClock(s.hour)} · {s.weatherLabel}
    </div>
  )
}
