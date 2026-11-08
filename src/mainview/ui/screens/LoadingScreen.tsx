import { Loader2 } from "lucide-react"
import { Screen } from "../anim"

export function LoadingScreen({
  open,
  loadPct,
}: {
  open: boolean
  loadPct: number
}) {
  return (
    <Screen
      open={open}
      className="absolute inset-0 flex items-center justify-center bg-[#0b0e14] text-white"
      from={{ autoAlpha: 0 }}
      stagger={[{ selector: "[data-load]", from: { autoAlpha: 0, y: 16 } }]}
    >
      <div data-load className="flex flex-col items-center gap-3">
        <Loader2 size={24} />
        <div className="h-1 w-48 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-[#51a7d5] transition-[width]"
            style={{ width: `${Math.round(loadPct * 100)}%` }}
          />
        </div>
      </div>
    </Screen>
  )
}
