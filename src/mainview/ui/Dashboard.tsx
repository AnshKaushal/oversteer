import type { CarTelemetry } from "../physics/vehicle/Vehicle"
import DashboardClassic from "./DashboardLegacy"
import { TwinDialDashboard } from "./dashboard/TwinDialDashboard"

export interface DashboardProps {
  tele: CarTelemetry
  dashStyle?: "modern" | "classic"
}

export default function Dashboard({
  tele,
  dashStyle = "modern",
}: DashboardProps) {
  return dashStyle === "classic" ? (
    <DashboardClassic tele={tele} />
  ) : (
    <TwinDialDashboard tele={tele} />
  )
}
