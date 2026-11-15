import { Plus, X } from "lucide-react"
import { Choice, ROW_BASE, Section, Slider, Toggle } from "./controls"
import type { TabProps } from "./types"

const DEFAULT_RUNS = [
  { from: 0, to: 100 },
  { from: 100, to: 200 },
  { from: 100, to: 0 },
]
const MAX_RUNS = 5
const num = (v: string) =>
  Math.max(0, Math.min(500, Math.round(Number(v) || 0)))

const DASH_STYLES = [
  {
    id: "modern" as const,
    label: "Modern",
  },
  {
    id: "classic" as const,
    label: "Classic",
  },
  {
    id: "single" as const,
    label: "Single",
  },
]

const FIELD =
  "w-16 bg-white/10 px-2 py-1.5 text-center text-[14px] font-semibold tabular-nums text-white outline-none transition-colors focus:bg-white/20"
const MINI =
  "-skew-x-12 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:bg-white/20"

export function InterfaceTab({ settings, onUpdateSettings }: TabProps) {
  const set = (patch: Partial<typeof settings>) =>
    onUpdateSettings({ ...settings, ...patch })
  const dash = settings.dashStyle ?? "modern"
  const runs = settings.speedRuns ?? DEFAULT_RUNS
  const setRun = (i: number, next: { from: number; to: number }) =>
    set({ speedRuns: runs.map((x, j) => (j === i ? next : x)) })

  return (
    <>
      <Section title="Dashboard">
        <Choice
          label="Cluster style"
          options={DASH_STYLES}
          value={dash}
          onChange={(id) => set({ dashStyle: id })}
        />
        <Toggle
          label="Performance metrics"
          checked={!!settings.perfOverlay}
          onChange={(v) => set({ perfOverlay: v })}
        />
      </Section>

      <Section title="Controls">
        <Slider
          label="Camera speed"
          value={settings.cameraSpeed ?? 1}
          min={0.5}
          max={2}
          step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => set({ cameraSpeed: v })}
        />
        <Toggle
          label="Controller rumble"
          checked={settings.rumble !== false}
          onChange={(v) => set({ rumble: v })}
        />
      </Section>

      <Section title="Timer">
        <Toggle
          label="Free Roam Speed Timer"
          checked={settings.speedTimer !== false}
          onChange={(v) => set({ speedTimer: v })}
        />
        {settings.speedTimer !== false && (
          <div data-set-row className={`${ROW_BASE} flex flex-col gap-2`}>
            {runs.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={r.from}
                  aria-label="From km/h"
                  onChange={(e) =>
                    setRun(i, { ...r, from: num(e.target.value) })
                  }
                  className={FIELD}
                />
                <span className="text-white/40">→</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={r.to}
                  aria-label="To km/h"
                  onChange={(e) => setRun(i, { ...r, to: num(e.target.value) })}
                  className={FIELD}
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                  km/h
                </span>
                <button
                  onClick={() =>
                    set({ speedRuns: runs.filter((_, j) => j !== i) })
                  }
                  aria-label="Remove run"
                  className="ml-auto p-1.5 text-white/40 outline-none transition-colors hover:text-white focus-visible:text-white"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              {runs.length < MAX_RUNS && (
                <button
                  onClick={() =>
                    set({ speedRuns: [...runs, { from: 0, to: 60 }] })
                  }
                  className={`${MINI} flex items-center gap-1`}
                >
                  <Plus size={12} /> Add run
                </button>
              )}
              <button
                onClick={() => set({ speedRuns: DEFAULT_RUNS })}
                className={MINI}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </Section>
    </>
  )
}
