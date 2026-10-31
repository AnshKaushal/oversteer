/**
 * Tyre force curves as text.
 *   bun scripts/tire-curves.ts <preset | car-id> [loadN]
 * Longitudinal force against slip ratio, lateral force and self-aligning
 * torque against slip angle, for a tyre preset (data/tyres.ts) or a car's own
 * wheels, at the given vertical load (default: the car's reference load).
 */
import { TYRES, tyre, type TyrePresetName } from "../src/mainview/data/tyres"
import { TireModel, tireParamsFrom } from "../src/mainview/physics/vehicle/components/TireModel"
import { carById } from "./lib/cars"
import type { Wheels } from "../src/mainview/data/schema"

const name = process.argv[2]
if (!name) {
  console.log(`usage: tire-curves.ts <${Object.keys(TYRES).join("|")}|car-id> [loadN]`)
  process.exit(1)
}
let wheels: Wheels
if (name in TYRES) {
  const base = carById("bmw-m3").physics.wheels
  wheels = { ...base, ...tyre(name as TyrePresetName) }
} else {
  wheels = carById(name).physics.wheels
}
const load = Number(process.argv[3] ?? wheels.referenceLoad)
const model = new TireModel(tireParamsFrom(wheels), wheels.radius)

const base = {
  grounded: true,
  normalLoad: load,
  normal: { x: 0, y: 1, z: 0 },
  patchVel: { x: 0, y: 0, z: -20 },
  wheelOmega: 0,
  wheelHeading: { x: 0, y: 0, z: -1 },
  bodyForward: { x: 0, y: 0, z: -1 },
}
const WIDTH = 40
const bar = (v: number, max: number) => {
  const n = Math.round((Math.abs(v) / max) * WIDTH)
  return (v < 0 ? "-" : "+") + "#".repeat(Math.min(WIDTH, n))
}
const peak = wheels.frictionMu * load
console.log(`${name} at ${load.toFixed(0)} N  (mu ${wheels.frictionMu}, peak ${peak.toFixed(0)} N)`)
console.log("\nslip ratio   Fx (N)")
for (const sx of [0.02, 0.05, 0.08, 0.12, 0.2, 0.35, 0.6, 1]) {
  const r = model.eval({ ...base, slipRatio: sx, slipTan: 0 })
  console.log(sx.toFixed(2).padStart(10), r.fx.toFixed(0).padStart(8), bar(r.fx, peak))
}
console.log("\nslip angle   Fy (N)     Mz (N m)")
for (const deg of [1, 2, 4, 6, 8, 12, 16, 24, 40]) {
  const r = model.eval({ ...base, slipRatio: 0, slipTan: Math.tan((deg * Math.PI) / 180) })
  console.log(`${String(deg).padStart(7)}°`, r.fy.toFixed(0).padStart(8), r.mz.toFixed(1).padStart(10), bar(r.fy, peak))
}
