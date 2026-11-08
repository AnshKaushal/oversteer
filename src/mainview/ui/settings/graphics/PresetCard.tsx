import { AA_MODES } from "../../../systems/antialias"
import { Gauge } from "lucide-react"
import { QUALITY_PRESETS, applyPreset } from "../../../systems/quality"
import type { AppSettings } from "../../../systems/settings"

export function PresetCard({
  settings,
  onUpdateSettings,
}: {
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
}) {
  return (
    <>
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
          <Gauge size={14} className="text-[#51a7d5]" />
          Graphics Preset
        </div>
        <div className="flex gap-2">
          {QUALITY_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onUpdateSettings(applyPreset(settings, p))}
              className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold uppercase ${
                settings.qualityPreset === p
                  ? "border-[#51a7d5] bg-[#51a7d5]/20 text-white"
                  : "border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] text-gray-400">Anti-aliasing</div>
          <div className="flex gap-1.5">
            {AA_MODES.map((m) => (
              <button
                key={m.id}
                title={m.hint}
                onClick={() =>
                  onUpdateSettings({ ...settings, antiAliasing: m.id })
                }
                className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold ${
                  (settings.antiAliasing ?? "fxaa") === m.id
                    ? "border-[#51a7d5] bg-[#51a7d5]/20 text-white"
                    : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500">
            {
              AA_MODES.find((m) => m.id === (settings.antiAliasing ?? "fxaa"))
                ?.hint
            }
          </p>
        </div>
        <label className="flex items-center justify-between text-[11px] text-gray-400">
          Controller rumble (impacts and tyre slip)
          <input
            type="checkbox"
            checked={settings.rumble !== false}
            onChange={() =>
              onUpdateSettings({
                ...settings,
                rumble: settings.rumble === false,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between text-[11px] text-gray-400">
          Auto-adjust resolution scale to hold ~55 FPS
          <input
            type="checkbox"
            checked={!!settings.autoQuality}
            onChange={() =>
              onUpdateSettings({
                ...settings,
                autoQuality: !settings.autoQuality,
              })
            }
          />
        </label>
      </div>
    </>
  )
}
