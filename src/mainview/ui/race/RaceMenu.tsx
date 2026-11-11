import { enginePeaks } from "../../physics/vehicle/components/Engine"
import { type ReactNode } from "react"
import {
  RACE_COUNTS,
  RACE_DISTANCES_KM,
  TRAFFIC_OPTIONS,
  trafficCountFor,
  type TrafficLevel,
} from "../../systems/RaceTypes"
import type { CarDefinition } from "../../data/schema"
import { TuningPanel } from "../TuningPanel"
import { EASE, Screen } from "../anim"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_LABELS,
} from "../../constants/timeOfDay"
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderPinwheel,
  Settings,
  Swords,
} from "lucide-react"

export function RaceMenu({
  open,
  rivals,
  distanceKm,
  onRivals,
  onDistance,
  lapMode = false,
  cars,
  carId,
  onPrevCar,
  onNextCar,
  pool,
  onTogglePool,
  traffic,
  onTraffic,
  racesEnabled = true,
  trafficEnabled = true,
  mapPicker,
  onFreeDrive,
  onStartRace,
  onOpenMultiplayer,
  onOpenSettings,
  onBack,
  timeOfDay,
  onTimeOfDay,
}: {
  open: boolean
  rivals: number
  distanceKm: number
  onRivals: (n: (typeof RACE_COUNTS)[number]) => void
  onDistance: (km: (typeof RACE_DISTANCES_KM)[number]) => void
  lapMode?: boolean
  cars: CarDefinition[]
  carId: string
  onPrevCar: () => void
  onNextCar: () => void
  pool: string[]
  onTogglePool: (id: string) => void
  traffic: TrafficLevel
  onTraffic: (level: TrafficLevel) => void
  racesEnabled?: boolean
  trafficEnabled?: boolean
  mapPicker?: ReactNode
  onFreeDrive: () => void
  onStartRace: () => void
  onOpenMultiplayer?: () => void
  onOpenSettings?: () => void
  onBack?: () => void
  timeOfDay?: TimeOfDayMode
  onTimeOfDay?: (tod: TimeOfDayMode) => void
}) {
  const idx = Math.max(
    0,
    cars.findIndex((c) => c.id === carId),
  )
  const selected = cars[idx] ?? cars[0]
  const specRows: [string, string][] = selected
    ? [
        [
          "POWER",
          `${Math.round(enginePeaks(selected.physics.engine).powerHP)} HP`,
        ],
        ["TORQUE", `${selected.physics.engine.maxTorqueNm} Nm`],
        ["0–100 KM/H", `${selected.tested.zeroToHundredS.toFixed(1)} s`],
        ["TOP SPEED", `${selected.tested.topSpeedKmh} km/h`],
        ["DRIVE", selected.physics.drivetrain.type.toUpperCase()],
        ["WEIGHT", `${selected.physics.mass.chassis} kg`],
        ["REDLINE", `${selected.physics.engine.redlineRPM} rpm`],
        [
          "GEARBOX",
          `${selected.physics.transmission.gearRatios.length}-speed auto`,
        ],
      ]
    : []
  return (
    <Screen
      open={open}
      className="pointer-events-none absolute inset-0 flex flex-col md:flex-row"
      from={{ autoAlpha: 0 }}
      exit={{ duration: 0.26, ease: EASE.in }}
      stagger={[
        { selector: "[data-panel]", from: { autoAlpha: 0 }, delay: 0.05 },
        {
          selector: "[data-fade]",
          from: { autoAlpha: 0 },
          each: 0.07,
          delay: 0.12,
        },
      ]}
    >
      {}
      <div className="relative min-h-[30vh] flex-1">
        {onBack && (
          <button
            data-fade
            onClick={onBack}
            title="Back to main screen"
            className="pointer-events-auto absolute top-4 left-16 z-10 flex items-center gap-1.5 border border-[#51a7d5] bg-[#0b0e14]/85 px-3 py-2 text-xs font-semibold text-[#6ec2f0] backdrop-blur transition hover:bg-[#51a7d5]/25 hover:text-white active:scale-95"
          >
            <ChevronLeft size={15} />
            Back
          </button>
        )}
        {onOpenSettings && (
          <button
            data-fade
            onClick={onOpenSettings}
            title="Graphics & Resolution Settings"
            className="pointer-events-auto absolute top-4 left-4 z-10 border border-[#51a7d5] bg-[#0b0e14]/85 px-3 py-2 text-xs font-semibold text-[#6ec2f0] backdrop-blur transition hover:bg-[#51a7d5]/25 hover:text-white active:scale-95"
          >
            <Settings size={15} />
          </button>
        )}
        <button
          data-fade
          onClick={onPrevCar}
          aria-label="Previous car"
          className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2 border border-[#51a7d5] bg-[#51a7d5]/15 p-3 text-2xl font-bold text-white backdrop-blur transition-colors hover:bg-[#51a7d5]/25 active:scale-95 md:left-6"
        >
          <ChevronLeft />
        </button>
        <button
          data-fade
          onClick={onNextCar}
          aria-label="Next car"
          className="pointer-events-auto absolute top-1/2 right-3 -translate-y-1/2 border border-[#51a7d5] bg-[#51a7d5]/15 p-3 text-2xl font-bold text-white backdrop-blur transition-colors hover:bg-[#51a7d5]/25 active:scale-95 md:right-6"
        >
          <ChevronRight />
        </button>
        <div
          data-fade
          className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-4 py-1 text-[12px] tracking-widest text-gray-200 backdrop-blur"
        >
          {idx + 1} / {cars.length}
        </div>
      </div>
      <div
        data-panel
        className="pointer-events-auto relative max-h-[62vh] w-full overflow-y-auto border-white/10 bg-[#0b0e14]/94 shadow-[0_30px_100px_rgba(0,0,0,0.7)] no-scrollbar md:max-h-none md:h-full md:w-[400px] md:border-l"
      >
        <div className="p-6">
          <div className="flex items-center justify-between gap-2">
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
              {selected?.name ?? "Choose your car"}
            </h1>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1.5">
            {specRows.map(([k, v]) => (
              <div
                key={k}
                className="bg-[#51a7d5]/15 border border-[#51a7d5] px-3 py-2"
              >
                <div className="text-[10px] font-semibold tracking-[0.18em] text-[#8f99a8]">
                  {k}
                </div>
                <div className="text-[15px] font-bold text-white tabular-nums">
                  {v}
                </div>
              </div>
            ))}
          </div>

          {cars.find((c) => c.id === carId) && (
            <TuningPanel car={cars.find((c) => c.id === carId)!} />
          )}

          {mapPicker}

          <div className="mt-5 text-left">
            {racesEnabled && (
              <>
                <div className="text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
                  RIVALS (AI)
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RACE_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => onRivals(n)}
                      className={`min-w-[44px] flex-1 border border-[#51a7d5] py-2 text-[13px] font-semibold transition ${
                        rivals === n
                          ? "bg-white text-[#0b0e14]"
                          : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-[11px] uppercase font-semibold tracking-[0.22em] text-[#8f99a8]">
                  Cars To Include / Exclude
                </div>
                {pool.length === 0 && (
                  <div className="mt-1 text-[12px] text-gray-400">
                    None selected. Every car shows up.
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cars.map((c) => {
                    const on = pool.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => onTogglePool(c.id)}
                        title={
                          on ? "Exclude from AI grid" : "Include in AI grid"
                        }
                        className={`border border-[#51a7d5] px-3 py-2 text-[12px] font-semibold transition ${
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
                <div className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
                  {lapMode ? "RACE LAPS" : "RACE DISTANCE"}
                </div>
                <div className="mt-2 flex gap-1.5">
                  {RACE_DISTANCES_KM.map((km) => (
                    <button
                      key={km}
                      onClick={() => onDistance(km)}
                      className={`flex-1 border border-[#51a7d5] py-2 text-[13px] font-semibold transition ${
                        distanceKm === km
                          ? "bg-white text-[#0b0e14]"
                          : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
                      }`}
                    >
                      {lapMode
                        ? `${km} ${km === 1 ? "lap" : "laps"}`
                        : `${km} km`}
                    </button>
                  ))}
                </div>
              </>
            )}
            {trafficEnabled && (
              <>
                <div className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
                  FREE-ROAM TRAFFIC
                </div>
                <div className="mt-2 flex gap-1.5">
                  {TRAFFIC_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => onTraffic(o.id)}
                      className={`flex-1 border border-[#51a7d5] py-2 text-[13px] font-semibold transition ${
                        traffic === o.id
                          ? "bg-white text-[#0b0e14]"
                          : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[12px] text-gray-400">
                  {traffic === "off"
                    ? "Empty roads when free roaming."
                    : `${trafficCountFor(traffic)} AI cruisers share the road in free roam.`}
                </div>
              </>
            )}

            <div className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
              TIME OF DAY
            </div>
            <div className="mt-2 flex gap-1.5">
              {TIME_OF_DAY_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => onTimeOfDay?.(m)}
                  className={`flex-1 border border-[#51a7d5] py-2 text-[13px] font-semibold transition ${
                    (timeOfDay ?? "day") === m
                      ? "bg-white text-[#0b0e14]"
                      : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
                  }`}
                >
                  {TIME_OF_DAY_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {racesEnabled && (
            <button
              onClick={onStartRace}
              className="mt-6 w-full bg-[#51a7d5] px-10 py-3.5 text-[15px] font-semibold tracking-wide text-white transition hover:bg-[#51a7d5]/90 inline-flex gap-1 items-center justify-center"
            >
              <ArrowUpRight size={20} />
              Start Race (Singleplayer)
            </button>
          )}
          {racesEnabled && onOpenMultiplayer && (
            <button
              onClick={onOpenMultiplayer}
              className="mt-2.5 w-full border border-[#51a7d5] bg-[#51a7d5]/15 px-6 py-3 text-[14px] font-semibold text-[#6ec2f0] transition hover:bg-[#51a7d5]/25 active:scale-[0.98] inline-flex items-center justify-center gap-1"
            >
              <Swords size={20} />
              Multiplayer Lobby
            </button>
          )}
          <button
            onClick={onFreeDrive}
            className="mt-2.5 w-full border border-white/12 bg-white/5 px-6 py-3 text-[14px] font-medium text-gray-100 transition hover:bg-white/10 active:scale-[0.98]  inline-flex items-center justify-center gap-1"
          >
            <LoaderPinwheel size={20} />
            {!trafficEnabled || traffic === "off"
              ? "Free Roam"
              : `Free Roam · ${TRAFFIC_OPTIONS.find((o) => o.id === traffic)?.label} traffic`}
          </button>
        </div>
      </div>
    </Screen>
  )
}
