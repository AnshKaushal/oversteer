import type { AppSettings } from "../../systems/settings"

export interface TabProps {
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
}
