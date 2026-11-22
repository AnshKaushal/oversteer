import {
  DAY_PHASES,
  DAY_PHASE_LABELS,
  SKY_WEATHERS,
  SKY_WEATHER_LABELS,
  composeMode,
  type DayPhase,
  type SkyWeather,
  normalizeMode,
  phaseOf,
  weatherOf,
} from "../../constants/timeOfDay"
import { skyClock } from "../../systems/sky/SkyClock"
import { FOG_LEVELS } from "../../systems/settings"
import { Choice, Section, Slider, Toggle } from "./controls"
import type { TabProps } from "./types"

const CLOCK_SPEEDS = [
  { v: 0, label: "Paused" },
  { v: 0.5, label: "Slow" },
  { v: 1, label: "Default" },
  { v: 3, label: "Fast" },
  { v: 10, label: "Rapid" },
]
const START_TIMES = [
  { h: 6.5, label: "Dawn" },
  { h: 12, label: "Noon" },
  { h: 18.5, label: "Dusk" },
  { h: 23, label: "Night" },
]

export function WorldTab({ settings, onUpdateSettings }: TabProps) {
  const set = (patch: Partial<typeof settings>) =>
    onUpdateSettings({ ...settings, ...patch })
  const mode = normalizeMode(settings.timeOfDay)
  return (
    <>
      <Section title="Atmosphere">
        <Choice
          label="Time of day"
          options={[
            { id: "live", label: "Live" },
            ...DAY_PHASES.map((m) => ({
              id: m as string,
              label: DAY_PHASE_LABELS[m],
            })),
          ]}
          value={settings.timeLive !== false ? "live" : phaseOf(mode)}
          onChange={(p) =>
            p === "live"
              ? set({ timeLive: true })
              : set({
                  timeLive: false,
                  timeOfDay: composeMode(p as DayPhase, weatherOf(mode)),
                })
          }
        />
        <Choice
          label="Weather"
          options={[
            { id: "live", label: "Live" },
            ...SKY_WEATHERS.map((w) => ({
              id: w as string,
              label: SKY_WEATHER_LABELS[w],
            })),
          ]}
          value={settings.weatherLive !== false ? "live" : weatherOf(mode)}
          onChange={(w) =>
            w === "live"
              ? set({ weatherLive: true })
              : set({
                  weatherLive: false,
                  timeOfDay: composeMode(phaseOf(mode), w as SkyWeather),
                })
          }
        />
        <Choice
          label="Fog"
          options={FOG_LEVELS.map((f) => ({ id: f, label: f }))}
          value={settings.fog ?? "normal"}
          onChange={(f) => set({ fog: f })}
        />
      </Section>

      <Section title="Live world">
        <Choice
          label="Clock speed"
          hint="Game minutes per real second. Default is 1x (a full day lasts 24 minutes)."
          options={CLOCK_SPEEDS.map((c) => ({ id: c.v, label: c.label }))}
          value={settings.clockSpeed ?? 1}
          onChange={(v) => set({ clockSpeed: v })}
        />
        <Choice
          label="Weather changes"
          options={[
            { id: "calm", label: "Rare" },
            { id: "normal", label: "Normal" },
            { id: "wild", label: "Frequent" },
          ]}
          value={settings.weatherFrequency ?? "normal"}
          onChange={(v) => set({ weatherFrequency: v })}
        />
        <Toggle
          label="Clock on screen"
          checked={settings.clockHud !== false}
          onChange={(v) => set({ clockHud: v })}
        />
        <Choice
          label="Set time"
          hint="Jumps the live clock."
          options={START_TIMES.map((t) => ({ id: t.h, label: t.label }))}
          value={-1 as number}
          onChange={(h) => {
            skyClock.setHour(h)
            set({})
          }}
        />
      </Section>

      <Section title="Street lights">
        <Toggle
          label="Show"
          checked={settings.streetLights !== false}
          onChange={(v) => set({ streetLights: v })}
        />
        <Toggle
          label="Light"
          checked={settings.streetLightsOn !== false}
          onChange={(v) => set({ streetLightsOn: v })}
        />
      </Section>

      <Section title="Detail">
        <Slider
          label="Draw distance"
          value={settings.drawDistance ?? 100}
          min={20}
          max={100}
          step={5}
          onChange={(v) => set({ drawDistance: v })}
        />
        <Slider
          label="Vegetation"
          value={settings.vegetation ?? 100}
          min={0}
          max={100}
          step={5}
          onChange={(v) => set({ vegetation: v })}
        />
      </Section>
    </>
  )
}
