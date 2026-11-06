import * as THREE from "three"
import type { TimeOfDayMode } from "../constants/timeOfDay"

export type ResolutionId = string

export interface ResolutionPreset {
  id: ResolutionId
  name: string
  height: number | null
  badge: string
  tier: "ultra" | "quality" | "balanced" | "performance" | "max-fps"
  description: string
}

let nativePanel: { width: number; height: number } | null = null

export function setNativePanel(p: { width: number; height: number } | null) {
  nativePanel = p
}

export function nativeDisplaySize(): { width: number; height: number } {
  if (nativePanel) return nativePanel
  if (typeof window === "undefined") return { width: 1920, height: 1080 }
  const dpr = window.devicePixelRatio || 1
  return {
    width: Math.round((window.screen?.width || window.innerWidth) * dpr),
    height: Math.round((window.screen?.height || window.innerHeight) * dpr),
  }
}

let osModes: { width: number; height: number }[] = []

export function setDisplayModes(m: { width: number; height: number }[]) {
  osModes = m
}

const STANDARD_HEIGHTS = [2160, 1440, 1200, 1080, 1050, 900, 800, 768, 720, 600, 540, 480]

function tierFor(h: number, nativeH: number): ResolutionPreset["tier"] {
  const r = h / nativeH
  if (r > 0.9) return "ultra"
  if (r > 0.6) return "quality"
  if (r > 0.45) return "balanced"
  if (r > 0.33) return "performance"
  return "max-fps"
}

const BADGES: Record<ResolutionPreset["tier"], string> = {
  ultra: "Sharpest",
  quality: "Quality",
  balanced: "Balanced",
  performance: "Fast",
  "max-fps": "Max FPS",
}

export function resolutionHeight(id: ResolutionId): number | null {
  const x = /^(\d+)x(\d+)$/.exec(id)
  if (x) return Number(x[2])
  const p = /^(\d+)p$/.exec(id)
  return p ? Number(p[1]) : null
}

// The resolutions the OS reports for this monitor, plus intermediate steps at the
// screen's own aspect ratio, listed largest first like an OS display settings page.
export function getResolutionPresets(): ResolutionPreset[] {
  const native = nativeDisplaySize()
  const aspect = native.width / native.height
  const sizes = new Map<string, { width: number; height: number; os: boolean }>()
  for (const m of osModes) {
    if (m.height <= native.height && m.width <= native.width) sizes.set(`${m.width}x${m.height}`, { ...m, os: true })
  }
  for (const h of STANDARD_HEIGHTS) {
    if (h >= native.height) continue
    const w = Math.round((h * aspect) / 2) * 2
    if (![...sizes.values()].some((s) => s.height === h)) sizes.set(`${w}x${h}`, { width: w, height: h, os: false })
  }
  const list = [...sizes.entries()]
    .filter(([id]) => id !== `${native.width}x${native.height}`)
    .sort((a, b) => b[1].height - a[1].height)
  const out: ResolutionPreset[] = [
    {
      id: "native",
      name: `${native.width} × ${native.height}`,
      height: null,
      badge: "Native",
      tier: "ultra",
      description: "This monitor's native resolution (recommended)",
    },
  ]
  for (const [id, m] of list) {
    const tier = tierFor(m.height, native.height)
    out.push({
      id,
      name: `${m.width} × ${m.height}`,
      height: m.height,
      badge: BADGES[tier],
      tier,
      description: m.os ? "Display mode reported by your system" : "Renders at this size and scales up to fill the screen",
    })
  }
  return out
}

export type FogLevel = "off" | "light" | "normal" | "heavy"
export const FOG_LEVELS: FogLevel[] = ["off", "light", "normal", "heavy"]
export const FOG_INTENSITY: Record<FogLevel, number | undefined> = {
  off: undefined,
  light: 1,
  normal: 2,
  heavy: 3,
}

export interface AppSettings {
  resolution: ResolutionId
  renderScale: number
  shadows: boolean
  shadowQuality: number
  timeOfDay?: TimeOfDayMode
  dashStyle?: "modern" | "classic"
  fog?: FogLevel
  perfOverlay?: boolean
  streetLights?: boolean
  streetLightsOn?: boolean
  vegetation?: number
  drawDistance?: number
  displayId?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  resolution: "1080p",
  renderScale: 100,
  shadows: true,
  shadowQuality: 100,
  timeOfDay: "day",
  dashStyle: "modern",
  fog: "normal",
  perfOverlay: false,
  streetLights: true,
  streetLightsOn: true,
  vegetation: 100,
  drawDistance: 100,
}

const SETTINGS_KEY = "oversteer_settings"

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

export function calculateResolution(
  presetId: ResolutionId,
  containerW: number,
  containerH: number,
  scalePercent: number = 100,
): { width: number; height: number; pixelRatio: number; label: string } {
  const w = containerW || (typeof window !== "undefined" ? window.innerWidth : 1920)
  const h = containerH || (typeof window !== "undefined" ? window.innerHeight : 1080)
  const aspect = w / h

  if (presetId === "native") {
    const scale = Math.max(0.5, Math.min(1.0, scalePercent / 100))
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const panel = nativeDisplaySize()
    const logicalW = (typeof window !== "undefined" && window.screen?.width) || w
    const pr = Math.min(dpr, panel.width / logicalW) * scale
    const calcW = Math.round(w * pr)
    const calcH = Math.round(h * pr)
    return {
      width: calcW,
      height: calcH,
      pixelRatio: pr,
      label: `${calcW} × ${calcH}`,
    }
  }

  const nativeH = nativeDisplaySize().height
  let targetH = Math.min(resolutionHeight(presetId) ?? 1080, nativeH)
  if (scalePercent !== 100) {
    targetH = Math.round((targetH * scalePercent) / 100)
  }

  let targetW = Math.round(targetH * aspect)
  if (targetW % 2 !== 0) targetW += 1
  if (targetH % 2 !== 0) targetH += 1

  return {
    width: targetW,
    height: targetH,
    pixelRatio: 1.0,
    label: `${targetW} × ${targetH}`,
  }
}

export function applyRendererResolution(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  container: HTMLDivElement | null,
  settings: AppSettings,
) {
  if (!renderer || !camera) return

  const mountW = container?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1920)
  const mountH = container?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 1080)
  const aspect = mountW / mountH

  camera.aspect = aspect
  camera.updateProjectionMatrix()

  const dom = renderer.domElement
  if (dom) {
    dom.style.width = "100%"
    dom.style.height = "100%"
    dom.style.display = "block"
  }

  const { width, height, pixelRatio } = calculateResolution(
    settings.resolution,
    mountW,
    mountH,
    settings.renderScale,
  )

  if (settings.resolution === "native") {
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(mountW, mountH, false)
  } else {
    renderer.setPixelRatio(1.0)
    renderer.setSize(width, height, false)
  }

  if (renderer.shadowMap.enabled !== settings.shadows) {
    renderer.shadowMap.enabled = settings.shadows
    renderer.shadowMap.needsUpdate = true
  }
}
