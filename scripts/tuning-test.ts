import {
  applyTuning,
  STOCK_TUNING,
  gearSpeeds,
} from "../src/mainview/data/tuning"
import { CARS } from "../src/mainview/data/cars"
import { validateCar } from "../src/mainview/data/validate"

let fails = 0
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`)
  if (!c) fails++
}
const car = CARS[0]
const before = JSON.stringify(car)
ok(applyTuning(car, STOCK_TUNING) === car, "stock tuning returns the same spec")
const t = applyTuning(car, {
  ...STOCK_TUNING,
  gearing: 1.1,
  springs: 1.2,
  rearBias: 1.4,
  downforce: 1.5,
  gripBias: 1.03,
})
ok(JSON.stringify(car) === before, "stock spec is not mutated")
ok(
  t.physics.transmission.finalDriveRatio >
    car.physics.transmission.finalDriveRatio,
  "gearing applied",
)
ok(
  t.physics.wheels.suspension.front.springRate >
    car.physics.wheels.suspension.front.springRate,
  "springs applied",
)
ok(
  t.physics.wheels.suspension.antiRollBarRear >
    car.physics.wheels.suspension.antiRollBarRear,
  "rear bar applied",
)
ok(
  t.physics.aero.downforceAt100kmh > car.physics.aero.downforceAt100kmh,
  "downforce applied",
)
ok(validateCar(t).length === 0, "tuned car still validates")
const clamp = applyTuning(car, { ...STOCK_TUNING, gearing: 99 })
ok(
  clamp.physics.transmission.finalDriveRatio <=
    car.physics.transmission.finalDriveRatio * 1.15 + 1e-9,
  "values are clamped",
)
const g0 = gearSpeeds(car, STOCK_TUNING)[0].kmhAtRedline
const g1 = gearSpeeds(car, { ...STOCK_TUNING, gearing: 1.1 })[0].kmhAtRedline
ok(g1 < g0, "taller final drive lowers speed per gear")
if (fails) process.exit(1)
console.log("tuning OK")
