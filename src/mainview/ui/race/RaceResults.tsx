import { type RaceSnapshot } from "../../systems/RaceTypes"
import { EASE, Screen } from "../anim"
import { useRef } from "react"
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

  let summary = `${km} km`
  if (playerTime != null) {
    summary += ` · ${formatTime(playerTime)}`
    if (race.playerPlace === 1) {
      const second = race.standings[1]?.finishTime ?? null
      if (second != null) {
        summary += ` · ${(second - playerTime).toFixed(2)}s clear`
      }
    } else if (winnerTime != null) {
      summary += ` · ${(playerTime - winnerTime).toFixed(2)}s behind`
    }
  } else if (player) {
    summary += ` · ${(Math.max(0, player.progressM) / 1000).toFixed(
      2,
    )} km covered`
  }

  return (
    <Screen
      open={open}
      className="absolute inset-0 overflow-y-auto bg-black/55 backdrop-blur-[2px]"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.4, ease: EASE.out }}
      exit={{ duration: 0.28, ease: EASE.in }}
      stagger={[
        {
          selector: "[data-res-head]",
          from: { autoAlpha: 0 },
          to: { duration: 0.7, ease: EASE.soft },
        },
        { selector: "[data-res-acts]", from: { autoAlpha: 0 } },
        {
          selector: "[data-res-row]",
          from: { autoAlpha: 0 },
          each: 0.05,
          delay: 0.18,
        },
        { selector: "[data-res-note]", from: { autoAlpha: 0 } },
      ]}
    >
      <div ref={rootRef} className="flex min-h-full flex-col p-5 md:p-8">
        {}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div data-res-head>
            <div
              className="mb-2 h-2.5 w-20"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#f5f5f5 0% 25%, #0b0e14 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            <div className="flex items-baseline gap-3">
              <span className="text-[72px] font-bold leading-[0.9] tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] md:text-[104px]">
                {placeLabel(race.playerPlace)}
              </span>
              <span className="text-[14px] font-medium text-gray-400">
                of {race.total}
              </span>
            </div>
            <p className="mt-2 text-[13px] tracking-wide text-gray-300">
              {summary}
            </p>
          </div>
          <div
            data-res-acts
            className="flex w-full flex-col gap-2 sm:w-[212px]"
          >
            <button
              onClick={onAgain}
              className="w-full bg-[#51a7d5] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#51a7d5]/90 active:scale-[0.98]"
            >
              Race again
            </button>
            <button
              onClick={onMenu}
              className="w-full border border-white/12 bg-white/5 px-6 py-3 text-[14px] font-medium text-gray-100 transition hover:bg-white/10 active:scale-[0.98]"
            >
              Back to the start
            </button>
          </div>
        </div>

        {readyNotice && (
          <div
            data-res-note
            className="mt-4 w-full max-w-[420px] border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-[13px] font-medium text-amber-200 sm:w-auto"
          >
            {readyNotice}
          </div>
        )}

        {}
        <div className="no-scrollbar mt-auto max-h-[46vh] overflow-y-auto border-t border-white/10">
          {race.standings.map((row, i) => (
            <div
              key={row.id}
              data-res-row
              className={`grid h-10 grid-cols-[44px_1fr_auto] items-center border-b border-white/5 ${
                row.isPlayer ? "bg-[#51a7d5]/20" : "bg-black/30"
              }`}
            >
              <div
                className={`grid h-full w-11 place-items-center border-r border-white/5 text-[13px] font-bold tabular-nums ${
                  i === 0
                    ? "bg-[#e30613] text-white"
                    : row.isPlayer
                      ? "bg-[#51a7d5] text-[#0b0e14]"
                      : "bg-white/[0.04] text-gray-400"
                }`}
              >
                {i + 1}
              </div>
              <div className="flex min-w-0 items-center gap-2.5 px-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
                <span
                  className={`truncate text-[14px] ${
                    row.isPlayer ? "font-semibold text-white" : "text-gray-200"
                  }`}
                >
                  {row.name}
                </span>
                {row.isPlayer && (
                  <span className="bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#0b0e14]">
                    YOU
                  </span>
                )}
              </div>
              <span
                className={`mr-4 text-[13px] tabular-nums md:mr-6 ${
                  row.finished ? "text-gray-200" : "text-gray-500"
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
