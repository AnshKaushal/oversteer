import type { calculateResolution } from "../../../systems/settings"
import { Monitor, Zap } from "lucide-react"
import type { AppSettings } from "../../../systems/settings"

export function RenderTargetCard({
  settings,
  currentDims,
  reductionPct,
}: {
  settings: AppSettings
  currentDims: ReturnType<typeof calculateResolution>
  reductionPct: number
}) {
  return (
    <>
      <div
        data-anim-item
        className="rounded border border-[#51a7d5]/40 bg-[#51a7d5]/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-[#51a7d5] bg-[#51a7d5]/20 text-[#6ec2f0]">
            <Monitor size={22} />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8f99a8]">
              Current Render Target
            </div>
            <div className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{currentDims.label}</span>
              {settings.renderScale < 100 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {settings.renderScale}% Scale
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-right sm:border-l sm:border-[#51a7d5]/30 sm:pl-4">
          <Zap
            size={18}
            className={
              reductionPct > 30 ? "text-emerald-400" : "text-[#51a7d5]"
            }
          />
          <div className="text-left">
            <div className="text-[10px] uppercase font-semibold text-[#8f99a8]">
              GPU Load Reduction
            </div>
            <div className="text-sm font-bold text-white">
              {reductionPct > 0 ? (
                <span className="text-emerald-400">
                  ~{reductionPct}% fewer pixels
                </span>
              ) : (
                <span className="text-gray-300">Full native load</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
