import { Screen } from "../anim"

export function LoadingScreen({ open }: { open: boolean; loadPct?: number }) {
  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[300] flex flex-col items-center justify-center gap-6 bg-black"
      from={{ autoAlpha: 0 }}
    >
      <img
        src={`${import.meta.env.BASE_URL || "./"}icon.png`}
        alt=""
        draggable={false}
        className="h-[min(48vh,460px)] w-auto mix-blend-screen"
      />
      <div className="flex items-baseline gap-1 text-[26px] font-extrabold uppercase italic tracking-[0.14em] text-white md:text-[38px]">
        Loading
        <span className="os-dot">.</span>
        <span className="os-dot">.</span>
        <span className="os-dot">.</span>
      </div>
    </Screen>
  )
}
