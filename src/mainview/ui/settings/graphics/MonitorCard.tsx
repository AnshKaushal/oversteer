import { Monitor } from "lucide-react"
import { moveToDisplay } from "../../../systems/updater"
import { DisplayList, currentDisplayId } from "../../DisplayPicker"
import type { AppSettings } from "../../../systems/settings"
import type { DisplayInfo } from "../../../../shared/updateRpc"

export function MonitorCard({
  settings,
  onUpdateSettings,
  displays,
}: {
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
  displays: DisplayInfo[]
}) {
  if (displays.length <= 1) return null
  return (
    <>
      {displays.length > 1 && (
        <div data-anim-item className="space-y-2.5">
          <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Monitor size={14} className="text-[#51a7d5]" />
            Monitor
          </label>
          <DisplayList
            displays={displays}
            selectedId={settings.displayId ?? currentDisplayId(displays)}
            onPick={(id) => {
              onUpdateSettings({ ...settings, displayId: id })
              void moveToDisplay(id)
            }}
          />
        </div>
      )}
    </>
  )
}
