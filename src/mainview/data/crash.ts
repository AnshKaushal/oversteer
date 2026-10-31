import type { CrashSpec } from "./schema"

/**
 * Crash classes. The body is rigid with no damage, so a class sets how hard a hit may throw the car
 * (upward speed and spin) and how long the tyres stay upset after it. A car picks one in its data.
 */
export const CRASH = {
  /** Light open-wheel racer: spins freely and loses grip the longest. */
  open: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 5,
    maxSpin: 5,
    gripLoss: 0.5,
    gripRecovery: 3,
  },
  /** Low, light sports cars. */
  sport: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 4,
    maxSpin: 4,
    gripLoss: 0.35,
    gripRecovery: 2.5,
  },
  /** Ordinary road cars and muscle cars. */
  road: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 3.5,
    maxSpin: 3.5,
    gripLoss: 0.3,
    gripRecovery: 2.5,
  },
  /** Heavy tall SUVs: shrug hits off with the least bounce. */
  heavy: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 3,
    maxSpin: 3,
    gripLoss: 0.25,
    gripRecovery: 3,
  },
} as const satisfies Record<string, CrashSpec>
