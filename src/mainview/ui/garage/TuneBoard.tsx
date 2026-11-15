import { useMemo, useState } from "react"
import {
  ChevronRight,
  CircleDot,
  Cog,
  Disc,
  Gauge,
  Link2,
  MoveVertical,
  RotateCw,
  Scale,
  Shield,
  Shrink,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type { CarSpec } from "../../data/schema"
import {
  ALIGN_DEG,
  DRIFT_ASSIST_OFF,
  STOCK_TUNING,
  TUNING_LIMITS,
  type Tuning,
  gearSpeeds,
  powerCurve,
  saveTuning,
  useTuning,
} from "../../data/tuning"
import { TUNE_PRESETS, tuneEffects } from "../../data/tuningFx"
import {
  ACCENT,
  BoardHeader,
  Label,
  MOD,
  Seg,
  accentFill,
  glass,
} from "./kit"

const mono = "tabular-nums"

type Tab = "power" | "suspension" | "alignment" | "chassis"
const TABS: { id: Tab; label: string }[] = [
  { id: "power", label: "Powertrain" },
  { id: "suspension", label: "Suspension" },
  { id: "alignment", label: "Alignment" },
  { id: "chassis", label: "Brakes & Aero" },
]

const deg = (per: number) => (v: number) => {
  const d = (v - 1) * per
  return Math.abs(d) < 0.005 ? "STOCK" : `${d > 0 ? "+" : ""}${d.toFixed(2)}°`
}

const ROWS: {
  key: keyof Tuning
  tab: Tab
  label: string
  hint: [string, string]
  Icon: LucideIcon
  fmt?: (v: number) => string
}[] = [
  {
    key: "power",
    tab: "power",
    label: "Engine output (ECU / boost)",
    hint: ["Detuned", "More power"],
    Icon: Zap,
  },
  {
    key: "gearing",
    tab: "power",
    label: "Final drive",
    hint: ["Taller: top speed", "Shorter: acceleration"],
    Icon: Cog,
  },
  {
    key: "diffLock",
    tab: "power",
    label: "Diff lock (power & coast)",
    hint: ["Open: smooth, safe", "Locked: drift, tail-happy"],
    Icon: Link2,
  },
  {
    key: "springs",
    tab: "suspension",
    label: "Spring stiffness",
    hint: ["Softer: compliance", "Stiffer: sharp turn-in"],
    Icon: MoveVertical,
  },
  {
    key: "damping",
    tab: "suspension",
    label: "Damper stiffness",
    hint: ["Bouncy, more roll", "Controlled, harsh"],
    Icon: Waves,
  },
  {
    key: "rearBias",
    tab: "suspension",
    label: "Rear roll-bar",
    hint: ["Planted rear", "Loose, more oversteer"],
    Icon: Scale,
  },
  {
    key: "camberFront",
    tab: "alignment",
    label: "Front camber",
    hint: ["Less negative", "More corner grip"],
    Icon: Shrink,
    fmt: deg(ALIGN_DEG.camber),
  },
  {
    key: "camberRear",
    tab: "alignment",
    label: "Rear camber",
    hint: ["Less negative", "More corner grip"],
    Icon: Shrink,
    fmt: deg(ALIGN_DEG.camber),
  },
  {
    key: "toeFront",
    tab: "alignment",
    label: "Front toe",
    hint: ["Toe-out: sharp turn-in", "Toe-in: stable"],
    Icon: RotateCw,
    fmt: deg(ALIGN_DEG.toe),
  },
  {
    key: "toeRear",
    tab: "alignment",
    label: "Rear toe",
    hint: ["Toe-out: loose rear", "Toe-in: stable rear"],
    Icon: RotateCw,
    fmt: deg(ALIGN_DEG.toe),
  },
  {
    key: "gripBias",
    tab: "alignment",
    label: "Tyre pressure",
    hint: ["Lower grip", "Higher grip"],
    Icon: CircleDot,
  },
  {
    key: "brakeForce",
    tab: "chassis",
    label: "Brake force",
    hint: ["Weak", "Strong"],
    Icon: Disc,
  },
  {
    key: "brakeBias",
    tab: "chassis",
    label: "Brake bias",
    hint: ["Rear: rotates", "Front: stable"],
    Icon: Gauge,
  },
  {
    key: "steerAngle",
    tab: "chassis",
    label: "Steering lock",
    hint: ["Less lock", "More lock (drift)"],
    Icon: RotateCw,
  },
  {
    key: "driftAssist",
    tab: "chassis",
    label: "Drift assist",
    hint: ["Off: full drift", "Strict: self-corrects"],
    Icon: Shield,
    fmt: (v) =>
      v <= DRIFT_ASSIST_OFF
        ? "OFF"
        : `${Math.round((v - 1) * 100) >= 0 ? "+" : ""}${Math.round((v - 1) * 100)}%`,
  },
  {
    key: "downforce",
    tab: "chassis",
    label: "Downforce",
    hint: ["Less drag", "More grip at speed"],
    Icon: Wind,
  },
]

// The track fills outward from the stock notch, so a change reads as a
// distance travelled (left = softer, right = more), not as a level.
const css = `
.tune-range{-webkit-appearance:none;appearance:none;width:100%;height:20px;background:transparent;margin:0;cursor:pointer;display:block;position:relative;z-index:1}
.tune-range:focus{outline:none}
.tune-range::-webkit-slider-runnable-track{height:6px;background:rgba(255,255,255,.1)}
.tune-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;margin-top:-7px;background:#fff;border:0;box-shadow:0 0 0 4px rgba(81,167,213,.35),0 2px 8px rgba(0,0,0,.5);transition:transform .12s,box-shadow .12s}
.tune-range:hover::-webkit-slider-thumb{transform:scale(1.12)}
.tune-range[data-pad-focus]{outline:none}
.tune-range[data-pad-focus]::-webkit-slider-thumb{box-shadow:0 0 0 4px ${ACCENT},0 2px 8px rgba(0,0,0,.5)}
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
  const off = (f: number) => `calc(${f} * (100% - 20px) + 10px)`
  const changed = Math.abs(value - 1) >= 0.005
  const { Icon } = row
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
          <Icon size={14} style={{ color: changed ? MOD : ACCENT }} />
          {row.label}
        </div>
        <span
          className={`${mono} px-2.5 py-0.5 text-[12px] font-semibold`}
          style={
            changed
              ? { background: `${MOD}22`, color: MOD }
              : { background: "rgba(255,255,255,.06)", color: "#8b97ab" }
          }
        >
          {row.fmt ? row.fmt(value) : fmtDelta(value)}
        </span>
      </div>
      <div className="relative mt-0.5">
        <span
          className="pointer-events-none absolute top-[7px] h-[6px]"
          style={{
            left: off(Math.min(frac, stock)),
            right: `calc(100% - ${off(Math.max(frac, stock))})`,
            background: changed ? MOD : ACCENT,
          }}
        />
        <input
          type="range"
          className="tune-range"
          min={lo}
          max={hi}
          step={0.01}
          value={value}
          aria-label={row.label}
          style={{
            ["--a" as string]: off(Math.min(frac, stock)),
            ["--b" as string]: off(Math.max(frac, stock)),
            ["--c" as string]: changed ? MOD : ACCENT,
          }}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(1)}
        />
        {/* stock notch */}
        <span
          className="pointer-events-none absolute top-[-1px] h-[22px] w-[2px] bg-white/40"
          style={{ left: `calc(${off(stock)} - 1px)` }}
        />
      </div>
      <div className="flex justify-between text-[10.5px] text-[#697488]">
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
    return <span className="text-[10px] text-[#5f5f68]">=</span>
  const good = better === "lower" ? value < 0 : value > 0
  return (
    <span
      className={`${mono} text-[10px] font-bold ${good ? "text-emerald-400" : "text-rose-400"}`}
    >
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  )
}

function Stat({
  label,
  value,
  unit,
  delta,
}: {
  label: string
  value: string
  unit: string
  delta: React.ReactNode
}) {
  return (
    <div className="bg-black/25 px-3 py-2">
      <Label>{label}</Label>
      <div className="flex items-baseline justify-between">
        <span className={`${mono} text-[22px] leading-tight font-semibold`}>
          {value}
          <span className="ml-1 text-[12px] font-medium text-[#8b97ab]">
            {unit}
          </span>
        </span>
        {delta}
      </div>
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
      <Label>Speed at redline · km/h</Label>
      <div className="mt-1 flex h-[50px] items-end gap-1">
        {tuned.map((g, i) => (
          <div
            key={g.gear}
            className="relative flex flex-1 flex-col items-center justify-end"
          >
            <span className={`${mono} mb-0.5 text-[9px] text-gray-400`}>
              {Math.round(g.kmhAtRedline)}
            </span>
            <div
              className="relative w-full"
              style={{ height: `${(g.kmhAtRedline / max) * 30}px` }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: ACCENT,
                  }}
              />
              <div
                className="absolute inset-x-[-2px] h-px bg-white"
                style={{
                  bottom: `${(stock[i].kmhAtRedline / g.kmhAtRedline) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {tuned.map((g) => (
          <span
            key={g.gear}
            className={`${mono} flex-1 pt-0.5 text-center text-[9.5px] text-[#697488]`}
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
  const W = 338
  const H = 56
  const maxRpm = car.physics.engine.redlineRPM
  const maxNm = Math.max(...pts.map((p) => p.nm))
  const maxKw = Math.max(...pts.map((p) => p.kw))
  const xy = (rpm: number, v: number, max: number) =>
    `${((rpm / maxRpm) * W).toFixed(1)},${(H - (v / max) * (H - 6) - 2).toFixed(1)}`
  const line = (f: (p: (typeof pts)[number]) => number, max: number) =>
    pts.map((p, i) => `${i ? "L" : "M"}${xy(p.rpm, f(p), max)}`).join(" ")
  const kw = line((p) => p.kw, maxKw)
  const lastX = ((pts[pts.length - 1].rpm / maxRpm) * W).toFixed(1)
  return (
    <svg width={W} height={H} className="block">
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="#fff"
          strokeOpacity=".07"
          strokeDasharray="2 4"
        />
      ))}
      <path d={`${kw} L${lastX},${H} L0,${H} Z`} fill={ACCENT} fillOpacity=".18" />
      <path d={kw} fill="none" stroke={ACCENT} strokeWidth="1.8" />
      <path
        d={line((p) => p.nm, maxNm)}
        fill="none"
        stroke="#fff"
        strokeOpacity=".85"
        strokeWidth="1.4"
        strokeDasharray="4 3"
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
  const [tab, setTab] = useState<Tab>("power")
  const dirty = (Object.keys(STOCK_TUNING) as (keyof Tuning)[]).some(
    (k) => Math.abs(t[k] - 1) > 0.004,
  )
  const activePreset = TUNE_PRESETS.find((p) =>
    (Object.keys(p.t) as (keyof Tuning)[]).every(
      (k) => Math.abs(p.t[k] - t[k]) < 0.004,
    ),
  )
  const modTabs = TABS.filter((x) =>
    ROWS.some((r) => r.tab === x.id && Math.abs(t[r.key] - 1) > 0.004),
  ).map((x) => x.id)
  return (
    <div className="flex h-full flex-col">
      <style>{css}</style>
      <BoardHeader
        title="Tuning"
        flag={
          dirty && (
            <span
              className="ml-1 px-2 py-0.5 text-[10.5px] font-semibold text-black"
              style={{ background: MOD }}
            >
              Modified
            </span>
          )
        }
        right={
          <div className="flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            {TUNE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => update({ ...p.t })}
                className={`px-3.5 py-1.5 text-[12.5px] font-semibold transition-all ${
                  activePreset?.id === p.id
                    ? "text-white"
                    : "text-[#8b97ab] hover:bg-white/[0.06] hover:text-white"
                }`}
                style={
                  activePreset?.id === p.id
                    ? { background: accentFill }
                    : undefined
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1fr_372px] gap-5">
        <div className="flex flex-col justify-between">
          <Seg
            options={TABS}
            value={tab}
            onChange={setTab}
            dots={modTabs}
          />
          {ROWS.filter((r) => r.tab === tab).map((r) => (
            <Slider
              key={r.key}
              row={r}
              value={t[r.key]}
              onChange={(v) => update({ ...t, [r.key]: v })}
            />
          ))}
        </div>
        <div className={`${glass} flex flex-col gap-2.5 p-4`}>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="0–100 km/h"
              value={fx.zeroTo100.toFixed(2)}
              unit="s"
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
              label="Top speed"
              value={`${Math.round(fx.topKmh)}`}
              unit="km/h"
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
              label="Power"
              value={`${Math.round(fx.powerHP)}`}
              unit="hp"
              delta={
                <Delta
                  value={fx.powerHP - fx.stockPowerHP}
                  unit=""
                  better="higher"
                  digits={0}
                />
              }
            />
            <Stat
              label="Grip"
              value={`${fx.gripPct > 0 ? "+" : ""}${fx.gripPct.toFixed(1)}`}
              unit="%"
              delta={null}
            />
          </div>
          <div className="flex items-center gap-3 px-1">
            <Label>Balance</Label>
            <div className="relative h-1.5 flex-1 bg-white/10">
              <div className="absolute top-[-3px] left-1/2 h-3 w-[2px] bg-white/40" />
              <div
                className="absolute top-[-4px] h-3.5 w-3.5 bg-white"
                style={{
                  left: `calc(${(fx.balance + 1) * 50}% - 7px)`,
                  boxShadow: `0 0 0 4px ${ACCENT}55`,
                }}
              />
            </div>
            <span
              className={`${mono} w-[64px] text-right text-[11px] font-semibold text-gray-200`}
            >
              {Math.abs(fx.balance) < 0.08
                ? "NEUTRAL"
                : fx.balance > 0
                  ? "LOOSE"
                  : "PLANTED"}
            </span>
          </div>
          <Gears car={car} t={t} />
          <div>
            <Curve car={car} />
            <div className="mt-0.5 text-[10.5px] text-[#697488]">
              <span style={{ color: ACCENT }}>●</span> power ·{" "}
              <span className="text-white/80">○</span> torque · estimates
            </div>
          </div>
          <button
            onClick={onDyno}
            className="group mt-auto flex items-center justify-between px-4 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110"
            style={{ background: accentFill }}
          >
            Verify on the dyno
            <ChevronRight
              size={18}
              className="transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      </div>
    </div>
  )
}
