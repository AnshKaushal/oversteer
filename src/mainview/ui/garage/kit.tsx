import type { ReactNode } from "react"

export const ACCENT = "#51a7d5"
export const ACCENT_DEEP = "#51a7d5"
export const MOD = "#ffc247"
export const DIM = "#8b97ab"

export const accentFill = ACCENT

export const glass =
  "border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const screenBg = {
  background: "#0a0a0a",
} as const

export function Label({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`text-[12px] font-medium tracking-wide text-[#8b97ab] ${className}`}
    >
      {children}
    </div>
  )
}

export function BoardHeader({
  title,
  right,
  flag,
}: {
  title: ReactNode
  right?: ReactNode
  flag?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 text-[34px] leading-none font-semibold tracking-tight">
        {title}
        {flag}
      </div>
      {right}
    </div>
  )
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  dots,
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  dots?: T[]
}) {
  return (
    <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            onClick={() => onChange(o.id)}
            className={`min-w-0 flex-1 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-all ${
              options.length > 5 ? "px-0.5 text-[12px]" : "px-2"
            } ${
              on
                ? "text-white"
                : "text-[#8b97ab] hover:bg-white/[0.06] hover:text-white"
            }`}
            style={on ? { background: accentFill } : undefined}
          >
            {o.label}
            {dots?.includes(o.id) && (
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 align-middle"
                style={{ background: MOD }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Token({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-3 py-1 text-[12.5px] font-semibold transition-all ${
        on
          ? "border-[#51a7d5]/50 bg-[#51a7d5]/15 text-white hover:bg-[#51a7d5]/25"
          : "border-white/[0.08] bg-white/[0.03] text-[#697488] line-through hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  )
}

export function Readout({
  label,
  value,
  unit,
  tone,
  hero,
}: {
  label: string
  value: string
  unit?: string
  tone?: "mod"
  hero?: boolean
}) {
  return (
    <div
      className={`${glass} ${hero ? "relative overflow-hidden px-5 py-4" : "px-4 py-3"}`}
    >
      {hero && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 opacity-30 blur-2xl"
          style={{ background: ACCENT }}
        />
      )}
      <Label>{label}</Label>
      <div
        className={`relative flex items-baseline gap-1.5 font-semibold tabular-nums ${
          hero ? "text-[64px] leading-[1.05] tracking-tight" : "text-[26px]"
        }`}
        style={tone === "mod" ? { color: MOD } : undefined}
      >
        {value}
        {unit && (
          <span
            className={`font-medium text-[#8b97ab] ${hero ? "text-[20px]" : "text-[13px]"}`}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}
