import { useEffect, useState } from "react"
import { Monitor, Check } from "lucide-react"
import type { DisplayInfo } from "../../shared/updateRpc"
import { getDisplays } from "../systems/updater"

export function currentDisplayId(displays: DisplayInfo[]): number | undefined {
  const cx = window.screenX + window.innerWidth / 2
  const cy = window.screenY + window.innerHeight / 2
  return displays.find(
    (d) => cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height,
  )?.id
}

export function useDisplays() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  useEffect(() => {
    let alive = true
    void getDisplays().then((d) => alive && setDisplays(d))
    return () => {
      alive = false
    }
  }, [])
  return displays
}

export function DisplayList({
  displays,
  selectedId,
  onPick,
}: {
  displays: DisplayInfo[]
  selectedId: number | undefined
  onPick: (id: number) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {displays.map((d, i) => {
        const sel = d.id === selectedId
        return (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className={`flex items-center gap-3 rounded border p-3 text-left transition-all ${
              sel
                ? "border-[#51a7d5] bg-[#51a7d5]/25 ring-1 ring-[#51a7d5]"
                : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
            }`}
          >
            <Monitor size={22} className="text-[#6ec2f0]" />
            <div className="flex-1">
              <div className="text-sm font-bold text-white">
                Monitor {i + 1}
                {d.isPrimary ? " (primary)" : ""}
              </div>
              <div className="font-mono text-xs text-gray-300">
                {Math.round(d.width * d.scaleFactor)} × {Math.round(d.height * d.scaleFactor)}
              </div>
            </div>
            {sel && <Check size={16} className="text-[#6ec2f0]" />}
          </button>
        )
      })}
    </div>
  )
}
