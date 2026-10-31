/**
 * World-level simulation constants. Nothing in `systems/` may hold these as
 * literals; physics code reads them from here (or from the car spec).
 */
export const WORLD = {
  gravity: 9.81,
  /** Fixed physics rate. Raise to 240 or 360 here if 120 Hz is not enough. */
  fixedHz: 120,
  /** Most fixed steps one rendered frame may run before time is dropped. */
  maxSubsteps: 30,
  /**
   * Wall-clock budget for the physics steps of one frame (ms). When a frame
   * runs out of budget the remaining backlog is dropped and counted, so a
   * slow machine drops sim time instead of spiralling.
   */
  stepBudgetMs: 12,
  /** Longest frame time accepted at all (s); guards tab-switch stalls. */
  maxFrameDt: 0.25,
  /** A pose jump larger than this between two steps is a teleport (m). */
  teleportDistance: 5,
  /** Averaging window of the frame-stats overlay (ms). */
  statsWindowMs: 500,
} as const

/**
 * How automatic shifting is chosen. Arcade shifts earlier or later with how
 * hard you drive; realistic always shifts at the car's `realisticAggression`.
 */
export type ShiftMode = "arcade" | "realistic"

/** Shift mode a new car starts in. */
export const DEFAULT_SHIFT_MODE: ShiftMode = "arcade"

/** Cars are four-wheeled; `CarSpec.wheels` is a 4-tuple. */
export const WHEEL_COUNT = 4

/** Multiplayer send pacing, independent of render rate. */
export const FIXED_DT = 1 / WORLD.fixedHz
