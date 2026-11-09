import { createStore, useStore } from "../systems/liveStore"
import type { CarTelemetry } from "../physics/vehicle/Vehicle"
import Dashboard from "./Dashboard"

export const teleStore = createStore<CarTelemetry | null>(null)

export function LiveDashboard({
  initial,
  dashStyle,
}: {
  initial: CarTelemetry
  dashStyle: "modern" | "classic" | "single"
}) {
  const t = useStore(teleStore)
  return <Dashboard tele={t ?? initial} dashStyle={dashStyle} />
}
