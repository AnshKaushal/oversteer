import type { CarDashConfig } from "../../data/schema"
import { KMH_PER_MS } from "../../data/units"
import type { DriveInput } from "../../systems/InputManager"
import type { Cruise } from "./components/Cruise"
import type { Engine } from "./components/Engine"
import type { Gearbox } from "./components/Gearbox"
import type { Launch } from "./components/Launch"
import type { SlipTracker } from "./components/SlipTracker"
import type { CarTelemetry, Kinematics } from "./types"

export interface TelemetrySources {
  k: Kinematics
  input: DriveInput
  gearbox: Gearbox
  engine: Engine
  launch: Launch
  cruise: Cruise
  slip: SlipTracker
  parking: boolean
  autoMode: boolean
  aggression: number
  safetyAids: boolean
  tractionControl: boolean
  stabilityControl: boolean
  absOn: boolean
  tractionActive: boolean
  stabilityActive: boolean
  absActive: boolean
  steerFeedback: number
  engineOn: boolean
  ignitionOn: boolean
  cranking: boolean
  crankTime: number
  sinceStart: number
  dash: CarDashConfig
}

export function buildTelemetry(s: TelemetrySources): CarTelemetry {
  return {
    speedKmh:
      Math.abs(s.k.fwdSpeed) * KMH_PER_MS * Math.sign(s.k.fwdSpeed || 1),
    rpm: Math.round(s.engine.rpm),
    gear: s.gearbox.gear,
    gearLabel: s.gearbox.label,
    autoMode: s.autoMode,
    throttle: s.input.throttle,
    brake: s.input.brake,
    steer: s.input.steer,
    shifting: s.gearbox.shifting,
    launchArmed: s.launch.armed,
    launching: s.launch.launching,
    parkingBrake: s.parking,
    cruiseOn: s.cruise.active,
    cruiseTargetKmh: s.cruise.targetKmh,
    slipRatio: s.slip.slipRatioAvg,
    drift: s.slip.drifting,
    dash: s.dash,
    aggression: s.aggression,
    safetyAids: s.safetyAids,
    tractionControl: s.tractionControl,
    stabilityControl: s.stabilityControl,
    absOn: s.absOn,
    tractionActive: s.tractionActive,
    stabilityActive: s.stabilityActive,
    absActive: s.absActive,
    steerFeedback: s.steerFeedback,
    engineOn: s.engineOn,
    ignitionOn: s.ignitionOn,
    cranking: s.cranking,
    crankTime: s.crankTime,
    sinceStart: s.sinceStart,
  }
}
