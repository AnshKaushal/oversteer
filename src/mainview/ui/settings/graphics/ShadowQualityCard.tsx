import { Cpu } from "lucide-react"
import type { AppSettings } from "../../../systems/settings"

export function ShadowQualityCard({
  settings,
  handleShadowQuality,
}: {
  settings: AppSettings
  handleShadowQuality: (n: number) => void
}) {
  return (
    <>
      <div
        data-anim-item
        className={`rounded border border-white/10 bg-white/[0.02] p-4 space-y-3 ${
          settings.shadows ? "" : "opacity-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Cpu size={14} className="text-[#51a7d5]" />
              Shadow Quality
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Sharpness and reach of shadows. Lower it for more FPS
            </p>
          </div>
          <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
            {settings.shadowQuality ?? 100}%
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={100}
          step={5}
          disabled={!settings.shadows}
          value={settings.shadowQuality ?? 100}
          onChange={(e) => handleShadowQuality(Number(e.target.value))}
          aria-label="Shadow Quality Percentage"
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[100, 75, 50, 25].map((val) => (
            <button
              key={val}
              disabled={!settings.shadows}
              onClick={() => handleShadowQuality(val)}
              className={`flex-1 min-w-[50px] py-1.5 text-xs font-semibold rounded border transition ${
                (settings.shadowQuality ?? 100) === val
                  ? "border-[#51a7d5] bg-[#51a7d5]/30 text-white"
                  : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
