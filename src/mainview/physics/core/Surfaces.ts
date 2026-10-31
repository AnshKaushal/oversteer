import type RAPIER from "@dimforge/rapier3d-compat"
import { DEFAULT_SURFACE, type SurfaceId } from "../../data/surfaces"

/** A collider's surface: one id, or a function of the world position for colliders that span several. */
export type SurfaceSource = SurfaceId | ((x: number, z: number) => SurfaceId)

const tables = new WeakMap<RAPIER.World, Map<number, SurfaceSource>>()

/** Marks a collider as a surface; the suspension rays read it back from what they hit. */
export function registerSurface(world: RAPIER.World, collider: RAPIER.Collider, source: SurfaceSource) {
  let t = tables.get(world)
  if (!t) tables.set(world, (t = new Map()))
  t.set(collider.handle, source)
}

/** Surface under world point (x, z) on `collider`. */
export function surfaceOf(world: RAPIER.World, collider: RAPIER.Collider | undefined, x: number, z: number): SurfaceId {
  if (!collider) return DEFAULT_SURFACE
  const s = tables.get(world)?.get(collider.handle) ?? DEFAULT_SURFACE
  return typeof s === "function" ? s(x, z) : s
}
