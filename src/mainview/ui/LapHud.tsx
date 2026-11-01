export interface LapSnapshot {
  lap: number
  running: boolean
  currentS: number
  lastS: number | null
  bestS: number | null
  progress: number
  lengthM: number
}

function fmt(s: number | null) {
  if (s == null) return "–:--.---"
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`
}

export function LapHud({ lap }: { lap: LapSnapshot }) {
  return (
    <div className="absolute top-4 left-1/2 w-[260px] -translate-x-1/2 border border-[#51a7d5]/60 bg-[#0b0e14]/80 px-4 py-2 text-white backdrop-blur">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
          LAP {lap.lap}
        </span>
        <span className="text-[22px] font-bold tabular-nums">
          {lap.running ? fmt(lap.currentS) : "Cross the line"}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[12px] tabular-nums text-gray-300">
        <span>LAST {fmt(lap.lastS)}</span>
        <span className="text-[#6ec2f0]">BEST {fmt(lap.bestS)}</span>
      </div>
      <div className="mt-1.5 h-1 bg-white/10">
        <div
          className="h-full bg-[#51a7d5]"
          style={{ width: `${Math.round(lap.progress * 100)}%` }}
        />
      </div>
    </div>
  )
}
