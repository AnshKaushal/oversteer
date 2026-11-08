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
      className="pointer-events-none absolute top-20 right-4 w-[212px]"
    >
      <div className="mb-1.5 text-right text-[10px] font-semibold tracking-[0.3em] text-white/60">
        LIVE · {snap.length}
      </div>
      <div
        ref={scrollRef}
        className="pointer-events-auto max-h-[46vh] overflow-y-auto rounded-xl pr-0.5 no-scrollbar"
      >
        <div className="relative" style={{ height: snap.length * BOARD_ROW_H }}>
          {snap.map((s, i) => (
            <div
              key={s.id}
              className={`absolute right-0 left-0 flex items-center gap-2 rounded-lg px-2 backdrop-blur transition-[top] duration-500 ease-out ${
                s.isPlayer
                  ? "border border-white/25 bg-white/15"
                  : "border border-transparent bg-black/45"
              }`}
              style={{ top: i * BOARD_ROW_H, height: BOARD_ROW_H - 4 }}
            >
              <span
                className={`w-4 text-[12px] font-bold tabular-nums ${
                  i === 0 ? "text-amber-300" : "text-white/80"
                }`}
              >
                {i + 1}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="flex-1 truncate text-[12px] font-medium text-white">
                {s.name}
              </span>
              <span className="text-[11px] tabular-nums text-gray-300">
                {gapText(s, playerS, gapM)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
