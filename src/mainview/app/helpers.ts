import * as THREE from "three"
import type { CarTelemetry } from "../physics/vehicle/Vehicle"
import { DEFAULT_CAR_ID, getCar } from "../data/cars"
import { FOG_INTENSITY, type AppSettings } from "../systems/settings"
import type { MapWorld } from "../maps"

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

export function grassTargetFor(forwardSpeed: number, racing: boolean): number {
  void forwardSpeed
  void racing
  return 1
}

export const initialTele: CarTelemetry = {
  speedKmh: 0,
  rpm: 800,
  gear: 1,
  gearLabel: "1",
  autoMode: true,
  throttle: 0,
  brake: 0,
  steer: 0,
  shifting: false,
  launchArmed: false,
  launching: false,
  parkingBrake: true,
  cruiseOn: false,
  cruiseTargetKmh: null,
  slipRatio: 0,
  drift: false,
  safetyAids: true,
  tractionControl: true,
  stabilityControl: true,
  absOn: true,
  tractionActive: false,
  stabilityActive: false,
  absActive: false,
  steerFeedback: 0,
  engineOn: true,
  ignitionOn: true,
  cranking: false,
  crankTime: 0,
  sinceStart: 99,
  dash: getCar(DEFAULT_CAR_ID).dash,
}

export const _qNpc = new THREE.Quaternion()
export const _vNpcFront = new THREE.Vector3()
export const _vNpcTarget = new THREE.Vector3()
export const _vNpcPos = new THREE.Vector3()

export function perfOverlay(): HTMLPreElement {
  const old = document.getElementById("perf-overlay")
  if (old) return old as HTMLPreElement
  const el = document.createElement("pre")
  el.id = "perf-overlay"
  el.style.cssText =
    "position:fixed;top:8px;left:8px;margin:0;padding:6px 8px;z-index:9999;" +
    "font:11px/1.35 ui-monospace,monospace;color:#9fe;background:rgba(0,0,0,.6);" +
    "pointer-events:none;display:none;white-space:pre"
  document.body.appendChild(el)
  return el
}

export function perfGraph(): HTMLCanvasElement {
  const old = document.getElementById("perf-graph")
  if (old) return old as HTMLCanvasElement
  const c = document.createElement("canvas")
  c.id = "perf-graph"
  c.width = 240
  c.height = 48
  c.style.cssText =
    "position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;display:none;" +
    "background:rgba(0,0,0,.6);margin-top:84px"
  document.body.appendChild(c)
  return c
}

export function shadowRange2(s: AppSettings): number {
  const q = Math.min(100, Math.max(25, s.shadowQuality ?? 100)) / 100
  const r = 40 + 80 * q
  return r * r
}

export function applyFog(wm: MapWorld, s: AppSettings) {
  wm.setShadowQuality(s.shadowQuality ?? 100)
  wm.setVegetation(s.vegetation ?? 100)
  wm.setDrawDistance(s.drawDistance ?? 100)
  wm.setStreetLights(s.streetLights !== false, s.streetLightsOn !== false)
  const k = FOG_INTENSITY[s.fog ?? "normal"]
  wm.setFog(k !== undefined, k ?? 1)
}
