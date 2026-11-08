import { Check, Layers } from "lucide-react"
import {
  type ResolutionId,
  getResolutionPresets,
  calculateResolution,
} from "../../../systems/settings"
import type { AppSettings } from "../../../systems/settings"

export function ResolutionCard({
  settings,
  viewport,
  presets,
  nativePixels,
  handleSelectPreset,
}: {
  settings: AppSettings
  viewport: { w: number; h: number }
  presets: ReturnType<typeof getResolutionPresets>
  nativePixels: number
  handleSelectPreset: (id: ResolutionId) => void
}) {
  return (
    <>
      <div data-anim-item className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Layers size={14} className="text-[#51a7d5]" />
            Display Resolutions
          </label>
          <span className="text-[11px] text-gray-400">
            Display: {viewport.w} × {viewport.h}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {presets.map((preset) => {
            const isSelected =
              settings.resolution === preset.id ||
              (preset.height !== null &&
                settings.resolution === `${preset.height}p`)
            const dims = calculateResolution(
              preset.id,
              viewport.w,
              viewport.h,
              100,
            )
            const px = dims.width * dims.height
            const redPct = Math.round(
              Math.max(0, (1 - px / nativePixels) * 100),
            )

            let tierColor = "border-[#51a7d5] bg-[#51a7d5]/15 text-[#6ec2f0]"
            if (preset.tier === "performance") {
              tierColor =
                "border-emerald-500 bg-emerald-500/15 text-emerald-300"
            } else if (preset.tier === "max-fps") {
              tierColor = "border-amber-500 bg-amber-500/15 text-amber-300"
            }

            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset.id)}
                className={`group relative flex flex-col justify-between rounded border p-3 text-left transition-all active:scale-[0.99] ${
                  isSelected
                    ? "border-[#51a7d5] bg-[#51a7d5]/25 shadow-[0_0_15px_rgba(81,167,213,0.3)] ring-1 ring-[#51a7d5]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white group-hover:text-[#6ec2f0] transition-colors">
                      {preset.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tierColor}`}
                    >
                      {preset.badge}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#51a7d5] text-[#0b0e14]">
                      <Check size={13} strokeWidth={3} />
                    </div>
                  )}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
                  <span className="font-mono text-gray-300">{dims.label}</span>
                  {redPct > 0 && (
                    <span className="text-emerald-400 font-semibold text-[11px]">
                      -{redPct}% GPU
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[11px] text-gray-400 line-clamp-1">
                  {preset.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
