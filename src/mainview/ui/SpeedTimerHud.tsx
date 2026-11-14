import { useStore } from "../systems/liveStore"
import { speedTimer, type RunView } from "../systems/speedTimer"

const fmt = (t: number | null) => (t === null ? "—" : t.toFixed(2))

function Row({ r }: { r: RunView }) {
  const running = r.state === "running"
  const done = r.state === "done"
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[#8f99a8]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            r.state === "armed"
              ? "bg-emerald-400"
              : running
                ? "animate-pulse bg-[#ffb020]"
                : "bg-white/15"
          }`}
        />
        {r.from}–{r.to}
      </span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span
          className={`text-[18px] font-bold ${
            running
              ? "text-[#ffb020]"
              : done
                ? "text-emerald-400"
                : r.state === "armed"
                  ? "text-white"
                  : "text-gray-500"
          }`}
        >
          {r.state === "armed" && r.time === null ? "READY" : fmt(r.time)}
          {r.time !== null && <span className="text-[10px] font-semibold"> s</span>}
        </span>
        {r.best !== null && (
          <span className="w-[54px] text-right text-[10px] text-gray-400">
            BEST {r.best.toFixed(2)}
          </span>
        )}
      </span>
    </div>
  )
}

/** 0-100 style timers, sitting above the right-hand dial (clear of it). */
export function SpeedTimerHud() {
  const runs = useStore(speedTimer.store)
  if (!runs.length) return null
  return (
    <div
      className="pointer-events-none absolute right-4 flex min-w-[210px] flex-col gap-1 rounded-lg border border-white/10 bg-black/45 px-3.5 py-2 backdrop-blur-sm select-none"
      style={{ bottom: "calc(clamp(190px, 25vw, 340px) + 32px)" }}
    >
      {runs.map((r) => (
        <Row key={`${r.from}-${r.to}`} r={r} />
      ))}
    </div>
  )
}
