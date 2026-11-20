import { createPortal } from "react-dom"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChevronLeft, ChevronRight, Settings } from "lucide-react"
import {
  RACE_COUNTS,
  RACE_DISTANCES_KM,
  type TrafficLevel,
} from "../../systems/RaceTypes"
import type { TimeOfDayMode } from "../../constants/timeOfDay"
import type { CarDefinition } from "../../data/schema"
import { SURFACES, type SurfaceId } from "../../systems/garageSurfaces"
import { setBoardElement, setPillElement } from "../../systems/garageBoard"
import { setFocus, setHot, useFocus, useHot } from "../../systems/garageFocus"
import { EASE, Screen } from "../anim"
import { PaintPicker } from "../PaintPicker"
import { TuneBoard } from "./TuneBoard"
import { DynoHud } from "./DynoHud"
import { DriveBoard, RaceBoard, SpecsBoard } from "./boards"
import { ACCENT, BoardHeader, accentFill, screenBg } from "./kit"
import { dyno } from "../../systems/dyno"
import { useGarageNav } from "./useGarageNav"

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
  gamepadNav?: boolean
}

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
        focused || id === "paint"
          ? "pointer-events-auto"
          : "pointer-events-none"
      } ${def.real ? "p-10" : "p-7"}`}
      style={{
        width: def.px[0],
        height: def.px[1],
        visibility: "hidden",
        ...(def.real ? null : screenBg),
      }}
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
      aria-label={def.label}
      className="group pointer-events-auto absolute top-0 left-0 z-[100] h-11 w-11"
      style={{ visibility: "hidden" }}
    >
      <span
        className={`absolute inset-0 border backdrop-blur-md transition-all duration-200 ${
          hot
            ? "scale-110 border-white/70 bg-white/25"
            : "border-white/35 bg-black/35"
        }`}
      />
      <span
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
          hot ? "h-4 w-4 bg-white" : "h-3 w-3"
        }`}
        style={hot ? undefined : { background: ACCENT }}
      />
      <span
        className={`absolute top-1/2 left-full ml-3 -translate-y-1/2 border px-4 py-1.5 text-[13px] font-semibold whitespace-nowrap backdrop-blur-md transition-all duration-200 group-data-[side=left]:right-full group-data-[side=left]:left-auto group-data-[side=left]:mr-3 group-data-[side=left]:ml-0 ${
          hot
            ? "translate-x-1 border-transparent text-white group-data-[side=left]:-translate-x-1"
            : "border-white/15 bg-black/45 text-gray-100"
        }`}
        style={hot ? { background: accentFill } : undefined}
      >
        {def.label}
      </span>
    </button>
  )
}

const hudBtn =
  "pointer-events-auto relative z-[90] flex items-center gap-2 border border-white/15 bg-black/45 px-4 py-2 text-[13px] font-semibold text-gray-100 backdrop-blur-md transition hover:bg-white/15 hover:text-white active:scale-95"
const arrowBtn =
  "pointer-events-auto absolute z-[90] top-1/2 -translate-y-1/2 border border-white/15 bg-black/45 p-3 text-white backdrop-blur-md transition-colors hover:bg-[#51a7d5] active:scale-95"

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
  useGarageNav(p.open && (p.gamepadNav ?? true), stepCar)

  useEffect(
    () => () => {
      setFocus(null)
      setHot(null)
    },
    [],
  )
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
      <style>{`[data-pad-focus]{outline:2px solid #51a7d5;outline-offset:3px}`}</style>
      <Surface id="paint" focused={focus === "paint"}>
        <BoardHeader title="Color" />
        <div
          className="mt-5 origin-top-left [&_button]:cursor-pointer"
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
          <Settings size={14} />
        </button>
        <button
          onClick={p.onBack}
          title="Back to main screen"
          className={hudBtn}
        >
          <ChevronLeft size={14} />
          Menu
        </button>
      </div>
      {focusDef && (
        <button
          data-pad-extra
          onClick={() => setFocus(null)}
          className={`${hudBtn} !absolute top-4 left-1/2 -translate-x-1/2`}
        >
          <ChevronLeft size={14} />
          Garage
          <span className="text-gray-500">/</span>
          <span style={{ color: ACCENT }}>{focusDef.label}</span>
        </button>
      )}

      {!focus && (
        <>
          <button
            onClick={p.onPrevCar}
            aria-label="Previous car"
            data-car-arrow
            className={`${arrowBtn} left-3 md:left-6`}
          >
            <ChevronLeft />
          </button>
          <button
            onClick={p.onNextCar}
            aria-label="Next car"
            data-car-arrow
            className={`${arrowBtn} right-3 md:right-6`}
          >
            <ChevronRight />
          </button>
        </>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
        {!focus && (
          <div className="flex items-center gap-3 border border-white/15 bg-black/45 py-1.5 pr-5 pl-2 backdrop-blur-md">
            <span
              className="px-3 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{ background: accentFill }}
            >
              {idx + 1} / {p.cars.length}
            </span>
            <span className="text-[14px] text-white font-semibold">
              {car?.name}
            </span>
          </div>
        )}
      </div>
    </Screen>
  )
}
