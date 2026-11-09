import type { CarTelemetry } from "../physics/vehicle/Vehicle"
import DashboardClassic from "./DashboardLegacy"
import { TwinDialDashboard } from "./dashboard/TwinDialDashboard"
import { SingleDialDashboard } from "./dashboard/SingleDialDashboard"

export interface DashboardProps {
  tele: CarTelemetry
  dashStyle?: "modern" | "classic" | "single"
}

export default function Dashboard({
  tele,
  dashStyle = "modern",
}: DashboardProps) {
  if (dashStyle === "classic") return <DashboardClassic tele={tele} />
  if (dashStyle === "single") return <SingleDialDashboard tele={tele} />
  return <TwinDialDashboard tele={tele} />
}
