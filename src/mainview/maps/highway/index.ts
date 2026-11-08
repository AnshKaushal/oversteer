import type { GameMap } from "../types"
import { WorldManager } from "../../systems/WorldManager"
import { highwayRoad } from "./road"

export const highwayMap: GameMap = {
  id: "highway",
  name: "Endless Highway",
  description:
    "A winding highway with trees, hills, clouds and the odd airport.",
  features: { airport: true, traffic: true, races: true, multiplayer: true },
  create() {
    return {
      map: highwayMap,
      road: highwayRoad,
      linear: highwayRoad,
      circuit: null,
      world: new WorldManager(),
    }
  },
}
