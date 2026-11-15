import type { CarSpec } from "../schema"
import { validateCar } from "../validate"
import { bmwM3 } from "./bmw-m3"
import { audiR8 } from "./audi-r8"
import { audiRs7 } from "./audi-rs7"
import { porsche911TurboS } from "./porsche-911-turbo-s"
import { gWagon } from "./g-wagon"
import { lamboUrus } from "./lambo-urus"
import { lamboAventador } from "./lambo-aventador"
import { dodgeChallengerHellcat } from "./dodge-challenger-hellcat"
import { f1Car } from "./f1-car"
import { jaguarFType } from "./jaguar-f-type"
import { ferrariF12 } from "./ferrari-f12"
import { fordMustang69 } from "./ford-mustang-69"
import { mercedesW124 } from "./mercedes-w124"
import { bugattiChironPurSport } from "./bugatti-chiron-pur-sport"
import { mitsubishiLancerEvoX } from "./mitsubishi-lancer-evo-x"
import { nissan350z } from "./nissan-350z"
import { astonMartinDb12 } from "./aston-martin-db12"

const ALL_CARS: CarSpec[] = [
  bmwM3,
  audiR8,
  audiRs7,
  porsche911TurboS,
  gWagon,
  lamboUrus,
  lamboAventador,
  dodgeChallengerHellcat,
  f1Car,
  jaguarFType,
  ferrariF12,
  fordMustang69,
  mercedesW124,
  bugattiChironPurSport,
  mitsubishiLancerEvoX,
  nissan350z,
  astonMartinDb12,
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
