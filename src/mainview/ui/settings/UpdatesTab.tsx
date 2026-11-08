import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { checkForUpdates } from "../../systems/updater"

export function UpdatesTab() {
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateMessage, setUpdateMessage] = useState("")
  const handleCheckForUpdates = async () => {
    if (updateChecking) return
    setUpdateChecking(true)
    setUpdateMessage("Checking for updates…")
    const result = await checkForUpdates()
    setUpdateMessage(result.message)
    setUpdateChecking(false)
  }
  return (
    <>
      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-[#51a7d5]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-200">
              Updates
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            {updateMessage || "Check whether a newer version is available."}
          </p>
        </div>
        <button
          onClick={handleCheckForUpdates}
          disabled={updateChecking}
          className="shrink-0 rounded border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {updateChecking ? "Checking…" : "Check for Updates"}
        </button>
      </div>
    </>
  )
}
