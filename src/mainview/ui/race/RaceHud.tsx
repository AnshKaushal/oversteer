import { type RaceSnapshot } from "../../systems/RaceTypes"
import { usePop } from "../anim"
import { formatTime, placeLabel } from "./raceFormat"

export function RaceHud({ race }: { race: RaceSnapshot }) {
  const pillRef = usePop<HTMLDivElement>([race.playerPlace])
  const stagedRef = usePop<HTMLDivElement>([race.staged])
  const countRef = usePop<HTMLDivElement>([race.countdown])
  const goRef = usePop<HTMLDivElement>([race.phase === "go"])
  if (!race.active || race.finished) return null
  const kmLeft = Math.max(
    0,
    (race.distanceM -
      (race.standings.find((s) => s.isPlayer)?.progressM ?? 0)) /
      1000,
  )
  const waitingLabel =
    race.waitingFor.length === 1
      ? `Waiting for ${race.waitingFor[0]}`
      : "Waiting for other players"
  return (
    <>
      <div className="pointer-events-none absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/12 bg-black/55 px-4 py-2 text-white backdrop-blur">
        {}
        <div ref={pillRef} className="flex items-center gap-3">
          <span className="text-[18px] font-bold tabular-nums">
            {placeLabel(race.playerPlace)}
          </span>
          <span className="text-[12px] text-gray-300">of {race.total}</span>
          <span className="h-4 w-px bg-white/20" />
          <span className="text-[13px] tabular-nums text-gray-200">
            {kmLeft.toFixed(2)} km left
          </span>
          <span className="h-4 w-px bg-white/20" />
          <span className="text-[13px] tabular-nums">
            {formatTime(race.elapsed)}
          </span>
        </div>
      </div>
      {race.staged && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            ref={stagedRef}
            className="rounded-3xl border border-amber-400/25 bg-black/65 px-10 py-6 text-center backdrop-blur"
          >
            <div className="text-[11px] font-semibold tracking-[0.4em] text-amber-300/90">
              ON THE GRID
            </div>
            <div className="mt-1 text-3xl font-bold text-white">
              {waitingLabel}…
            </div>
            <div className="mt-1 text-[14px] text-gray-300">
              Your car is on the start line. The countdown starts once
              everyone&apos;s ready.
            </div>
          </div>
        </div>
      )}
      {!race.staged && race.phase === "heads" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-3xl border border-white/10 bg-black/65 px-10 py-6 text-center backdrop-blur">
            <div className="text-[11px] font-semibold tracking-[0.4em] text-[#8f99a8]">
              ON THE GRID
            </div>
            <div className="mt-1 text-3xl font-bold text-white">
              {race.total - 1} rival{race.total - 1 === 1 ? "" : "s"} ·{" "}
              {(race.distanceM / 1000).toFixed(0)} km
            </div>
            <div className="mt-1 text-[14px] text-gray-300">
              Lights out in {Math.max(1, Math.ceil(race.readyIn))}…
            </div>
          </div>
        </div>
      )}
      {!race.staged && race.phase === "count" && race.countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div
              ref={countRef}
              className="text-[120px] font-bold leading-none text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            >
              {race.countdown}
            </div>
            <div className="mt-2 text-[14px] tracking-wide text-gray-200">
              Hold W + S to arm launch
            </div>
          </div>
        </div>
      )}
      {race.phase === "go" && race.elapsed < 1.2 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            ref={goRef}
            className="text-[100px] font-bold leading-none text-[#4ade80] drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          >
            GO!
          </div>
        </div>
      )}
    </>
  )
}
