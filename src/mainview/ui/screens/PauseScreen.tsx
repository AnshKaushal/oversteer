import { ArrowRight } from "lucide-react"
import { EASE, Screen } from "../anim"
import { useEffect, useRef, useState } from "react"
import { ControlsGuide } from "../ControlsGuide"
import { useMenuGamepadNav } from "../useMenuGamepadNav"
import { useMenuKeyNav } from "../useMenuKeyNav"
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
  const [showControls, setShowControls] = useState(false)
  const [confirm, setConfirm] = useState<"restart" | "quit" | null>(null)
  useEffect(() => {
    if (!open) {
      setShowControls(false)
      setConfirm(null)
    }
  }, [open])
  useMenuGamepadNav(
    open && gamepadNav,
    rootRef,
    confirm
      ? () => setConfirm(null)
      : showControls
        ? () => setShowControls(false)
        : resumeGame,
  )
  useMenuKeyNav(open && !confirm, rootRef)
  const racing = race.active && !race.finished
  const guard = (kind: "restart" | "quit", run: () => void) => () =>
    racing ? setConfirm(kind) : run()

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
    { label: "Restart", hint: "", onClick: guard("restart", restart) },
    {
      label: "Controls",
      hint: "",
      onClick: () => setShowControls((v) => !v),
    },
    { label: "Settings", hint: "", onClick: () => setShowSettings(true) },
    { label: "Main menu", hint: "", onClick: guard("quit", quitToMenu) },
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
            "linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.6) 55%, rgba(10,10,10,0) 100%)",
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

                <span className="flex items-center gap-4">
                  {it.hint && (
                    <span
                      className={`border px-2 py-0.5 text-[12px] font-bold tracking-widest ${
                        it.primary
                          ? "border-[#0a0a0a]/40 group-hover:border-[#0a0a0a]/40"
                          : "border-[#efefef]/40 group-hover:border-[#0a0a0a]/40"
                      }`}
                    >
                      {it.hint}
                    </span>
                  )}
                  <ArrowRight
                    size={22}
                    strokeWidth={2.5}
                    className="transition-transform duration-150 group-hover:translate-x-1"
                  />
                </span>
              </span>
            </button>
          ))}
        </div>

        {confirm && (
          <div
            role="alertdialog"
            aria-label="Confirm"
            className="mt-[3px] w-full bg-[#0a0a0a] p-6 md:w-[560px]"
          >
            <p className="text-[18px] font-extrabold uppercase tracking-tight">
              {confirm === "restart"
                ? "Restart and lose this race?"
                : "Leave and lose this race?"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-[3px]">
              <button
                autoFocus
                onClick={() => setConfirm(null)}
                className="bg-[#51a7d5] py-3 text-[14px] font-extrabold uppercase tracking-[0.1em] text-[#0a0a0a] outline-none transition-colors hover:bg-[#efefef] focus-visible:bg-[#efefef]"
              >
                Keep racing
              </button>
              <button
                onClick={() => {
                  const k = confirm
                  setConfirm(null)
                  if (k === "restart") restart()
                  else quitToMenu()
                }}
                className="bg-[#efefef] py-3 text-[14px] font-extrabold uppercase tracking-[0.1em] text-[#0a0a0a] outline-none transition-colors hover:bg-[#51a7d5] focus-visible:bg-[#51a7d5]"
              >
                {confirm === "restart" ? "Restart" : "Leave"}
              </button>
            </div>
          </div>
        )}

        {showControls && (
          <div
            role="region"
            aria-label="Controls"
            className="mt-[3px] w-full bg-[#0a0a0a] p-6 md:absolute md:right-16 md:top-1/2 md:mt-0 md:max-h-[80vh] md:w-[640px] md:-translate-y-1/2 md:overflow-y-auto md:p-8"
          >
            <ControlsGuide />
          </div>
        )}

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
