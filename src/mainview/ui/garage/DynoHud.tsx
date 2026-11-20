import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Minus, Plus, Play, Square, SlidersHorizontal } from "lucide-react"
import { getCar } from "../../data/cars"
import { enginePeaks } from "../../physics/vehicle/components/Engine"
import { dyno, useDyno, type DynoPoint } from "../../systems/dyno"
import { setBoardElement } from "../../systems/garageBoard"
import { setFocus } from "../../systems/garageFocus"
import type { CarTelemetry } from "../../physics/vehicle/Vehicle"
import { SingleDialDashboard } from "../dashboard/SingleDialDashboard"
import { ACCENT, accentFill, glass } from "./kit"

const POWER = ACCENT
const TORQUE = "#ffffff"
const MUTED = "#8b97ab"

const css = `
@keyframes dynoIn{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translate(-50%,0)}}
`

function Graph({
  curve,
  prev,
  rpm,
  hp,
  nm,
  redline,
  maxHp,
  maxNm,
  live,
}: {
  curve: DynoPoint[]
  prev: DynoPoint[] | null
  rpm: number
  hp: number
  nm: number
  redline: number
  maxHp: number
  maxNm: number
  live: boolean
}) {
  const W = 600
  const H = 178
  const L = 38
  const B = 20
  const maxRpm = Math.ceil((redline * 1.04) / 1000) * 1000
  const x = (r: number) => L + (r / maxRpm) * (W - L - 38)
  const yHp = (v: number) => H - B - (v / maxHp) * (H - B - 10)
  const yNm = (v: number) => H - B - (v / maxNm) * (H - B - 10)
  const path = (pts: DynoPoint[], f: (p: DynoPoint) => number) =>
    pts
      .map(
        (p, i) => `${i ? "L" : "M"}${x(p.rpm).toFixed(1)},${f(p).toFixed(1)}`,
      )
      .join(" ")
  const hpPath = (pts: DynoPoint[]) => path(pts, (p) => yHp(p.hp))
  const nmPath = (pts: DynoPoint[]) => path(pts, (p) => yNm(p.nm))
  const xt = []
  for (let r = 0; r <= maxRpm; r += 1000)
    xt.push(
      <g key={r}>
        <line
          x1={x(r)}
          x2={x(r)}
          y1={10}
          y2={H - B}
          stroke="#fff"
          strokeOpacity=".05"
        />
        <text
          x={x(r)}
          y={H - 6}
          fontSize="9"
          textAnchor="middle"
          fill={MUTED}
        >
          {r / 1000}k
        </text>
      </g>,
    )
  const yt = []
  for (let i = 0; i <= 4; i++) {
    const hv = (maxHp / 4) * i
    const nv = (maxNm / 4) * i
    yt.push(
      <g key={i}>
        <line
          x1={L}
          x2={W - 38}
          y1={yHp(hv)}
          y2={yHp(hv)}
          stroke="#fff"
          strokeOpacity=".06"
        />
        <text
          x={L - 5}
          y={yHp(hv) + 3}
          fontSize="9"
          textAnchor="end"
          fill={POWER}
        >
          {Math.round(hv)}
        </text>
        <text x={W - 33} y={yNm(nv) + 3} fontSize="9" fill={MUTED}>
          {Math.round(nv)}
        </text>
      </g>,
    )
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {xt}
      {yt}
      <text x={L - 5} y="8" fontSize="9" textAnchor="end" fill={POWER}>
        hp
      </text>
      <text x={W - 33} y="8" fontSize="9" fill={MUTED}>
        Nm
      </text>
      {prev && prev.length > 1 && (
        <g opacity=".35" strokeDasharray="4 3" fill="none" strokeWidth="1.5">
          <path d={hpPath(prev)} stroke={POWER} />
          <path d={nmPath(prev)} stroke={TORQUE} />
        </g>
      )}
      {curve.length > 1 && (
        <g fill="none" strokeWidth="2.4" strokeLinejoin="round">
          <path
            d={`${hpPath(curve)} L${x(curve[curve.length - 1].rpm).toFixed(1)},${H - B} L${x(curve[0].rpm).toFixed(1)},${H - B} Z`}
            fill={POWER} fillOpacity=".12"
            stroke="none"
          />
          <path d={nmPath(curve)} stroke={TORQUE} strokeOpacity=".9" />
          <path d={hpPath(curve)} stroke={POWER} />
        </g>
      )}
      {live && (
        <g>
          <line
            x1={x(rpm)}
            x2={x(rpm)}
            y1={10}
            y2={H - B}
            stroke="#fff"
            strokeOpacity=".3"
          />
          <circle cx={x(rpm)} cy={yHp(hp)} r="4" fill={POWER} />
          <circle cx={x(rpm)} cy={yNm(nm)} r="4" fill={TORQUE} />
        </g>
      )}
    </svg>
  )
}

function Big({
  label,
  value,
  unit,
  sub,
  color,
}: {
  label: string
  value: string
  unit: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-black/25 px-3.5 py-2.5">
      <div className="text-[12px] font-medium text-[#8b97ab]">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[30px] leading-tight font-semibold tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
        <span className="text-[12px] font-medium text-[#8b97ab]">{unit}</span>
      </div>
      {sub && (
        <div className="text-[11px] tabular-nums text-[#697488]">{sub}</div>
      )}
    </div>
  )
}

const peakOf = (pts: DynoPoint[] | null, k: "hp" | "nm") =>
  pts && pts.length ? Math.max(...pts.map((p) => p[k])) : null

const vs = (v: number, prev: number | null) =>
  prev === null || Math.abs(v - prev) < 1
    ? ""
    : ` · ${v > prev ? "+" : "−"}${Math.abs(Math.round(v - prev))}`

export function DynoHud({ carName }: { carName: string }) {
  const s = useDyno()
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setBoardElement("dyno", ref.current)
    return () => setBoardElement("dyno", null)
  }, [])
  useEffect(() => {
    let thr = 0
    let brk = 0
    const apply = () => dyno.setKeys(thr, brk)
    const typing = (e: KeyboardEvent) =>
      (e.target as HTMLElement | null)?.tagName === "INPUT"
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return
      if (e.code === "KeyW") thr = 1
      else if (e.code === "KeyS") brk = 1
      else if (e.code === "KeyQ" && !e.repeat) dyno.shift(-1)
      else if (e.code === "KeyE" && !e.repeat) dyno.shift(1)
      else return
      e.preventDefault()
      apply()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW") thr = 0
      else if (e.code === "KeyS") brk = 0
      else return
      apply()
    }
    const release = () => {
      thr = brk = 0
      apply()
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", release)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", release)
      release()
    }
  }, [])
  const spec = useMemo(() => (s.carId ? getCar(s.carId) : null), [s.carId])
  const pk = useMemo(
    () => (spec ? enginePeaks(spec.physics.engine) : null),
    [spec],
  )
  const maxHp = useMemo(() => {
    const m = Math.max(
      pk?.powerHP ?? 100,
      peakOf(s.curve, "hp") ?? 0,
      peakOf(s.prev, "hp") ?? 0,
    )
    return Math.max(100, Math.ceil((m * 1.08) / 100) * 100)
  }, [pk, s.curve, s.prev])
  const maxNm = useMemo(() => {
    const m = Math.max(
      pk?.torqueNm ?? 100,
      peakOf(s.curve, "nm") ?? 0,
      peakOf(s.prev, "nm") ?? 0,
    )
    return Math.max(100, Math.ceil((m * 1.08) / 100) * 100)
  }, [pk, s.curve, s.prev])
  const tele = {
    rpm: s.rpm,
    speedKmh: s.speedKmh,
    gearLabel: String(s.gear),
    engineOn: true,
    autoMode: false,
    parkingBrake: false,
    drift: false,
    tractionControl: false,
    absOn: false,
    stabilityControl: false,
    dash: {
      maxRpm: Math.ceil((s.redline * 1.06) / 1000) * 1000,
      redFromRpm: s.redline,
    },
  } as unknown as CarTelemetry
  const pulling = s.phase === "pulling"
  const manual = s.phase === "manual"
  const cooling = s.phase === "cooldown"
  const prevHp = peakOf(s.prev, "hp")
  const prevNm = peakOf(s.prev, "nm")
  const pill =
    "inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold transition disabled:opacity-40"
  const ghost = `${pill} border border-white/10 bg-white/[0.06] text-gray-100 hover:bg-white/[0.12]`
  const step =
    "flex h-8 w-8 items-center justify-center text-gray-100 transition hover:bg-white/[0.12] disabled:opacity-30"
  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute bottom-10 left-1/2 z-[95] w-[min(1180px,94vw)] border border-white/10 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
      style={{
        animation: "dynoIn .5s .7s both cubic-bezier(.2,.8,.2,1)",
        background: "rgba(10,10,10,0.94)",
      }}
    >
      <style>{css}</style>
      <div className="flex items-center justify-between">
        <div className="text-[24px] leading-none font-semibold tracking-tight">
          {carName}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-white/[0.06] bg-black/30 p-1">
            <button
              aria-label="Lower gear"
              disabled={pulling || s.gear <= 1}
              onClick={() => dyno.shift(-1)}
              className={step}
            >
              <Minus size={14} />
            </button>
            <span className="w-8 text-center text-[15px] font-semibold tabular-nums">
              {s.gear}
            </span>
            <button
              aria-label="Higher gear"
              disabled={pulling || s.gear >= s.gears}
              onClick={() => dyno.shift(1)}
              className={step}
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            disabled={pulling}
            onClick={() => dyno.toggleAuto()}
            className={`${pill} border text-white transition ${
              s.auto
                ? "border-transparent"
                : "border-white/10 bg-white/[0.06] text-gray-300 hover:bg-white/[0.12]"
            }`}
            style={s.auto ? { background: accentFill } : undefined}
          >
            Auto
          </button>
          <button
            disabled={pulling || manual || cooling}
            onClick={() => dyno.beginManual()}
            className={ghost}
          >
            Manual
          </button>
          <button onClick={() => setFocus("tune")} className={ghost}>
            <SlidersHorizontal size={14} />
            Tuning
          </button>
          {pulling || manual ? (
            <button
              onClick={() => dyno.abort()}
              className={`${pill} min-w-[150px] border border-rose-400/50 bg-rose-500/25 hover:bg-rose-500/40`}
            >
              <Square size={13} fill="currentColor" />
              {manual ? "End run" : "Abort"}
            </button>
          ) : (
            <button
              disabled={cooling}
              onClick={() => dyno.start()}
              className={`${pill} min-w-[150px] text-white hover:brightness-110`}
              style={{ background: accentFill }}
            >
              <Play size={13} fill="currentColor" />
              {cooling
                ? "Cooling down"
                : s.phase === "done"
                  ? "Pull again"
                  : "Start pull"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[220px_1fr_210px] items-center gap-5">
        <SingleDialDashboard tele={tele} embedded />
        <div className={`${glass} h-[210px] p-2`}>
          <Graph
            curve={s.curve}
            prev={s.prev}
            rpm={s.rpm}
            hp={s.hp}
            nm={s.nm}
            redline={s.redline}
            maxHp={maxHp}
            maxNm={maxNm}
            live={pulling || manual}
          />
        </div>
        <div className="flex flex-col gap-2.5">
          {s.peakHp && s.peakNm ? (
            <>
              <Big
                label="Peak power"
                value={Math.round(s.peakHp.v).toLocaleString()}
                unit="hp"
                color={POWER}
                sub={`${Math.round(s.peakHp.rpm).toLocaleString()} rpm${vs(s.peakHp.v, prevHp)}`}
              />
              <Big
                label="Peak torque"
                value={Math.round(s.peakNm.v).toLocaleString()}
                unit="Nm"
                color={TORQUE}
                sub={`${Math.round(s.peakNm.rpm).toLocaleString()} rpm${vs(s.peakNm.v, prevNm)}`}
              />
            </>
          ) : (
            <>
              <Big
                label="Power"
                value={Math.round(s.hp).toLocaleString()}
                unit="hp"
                color={POWER}
              />
              <Big
                label="Torque"
                value={Math.round(s.nm).toLocaleString()}
                unit="Nm"
                color={TORQUE}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
