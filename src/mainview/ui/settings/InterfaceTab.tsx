import { Check, Gauge, Activity } from "lucide-react"
import type { TabProps } from "./types"

export function InterfaceTab({ settings, onUpdateSettings }: TabProps) {
  const handleSelectDashStyle = (style: "modern" | "classic") =>
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
            Pick the instrument cluster look — twin half-dials or the classic
            circular gauges
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
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
    </>
  )
}
