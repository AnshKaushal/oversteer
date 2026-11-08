import type { GameMap, MapInstance, RoadModel } from "../types"
import { type CircuitConfig, createCircuitConfig } from "./config"
import { CircuitDriver } from "./CircuitDriver"
import { CircuitWorld } from "./CircuitWorld"
import { Track } from "./Track"

export {
  createCircuitConfig,
  randomSeed,
  DEFAULT_CIRCUIT_CONFIG,
} from "./config"
export type { CircuitConfig } from "./config"

export const circuitMap: GameMap = {
  id: "circuit",
  name: "Race Circuit",
  description:
    "A closed race circuit generated from a seed: random corners, straights and a start/finish line.",
  features: { airport: false, traffic: false, races: true, multiplayer: true },
  gapM: (a, b) => a - b,
  create(options?: unknown): MapInstance {
    const cfg: CircuitConfig = createCircuitConfig(
      (options ?? {}) as Partial<CircuitConfig>,
    )
    const track = new Track(cfg)
    const road: RoadModel = {
      spawnPose(s, lateral) {
        const p = track.at(s)
        return {
          x: p.x - p.tz * lateral,
          z: p.z + p.tx * lateral,
          yaw: Math.atan2(-p.tx, -p.tz),
        }
      },
      nearestPose(x, z) {
        const h = track.project(x, z)
        return { x: h.x, z: h.z, yaw: Math.atan2(-h.tx, -h.tz) }
      },
    }
    return {
      map: circuitMap,
      road,
      linear: null,
      circuit: {
        lengthM: track.lengthM,
        seed: cfg.seed,
        progressAt: (x, z) => track.project(x, z).s,
        progressTracker() {
          const L = track.lengthM
          let cum = 0
          let last = NaN
          return (x, z) => {
            const s = track.project(x, z).s
            if (Number.isNaN(last)) {
              cum = s > L / 2 ? s - L : s
            } else {
              let d = s - last
              if (d > L / 2) d -= L
              else if (d < -L / 2) d += L
              cum += d
            }
            last = s
            return cum
          }
        },
      },
      rivalDriver: (profile) => new CircuitDriver(profile, track),
      world: new CircuitWorld(track),
    }
  },
}
