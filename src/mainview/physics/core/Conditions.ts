import {
  DEFAULT_WEATHER,
  TIME_OF_DAY_GRIP,
  type WeatherId,
} from "../../data/surfaces"

export const conditions: {
  weather: WeatherId
  timeOfDay: string
  lowLight: boolean
  stormHazards: boolean
} = {
  weather: DEFAULT_WEATHER,
  timeOfDay: "day",
  lowLight: false,
  stormHazards: false,
}

export function timeOfDayGrip(): number {
  return TIME_OF_DAY_GRIP[conditions.timeOfDay.split("-")[0]] ?? 1
}
