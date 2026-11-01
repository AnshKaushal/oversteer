import { DEFAULT_WEATHER, TIME_OF_DAY_GRIP, type WeatherId } from "../../data/surfaces"

export const conditions: { weather: WeatherId; timeOfDay: string } = {
  weather: DEFAULT_WEATHER,
  timeOfDay: "day",
}

export function timeOfDayGrip(): number {
  return TIME_OF_DAY_GRIP[conditions.timeOfDay] ?? 1
}
