import { useEffect, useMemo, useState } from "react"
import type { CarSpec } from "../data/schema"
import {
  STOCK_TUNING,
  TUNING_LIMITS,
  type Tuning,
  gearSpeeds,
  loadTuning,
  powerCurve,
  saveTuning,
} from "../data/tuning"

const ROWS: { key: keyof Tuning; label: string; hint: string }[] = [
  {
    key: "gearing",
    label: "Final drive",
    hint: "Higher = quicker acceleration, lower top speed",
  },
  {
    key: "springs",
    label: "Spring stiffness",
    hint: "Stiffer = sharper turn-in, less compliance",
  },
  {
    key: "rearBias",
    label: "Rear roll-bar bias",
    hint: "Higher = looser rear, more oversteer",
  },
  {
    key: "downforce",
    label: "Downforce",
    hint: "More grip at speed, more drag",
  },
  {
    key: "gripBias",
    label: "Tyre pressure grip",
    hint: "Small grip shift, ±5%",
  },
]

function Curve({ car }: { car: CarSpec }) {
  const pts = useMemo(() => powerCurve(car), [car])
  const maxRpm = car.physics.engine.redlineRPM
  const maxNm = Math.max(...pts.map((p) => p.nm))
  const maxKw = Math.max(...pts.map((p) => p.kw))
  const W = 220
  const H = 60
  const line = (f: (p: (typeof pts)[number]) => number, max: number) =>
    pts
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${((p.rpm / maxRpm) * W).toFixed(1)},${(H - (f(p) / max) * H).toFixed(1)}`,
      )
      .join(" ")
  return (
    <svg width={W} height={H} className="mt-2 block">
      <path
        d={line((p) => p.nm, maxNm)}
        fill="none"
        stroke="#5fb4ff"
        strokeWidth="1.5"
      />
      <path
        d={line((p) => p.kw, maxKw)}
        fill="none"
        stroke="#ffb020"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function TuningPanel({ car }: { car: CarSpec }) {
  const [t, setT] = useState<Tuning>(() => loadTuning(car.id))
  useEffect(() => setT(loadTuning(car.id)), [car.id])
  const update = (next: Tuning) => {
    setT(next)
    saveTuning(car.id, next)
  }
  const gears = gearSpeeds(car, t)
  const dirty = (Object.keys(STOCK_TUNING) as (keyof Tuning)[]).some(
    (k) => t[k] !== 1,
  )
  return (
    <details className="mt-4 text-left">
      <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
        TUNING {dirty && <span className="text-[#ffb020]">· MODIFIED</span>}
      </summary>
      <div className="mt-2 space-y-2">
        {ROWS.map((r) => (
          <label key={r.key} className="block" title={r.hint}>
            <div className="flex justify-between text-[11px] text-gray-300">
              <span>{r.label}</span>
              <span className="tabular-nums">
                {Math.round(t[r.key] * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="w-full"
              min={TUNING_LIMITS[r.key][0]}
              max={TUNING_LIMITS[r.key][1]}
              step={0.01}
              value={t[r.key]}
              onChange={(e) =>
                update({ ...t, [r.key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <div className="text-[10px] text-gray-400">
          Top speed by gear (km/h at redline):{" "}
          <span className="tabular-nums text-gray-200">
            {gears.map((g) => Math.round(g.kmhAtRedline)).join(" · ")}
          </span>
        </div>
        <Curve car={car} />
        <div className="text-[10px] text-gray-500">
          <span className="text-[#5fb4ff]">torque</span> ·{" "}
          <span className="text-[#ffb020]">power</span> · applies next time you
          start driving
        </div>
        <button
          className="text-[11px] text-[#6ec2f0] disabled:opacity-40"
          disabled={!dirty}
          onClick={() => update({ ...STOCK_TUNING })}
        >
          Reset to stock
        </button>
      </div>
    </details>
  )
}
