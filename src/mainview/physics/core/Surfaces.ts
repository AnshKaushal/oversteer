import type RAPIER from "@dimforge/rapier3d-compat"
import { DEFAULT_SURFACE, type SurfaceId } from "../../data/surfaces"

export type SurfaceSource = SurfaceId | ((x: number, z: number) => SurfaceId)

const tables = new WeakMap<RAPIER.World, Map<number, SurfaceSource>>()

export function registerSurface(world: RAPIER.World, collider: RAPIER.Collider, source: SurfaceSource) {
  let t = tables.get(world)
  if (!t) tables.set(world, (t = new Map()))
  t.set(collider.handle, source)
}

export function surfaceOf(world: RAPIER.World, collider: RAPIER.Collider | undefined, x: number, z: number): SurfaceId {
  if (!collider) return DEFAULT_SURFACE
  const s = tables.get(world)?.get(collider.handle) ?? DEFAULT_SURFACE
  return typeof s === "function" ? s(x, z) : s
}
