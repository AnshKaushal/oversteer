import { Wind } from "lucide-react"
import type { AppSettings } from "../../../systems/settings"

export function MotionBlurCard({
  settings,
  onUpdateSettings,
}: {
  settings: AppSettings
  onUpdateSettings: (s: AppSettings) => void
}) {
  const value = settings.motionBlur ?? 0
  return (
    <div
      data-anim-item
      className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Wind size={14} className="text-[#51a7d5]" />
            Motion Blur
          </label>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Blurs the world as the camera moves. 0 turns it off
          </p>
        </div>
        <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) =>
          onUpdateSettings({ ...settings, motionBlur: Number(e.target.value) })
        }
        aria-label="Motion Blur"
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
      />
    </div>
  )
}
