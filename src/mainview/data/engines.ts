import type { EngineConfig } from "./schema"

const FLYWHEEL_PER_LITRE = { road: 0.07, sport: 0.05, race: 0.015 } as const
const INERTIA_PER_CYLINDER = 0.008

export function engineInertiaFor(c: EngineConfig): number {
  return (
    c.displacementL * FLYWHEEL_PER_LITRE[c.flywheel] +
    c.cylinders * INERTIA_PER_CYLINDER
  )
}

export function engineBuild(config: EngineConfig): {
  config: EngineConfig
  engineInertia: number
} {
  return { config, engineInertia: engineInertiaFor(config) }
}
