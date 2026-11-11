import { createPortal } from "react-dom"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderPinwheel,
  Settings,
  Swords,
} from "lucide-react"
import { enginePeaks } from "../../physics/vehicle/components/Engine"
import {
  RACE_COUNTS,
  RACE_DISTANCES_KM,
  TRAFFIC_OPTIONS,
  trafficCountFor,
  type TrafficLevel,
} from "../../systems/RaceTypes"
import {
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_MODES,
  type TimeOfDayMode,
} from "../../constants/timeOfDay"
import type { CarDefinition } from "../../data/schema"
import { SURFACES, type SurfaceId } from "../../systems/garageSurfaces"
import { setBoardElement, setPillElement } from "../../systems/garageBoard"
import { setFocus, setHot, useFocus, useHot } from "../../systems/garageFocus"
import { EASE, Screen } from "../anim"
import { PaintPicker } from "../PaintPicker"
import { TuneBoard } from "./TuneBoard"
import { DynoHud } from "./DynoHud"
import { dyno } from "../../systems/dyno"
import { useTuning } from "../../data/tuning"
import { tunedStats } from "../../data/tuningFx"
import { useGarageNav } from "./useGarageNav"

const label = "text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]"
const chip = (on: boolean) =>
  `flex-1 border border-[#51a7d5] py-1.5 text-[13px] font-semibold transition ${
    on
      ? "bg-white text-[#0b0e14]"
      : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
  }`

export interface GarageSceneProps {
  open: boolean
  cars: CarDefinition[]
  carId: string
  onPrevCar: () => void
  onNextCar: () => void
  paint: number | null
  onPaint: (color: number | null) => void
  rivals: number
  onRivals: (n: (typeof RACE_COUNTS)[number]) => void
  distanceKm: number
  onDistance: (km: (typeof RACE_DISTANCES_KM)[number]) => void
  lapMode: boolean
  pool: string[]
  onTogglePool: (id: string) => void
  traffic: TrafficLevel
  onTraffic: (level: TrafficLevel) => void
  racesEnabled: boolean
  trafficEnabled: boolean
  mapPicker: ReactNode
  timeOfDay?: TimeOfDayMode
  onTimeOfDay: (tod: TimeOfDayMode) => void
  onFreeDrive: () => void
  onStartRace: () => void
  onOpenMultiplayer: () => void
  onOpenSettings: () => void
  onBack: () => void
}

/** One in-world screen: registered so the session can warp it onto the wall. */
function Surface({
  id,
  focused,
  children,
}: {
  id: SurfaceId
  focused: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const def = SURFACES.find((s) => s.id === id)!
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setHost(document.getElementById("garage-boards"))
  }, [])
  useLayoutEffect(() => {
    setBoardElement(id, ref.current)
    return () => setBoardElement(id, null)
  }, [id, host])
  const node = (
    <div
      ref={ref}
      className={`absolute top-0 left-0 origin-top-left overflow-hidden text-white ${
        focused ? "pointer-events-auto" : "pointer-events-none"
      } ${def.real ? "p-10" : "bg-[#0c0f14] p-7"}`}
      style={{ width: def.px[0], height: def.px[1], visibility: "hidden" }}
    >
      {children}
    </div>
  )
  return host ? createPortal(node, host) : null
}

function Pill({
  id,
  hot,
  onPick,
}: {
  id: SurfaceId
  hot: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    setPillElement(id, ref.current)
    return () => setPillElement(id, null)
  }, [id])
  const def = SURFACES.find((s) => s.id === id)!
  return (
    <button
      ref={ref}
      onClick={onPick}
      onMouseEnter={() => setHot(id)}
      className={`pointer-events-auto absolute top-0 left-0 z-[100] flex items-center gap-2 border px-3 py-1.5 text-[12px] font-semibold tracking-wide whitespace-nowrap backdrop-blur transition-colors ${
        hot
          ? "border-white bg-white text-[#0b0e14]"
          : "border-[#51a7d5] bg-[#0b0e14]/80 text-[#6ec2f0] hover:bg-[#51a7d5]/30 hover:text-white"
      }`}
      style={{ visibility: "hidden" }}
    >
      <span
        className={`h-2 w-2 rounded-full ${hot ? "bg-[#0b0e14]" : "animate-pulse bg-[#51a7d5]"}`}
      />
      {def.label}
    </button>
  )
}

function Title({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[30px] leading-none font-bold">{children}</div>
  )
}

function SpecsBoard({ car }: { car: CarDefinition }) {
  // Same source as the tuning board, so the figures always agree.
  const tuning = useTuning(car.id)
  const stats = useMemo(() => tunedStats(car, tuning), [car, tuning])
  const peaks = useMemo(() => enginePeaks(car.physics.engine), [car])
  const modified = Object.values(tuning).some((v) => Math.abs(v - 1) > 0.004)
  const rows: [string, string][] = [
    ["POWER", `${Math.round(peaks.powerHP)} HP`],
    ["TORQUE", `${Math.round(peaks.torqueNm)} Nm`],
    ["0–100 KM/H", `${stats.zeroTo100.toFixed(1)} s`],
    ["TOP SPEED", `${Math.round(stats.topKmh)} km/h`],
    ["DRIVE", car.physics.drivetrain.type.toUpperCase()],
    ["WEIGHT", `${car.physics.mass.chassis} kg`],
    ["REDLINE", `${car.physics.engine.redlineRPM} rpm`],
    ["GEARBOX", `${car.physics.transmission.gearRatios.length}-speed auto`],
  ]
  return (
    <>
      <Title>{car.name}</Title>
      {modified && (
        <div className="-mt-1 mb-2 text-[10px] font-bold tracking-[0.2em] text-[#ffb020]">
          TUNED · 0–100 AND TOP SPEED INCLUDE YOUR TUNING
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="border border-[#51a7d5] bg-[#51a7d5]/15 px-2.5 py-2"
          >
            <div className="text-[9px] font-semibold tracking-[0.18em] text-[#8f99a8]">
              {k}
            </div>
            <div
              className={`text-[15px] font-bold tabular-nums ${
                modified && (k === "TOP SPEED" || k.startsWith("0–100"))
                  ? "text-[#ffb020]"
                  : ""
              }`}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function RaceBoard(p: GarageSceneProps) {
  return (
    <>
      <Title>Race setup</Title>
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          {p.racesEnabled && (
            <>
              <div className={label}>RIVALS (AI)</div>
              <div className="mt-1.5 flex gap-1.5">
                {RACE_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => p.onRivals(n)}
                    className={chip(p.rivals === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className={`${label} mt-3`}>
                {p.lapMode ? "RACE LAPS" : "RACE DISTANCE"}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {RACE_DISTANCES_KM.map((km) => (
                  <button
                    key={km}
                    onClick={() => p.onDistance(km)}
                    className={chip(p.distanceKm === km)}
                  >
                    {p.lapMode
                      ? `${km} ${km === 1 ? "lap" : "laps"}`
                      : `${km} km`}
                  </button>
                ))}
              </div>
            </>
          )}
          {p.trafficEnabled && (
            <>
              <div className={`${label} mt-3`}>FREE-ROAM TRAFFIC</div>
              <div className="mt-1.5 flex gap-1.5">
                {TRAFFIC_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => p.onTraffic(o.id)}
                    className={chip(p.traffic === o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                {p.traffic === "off"
                  ? "Empty roads when free roaming."
                  : `${trafficCountFor(p.traffic)} AI cruisers in free roam.`}
              </div>
            </>
          )}
          <div className={`${label} mt-3`}>TIME OF DAY</div>
          <div className="mt-1.5 flex gap-1.5">
            {TIME_OF_DAY_MODES.map((m) => (
              <button
                key={m}
                onClick={() => p.onTimeOfDay(m)}
                className={chip((p.timeOfDay ?? "day") === m)}
              >
                {TIME_OF_DAY_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          {p.racesEnabled && (
            <>
              <div className={label}>AI CARS · INCLUDE / EXCLUDE</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.cars.map((c) => {
                  const on = p.pool.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => p.onTogglePool(c.id)}
                      className={`border border-[#51a7d5] px-2.5 py-1.5 text-[12px] font-semibold transition ${
                        on
                          ? "bg-[#51a7d5]/15 text-white hover:bg-[#51a7d5]/25"
                          : "bg-red-500/30 text-gray-300 line-through hover:bg-red-500/50"
                      }`}
                    >
                      {c.shortName}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div className="no-scrollbar max-h-[190px] overflow-y-auto">
            {p.mapPicker}
          </div>
        </div>
      </div>
    </>
  )
}

function DriveBoard(p: GarageSceneProps) {
  const btn =
    "inline-flex w-full items-center justify-center gap-2 px-4 py-4 text-[15px] font-semibold transition"
  return (
    <>
      <Title>Drive</Title>
      <div className="flex flex-col gap-3">
        {p.racesEnabled && (
          <button
            onClick={p.onStartRace}
            className={`${btn} bg-[#51a7d5] text-white hover:bg-[#51a7d5]/90`}
          >
            <ArrowUpRight size={20} />
            Start Race
          </button>
        )}
        {p.racesEnabled && (
          <button
            onClick={p.onOpenMultiplayer}
            className={`${btn} border border-[#51a7d5] bg-[#51a7d5]/15 text-[#6ec2f0] hover:bg-[#51a7d5]/25`}
          >
            <Swords size={20} />
            Multiplayer
          </button>
        )}
        <button
          onClick={p.onFreeDrive}
          className={`${btn} border border-white/15 bg-white/5 text-gray-100 hover:bg-white/10`}
        >
          <LoaderPinwheel size={20} />
          Free Roam
        </button>
      </div>
    </>
  )
}

const hudBtn =
  "pointer-events-auto relative z-[90] flex items-center gap-1.5 border border-[#51a7d5] bg-[#0b0e14]/85 px-3 py-2 text-xs font-semibold text-[#6ec2f0] backdrop-blur transition hover:bg-[#51a7d5]/25 hover:text-white active:scale-95"
const arrowBtn =
  "pointer-events-auto absolute z-[90] top-1/2 -translate-y-1/2 border border-[#51a7d5] bg-[#51a7d5]/15 p-3 text-white backdrop-blur transition-colors hover:bg-[#51a7d5]/25 active:scale-95"

/**
 * The garage as the menu: every setting lives on a screen in the room. Click a
 * hotspot (or use the d-pad) and the camera moves in on that screen.
 */
export function GarageScene(p: GarageSceneProps) {
  const focus = useFocus()
  const hot = useHot()
  const idx = Math.max(
    0,
    p.cars.findIndex((c) => c.id === p.carId),
  )
  const car = p.cars[idx] ?? p.cars[0]
  const { onPrevCar, onNextCar } = p
  const stepCar = useCallback(
    (d: 1 | -1) => (d < 0 ? onPrevCar() : onNextCar()),
    [onPrevCar, onNextCar],
  )
  useGarageNav(p.open, stepCar)

  useEffect(
    () => () => {
      setFocus(null)
      setHot(null)
    },
    [],
  )
  // Enter the dyno when its view is open; leaving (or switching car) stops it.
  const carId = p.carId
  useEffect(() => {
    if (focus !== "dyno") return
    dyno.enter(carId)
    return () => dyno.leave()
  }, [focus, carId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus) setFocus(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus])

  const focusDef = SURFACES.find((s) => s.id === focus)
  return (
    <Screen
      open={p.open}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      from={{ autoAlpha: 0 }}
      exit={{ duration: 0.26, ease: EASE.in }}
    >
      <style>{`[data-pad-focus]{outline:3px solid #fff;outline-offset:2px}`}</style>
      <Surface id="paint" focused={focus === "paint"}>
        <div className="mb-4 text-[34px] leading-none font-bold">Color</div>
        <div
          className="origin-top-left [&_button]:cursor-pointer"
          style={{ width: (600 - 80) / 1.5, transform: "scale(1.5)" }}
        >
          <PaintPicker value={p.paint} showStock onPick={p.onPaint} />
        </div>
      </Surface>
      <Surface id="specs" focused={focus === "specs"}>
        {car && <SpecsBoard car={car} />}
      </Surface>
      <Surface id="tune" focused={focus === "tune"}>
        {car && <TuneBoard car={car} onDyno={() => setFocus("dyno")} />}
      </Surface>
      <Surface id="race" focused={focus === "race"}>
        <RaceBoard {...p} />
      </Surface>
      <Surface id="drive" focused={focus === "drive"}>
        <DriveBoard {...p} />
      </Surface>

      {focus === "dyno" && car && <DynoHud carName={car.name} />}

      {SURFACES.map((s) => (
        <Pill
          key={s.id}
          id={s.id}
          hot={hot === s.id}
          onPick={() => setFocus(s.id)}
        />
      ))}

      <div className="absolute top-4 left-4 z-[90] flex gap-2">
        <button
          onClick={p.onOpenSettings}
          title="Graphics & Resolution Settings"
          className={hudBtn}
        >
          <Settings size={15} />
        </button>
        <button
          onClick={p.onBack}
          title="Back to main screen"
          className={hudBtn}
        >
          <ChevronLeft size={15} />
          Menu
        </button>
      </div>
      {focusDef && (
        <button
          onClick={() => setFocus(null)}
          className={`${hudBtn} !absolute top-4 left-1/2 -translate-x-1/2`}
        >
          <ChevronLeft size={15} />
          Back to garage · {focusDef.label}
        </button>
      )}

      {!focus && (
        <>
          <button
            onClick={p.onPrevCar}
            aria-label="Previous car"
            className={`${arrowBtn} left-3 md:left-6`}
          >
            <ChevronLeft />
          </button>
          <button
            onClick={p.onNextCar}
            aria-label="Next car"
            className={`${arrowBtn} right-3 md:right-6`}
          >
            <ChevronRight />
          </button>
        </>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-1">
        {!focus && (
          <div className="rounded-full border border-white/10 bg-black/55 px-4 py-1 text-[12px] tracking-widest text-gray-200 backdrop-blur">
            {car?.name} · {idx + 1} / {p.cars.length}
          </div>
        )}
        <div className="text-[10px] tracking-wider text-gray-400">
          {focus === "dyno"
            ? "W throttle · S brake · Q / E gear · drag to look · Esc back"
            : focus
              ? "Esc / B — back   ·   D-pad — move   ·   A — select"
              : "Click a screen   ·   D-pad — choose   ·   A — open   ·   LB / RB — car"}
        </div>
      </div>
    </Screen>
  )
}
