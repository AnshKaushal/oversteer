import { RUNWAY_END_D } from "../Airport"
import { FlybyMode } from "./types"

export const TARGET_SPAN = 36
export const CROSS_LEAD = 120
export const PASS_HALF = 400
export const PASS_LENGTH = PASS_HALF * 2
export const EXIT_LEN = 1800
export const LANDING_EXIT_LEN = 600
export function exitLen(mode: FlybyMode): number {
  return mode === "landing" ? LANDING_EXIT_LEN : EXIT_LEN
}
export const TAKEOFF_START_D = -(RUNWAY_END_D - PASS_LENGTH) + 40
export const LANDING_START_D = -500
export const TAKEOFF_ROLL = 520
export const TAKEOFF_LIFTOFF_D = TAKEOFF_START_D + TAKEOFF_ROLL
export const TAKEOFF_ACCEL = 2.2
export const TAKEOFF_GRADIENT = 0.07
export const TAKEOFF_EASE = 300
export const TAKEOFF_HOLD = 3
export const FADE_TIME = 1.5
export const LANDING_DWELL = 4
export const AIRPORT_STAY_DIST = 1100
export const AIRPORT_VIEW_DIST = 1800
export const AIRPORT_MIN_ANGLE = 40
export const MAX_LEAD = 700
export const MIN_GAP = 8
export const MAX_GAP = 10
export const FIRST_GAP_MIN = 5
export const FIRST_GAP_MAX = 5

export const MIN_ANGLE = 20
export const MAX_ANGLE = 90
export const CRUISE_ALT = 145
export const CRUISE_LEAD = 380
export const SHADOW_MAP_NEAR = 40
export const SHADOW_MAP_FAR = 75
export const SUN_SHADOW_X = 120 / 180
export const SUN_SHADOW_Z = 60 / 180

export const DEG = Math.PI / 180

export const LANDING_TOUCH_D = 900
export const TOUCH_SMOKE_LEN = 260
export const TOUCH_SMOKE_RATE = 160
export const TOUCH_SMOKE_BURST = 40
export const LANDING_HILL_MARGIN = 4
export const LANDING_SLOPE = 0.07
export const LANDING_FLARE = 160
export const LANDING_TOUCH_SPEED = 40
export const LANDING_DECEL = 1.8
export const LANDING_STOP_DIST =
  (LANDING_TOUCH_SPEED * LANDING_TOUCH_SPEED) / (2 * LANDING_DECEL)
