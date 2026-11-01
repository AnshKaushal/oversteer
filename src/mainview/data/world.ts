export const WORLD = {
  gravity: 9.81,
  fixedHz: 120,
  maxSubsteps: 30,
  stepBudgetMs: 12,
  maxFrameDt: 0.25,
  teleportDistance: 5,
  statsWindowMs: 500,
} as const

export type ShiftMode = "arcade" | "realistic"

export const DEFAULT_SHIFT_MODE: ShiftMode = "arcade"

export const WHEEL_COUNT = 4

export const FIXED_DT = 1 / WORLD.fixedHz
