import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import {
  Monitor,
  Sparkles,
  Zap,
  Check,
  RotateCcw,
  Cpu,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  Sun,
  Gauge,
  Droplets,
  RefreshCw,
  CloudFog,
  Activity,
  Lamp,
} from "lucide-react"
import { DEFAULT_WEATHER, WEATHER_GRIP, type WeatherId } from "../data/surfaces"

const WEATHER_IDS = Object.keys(WEATHER_GRIP) as WeatherId[]
import {
  type TimeOfDayMode,
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_LABELS,
} from "../constants/timeOfDay"
import {
  type AppSettings,
  type FogLevel,
  FOG_LEVELS,
  type ResolutionId,
  RESOLUTION_PRESETS,
  DEFAULT_SETTINGS,
  calculateResolution,
} from "../systems/settings"
import { EASE } from "./anim"
import { checkForUpdates } from "../systems/updater"

export interface SettingsModalProps {
  open: boolean
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
  onClose: () => void
}

export function SettingsModal({
  open,
  settings,
  onUpdateSettings,
  onClose,
}: SettingsModalProps) {
  const [mounted, setMounted] = useState(open)
  const [tab, setTab] = useState<"graphics" | "world" | "interface" | "about">("graphics")
  const [showUpscalingInfo, setShowUpscalingInfo] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateMessage, setUpdateMessage] = useState("")
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<gsap.core.Timeline | null>(null)

  const handleCheckForUpdates = async () => {
    if (updateChecking) return
    setUpdateChecking(true)
    setUpdateMessage("Checking for updates…")
    const result = await checkForUpdates()
    setUpdateMessage(result.message)
    setUpdateChecking(false)
  }

  // Track client viewport dimensions for preview
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1920,
    h: typeof window !== "undefined" ? window.innerHeight : 1080,
  })

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        w: window.innerWidth,
        h: window.innerHeight,
      })
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Mount/unmount lifecycle with GSAP transitions
  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!mounted) return

    const overlay = overlayRef.current
    const modal = modalRef.current
    if (!overlay || !modal) return

    animRef.current?.kill()

    if (open) {
      // Entrance animation
      const tl = gsap.timeline({ defaults: { ease: EASE.out } })
      animRef.current = tl

      tl.set(overlay, { autoAlpha: 0 })
        .set(modal, { autoAlpha: 0, y: 14 })
        .to(overlay, { autoAlpha: 1, duration: 0.28, ease: "power2.out" })
        .to(
          modal,
          { autoAlpha: 1, y: 0, duration: 0.34, ease: EASE.soft },
          "-=0.18",
        )
        .fromTo(
          modal.querySelectorAll("[data-anim-item]"),
          { autoAlpha: 0, y: 12 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.32,
            stagger: 0.04,
            ease: "power2.out",
          },
          "-=0.22",
        )
    } else {
      // Exit animation
      const tl = gsap.timeline({
        onComplete: () => {
          setMounted(false)
        },
      })
      animRef.current = tl

      tl.to(modal, {
        autoAlpha: 0,
        y: 10,
        duration: 0.22,
        ease: EASE.in,
      }).to(overlay, { autoAlpha: 0, duration: 0.18, ease: "power2.in" }, "-=0.12")
    }

    return () => {
      animRef.current?.kill()
    }
  }, [open, mounted])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [open, onClose])

  if (!mounted) return null

  // Native baseline pixel count for comparison
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

  const handleSelectPreset = (id: ResolutionId) => {
    onUpdateSettings({
      ...settings,
      resolution: id,
    })
  }

  const handleScaleChange = (scale: number) => {
    onUpdateSettings({
      ...settings,
      renderScale: scale,
    })
  }

  const handleToggleShadows = () => {
    onUpdateSettings({
      ...settings,
      shadows: !settings.shadows,
    })
  }

  const handleShadowQuality = (q: number) => {
    onUpdateSettings({
      ...settings,
      shadowQuality: q,
    })
  }

  const handleSelectTimeOfDay = (mode: TimeOfDayMode) => {
    onUpdateSettings({
      ...settings,
      timeOfDay: mode,
    })
  }

  const handleSelectFog = (fog: FogLevel) => {
    onUpdateSettings({
      ...settings,
      fog,
    })
  }

  const handleSelectWeather = (weather: WeatherId) => {
    onUpdateSettings({
      ...settings,
      weather,
    })
  }

  const handleSelectDashStyle = (style: "modern" | "classic") => {
    onUpdateSettings({
      ...settings,
      dashStyle: style,
    })
  }

  const handleReset = () => {
    onUpdateSettings(DEFAULT_SETTINGS)
  }

  const TABS = [
    { id: "graphics", label: "Graphics", icon: Monitor },
    { id: "world", label: "World", icon: Sun },
    { id: "interface", label: "Interface", icon: Gauge },
    { id: "about", label: "Updates", icon: RefreshCw },
  ] as const

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/55 backdrop-blur-[2px] text-white"
    >
      <div ref={modalRef} className="flex min-h-full flex-col p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div data-anim-item>
            <div
              className="mb-2 h-2.5 w-20"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#51a7d5 0% 25%, #0b0e14 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            <span className="text-[64px] font-bold leading-[0.9] tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] md:text-[96px]">
              Settings
            </span>
            <p className="mt-2 text-[13px] tracking-wide text-gray-300">
              Graphics, world and interface. Changes apply instantly.
            </p>
          </div>
          <div data-anim-item className="flex w-full flex-col gap-2 sm:w-[280px]">
            <button
              onClick={onClose}
              className="w-full bg-[#51a7d5] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#51a7d5]/90 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Done
            </button>
            <button
              onClick={handleReset}
              className="w-full border border-white/12 bg-white/5 px-6 py-3 text-[14px] font-medium text-gray-100 transition hover:bg-white/10 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Reset defaults
            </button>
          </div>
        </div>

        <div className="mt-8 grid flex-1 gap-6 md:grid-cols-[220px_1fr]">
          <div data-anim-item className="flex flex-row gap-2 md:flex-col md:self-start">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center gap-2.5 border px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.98] md:flex-none ${
                  tab === id
                    ? "border-[#51a7d5] bg-[#51a7d5] text-[#0b0e14]"
                    : "border-white/10 bg-black/30 text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="max-w-3xl space-y-4">
            <div className={tab === "graphics" ? "space-y-4" : "hidden"}>
          {/* Active Resolution Live Status Card */}
          <div
            data-anim-item
            className="rounded border border-[#51a7d5]/40 bg-[#51a7d5]/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded border border-[#51a7d5] bg-[#51a7d5]/20 text-[#6ec2f0]">
                <Monitor size={22} />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8f99a8]">
                  Current Render Target
                </div>
                <div className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>{currentDims.label}</span>
                  {settings.renderScale < 100 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {settings.renderScale}% Scale
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-right sm:border-l sm:border-[#51a7d5]/30 sm:pl-4">
              <Zap
                size={18}
                className={
                  reductionPct > 30 ? "text-emerald-400" : "text-[#51a7d5]"
                }
              />
              <div className="text-left">
                <div className="text-[10px] uppercase font-semibold text-[#8f99a8]">
                  GPU Load Reduction
                </div>
                <div className="text-sm font-bold text-white">
                  {reductionPct > 0 ? (
                    <span className="text-emerald-400">
                      ~{reductionPct}% fewer pixels
                    </span>
                  ) : (
                    <span className="text-gray-300">Full native load</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Resolution Presets */}
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
              {RESOLUTION_PRESETS.map((preset) => {
                const isSelected = settings.resolution === preset.id
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

                let tierColor =
                  "border-[#51a7d5] bg-[#51a7d5]/15 text-[#6ec2f0]"
                if (preset.tier === "performance") {
                  tierColor =
                    "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                } else if (preset.tier === "max-fps") {
                  tierColor =
                    "border-amber-500 bg-amber-500/15 text-amber-300"
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
                      <span className="font-mono text-gray-300">
                        {dims.label}
                      </span>
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

          {/* Fine-Tuning Render Scale */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#51a7d5]" />
                  Render Scale Sub-Sampling
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Internal scale multiplier for the selected resolution
                </p>
              </div>
              <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
                {settings.renderScale}%
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={settings.renderScale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              aria-label="Render Scale Percentage"
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
            />

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[100, 85, 75, 67, 50].map((val) => (
                <button
                  key={val}
                  onClick={() => handleScaleChange(val)}
                  className={`flex-1 min-w-[50px] py-1.5 text-xs font-semibold rounded border transition ${
                    settings.renderScale === val
                      ? "border-[#51a7d5] bg-[#51a7d5]/30 text-white"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          {/* Graphics Quality: Shadows */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
                <Cpu size={14} className="text-[#51a7d5]" />
                Dynamic Shadows
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Cascading shadow maps for cars and track scenery
              </p>
            </div>

            <button
              onClick={handleToggleShadows}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.shadows ? "bg-[#51a7d5]" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.shadows ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Shadow quality */}
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

          {/* Upscaling Tech Info Accordion (MetalFX / DLSS / FSR) */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] overflow-hidden"
          >
            <button
              onClick={() => setShowUpscalingInfo((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition"
            >
              <div className="flex items-center gap-2">
                <Info size={16} className="text-[#51a7d5]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-200">
                  Upscaling Tech FAQ (MetalFX / DLSS / FSR)
                </span>
              </div>
              {showUpscalingInfo ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>

            {showUpscalingInfo && (
              <div className="px-4 pb-4 pt-1 border-t border-white/5 text-xs text-gray-300 space-y-2 leading-relaxed">
                <p>
                  <strong className="text-white">How OverSteer Scales:</strong>{" "}
                  Lowering the resolution renders the 3D WebGL scene at a
                  lighter pixel grid (e.g. 720p or 1080p), and scales it to
                  fullscreen via GPU bilinear sampling. Meanwhile, all dials,
                  speedometer, and HUD remain pin-sharp at your screen&apos;s full
                  native resolution!
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <span className="font-semibold text-[#6ec2f0] block">
                      AMD FSR 1.0
                    </span>
                    Spatial EASU + RCAS shader pass can run directly in Three.js
                    WebGL for edge sharpening.
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <span className="font-semibold text-green-400 block">
                      Apple MetalFX
                    </span>
                    Requires native Metal API hooks outside the webview;
                    available if bundled via native WebGPU/C++ surface.
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/10">
                    <span className="font-semibold text-emerald-300 block">
                      NVIDIA DLSS
                    </span>
                    Requires proprietary NVAPI DLLs and Tensor Cores, not
                    directly accessible from sandboxed WebGL browsers.
                  </div>
                </div>
              </div>
            )}
          </div>

            </div>
            <div className={tab === "world" ? "space-y-4" : "hidden"}>
          {/* Time of Day */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
          >
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
                <Sun size={14} className="text-[#51a7d5]" />
                Time of Day
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Select atmosphere (headlights turn on automatically at evening, night and in rain; rain and storms also lower tyre grip)
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {TIME_OF_DAY_MODES.map((mode) => {
                const active = (settings.timeOfDay ?? "day") === mode
                return (
                  <button
                    key={mode}
                    onClick={() => handleSelectTimeOfDay(mode)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded border text-xs font-semibold transition ${
                      active
                        ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white"
                        : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <span>{TIME_OF_DAY_LABELS[mode]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Street lights */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3.5"
          >
            <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Lamp size={14} className="text-[#51a7d5]" />
              Street Lights
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-gray-200">Show</div>
                <p className="text-[11px] text-gray-400 mt-0.5">Lamp posts beside the road</p>
              </div>
              <button
                onClick={() => onUpdateSettings({ ...settings, streetLights: settings.streetLights === false })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.streetLights !== false ? "bg-[#51a7d5]" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.streetLights !== false ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-gray-200">Lit</div>
                <p className="text-[11px] text-gray-400 mt-0.5">Lamps light up in every sky except day</p>
              </div>
              <button
                onClick={() => onUpdateSettings({ ...settings, streetLightsOn: settings.streetLightsOn === false })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.streetLightsOn !== false ? "bg-[#51a7d5]" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.streetLightsOn !== false ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Fog */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
          >
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
                <CloudFog size={14} className="text-[#51a7d5]" />
                Fog
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                How thick the haze is on top of the time of day. Off shows the whole horizon
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {FOG_LEVELS.map((level) => {
                const active = (settings.fog ?? "normal") === level
                return (
                  <button
                    key={level}
                    onClick={() => handleSelectFog(level)}
                    className={`flex items-center justify-center py-2 px-2 rounded border text-xs font-semibold capitalize transition ${
                      active
                        ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white"
                        : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {level}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Weather */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
          >
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
                <Droplets size={14} className="text-[#51a7d5]" />
                Weather
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Wet weather lowers tyre grip, most on tarmac
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {WEATHER_IDS.map((id) => {
                const active = (settings.weather ?? DEFAULT_WEATHER) === id
                return (
                  <button
                    key={id}
                    onClick={() => handleSelectWeather(id)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded border text-xs font-semibold capitalize transition ${
                      active
                        ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white"
                        : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <span>{id}</span>
                  </button>
                )
              })}
            </div>
          </div>

            </div>
            <div className={tab === "interface" ? "space-y-4" : "hidden"}>
          {/* Performance metrics */}
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
                Show FPS, frame and physics timings and draw calls (F3 also toggles it)
              </p>
            </div>

            <button
              onClick={() =>
                onUpdateSettings({ ...settings, perfOverlay: !settings.perfOverlay })
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

          {/* Cluster Style */}
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
              {(
                [
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
                ]
              ).map((opt) => {
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

            </div>
            <div className={tab === "about" ? "space-y-4" : "hidden"}>
          {/* Updates */}
          <div
            data-anim-item
            className="rounded border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="text-[#51a7d5]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-200">
                  Updates
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                {updateMessage || "Check whether a newer version is available."}
              </p>
            </div>
            <button
              onClick={handleCheckForUpdates}
              disabled={updateChecking}
              className="shrink-0 rounded border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              {updateChecking ? "Checking…" : "Check for Updates"}
            </button>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
