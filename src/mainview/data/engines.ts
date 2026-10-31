import type { EngineConfig } from "./schema"

/** Crank and flywheel inertia per litre of displacement (kg m^2 / L), by flywheel build. */
const FLYWHEEL_PER_LITRE = { road: 0.07, sport: 0.05, race: 0.015 } as const
/** Crank, rod and piston inertia each cylinder adds (kg m^2). */
const INERTIA_PER_CYLINDER = 0.008

/** Rotating inertia of the engine (kg m^2) from its configuration: bigger and more cylinders spin up slower. */
export function engineInertiaFor(c: EngineConfig): number {
  return c.displacementL * FLYWHEEL_PER_LITRE[c.flywheel] + c.cylinders * INERTIA_PER_CYLINDER
}

/** Spread into a car's `engine`: the configuration and the inertia derived from it. */
export function engineBuild(config: EngineConfig): { config: EngineConfig; engineInertia: number } {
  return { config, engineInertia: engineInertiaFor(config) }
}
