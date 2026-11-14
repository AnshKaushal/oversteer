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
const t2 = applyTuning(car, {
  ...STOCK_TUNING,
  power: 1.2,
  brakeForce: 1.2,
  diffLock: 1.5,
  camberFront: 1.3,
  toeRear: 1.5,
  steerAngle: 1.1,
})
const c0 = car.physics
ok(t2.physics.engine.maxTorqueNm > c0.engine.maxTorqueNm, "power applied")
ok(t2.physics.wheels.brakeForce.front > c0.wheels.brakeForce.front, "brakes applied")
ok(
  t2.physics.differential.lsdAccelLock >= c0.differential.lsdAccelLock,
  "diff lock applied",
)
ok(
  t2.physics.wheels.alignment.front.camberDeg >
    c0.wheels.alignment.front.camberDeg,
  "camber applied",
)
ok(validateCar(t2).length === 0, "alignment/diff tuned car validates")
const ext = applyTuning(car, {
  ...STOCK_TUNING,
  camberFront: 0.5,
  camberRear: 1.5,
  toeFront: 0.5,
  toeRear: 1.5,
  diffLock: 2,
  brakeForce: 1.3,
  brakeBias: 1.2,
})
ok(validateCar(ext).length === 0, "extreme tuning still validates")
const dr = applyTuning(car, { ...STOCK_TUNING, driftAssist: 0.6 })
ok(
  (dr.physics.assists.bodyStability.driftDeadzoneScale ?? 1) > 1 &&
    (dr.physics.assists.bodyStability.driftAuthorityScale ?? 1) < 1,
  "drift assist lenient",
)
ok(validateCar(dr).length === 0, "drift-tuned car validates")
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
