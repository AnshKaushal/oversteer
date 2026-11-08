import { EASE, Screen } from "../anim"

export function IntroScreen({
  open,
  onEnter,
}: {
  open: boolean
  onEnter: () => void
}) {
  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[70] bg-[#0b0e14]/30 p-6 md:p-10 w-full"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.5 }}
      exit={{ duration: 0.45, ease: EASE.in }}
      stagger={[
        { selector: "[data-intro-chip]", from: { autoAlpha: 0 } },
        {
          selector: "[data-intro-title]",
          from: { autoAlpha: 0 },
          to: { duration: 0.8, ease: EASE.soft },
        },
        { selector: "[data-intro-sub]", from: { autoAlpha: 0 } },
        {
          selector: "[data-intro-cta]",
          from: { autoAlpha: 0 },
          each: 0.08,
          delay: 0.2,
        },
      ]}
      onClick={() => onEnter()}
    >
      <div className="flex h-full flex-col justify-between w-full">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full">
            <div
              data-intro-chip
              className="mb-4 h-3 w-24"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#f5f5f5 0% 25%, #e30613 0% 50%)",
                backgroundSize: "14px 14px",
              }}
            />
            <h1
              data-intro-title
              className="text-[80px] font-bold leading-[0.85] tracking-tight text-white md:text-[140px]"
            >
              OverSteer
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            data-intro-cta
            onClick={() => onEnter()}
            className="bg-[#51a7d5] px-8 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#51a7d5]/90"
          >
            Enter the garage
          </button>
        </div>
      </div>
    </Screen>
  )
}
