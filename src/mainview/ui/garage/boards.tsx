import { useMemo } from "react"
import { ArrowUpRight, LoaderPinwheel, Swords } from "lucide-react"
import { enginePeaks } from "../../physics/vehicle/components/Engine"
import {
  RACE_COUNTS,
  RACE_DISTANCES_KM,
  TRAFFIC_OPTIONS,
  trafficCountFor,
} from "../../systems/RaceTypes"
import {
  composeMode,
  DAY_PHASES,
  DAY_PHASE_LABELS,
  phaseOf,
  SKY_WEATHERS,
  SKY_WEATHER_LABELS,
  weatherOf,
} from "../../constants/timeOfDay"
import type { CarDefinition } from "../../data/schema"
import { useTuning } from "../../data/tuning"
import { tunedStats } from "../../data/tuningFx"
import type { GarageSceneProps } from "./GarageScene"
import {
  BoardHeader,
  Label,
  MOD,
  Readout,
  Seg,
  Token,
  accentFill,
  glass,
} from "./kit"

export function SpecsBoard({ car }: { car: CarDefinition }) {
  const tuning = useTuning(car.id)
  const stats = useMemo(() => tunedStats(car, tuning), [car, tuning])
  const peaks = useMemo(() => enginePeaks(car.physics.engine), [car])
  const modified = Object.values(tuning).some((v) => Math.abs(v - 1) > 0.004)
  return (
    <div className="flex h-full flex-col">
      <BoardHeader
        title={car.name}
        flag={
          modified && (
            <span
              className="ml-1 px-2 py-0.5 text-[10.5px] font-semibold text-black"
              style={{ background: MOD }}
            >
              Tuned
            </span>
          )
        }
      />
      <div className="mt-4 grid flex-1 grid-cols-[1.1fr_1fr] gap-3">
        <div className="flex">
          <div className="flex-1 [&>div]:h-full [&>div]:flex [&>div]:flex-col [&>div]:justify-center">
            <Readout
              hero
              label="Peak power"
              value={`${Math.round(peaks.powerHP)}`}
              unit="hp"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Readout
            label="Torque"
            value={`${Math.round(peaks.torqueNm)}`}
            unit="Nm"
          />
          <Readout
            label="0–100 km/h"
            value={stats.zeroTo100.toFixed(1)}
            unit="s"
            tone={modified ? "mod" : undefined}
          />
          <Readout
            label="Top speed"
            value={`${Math.round(stats.topKmh)}`}
            unit="km/h"
            tone={modified ? "mod" : undefined}
          />
          <Readout
            label="Weight"
            value={`${car.physics.mass.chassis}`}
            unit="kg"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {[
          car.physics.drivetrain.type.toUpperCase(),
          `${car.physics.transmission.gearRatios.length}-speed auto`,
          `Redline ${car.physics.engine.redlineRPM} rpm`,
        ].map((t) => (
          <span
            key={t}
            className="border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-gray-300"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

export function RaceBoard(p: GarageSceneProps) {
  return (
    <div className="flex h-full flex-col">
      <BoardHeader title="Race setup" />
      <div className="mt-4 grid flex-1 grid-cols-2 gap-4">
        <div className={`${glass} flex flex-col gap-3 p-4`}>
          {p.racesEnabled && (
            <>
              <div>
                <Label>Rivals</Label>
                <Seg
                  options={RACE_COUNTS.map((n) => ({ id: n, label: n }))}
                  value={p.rivals as (typeof RACE_COUNTS)[number]}
                  onChange={p.onRivals}
                />
              </div>
              <div>
                <Label>{p.lapMode ? "Laps" : "Distance"}</Label>
                <Seg
                  options={RACE_DISTANCES_KM.map((km) => ({
                    id: km,
                    label: p.lapMode
                      ? `${km} ${km === 1 ? "lap" : "laps"}`
                      : `${km} km`,
                  }))}
                  value={p.distanceKm as (typeof RACE_DISTANCES_KM)[number]}
                  onChange={p.onDistance}
                />
              </div>
            </>
          )}
          {p.trafficEnabled && (
            <div>
              <Label>
                Free-roam traffic
                <span className="ml-2 text-[#697488]">
                  {p.traffic === "off"
                    ? "Empty roads"
                    : `${trafficCountFor(p.traffic)} cruisers`}
                </span>
              </Label>
              <Seg
                options={TRAFFIC_OPTIONS.map((o) => ({
                  id: o.id,
                  label: o.label,
                }))}
                value={p.traffic}
                onChange={p.onTraffic}
              />
            </div>
          )}
          <div>
            <Label>Time of day</Label>
            <Seg
              options={DAY_PHASES.map((ph) => ({
                id: ph,
                label: DAY_PHASE_LABELS[ph],
              }))}
              value={phaseOf(p.timeOfDay ?? "day")}
              onChange={(ph) =>
                p.onTimeOfDay(composeMode(ph, weatherOf(p.timeOfDay ?? "day")))
              }
            />
          </div>
          <div>
            <Label>Weather</Label>
            <Seg
              options={SKY_WEATHERS.map((w) => ({
                id: w,
                label: SKY_WEATHER_LABELS[w],
              }))}
              value={weatherOf(p.timeOfDay ?? "day")}
              onChange={(w) =>
                p.onTimeOfDay(composeMode(phaseOf(p.timeOfDay ?? "day"), w))
              }
            />
          </div>
        </div>
        <div className={`${glass} flex flex-col gap-3 p-4`}>
          {p.racesEnabled && (
            <div>
              <Label>Opponent cars · tap to toggle</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.cars.map((c) => (
                  <Token
                    key={c.id}
                    on={p.pool.includes(c.id)}
                    onClick={() => p.onTogglePool(c.id)}
                  >
                    {c.shortName}
                  </Token>
                ))}
              </div>
            </div>
          )}
          <div className="no-scrollbar max-h-[190px] overflow-y-auto">
            {p.mapPicker}
          </div>
        </div>
      </div>
    </div>
  )
}

function Action({
  onClick,
  icon,
  children,
  primary,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-between px-5 py-[18px] text-left text-[18px] font-semibold transition-all active:scale-[0.98] ${
        primary
          ? "text-white hover:brightness-110"
          : `${glass} text-gray-100 hover:bg-white/[0.09]`
      }`}
      style={primary ? { background: accentFill } : undefined}
    >
      {children}
      <span className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
        {icon}
      </span>
    </button>
  )
}

export function DriveBoard(p: GarageSceneProps) {
  return (
    <div className="flex h-full flex-col">
      <BoardHeader title="Drive" />
      <div className="mt-5 flex flex-1 flex-col justify-center gap-3">
        {p.racesEnabled && (
          <Action primary onClick={p.onStartRace} icon={<ArrowUpRight size={22} />}>
            Start race
          </Action>
        )}
        {p.racesEnabled && (
          <Action onClick={p.onOpenMultiplayer} icon={<Swords size={20} />}>
            Multiplayer
          </Action>
        )}
        <Action onClick={p.onFreeDrive} icon={<LoaderPinwheel size={20} />}>
          Free roam
        </Action>
      </div>
    </div>
  )
}
