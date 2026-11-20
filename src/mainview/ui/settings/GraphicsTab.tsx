import {
  type ResolutionId,
  getResolutionPresets,
  calculateResolution,
} from "../../systems/settings"
import { AA_MODES } from "../../systems/antialias"
import { QUALITY_PRESETS, applyPreset } from "../../systems/quality"
import { moveToDisplay } from "../../systems/updater"
import { currentDisplayId, useDisplays } from "../DisplayPicker"
import { Choice, Section, Slider, Toggle } from "./controls"
import { ResolutionCarousel } from "./ResolutionCarousel"
import type { TabProps } from "./types"
import { useViewport } from "./useViewport"

export function GraphicsTab({ settings, onUpdateSettings }: TabProps) {
  const displays = useDisplays()
  const viewport = useViewport()
  const presets = getResolutionPresets()
  const nativeDims = calculateResolution("native", viewport.w, viewport.h, 100)
  const nativePixels = nativeDims.width * nativeDims.height
  const currentDims = calculateResolution(
    settings.resolution,
    viewport.w,
    viewport.h,
    settings.renderScale,
  )
  const reductionPct = Math.round(
    Math.max(
      0,
      (1 - (currentDims.width * currentDims.height) / nativePixels) * 100,
    ),
  )
  const set = (patch: Partial<typeof settings>) =>
    onUpdateSettings({ ...settings, ...patch })
  const aa = settings.antiAliasing ?? "smaa"

  return (
    <>
      <div
        data-set-row
        className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-2 px-4"
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            Render target
          </div>
          <div className="text-[28px] font-extrabold italic leading-tight tabular-nums text-white">
            {currentDims.label}
            {settings.renderScale < 100 && (
              <span className="ml-3 text-[13px] font-bold not-italic text-amber-300">
                {settings.renderScale}% scale
              </span>
            )}
          </div>
        </div>
        <div
          className={`text-[12px] font-semibold ${
            reductionPct > 0 ? "text-emerald-400" : "text-white/40"
          }`}
        >
          {reductionPct > 0
            ? `~${reductionPct}% fewer pixels than native`
            : "Full native load"}
        </div>
      </div>

      <Section title="Display">
        {displays.length > 1 && (
          <Choice
            label="Monitor"
            options={displays.map((d, i) => ({
              id: d.id,
              label: `${i + 1}${d.isPrimary ? " · Primary" : ""}`,
            }))}
            value={settings.displayId ?? currentDisplayId(displays) ?? -1}
            onChange={(id) => {
              set({ displayId: id })
              void moveToDisplay(id)
            }}
          />
        )}
        <ResolutionCarousel
          presets={presets}
          selectedId={settings.resolution}
          viewport={viewport}
          onSelect={(id: ResolutionId) => set({ resolution: id })}
        />
        <Toggle
          label="Smart upscaling"
          hint="Renders below native and reconstructs with a sharpening upscaler. Much crisper than a plain stretch at the same cost"
          checked={settings.upscaler !== false}
          onChange={(v) => set({ upscaler: v })}
        />
        <Slider
          label="Render scale"
          value={settings.renderScale}
          min={50}
          max={100}
          step={5}
          onChange={(v) => set({ renderScale: v })}
        />
      </Section>

      <Section title="Quality">
        <Choice
          label="Preset"
          options={QUALITY_PRESETS.map((p) => ({ id: p, label: p }))}
          value={settings.qualityPreset ?? QUALITY_PRESETS[0]}
          onChange={(p) => onUpdateSettings(applyPreset(settings, p))}
        />
        <Choice
          label="Anti-aliasing"
          options={AA_MODES.map((m) => ({ id: m.id, label: m.label }))}
          value={aa}
          onChange={(id) => set({ antiAliasing: id })}
        />
        <Toggle
          label="Dynamic shadows"
          checked={settings.shadows}
          onChange={(v) => set({ shadows: v })}
        />
        <Slider
          label="Shadow quality"
          value={settings.shadowQuality ?? 100}
          min={25}
          max={100}
          step={5}
          disabled={!settings.shadows}
          onChange={(v) => set({ shadowQuality: v })}
        />
        <Slider
          label="Motion blur"
          value={settings.motionBlur ?? 0}
          min={0}
          max={100}
          format={(v) => (v === 0 ? "Off" : String(v))}
          onChange={(v) => set({ motionBlur: v })}
        />
        <Choice
          label="Frame rate limit"
          options={[
            { id: 0, label: "Off" },
            { id: 60, label: "60" },
            { id: 45, label: "45" },
            { id: 30, label: "30" },
          ]}
          value={settings.fpsCap ?? 0}
          onChange={(id) => set({ fpsCap: id })}
        />
        <Toggle
          label="Auto-adjust scale"
          hint="Lowers the resolution scale to hold ~55 FPS"
          checked={!!settings.autoQuality}
          onChange={(v) => set({ autoQuality: v })}
        />
      </Section>
    </>
  )
}
