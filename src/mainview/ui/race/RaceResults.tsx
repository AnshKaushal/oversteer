import { type RaceSnapshot } from "../../systems/RaceTypes"
import { EASE, Screen } from "../anim"
import { useRef } from "react"
import { ArrowRight } from "lucide-react"
import { useMenuGamepadNav } from "../useMenuGamepadNav"
import { formatTime, placeLabel } from "./raceFormat"

export function RaceResults({
  open,
  race,
  onAgain,
  onMenu,
  readyNotice,
}: {
  open: boolean
  race: RaceSnapshot
  onAgain: () => void
  onMenu: () => void
  readyNotice?: string | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useMenuGamepadNav(open, rootRef, onMenu)
  const player = race.standings.find((s) => s.isPlayer)
  const winner = race.standings[0]
  const winnerTime = winner?.finishTime ?? null
  const playerTime = player?.finishTime ?? null
  const km = (race.distanceM / 1000).toFixed(0)

  const stats: [string, string][] = [
    ["Distance", `${km} km`],
    ["Time", playerTime != null ? formatTime(playerTime) : "DNF"],
    [
      race.playerPlace === 1 ? "Margin" : "Gap",
      playerTime != null
        ? race.playerPlace === 1
          ? race.standings[1]?.finishTime != null
            ? `${(race.standings[1].finishTime - playerTime).toFixed(2)}s`
            : "—"
          : winnerTime != null
            ? `+${(playerTime - winnerTime).toFixed(2)}s`
            : "—"
        : `${(Math.max(0, player?.progressM ?? 0) / 1000).toFixed(2)} km`,
    ],
  ]

  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[110] overflow-y-auto bg-[#0a0a0a]/30 text-[#efefef]"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.4, ease: EASE.out }}
      exit={{ duration: 0.28, ease: EASE.in }}
      motion
      stagger={[
        {
          selector: "[data-res-head]",
          from: { autoAlpha: 0, x: -40 },
          to: { duration: 0.7, ease: EASE.soft },
        },
        { selector: "[data-res-stat]", from: { autoAlpha: 0, y: 16 }, each: 0.07 },
        {
          selector: "[data-res-row]",
          from: { autoAlpha: 0, x: 40 },
          each: 0.05,
          delay: 0.18,
        },
        { selector: "[data-res-acts]", from: { autoAlpha: 0 }, delay: 0.3 },
        { selector: "[data-res-note]", from: { autoAlpha: 0 } },
      ]}
    >
      <div
        ref={rootRef}
        className="relative mx-auto grid min-h-full w-full max-w-[1300px] grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[1fr_minmax(380px,460px)] md:items-center md:px-16"
      >
        <div className="flex flex-col">
          <div data-res-head>
            <div className="mb-5 h-[6px] w-16 bg-[#51a7d5]" />
            <div className="text-[12px] font-black uppercase tracking-[0.35em] opacity-70">
              Race finished · {race.total} cars
            </div>
            <div
              className="mt-2 font-black leading-[0.8] tracking-tighter"
              style={{ fontSize: "clamp(110px, 20vw, 280px)" }}
            >
              {placeLabel(race.playerPlace)}
            </div>
          </div>

          <div className="mt-8 grid max-w-[560px] grid-cols-3 gap-[3px]">
            {stats.map(([k, v]) => (
              <div key={k} data-res-stat className="bg-[#0a0a0a] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51a7d5]">
                  {k}
                </div>
                <div className="mt-1 text-[22px] font-extrabold tabular-nums">
                  {v}
                </div>
              </div>
            ))}
          </div>

          {readyNotice && (
            <div
              data-res-note
              className="mt-3 max-w-[560px] bg-[#efefef] px-4 py-2.5 text-[13px] font-bold text-[#0a0a0a]"
            >
              {readyNotice}
            </div>
          )}

          <div
            data-res-acts
            className="mt-3 flex max-w-[560px] flex-col gap-[3px] sm:flex-row"
          >
            <button
              onClick={onAgain}
              className="group flex flex-1 items-center justify-between bg-[#51a7d5] px-5 py-4 text-[20px] font-extrabold uppercase tracking-tight text-[#0a0a0a] transition-colors hover:bg-[#efefef]"
            >
              Race again
              <ArrowRight size={20} strokeWidth={2.5} />
            </button>
            <button
              onClick={onMenu}
              className="group flex flex-1 items-center justify-between bg-[#0a0a0a] px-5 py-4 text-[20px] font-extrabold uppercase tracking-tight text-[#efefef] transition-colors hover:bg-[#efefef] hover:text-[#0a0a0a]"
            >
              Quit to start
              <ArrowRight size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="no-scrollbar flex max-h-[80vh] flex-col gap-[3px] overflow-y-auto">
          <div
            data-res-row
            className="grid grid-cols-[40px_1fr_auto] bg-[#efefef] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-[#0a0a0a]"
          >
            <span>Pos</span>
            <span>Driver</span>
            <span>Result</span>
          </div>
          {race.standings.map((row, i) => (
            <div
              key={row.id}
              data-res-row
              className={`grid h-11 shrink-0 grid-cols-[40px_1fr_auto] items-center px-3 ${
                row.isPlayer
                  ? "bg-[#51a7d5] text-[#0a0a0a]"
                  : "bg-[#0a0a0a] text-[#efefef]"
              }`}
            >
              <span className="text-[16px] font-black tabular-nums">
                {i + 1}
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-3 w-3 shrink-0"
                  style={{ background: row.color }}
                />
                <span className="truncate text-[14px] font-bold">
                  {row.name}
                </span>
                {row.isPlayer && (
                  <span className="bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-black text-[#efefef]">
                    YOU
                  </span>
                )}
              </span>
              <span
                className={`text-[13px] font-bold tabular-nums ${
                  row.finished || row.isPlayer ? "" : "opacity-50"
                }`}
              >
                {row.finished
                  ? i === 0
                    ? formatTime(row.finishTime)
                    : winnerTime != null
                      ? `+${(row.finishTime! - winnerTime).toFixed(2)}s`
                      : formatTime(row.finishTime)
                  : `${Math.max(0, row.progressM / 1000).toFixed(2)} km`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}
