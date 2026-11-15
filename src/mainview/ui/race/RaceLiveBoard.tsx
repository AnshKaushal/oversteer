import { useEffect, useRef, useState } from "react"
import { type RaceSnapshot, type RaceStanding } from "../../systems/RaceTypes"
import { usePop } from "../anim"
import { roadGapM } from "../../systems/WorldManager"
import { formatTime } from "./raceFormat"

const BOARD_ROW_H = 34

function gapText(
  s: RaceStanding,
  playerS: number,
  gapM: (a: number, b: number) => number,
): string {
  if (s.isPlayer) return "YOU"
  if (s.finished) return formatTime(s.finishTime)
  const gap = gapM(s.progressM, playerS)
  const a = Math.abs(gap)
  const v = a >= 1000 ? `${(a / 1000).toFixed(1)} km` : `${Math.round(a)} m`
  return gap >= 0 ? `+${v}` : `-${v}`
}

export function RaceLiveBoard({
  race,
  gapM = roadGapM,
}: {
  race: RaceSnapshot
  gapM?: (a: number, b: number) => number
}) {
  const [snap, setSnap] = useState<RaceStanding[]>([])
  const rootRef = usePop<HTMLDivElement>([])
  const lastRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const now = performance.now()
    if (now - lastRef.current > 400) {
      lastRef.current = now
      setSnap(race.standings)
    }
  }, [race])
  const meIdx = snap.findIndex((s) => s.isPlayer)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || meIdx < 0) return
    el.scrollTo({
      top: Math.max(0, meIdx * BOARD_ROW_H - el.clientHeight / 2),
      behavior: "smooth",
    })
  }, [snap, meIdx])
  if (!race.active || race.finished || snap.length === 0) return null
  const playerS = race.standings.find((s) => s.isPlayer)?.progressM ?? 0
  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute top-20 right-5 w-[220px] md:right-8"
    >
      <div className="mb-[3px] flex items-center justify-between bg-[#efefef] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0a0a0a]">
        <span>Live</span>
        <span className="tabular-nums">{snap.length}</span>
      </div>
      <div
        ref={scrollRef}
        className="pointer-events-auto max-h-[46vh] overflow-y-auto no-scrollbar"
      >
        <div className="relative" style={{ height: snap.length * BOARD_ROW_H }}>
          {snap.map((s, i) => (
            <div
              key={s.id}
              className={`absolute right-0 left-0 flex items-center gap-2 px-2.5 transition-[top] duration-500 ease-out ${
                s.isPlayer
                  ? "bg-[#51a7d5] text-[#0a0a0a]"
                  : "bg-[#0a0a0a] text-[#efefef]"
              }`}
              style={{ top: i * BOARD_ROW_H, height: BOARD_ROW_H - 4 }}
            >
              <span
                className="w-4 text-[12px] font-black tabular-nums"
              >
                {i + 1}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0"
                style={{ background: s.color }}
              />
              <span className="flex-1 truncate text-[12px] font-bold">
                {s.name}
              </span>
              <span className="text-[11px] font-bold tabular-nums opacity-70">
                {gapText(s, playerS, gapM)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
