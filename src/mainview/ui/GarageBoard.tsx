import { useLayoutEffect, useRef } from "react"
import { PaintPicker } from "./PaintPicker"
import { BOARD_H, BOARD_W, setBoardElement } from "../systems/garageBoard"

const SCALE = 1.5

export function GarageBoard({
  paint,
  onPaint,
}: {
  paint: number | null
  onPaint: (color: number | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setBoardElement(ref.current)
    return () => setBoardElement(null)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        ref={ref}
        className="pointer-events-auto absolute top-0 left-0 origin-top-left overflow-hidden p-10 text-white"
        style={{ width: BOARD_W, height: BOARD_H, visibility: "hidden" }}
      >
        <div className="mb-4 text-[34px] leading-none font-bold">Color</div>
        <div
          className="origin-top-left [&_button]:cursor-pointer"
          style={{
            width: (BOARD_W - 80) / SCALE,
            transform: `scale(${SCALE})`,
          }}
        >
          <PaintPicker value={paint} showStock onPick={onPaint} />
        </div>
      </div>
    </div>
  )
}
