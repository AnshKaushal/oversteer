import type { GameMap, MapInstance } from "./types"
import { highwayMap } from "./highway"
import { circuitMap } from "./circuit"

export type {
  CircuitInfo,
  GameMap,
  LinearRoad,
  MapFeatures,
  MapInstance,
  MapWorld,
  Pose,
  RoadModel,
} from "./types"
export type { CircuitConfig } from "./circuit"
export { createCircuitConfig, randomSeed } from "./circuit"

export const DEFAULT_MAP_ID = "highway"

const MAPS: readonly GameMap[] = [highwayMap, circuitMap]

export function listMaps(): readonly GameMap[] {
  return MAPS
}

export function getMap(id?: string | null): GameMap {
  return (
    MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP_ID)!
  )
}

export function createMap(id?: string | null, options?: unknown): MapInstance {
  return getMap(id).create(options)
}
