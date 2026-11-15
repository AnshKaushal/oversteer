import { ArrowRight } from "lucide-react"
import { EASE, Screen } from "../anim"
import { useRef } from "react"
import { useMenuGamepadNav } from "../useMenuGamepadNav"
import {
  TRAFFIC_OPTIONS,
  type RaceSnapshot,
  type TrafficLevel,
} from "../../systems/RaceTypes"
import type { PeerPlayer } from "../../systems/net/types"

export interface PauseScreenProps {
  open: boolean
  race: RaceSnapshot
  netConnected: boolean
  netPeers: PeerPlayer[]
  trafficLevel: TrafficLevel
  resumeGame: () => void
  restart: () => void
  quitToMenu: () => void
  setShowSettings: (v: boolean) => void
  gamepadNav?: boolean
}

const ROW =
  "group flex w-full items-center justify-between gap-6 px-6 py-4 text-left transition-colors duration-150 md:px-8 md:py-5"

export function PauseScreen({
  open,
  race,
  netConnected,
  netPeers,
  trafficLevel,
  resumeGame,
  restart,
  quitToMenu,
  setShowSettings,
  gamepadNav = true,
}: PauseScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useMenuGamepadNav(open && gamepadNav, rootRef, resumeGame)

  const mode = netConnected
    ? `Online · ${netPeers.length + 1} player${netPeers.length === 0 ? "" : "s"}`
    : race.active
      ? `Race · ${race.total} cars · ${(race.distanceM / 1000).toFixed(1)} km`
      : `Free roam · ${TRAFFIC_OPTIONS.find((o) => o.id === trafficLevel)?.label} traffic`

  const items: {
    label: string
    hint: string
    onClick: () => void
    primary?: boolean
  }[] = [
    { label: "Resume", hint: "P", onClick: resumeGame, primary: true },
    { label: "Restart", hint: "", onClick: restart },
    { label: "Settings", hint: "", onClick: () => setShowSettings(true) },
    { label: "Quit to start", hint: "", onClick: quitToMenu },
  ]

  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[110] overflow-y-auto bg-[#0a0a0a]/30 text-[#efefef]"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.3, ease: EASE.out }}
      exit={{ duration: 0.2, ease: EASE.in }}
      stagger={[
        { selector: "[data-pause-head]", from: { autoAlpha: 0 } },
        {
          selector: "[data-pause-row]",
          from: { autoAlpha: 0 },
          each: 0.06,
          delay: 0.08,
        },
        { selector: "[data-pause-foot]", from: { autoAlpha: 0 }, delay: 0.3 },
      ]}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-[60%]"
        style={{
          background:
            "linear-gradient(90deg, rgba(11,14,20,0.92) 0%, rgba(11,14,20,0.6) 55%, rgba(11,14,20,0) 100%)",
        }}
      />
      <div
        ref={rootRef}
        className="relative mx-auto flex min-h-full w-full flex-col justify-center px-6 py-10 md:px-16"
      >
        <div data-pause-head className="mb-8 md:mb-10">
          <h1
            className="font-black uppercase leading-[0.82] tracking-tighter text-[#efefef]"
            style={{ fontSize: "clamp(56px, 11vw, 168px)" }}
          >
            Paused
          </h1>
        </div>

        <div className="flex w-full flex-col gap-[3px] md:w-[560px]">
          {items.map((it) => (
            <button
              key={it.label}
              data-pause-row
              onClick={it.onClick}
              className={`${ROW} ${
                it.primary
                  ? "bg-[#51a7d5] text-[#0a0a0a] hover:bg-[#efefef]"
                  : "bg-[#0a0a0a] text-[#efefef] hover:bg-[#efefef] hover:text-[#0a0a0a]"
              }`}
            >
              <span className="w-full flex items-baseline justify-between gap-5">
                <span className="text-[26px] font-extrabold uppercase leading-none tracking-tight md:text-[34px]">
                  {it.label}
                </span>

                <ArrowRight
                  size={22}
                  strokeWidth={2.5}
                  className="transition-transform duration-150 group-hover:translate-x-1"
                />
              </span>
            </button>
          ))}
        </div>

        <div
          data-pause-foot
          className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] font-bold uppercase tracking-[0.18em]"
        >
          <span className="bg-[#0a0a0a] px-2.5 py-1 text-[#efefef]">
            {mode}
          </span>
        </div>
      </div>
    </Screen>
  )
}
