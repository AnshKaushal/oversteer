import type { CrashSpec } from "./schema"

export const CRASH = {
  open: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 5,
    maxSpin: 5,
    gripLoss: 0.5,
    gripRecovery: 3,
  },
  sport: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 4,
    maxSpin: 4,
    gripLoss: 0.35,
    gripRecovery: 2.5,
  },
  road: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 3.5,
    maxSpin: 3.5,
    gripLoss: 0.3,
    gripRecovery: 2.5,
  },
  heavy: {
    detectDeltaV: 3,
    severeDeltaV: 12,
    maxLaunchSpeed: 3,
    maxSpin: 3,
    gripLoss: 0.25,
    gripRecovery: 3,
  },
} as const satisfies Record<string, CrashSpec>
