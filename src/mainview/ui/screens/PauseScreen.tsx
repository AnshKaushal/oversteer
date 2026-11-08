import { Play, RotateCcw, LogOut, Settings } from "lucide-react"
import { EASE, Screen } from "../anim"
import { getCar } from "../../data/cars"
import {
  TRAFFIC_OPTIONS,
  type RaceSnapshot,
  type TrafficLevel,
} from "../../systems/RaceTypes"
import type { PeerPlayer } from "../../systems/net/types"

export interface PauseScreenProps {
  open: boolean
  carId: string
  race: RaceSnapshot
  netConnected: boolean
  netPeers: PeerPlayer[]
  trafficLevel: TrafficLevel
  resumeGame: () => void
  restart: () => void
  quitToMenu: () => void
  setShowSettings: (v: boolean) => void
}

export function PauseScreen({
  open,
  carId,
  race,
  netConnected,
  netPeers,
  trafficLevel,
  resumeGame,
  restart,
  quitToMenu,
  setShowSettings,
}: PauseScreenProps) {
  return (
    <Screen
      open={open}
      className="absolute inset-0 overflow-y-auto bg-black/55 backdrop-blur-[2px]"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.3, ease: EASE.out }}
      exit={{ duration: 0.2, ease: EASE.in }}
      stagger={[
        { selector: "[data-pause-head]", from: { autoAlpha: 0 } },
        { selector: "[data-pause-acts]", from: { autoAlpha: 0 } },
        {
          selector: "[data-pause-row]",
          from: { autoAlpha: 0 },
          each: 0.035,
          delay: 0.1,
        },
      ]}
    >
      <div className="flex min-h-full flex-col p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div data-pause-head>
            <div
              className="mb-2 h-2.5 w-20"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#51a7d5 0% 25%, #0b0e14 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            <span className="text-[64px] font-bold leading-[0.9] tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] md:text-[96px]">
              Paused
            </span>
            <p className="mt-2 text-[13px] tracking-wide text-gray-300">
              {netConnected
                ? `${getCar(carId).name} · Online · ${netPeers.length + 1} player${netPeers.length === 0 ? "" : "s"}`
                : race.active
                  ? `${getCar(carId).name} · Race · ${race.total} cars · ${(race.distanceM / 1000).toFixed(1)} km`
                  : `${getCar(carId).name} · Free Roam · ${TRAFFIC_OPTIONS.find((o) => o.id === trafficLevel)?.label} traffic`}
            </p>
          </div>
          <div
            data-pause-acts
            className="flex w-full flex-col gap-2 sm:w-[280px]"
          >
            <button
              onClick={resumeGame}
              className="w-full bg-[#51a7d5] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#51a7d5]/90 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <Play size={16} />
              Keep driving
            </button>
            <button
              onClick={() => {
                restart()
              }}
              className="w-full border border-[#51a7d5] bg-[#51a7d5]/15 px-6 py-3 text-[14px] font-semibold text-[#6ec2f0] transition hover:bg-[#51a7d5]/25 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Restart
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-full border border-[#51a7d5]/40 bg-[#51a7d5]/10 px-6 py-3 text-[14px] font-medium text-[#6ec2f0] transition hover:bg-[#51a7d5]/20 hover:text-white active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <Settings size={16} />
              Settings
            </button>
            <button
              onClick={quitToMenu}
              className="w-full border border-white/12 bg-white/5 px-6 py-3 text-[14px] font-medium text-gray-100 transition hover:bg-white/10 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Back to the start
            </button>
          </div>
        </div>

        {}
        <div className="no-scrollbar mt-auto border-t border-white/10 max-w-[300px]">
          {(
            [
              ["P", "Pause"],
              ["Space", "Handbrake (tap to latch)"],
              ["L", "Launch control"],
              ["E", "Shift up"],
              ["Q", "Shift down"],
              ["M", "Transmission mode"],
              ["X", "Traction control"],
              ["G", "Stability control"],
              ["B", "ABS"],
              ["N", "Safety aids"],
              ["V", "Tap: ignition · Hold: start engine"],
              [";", "Cruise control"],
              ["[ ]", "Cruise set / resume"],
              ["H", "Headlights"],
              ["T", "Time of day"],
              ["R", "Put car back on road"],
              ["C", "Camera view"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              data-pause-row
              className="grid h-9 grid-cols-[52px_1fr] items-center border-b border-white/5 bg-black/30"
            >
              <div
                className={`grid h-full place-items-center border-r border-white/5 text-[12px] font-bold ${
                  key === "P"
                    ? "bg-[#51a7d5] text-[#0b0e14]"
                    : "bg-white/[0.04] text-gray-400"
                }`}
              >
                {key}
              </div>
              <span className="px-3 text-[14px] text-gray-200">{label}</span>
            </div>
          ))}
          <div
            data-pause-row
            className="py-2 text-center text-[12px] text-gray-500"
          >
            press P to keep driving
          </div>
        </div>
      </div>
    </Screen>
  )
}
