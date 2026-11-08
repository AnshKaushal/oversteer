import { Cpu } from "lucide-react"
import type { AppSettings } from "../../../systems/settings"

export function ShadowsCard({
  settings,
  handleToggleShadows,
}: {
  settings: AppSettings
  handleToggleShadows: () => void
}) {
  return (
    <>
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between"
      >
        <div>
          <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Cpu size={14} className="text-[#51a7d5]" />
            Dynamic Shadows
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Cascading shadow maps for cars and track scenery
          </p>
        </div>

        <button
          onClick={handleToggleShadows}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            settings.shadows ? "bg-[#51a7d5]" : "bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.shadows ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </>
  )
}
