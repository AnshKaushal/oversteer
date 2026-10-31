/** Validates every car spec. Exit 1 if any problem is found. */
import { CARS } from "../src/mainview/data/cars"
import { validateAll } from "../src/mainview/data/validate"
const errs = validateAll(CARS)
for (const e of errs) console.log("FAIL | " + e)
console.log(errs.length ? `\n${errs.length} problem(s)` : `${CARS.length} cars valid`)
process.exit(errs.length ? 1 : 0)
