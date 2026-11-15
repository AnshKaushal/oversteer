import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Swiper, SwiperSlide } from "swiper/react"
import type { Swiper as SwiperType } from "swiper"
import "swiper/css"
import {
  type ResolutionId,
  type getResolutionPresets,
} from "../../systems/settings"
import { arrowKeys, useStep } from "./controls"

type Preset = ReturnType<typeof getResolutionPresets>[number]

const TIER_STYLE: Record<string, string> = {
  ultra: "bg-[#51a7d5]/20 text-[#7cc4ea]",
  performance: "bg-emerald-500/20 text-emerald-300",
  "max-fps": "bg-amber-500/20 text-amber-300",
}

// Stepping through the carousel previews instantly; the (expensive) render
// target resize is only committed once the player stops on an option.
const COMMIT_DELAY = 350

export function ResolutionCarousel({
  presets,
  selectedId,
  viewport,
  onSelect,
}: {
  presets: Preset[]
  selectedId: ResolutionId
  viewport: { w: number; h: number }
  onSelect: (id: ResolutionId) => void
}) {
  const n = presets.length
  const selectedIdx = Math.max(
    0,
    presets.findIndex(
      (p) =>
        p.id === selectedId ||
        (p.height !== null && selectedId === `${p.height}p`),
    ),
  )
  const [idx, setIdx] = useState(selectedIdx)
  const swiper = useRef<SwiperType | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIdx(selectedIdx)
    const s = swiper.current
    if (s && s.realIndex !== selectedIdx) s.slideToLoop(selectedIdx, 0)
  }, [selectedIdx])

  useEffect(() => {
    if (idx === selectedIdx || !presets[idx]) return
    const t = window.setTimeout(() => onSelect(presets[idx].id), COMMIT_DELAY)
    return () => window.clearTimeout(t)
  }, [idx, selectedIdx, presets, onSelect])

  const step = (d: -1 | 1) => {
    if (d > 0) swiper.current?.slideNext()
    else swiper.current?.slidePrev()
  }
  useStep(ref, step)

  if (n === 0) return null

  const Arrow = ({ d }: { d: -1 | 1 }) => (
    <div
      role="button"
      aria-label={d > 0 ? "Next resolution" : "Previous resolution"}
      onClick={() => step(d)}
      className="flex w-10 shrink-0 cursor-pointer items-center justify-center text-white/50 transition-colors hover:bg-white/10 hover:text-white"
    >
      {d > 0 ? <ChevronRight size={26} /> : <ChevronLeft size={26} />}
    </div>
  )

  const face = (p: Preset) => {
    return (
      <div className="os-face flex flex-col items-center gap-2 text-center">
        <div className="text-[26px] font-extrabold italic leading-none tracking-tight tabular-nums text-white md:text-[34px]">
          {p.name}
        </div>
        <span
          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${TIER_STYLE[p.tier] ?? TIER_STYLE.ultra}`}
        >
          {p.badge}
        </span>
      </div>
    )
  }

  return (
    <div data-set-row className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white">
          Resolution
        </div>
        <span className="text-[11px] tabular-nums text-white/40">
          Display {viewport.w} × {viewport.h}
        </span>
      </div>

      <div
        ref={ref}
        role="listbox"
        aria-label="Resolution"
        tabIndex={0}
        data-pad-step
        onKeyDown={arrowKeys(step)}
        className="flex items-stretch gap-2 outline-none"
      >
        <Arrow d={-1} />
        <Swiper
          className="os-swiper min-w-0 flex-1"
          onSwiper={(s) => (swiper.current = s)}
          onRealIndexChange={(s) => setIdx(s.realIndex)}
          initialSlide={selectedIdx}
          loop={n > 3}
          centeredSlides
          slidesPerView={3}
          speed={450}
          slideToClickedSlide
          grabCursor
          allowTouchMove={false}
        >
          {presets.map((p) => (
            <SwiperSlide key={p.id}>{face(p)}</SwiperSlide>
          ))}
        </Swiper>
        <Arrow d={1} />
      </div>

      <div className="flex justify-center gap-1.5">
        {presets.map((p, i) => (
          <span
            key={p.id}
            className={`h-1 transition-all duration-300 ${
              i === idx ? "w-6 bg-[#51a7d5]" : "w-2 bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
