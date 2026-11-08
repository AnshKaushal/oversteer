import type { CarSpec } from "../schema"
import { validateCar } from "../validate"
import { bmwM3 } from "./bmw-m3"
import { audiR8 } from "./audi-r8"
import { audiRs7 } from "./audi-rs7"
import { porsche997Gt2 } from "./porsche-997-gt2"
import { gWagon } from "./g-wagon"
import { lamboUrus } from "./lambo-urus"
import { lamboAventador } from "./lambo-aventador"
import { dodgeChallenger } from "./dodge-challenger"
import { f1Car } from "./f1-car"
import { cheetah84 } from "./cheetah-84"
import { dodgeCharger69 } from "./dodge-charger-69"
import { mercedesSl65 } from "./mercedes-sl65-amg"
import { bugattiChironPurSport } from "./bugatti-chiron-pur-sport"
import { mitsubishiLancerEvo6 } from "./mitsubishi-lancer-evo-6"
import { nissan350z } from "./nissan-350z"

const ALL_CARS: CarSpec[] = [
  bmwM3,
  audiR8,
  audiRs7,
  porsche997Gt2,
  gWagon,
  lamboUrus,
  lamboAventador,
  dodgeChallenger,
  f1Car,
  cheetah84,
  dodgeCharger69,
  mercedesSl65,
  bugattiChironPurSport,
  mitsubishiLancerEvo6,
  nissan350z,
]

export const CARS: CarSpec[] = ALL_CARS.filter((car) => {
  const errs = validateCar(car)
  if (!errs.length) return true
  const msg = errs.join("\n")
  if ((import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
    console.error(msg)
    return false
  }
  throw new Error(msg)
})

export const DEFAULT_CAR_ID = "bmw-m3"

const byId = new Map<string, CarSpec>(CARS.map((c) => [c.id, c]))

export function getCar(id: string | undefined | null): CarSpec {
  const found = id ? byId.get(id) : undefined
  return found ?? byId.get(DEFAULT_CAR_ID)!
}

export function isKnownCarId(id: string | undefined | null): boolean {
  return !!id && byId.has(id)
}

export function modelFileForCarId(id: string | undefined | null): string {
  return getCar(id).modelFile
}
