import { RenderTargetCard } from "./graphics/RenderTargetCard"
import { MonitorCard } from "./graphics/MonitorCard"
import { ResolutionCard } from "./graphics/ResolutionCard"
import { RenderScaleCard } from "./graphics/RenderScaleCard"
import { PresetCard } from "./graphics/PresetCard"
import { ShadowsCard } from "./graphics/ShadowsCard"
import { ShadowQualityCard } from "./graphics/ShadowQualityCard"
import { MotionBlurCard } from "./graphics/MotionBlurCard"
import { UpscalingFaqCard } from "./graphics/UpscalingFaqCard"
import {
  type ResolutionId,
  getResolutionPresets,
  calculateResolution,
} from "../../systems/settings"
import { useDisplays } from "../DisplayPicker"
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
  const currentPixels = currentDims.width * currentDims.height
  const reductionPct = Math.round(
    Math.max(0, (1 - currentPixels / nativePixels) * 100),
  )
  const handleSelectPreset = (id: ResolutionId) =>
    onUpdateSettings({ ...settings, resolution: id })
  const handleScaleChange = (scale: number) =>
    onUpdateSettings({ ...settings, renderScale: scale })
  const handleToggleShadows = () =>
    onUpdateSettings({ ...settings, shadows: !settings.shadows })
  const handleShadowQuality = (q: number) =>
    onUpdateSettings({ ...settings, shadowQuality: q })
  return (
    <>
      <RenderTargetCard
        settings={settings}
        currentDims={currentDims}
        reductionPct={reductionPct}
      />
      <MonitorCard
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        displays={displays}
      />
      <ResolutionCard
        settings={settings}
        viewport={viewport}
        presets={presets}
        nativePixels={nativePixels}
        handleSelectPreset={handleSelectPreset}
      />
      <RenderScaleCard
        settings={settings}
        handleScaleChange={handleScaleChange}
      />
      <PresetCard settings={settings} onUpdateSettings={onUpdateSettings} />
      <ShadowsCard
        settings={settings}
        handleToggleShadows={handleToggleShadows}
      />
      <ShadowQualityCard
        settings={settings}
        handleShadowQuality={handleShadowQuality}
      />
      <MotionBlurCard settings={settings} onUpdateSettings={onUpdateSettings} />
      <UpscalingFaqCard />
    </>
  )
}
