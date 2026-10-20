import * as THREE from "three"

export type ResolutionId =
  | "native"
  | "1440p"
  | "1080p"
  | "900p"
  | "720p"
  | "540p"
  | "480p"

export interface ResolutionPreset {
  id: ResolutionId
  name: string
  height: number | null // null for native
  badge: string
  tier: "ultra" | "quality" | "balanced" | "performance" | "max-fps"
  description: string
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  {
    id: "native",
    name: "Native Display",
    height: null,
    badge: "Native",
    tier: "quality",
    description: "Matches monitor native resolution (full detail)",
  },
  {
    id: "1440p",
    name: "1440p QHD",
    height: 1440,
    badge: "2K Ultra",
    tier: "ultra",
    description: "High resolution for powerful dedicated GPUs",
  },
  {
    id: "1080p",
    name: "1080p FHD",
    height: 1080,
    badge: "Full HD",
    tier: "quality",
    description: "Standard Full HD resolution (balanced crispness)",
  },
  {
    id: "900p",
    name: "900p HD+",
    height: 900,
    badge: "Balanced",
    tier: "balanced",
    description: "Great balance of smooth framerate and visual clarity",
  },
  {
    id: "720p",
    name: "720p HD",
    height: 720,
    badge: "Fast",
    tier: "performance",
    description: "Recommended for laptops and integrated graphics",
  },
  {
    id: "540p",
    name: "540p qHD",
    height: 540,
    badge: "High FPS",
    tier: "performance",
    description: "Huge framerate boost on older or battery-saver GPUs",
  },
  {
    id: "480p",
    name: "480p SD",
    height: 480,
    badge: "Max FPS",
    tier: "max-fps",
    description: "Maximum performance mode for lower-spec devices",
  },
]

export interface AppSettings {
  resolution: ResolutionId
  renderScale: number // 50 to 100
  shadows: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  resolution: "1080p",
  renderScale: 100,
  shadows: true,
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
    const pr = Math.min(dpr, 1.25) * scale
    const calcW = Math.round(w * pr)
    const calcH = Math.round(h * pr)
    return {
      width: calcW,
      height: calcH,
      pixelRatio: pr,
      label: `${calcW} × ${calcH}`,
    }
  }

  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId)
  let targetH = preset?.height ?? 1080
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
