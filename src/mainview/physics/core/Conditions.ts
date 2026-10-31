import { DEFAULT_WEATHER, TIME_OF_DAY_GRIP, type WeatherId } from "../../data/surfaces"

/** The world's grip conditions, set by the app and read by every car's tyres. */
export const conditions: { weather: WeatherId; timeOfDay: string } = {
  weather: DEFAULT_WEATHER,
  timeOfDay: "day",
}

/** Grip scale from the time of day alone. */
export function timeOfDayGrip(): number {
  return TIME_OF_DAY_GRIP[conditions.timeOfDay] ?? 1
}
