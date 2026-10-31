import type { LoadedPacejkaCurve, PacejkaCurve, TireSpec, Wheels } from "./schema"

/** A tyre compound: grip, curve shape and patch dynamics. A car picks one and overrides what differs. */
export interface TyrePreset {
  frictionMu: number
  rollingResist: number
  relaxationLength: number
  slipDampRate: number
  tire: TireSpec
  pacejka: {
    longitudinal: LoadedPacejkaCurve
    lateral: LoadedPacejkaCurve
    aligning: PacejkaCurve
  }
}

const curve = (B: number, C: number, E: number): PacejkaCurve => ({ B, C, D: 1, E, Sh: 0, Sv: 0 })
const loaded = (B: number, C: number, E: number, loadSensitivity: number): LoadedPacejkaCurve => ({
  ...curve(B, C, E),
  loadSensitivity,
})

export const TYRES = {
  /** All-round road tyre. */
  sport: {
    frictionMu: 1.4,
    rollingResist: 0.012,
    relaxationLength: 0.18,
    slipDampRate: 100,
    tire: { rollingV0: 0.5, combinedWeight: 6, maxSlip: 10 },
    pacejka: {
      longitudinal: loaded(10, 1.65, 0.97, 0.9),
      lateral: loaded(9, 1.45, 0.97, 0.85),
      aligning: curve(8, 1.2, 0.97),
    },
  },
  /** Economy / touring: lower grip, soft onset. */
  street: {
    frictionMu: 1.1,
    rollingResist: 0.01,
    relaxationLength: 0.22,
    slipDampRate: 100,
    tire: { rollingV0: 0.5, combinedWeight: 6, maxSlip: 10 },
    pacejka: {
      longitudinal: loaded(8, 1.6, 0.95, 0.88),
      lateral: loaded(7.5, 1.4, 0.95, 0.82),
      aligning: curve(7, 1.2, 0.95),
    },
  },
  /** Track compound: high grip, sharp peak, more rolling loss. */
  race: {
    frictionMu: 1.7,
    rollingResist: 0.015,
    relaxationLength: 0.14,
    slipDampRate: 100,
    tire: { rollingV0: 0.5, combinedWeight: 6, maxSlip: 10 },
    pacejka: {
      longitudinal: loaded(12, 1.7, 0.9, 0.92),
      lateral: loaded(11, 1.5, 0.9, 0.88),
      aligning: curve(9, 1.2, 0.9),
    },
  },
  /** Winter / all-season: moderate grip, long and forgiving. */
  allSeason: {
    frictionMu: 1.2,
    rollingResist: 0.012,
    relaxationLength: 0.24,
    slipDampRate: 100,
    tire: { rollingV0: 0.5, combinedWeight: 6, maxSlip: 10 },
    pacejka: {
      longitudinal: loaded(7, 1.55, 0.9, 0.86),
      lateral: loaded(6.5, 1.35, 0.9, 0.8),
      aligning: curve(6, 1.2, 0.9),
    },
  },
  /** Knobbly off-road tyre: low grip on tarmac, wide gentle peak, large patch lag. */
  offRoad: {
    frictionMu: 1.0,
    rollingResist: 0.02,
    relaxationLength: 0.3,
    slipDampRate: 100,
    tire: { rollingV0: 0.5, combinedWeight: 6, maxSlip: 10 },
    pacejka: {
      longitudinal: loaded(5.5, 1.5, 0.85, 0.82),
      lateral: loaded(5, 1.3, 0.85, 0.78),
      aligning: curve(5, 1.2, 0.85),
    },
  },
} satisfies Record<string, TyrePreset>

export type TyrePresetName = keyof typeof TYRES

/** The tyre fields of `Wheels` from a preset, with per-car overrides on top. */
export function tyre(
  name: TyrePresetName,
  override: Partial<Pick<Wheels, "frictionMu" | "rollingResist" | "relaxationLength" | "slipDampRate">> = {},
) {
  const p = TYRES[name]
  return {
    frictionMu: p.frictionMu,
    rollingResist: p.rollingResist,
    relaxationLength: p.relaxationLength,
    slipDampRate: p.slipDampRate,
    ...override,
    tire: { ...p.tire },
    pacejka: {
      longitudinal: { ...p.pacejka.longitudinal },
      lateral: { ...p.pacejka.lateral },
      aligning: { ...p.pacejka.aligning },
    },
  }
}
