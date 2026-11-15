import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react"

export const ROW_BASE =
  "os-row relative px-4 py-3.5 transition-colors hover:bg-white/[0.05] focus-within:bg-white/[0.08] " +
  "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:origin-center before:scale-y-0 before:bg-[#51a7d5] before:transition-transform before:duration-200 focus-within:before:scale-y-100"

export function useStep(
  ref: RefObject<HTMLElement | null>,
  onStep: (dir: -1 | 1) => void,
) {
  const cb = useRef(onStep)
  cb.current = onStep
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: Event) =>
      cb.current((e as CustomEvent<number>).detail > 0 ? 1 : -1)
    el.addEventListener("padstep", handler)
    return () => el.removeEventListener("padstep", handler)
  }, [ref])
}

export function arrowKeys(step: (dir: -1 | 1) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      step(-1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      step(1)
    }
  }
}

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mb-7">
      <div
        data-set-row
        className="mb-1 flex items-center gap-3 px-4 text-[11px] font-bold uppercase tracking-[0.3em] text-[#51a7d5]"
      >
        {title}
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function Label({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white">
        {label}
      </div>
      {hint && (
        <p className="mt-1 text-[12px] leading-snug text-white/45">{hint}</p>
      )}
    </div>
  )
}

/** A row that just holds a label and an arbitrary right-hand control. */
export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      data-set-row
      className={`${ROW_BASE} flex items-center justify-between gap-4`}
    >
      <Label label={label} hint={hint} />
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useStep(ref, (d) => onChange(d > 0))
  return (
    <button
      ref={ref}
      data-set-row
      data-pad-step
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`${ROW_BASE} flex w-full items-center justify-between gap-4 text-left outline-none`}
    >
      <Label label={label} hint={hint} />
      <span className="flex shrink-0 items-center gap-3">
        <span
          className={`w-7 text-right text-[12px] font-bold tracking-widest transition-colors ${
            checked ? "text-[#51a7d5]" : "text-white/35"
          }`}
        >
          {checked ? "ON" : "OFF"}
        </span>
        <span
          className={`relative h-[18px] w-[44px] -skew-x-12 transition-colors ${
            checked ? "bg-[#51a7d5]" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-[3px] h-3 w-5 bg-white transition-[left] duration-200 ${
              checked ? "left-[21px]" : "left-[3px]"
            }`}
          />
        </span>
      </span>
    </button>
  )
}

export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => `${v}%`,
  disabled = false,
}: {
  label: string
  hint?: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  format?: (v: number) => string
  disabled?: boolean
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <div
      data-set-row
      className={`${ROW_BASE} flex flex-col gap-3 ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <Label label={label} hint={hint} />
        <span className="shrink-0 text-[22px] font-extrabold italic leading-none tabular-nums text-white">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="os-range"
        style={{ "--p": `${p}%` } as CSSProperties}
      />
    </div>
  )
}

export function Choice<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: ReactNode
  options: { id: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  )
  const step = (d: -1 | 1) => {
    const next = options[Math.min(options.length - 1, Math.max(0, index + d))]
    if (next && next.id !== value) onChange(next.id)
  }
  useStep(ref, step)
  const stacked = options.length > 4
  return (
    <div
      data-set-row
      className={`${ROW_BASE} flex gap-3 ${
        stacked
          ? "flex-col"
          : "flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      }`}
    >
      <Label label={label} hint={hint} />
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        tabIndex={0}
        data-pad-step
        onKeyDown={arrowKeys(step)}
        className="flex shrink-0 flex-wrap gap-1 outline-none"
      >
        {options.map((o) => {
          const active = o.id === value
          return (
            <div
              key={String(o.id)}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.id)}
              className={`cursor-pointer -skew-x-12 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                active
                  ? "bg-[#51a7d5] text-[#0b0e14]"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              <span className="block skew-x-12">{o.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="-skew-x-12 bg-white/10 px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white outline-none transition-colors hover:bg-white/20 focus-visible:bg-white/20 disabled:opacity-50"
    >
      <span className="block skew-x-12">{children}</span>
    </button>
  )
}
