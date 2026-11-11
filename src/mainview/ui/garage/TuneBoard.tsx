import { useMemo } from "react"
import {
  ChevronRight,
  CircleDot,
  Cog,
  MoveVertical,
  Scale,
  Wind,
  type LucideIcon,
} from "lucide-react"
import type { CarSpec } from "../../data/schema"
import {
  STOCK_TUNING,
  TUNING_LIMITS,
  type Tuning,
  gearSpeeds,
  powerCurve,
  saveTuning,
  useTuning,
} from "../../data/tuning"
import { TUNE_PRESETS, tuneEffects } from "../../data/tuningFx"

const ROWS: {
  key: keyof Tuning
  label: string
  hint: [string, string]
  Icon: LucideIcon
}[] = [
  {
    key: "gearing",
    label: "Final drive",
    hint: ["Taller: top speed", "Shorter: acceleration"],
    Icon: Cog,
  },
  {
    key: "springs",
    label: "Spring stiffness",
    hint: ["Softer: compliance", "Stiffer: sharp turn-in"],
    Icon: MoveVertical,
  },
  {
    key: "rearBias",
    label: "Rear roll-bar",
    hint: ["Planted rear", "Loose, more oversteer"],
    Icon: Scale,
  },
  {
    key: "downforce",
    label: "Downforce",
    hint: ["Less drag", "More grip at speed"],
    Icon: Wind,
  },
  {
    key: "gripBias",
    label: "Tyre pressure",
    hint: ["Lower grip", "Higher grip"],
    Icon: CircleDot,
  },
]

const css = `
.tune-range{-webkit-appearance:none;appearance:none;width:100%;height:22px;background:transparent;margin:0;cursor:pointer;display:block}
.tune-range:focus{outline:none}
.tune-range::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(to right,#51a7d5 var(--p),#262d38 var(--p))}
.tune-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:22px;margin-top:-8px;border-radius:3px;background:#fff;border:2px solid #0c0f14;box-shadow:0 0 0 1px #51a7d5,0 2px 6px rgba(0,0,0,.6);transition:transform .12s}
.tune-range:hover::-webkit-slider-thumb{transform:scaleY(1.12)}
.tune-range[data-pad-focus]{outline:none}
.tune-range[data-pad-focus]::-webkit-slider-thumb{box-shadow:0 0 0 3px #fff,0 2px 6px rgba(0,0,0,.6)}
`

const fmtDelta = (v: number) => {
  const pct = Math.round((v - 1) * 100)
  return pct === 0 ? "STOCK" : `${pct > 0 ? "+" : ""}${pct}%`
}

function Slider({
  row,
  value,
  onChange,
}: {
  row: (typeof ROWS)[number]
  value: number
  onChange: (v: number) => void
}) {
  const [lo, hi] = TUNING_LIMITS[row.key]
  const frac = (value - lo) / (hi - lo)
  const stock = (1 - lo) / (hi - lo)
  const off = (f: number) => `calc(${f} * (100% - 14px) + 7px)`
  const changed = Math.abs(value - 1) >= 0.005
  const { Icon } = row
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
          <Icon size={15} className="text-[#51a7d5]" />
          {row.label}
        </div>
        <span
          className={`min-w-[58px] border px-2 py-0.5 text-center text-[11px] font-bold tabular-nums tracking-wide ${
            changed
              ? "border-[#ffb020] bg-[#ffb020]/15 text-[#ffb020]"
              : "border-white/10 bg-white/5 text-gray-400"
          }`}
        >
          {fmtDelta(value)}
        </span>
      </div>
      <div className="relative mt-1">
        <input
          type="range"
          className="tune-range"
          min={lo}
          max={hi}
          step={0.01}
          value={value}
          aria-label={row.label}
          style={{ ["--p" as string]: off(frac) }}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(1)}
        />
        <span
          className="pointer-events-none absolute top-[3px] h-4 w-[2px] bg-white/45"
          style={{ left: `calc(${off(stock)} - 1px)` }}
        />
      </div>
      <div className="flex justify-between text-[9.5px] tracking-wide text-gray-500">
        <span>{row.hint[0]}</span>
        <span>{row.hint[1]}</span>
      </div>
    </div>
  )
}

function Delta({
  value,
  unit,
  better,
  digits = 1,
}: {
  value: number
  unit: string
  better: "lower" | "higher"
  digits?: number
}) {
  if (Math.abs(value) < Math.pow(10, -digits) / 2)
    return <span className="text-[10px] text-gray-500">=</span>
  const good = better === "lower" ? value < 0 : value > 0
  return (
    <span
      className={`text-[10px] font-bold tabular-nums ${good ? "text-emerald-400" : "text-rose-400"}`}
    >
      {value > 0 ? "+" : "−"}
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  )
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 py-1.5">
      <span className="text-[10px] font-semibold tracking-[0.18em] text-[#8f99a8]">
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-[16px] font-bold tabular-nums">{value}</span>
        <span className="w-[52px] text-right">{delta}</span>
      </span>
    </div>
  )
}

function Gears({ car, t }: { car: CarSpec; t: Tuning }) {
  const tuned = gearSpeeds(car, t)
  const stock = gearSpeeds(car, STOCK_TUNING)
  const max = Math.max(
    ...tuned.map((g) => g.kmhAtRedline),
    ...stock.map((g) => g.kmhAtRedline),
  )
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.18em] text-[#8f99a8]">
        SPEED AT REDLINE · KM/H
      </div>
      <div className="mt-1.5 flex h-[54px] items-end gap-1.5">
        {tuned.map((g, i) => (
          <div
            key={g.gear}
            className="relative flex flex-1 flex-col items-center justify-end"
          >
            <span className="mb-0.5 text-[9px] tabular-nums text-gray-300">
              {Math.round(g.kmhAtRedline)}
            </span>
            <div
              className="relative w-full"
              style={{ height: `${(g.kmhAtRedline / max) * 34}px` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#51a7d5]/40 to-[#51a7d5]" />
              <div
                className="absolute inset-x-[-2px] h-[2px] bg-white/70"
                style={{
                  bottom: `${(stock[i].kmhAtRedline / g.kmhAtRedline) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {tuned.map((g) => (
          <span
            key={g.gear}
            className="flex-1 text-center text-[9px] font-semibold text-gray-500"
          >
            {g.gear}
          </span>
        ))}
      </div>
    </div>
  )
}

function Curve({ car }: { car: CarSpec }) {
  const pts = useMemo(() => powerCurve(car), [car])
  const W = 372
  const H = 70
  const maxRpm = car.physics.engine.redlineRPM
  const maxNm = Math.max(...pts.map((p) => p.nm))
  const maxKw = Math.max(...pts.map((p) => p.kw))
  const xy = (rpm: number, v: number, max: number) =>
    `${((rpm / maxRpm) * W).toFixed(1)},${(H - (v / max) * (H - 6) - 2).toFixed(1)}`
  const line = (f: (p: (typeof pts)[number]) => number, max: number) =>
    pts.map((p, i) => `${i ? "L" : "M"}${xy(p.rpm, f(p), max)}`).join(" ")
  const nm = line((p) => p.nm, maxNm)
  const lastX = ((pts[pts.length - 1].rpm / maxRpm) * W).toFixed(1)
  return (
    <svg width={W} height={H} className="block">
      <defs>
        <linearGradient id="nmFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5fb4ff" stopOpacity=".35" />
          <stop offset="1" stopColor="#5fb4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="#fff"
          strokeOpacity=".06"
        />
      ))}
      <path d={`${nm} L${lastX},${H} L0,${H} Z`} fill="url(#nmFill)" />
      <path d={nm} fill="none" stroke="#5fb4ff" strokeWidth="1.8" />
      <path
        d={line((p) => p.kw, maxKw)}
        fill="none"
        stroke="#ffb020"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function TuneBoard({
  car,
  onDyno,
}: {
  car: CarSpec
  onDyno: () => void
}) {
  const t = useTuning(car.id)
  const update = (next: Tuning) => saveTuning(car.id, next)
  const fx = useMemo(() => tuneEffects(car, t), [car, t])
  const dirty = (Object.keys(STOCK_TUNING) as (keyof Tuning)[]).some(
    (k) => Math.abs(t[k] - 1) > 0.004,
  )
  const activePreset = TUNE_PRESETS.find((p) =>
    (Object.keys(p.t) as (keyof Tuning)[]).every(
      (k) => Math.abs(p.t[k] - t[k]) < 0.004,
    ),
  )
  return (
    <div className="flex h-full flex-col">
      <style>{css}</style>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <div className="text-[30px] leading-none font-bold">Tuning</div>
          {dirty && (
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#ffb020]">
              MODIFIED
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {TUNE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ ...p.t })}
              className={`border px-3 py-1.5 text-[12px] font-semibold transition ${
                activePreset?.id === p.id
                  ? "border-white bg-white text-[#0b0e14]"
                  : "border-[#51a7d5] bg-[#51a7d5]/15 text-gray-200 hover:bg-[#51a7d5]/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1fr_372px] gap-7">
        <div className="flex flex-col justify-between">
          {ROWS.map((r) => (
            <Slider
              key={r.key}
              row={r}
              value={t[r.key]}
              onChange={(v) => update({ ...t, [r.key]: v })}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.2em] text-[#8f99a8]">
              ESTIMATED EFFECT
            </div>
            <Stat
              label="0–100 KM/H"
              value={`${fx.zeroTo100.toFixed(2)} s`}
              delta={
                <Delta
                  value={fx.zeroTo100 - fx.stockZeroTo100}
                  unit="s"
                  better="lower"
                  digits={2}
                />
              }
            />
            <Stat
              label="TOP SPEED"
              value={`${Math.round(fx.topKmh)} km/h`}
              delta={
                <Delta
                  value={fx.topKmh - fx.stockTopKmh}
                  unit=""
                  better="higher"
                  digits={0}
                />
              }
            />
            <Stat
              label="GRIP"
              value={`${fx.gripPct > 0 ? "+" : ""}${fx.gripPct.toFixed(1)}%`}
              delta={null}
            />
            <div className="flex items-center justify-between pt-1.5">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-[#8f99a8]">
                BALANCE
              </span>
              <div className="relative h-[6px] w-[190px] bg-[#262d38]">
                <div className="absolute top-0 left-1/2 h-full w-px bg-white/40" />
                <div
                  className="absolute top-[-4px] h-[14px] w-[6px] bg-[#ffb020]"
                  style={{ left: `calc(${(fx.balance + 1) * 50}% - 3px)` }}
                />
              </div>
              <span className="w-[52px] text-right text-[10px] font-bold text-gray-300">
                {Math.abs(fx.balance) < 0.08
                  ? "NEUTRAL"
                  : fx.balance > 0
                    ? "LOOSE"
                    : "PLANTED"}
              </span>
            </div>
          </div>
          <Gears car={car} t={t} />
          <div>
            <Curve car={car} />
            <div className="mt-0.5 text-[9.5px] text-gray-500">
              <span className="text-[#5fb4ff]">■</span> torque ·{" "}
              <span className="text-[#ffb020]">■</span> power · effects are
              estimates
            </div>
          </div>
          <button
            onClick={onDyno}
            className="mt-auto flex items-center justify-between border border-[#51a7d5] bg-[#51a7d5] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#51a7d5]/85"
          >
            Verify on the dyno
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
