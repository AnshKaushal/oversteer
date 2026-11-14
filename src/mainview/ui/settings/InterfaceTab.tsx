import { Check, Gauge, Activity, Timer, Plus, X } from "lucide-react"
import type { TabProps } from "./types"

const DEFAULT_RUNS = [
  { from: 0, to: 100 },
  { from: 100, to: 200 },
  { from: 100, to: 0 },
]
const MAX_RUNS = 5
const num = (v: string) => Math.max(0, Math.min(500, Math.round(Number(v) || 0)))

export function InterfaceTab({ settings, onUpdateSettings }: TabProps) {
  const handleSelectDashStyle = (style: "modern" | "classic" | "single") =>
    onUpdateSettings({ ...settings, dashStyle: style })
  return (
    <>
      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between"
      >
        <div>
          <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Activity size={14} className="text-[#51a7d5]" />
            Performance Metrics
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Show FPS, frame and physics timings and draw calls (F3 also toggles
            it)
          </p>
        </div>

        <button
          onClick={() =>
            onUpdateSettings({
              ...settings,
              perfOverlay: !settings.perfOverlay,
            })
          }
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            settings.perfOverlay ? "bg-[#51a7d5]" : "bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.perfOverlay ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
      >
        <div>
          <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Gauge size={14} className="text-[#51a7d5]" />
            Dashboard Cluster Style
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Pick the instrument cluster look — twin half-dials, a single round dial, or the classic
            circular gauges
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            {
              id: "modern" as const,
              name: "Modern Cluster",
              desc: "Twin half-circle dials hugging the corners",
            },
            {
              id: "classic" as const,
              name: "Classic Cluster",
              desc: "Circular chrome gauges with red needles",
            },
            {
              id: "single" as const,
              name: "Single Dial",
              desc: "One round dial, speed and gear in the hub",
            },
          ].map((opt) => {
            const active = (settings.dashStyle ?? "modern") === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleSelectDashStyle(opt.id)}
                className={`relative flex flex-col items-start gap-0.5 p-3 rounded border text-left transition ${
                  active
                    ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white ring-1 ring-[#51a7d5]"
                    : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                }`}
              >
                <span className="text-sm font-bold">{opt.name}</span>
                <span className="text-[11px] opacity-80">{opt.desc}</span>
                {active && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#51a7d5] text-[#0b0e14] absolute top-2.5 right-2.5">
                    <Check size={13} strokeWidth={3} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Gauge size={14} className="text-[#51a7d5]" />
              Camera Movement Speed
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">
              How fast the free camera moves (mouse) and the gamepad camera
              looks (free and normal)
            </p>
          </div>
          <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
            {(settings.cameraSpeed ?? 1).toFixed(1)}x
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.cameraSpeed ?? 1}
          onChange={(e) =>
            onUpdateSettings({
              ...settings,
              cameraSpeed: Number(e.target.value),
            })
          }
          aria-label="Camera Movement Speed"
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
        />
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Timer size={14} className="text-[#51a7d5]" />
              Speed Timer
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Times 0–100, 100–0, 100–200 and your own speed gates (km/h) in
              free roam, shown above the right dial. Stop, then accelerate or
              brake through the gates.
            </p>
          </div>
          <button
            onClick={() =>
              onUpdateSettings({
                ...settings,
                speedTimer: settings.speedTimer === false,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              settings.speedTimer !== false ? "bg-[#51a7d5]" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.speedTimer !== false ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {settings.speedTimer !== false && (
          <div className="space-y-2">
            {(settings.speedRuns ?? DEFAULT_RUNS).map((r, i) => {
              const runs = settings.speedRuns ?? DEFAULT_RUNS
              const set = (next: { from: number; to: number }) =>
                onUpdateSettings({
                  ...settings,
                  speedRuns: runs.map((x, j) => (j === i ? next : x)),
                })
              const field =
                "w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-center text-sm font-semibold tabular-nums text-white focus:border-[#51a7d5] focus:outline-none"
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={r.from}
                    aria-label="From km/h"
                    onChange={(e) => set({ ...r, from: num(e.target.value) })}
                    className={field}
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={r.to}
                    aria-label="To km/h"
                    onChange={(e) => set({ ...r, to: num(e.target.value) })}
                    className={field}
                  />
                  <span className="text-[11px] text-gray-400">km/h</span>
                  <button
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        speedRuns: runs.filter((_, j) => j !== i),
                      })
                    }
                    aria-label="Remove run"
                    className="ml-auto rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
            <div className="flex gap-2 pt-1">
              {(settings.speedRuns ?? DEFAULT_RUNS).length < MAX_RUNS && (
                <button
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      speedRuns: [
                        ...(settings.speedRuns ?? DEFAULT_RUNS),
                        { from: 0, to: 60 },
                      ],
                    })
                  }
                  className="flex items-center gap-1 rounded border border-white/10 bg-black/30 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-white/25 hover:text-white"
                >
                  <Plus size={13} /> Add run
                </button>
              )}
              <button
                onClick={() =>
                  onUpdateSettings({ ...settings, speedRuns: DEFAULT_RUNS })
                }
                className="rounded border border-white/10 bg-black/30 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-white/25 hover:text-white"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
