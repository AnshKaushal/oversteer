import { type RaceSnapshot } from "../../systems/RaceTypes"
import { usePop } from "../anim"
import { formatTime, placeLabel } from "./raceFormat"

const BLUE = "#51a7d5"

export function RaceHud({ race }: { race: RaceSnapshot }) {
  const placeRef = usePop<HTMLDivElement>([race.playerPlace])
  const stagedRef = usePop<HTMLDivElement>([race.staged])
  const countRef = usePop<HTMLDivElement>([race.countdown])
  const goRef = usePop<HTMLDivElement>([race.phase === "go"])
  if (!race.active || race.finished) return null
  const me = race.standings.find((s) => s.isPlayer)
  const kmLeft = Math.max(0, (race.distanceM - (me?.progressM ?? 0)) / 1000)
  const frac = (m: number) =>
    Math.min(1, Math.max(0, m / Math.max(1, race.distanceM)))
  const waitingLabel =
    race.waitingFor.length === 1
      ? `Waiting for ${race.waitingFor[0]}`
      : "Waiting for other players"
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[6px] bg-[#0a0a0a]">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${frac(me?.progressM ?? 0) * 100}%`, background: BLUE }}
        />
        {race.standings
          .filter((s) => !s.isPlayer)
          .map((s) => (
            <span
              key={s.id}
              className="absolute top-0 h-[6px] w-[3px] bg-[#efefef]"
              style={{ left: `calc(${frac(s.progressM) * 100}% - 1px)` }}
            />
          ))}
      </div>

      <div className="pointer-events-none absolute left-5 top-5 flex items-stretch md:left-8 md:top-8">
        <div
          ref={placeRef}
          className="flex items-baseline gap-2 bg-[#efefef] px-4 py-2 text-[#0a0a0a]"
        >
          <span className="text-[44px] font-black leading-none tracking-tighter tabular-nums">
            {placeLabel(race.playerPlace)}
          </span>
          <span className="text-[13px] font-bold uppercase tracking-widest opacity-60">
            / {race.total}
          </span>
        </div>
        <div className="flex flex-col justify-center gap-0.5 bg-[#0a0a0a] px-4 text-[#efefef]">
          <span className="text-[20px] font-extrabold leading-none tabular-nums">
            {formatTime(race.elapsed)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] tabular-nums opacity-60">
            {kmLeft.toFixed(2)} km left
          </span>
        </div>
      </div>

      {race.staged && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div ref={stagedRef} className="bg-[#0a0a0a] text-[#efefef]">
            <div className="bg-[#51a7d5] px-6 py-1.5 text-[11px] font-black uppercase tracking-[0.4em] text-[#0a0a0a]">
              On the grid
            </div>
            <div className="px-6 py-4 text-center">
              <div className="text-3xl font-extrabold">{waitingLabel}…</div>
              <div className="mt-1 text-[13px] opacity-70">
                The countdown starts once everyone&apos;s ready.
              </div>
            </div>
          </div>
        </div>
      )}
      {!race.staged && race.phase === "heads" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <div className="bg-[#0a0a0a] text-[#efefef]">
            <div className="bg-[#efefef] px-6 py-1.5 text-center text-[11px] font-black uppercase tracking-[0.4em] text-[#0a0a0a]">
              On the grid
            </div>
            <div className="flex items-center gap-5 px-6 py-3">
              <span className="text-[22px] font-extrabold">
                {race.total - 1} rival{race.total - 1 === 1 ? "" : "s"} ·{" "}
                {(race.distanceM / 1000).toFixed(0)} km
              </span>
              <span className="text-[13px] font-bold uppercase tracking-widest text-[#51a7d5]">
                Lights out {Math.max(1, Math.ceil(race.readyIn))}
              </span>
            </div>
          </div>
        </div>
      )}
      {!race.staged && race.phase === "count" && race.countdown > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div
            ref={countRef}
            className="grid h-[200px] w-[200px] place-items-center bg-[#0a0a0a] text-[150px] font-black leading-none tabular-nums text-[#efefef]"
          >
            {race.countdown}
          </div>
          <div className="bg-[#efefef] px-3 py-1 text-[12px] font-black uppercase tracking-[0.2em] text-[#0a0a0a]">
            Hold W + S to arm launch
          </div>
        </div>
      )}
      {race.phase === "go" && race.elapsed < 1.2 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            ref={goRef}
            className="bg-[#51a7d5] px-10 py-4 text-[120px] font-black uppercase italic leading-none tracking-tighter text-[#0a0a0a]"
          >
            Go
          </div>
        </div>
      )}
    </>
  )
}
