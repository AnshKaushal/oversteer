import {
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_LABELS,
} from "../../constants/timeOfDay"
import { FOG_LEVELS } from "../../systems/settings"
import { Choice, Section, Slider, Toggle } from "./controls"
import type { TabProps } from "./types"

export function WorldTab({ settings, onUpdateSettings }: TabProps) {
  const set = (patch: Partial<typeof settings>) =>
    onUpdateSettings({ ...settings, ...patch })
  return (
    <>
      <Section title="Atmosphere">
        <Choice
          label="Time of day"
          options={TIME_OF_DAY_MODES.map((m) => ({
            id: m,
            label: TIME_OF_DAY_LABELS[m],
          }))}
          value={settings.timeOfDay ?? "day"}
          onChange={(m) => set({ timeOfDay: m })}
        />
        <Choice
          label="Fog"
          options={FOG_LEVELS.map((f) => ({ id: f, label: f }))}
          value={settings.fog ?? "normal"}
          onChange={(f) => set({ fog: f })}
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
