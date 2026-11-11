import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Minus, Plus, Play, Square, SlidersHorizontal } from "lucide-react"
import { getCar } from "../../data/cars"
import { enginePeaks } from "../../physics/vehicle/components/Engine"
import { dyno, useDyno, type DynoPoint } from "../../systems/dyno"
import { setBoardElement } from "../../systems/garageBoard"
import { setFocus } from "../../systems/garageFocus"

const AMBER = "#ffb020"
const BLUE = "#5fb4ff"

const css = `
@keyframes dynoIn{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translate(-50%,0)}}
`

function Tach({
  rpm,
  redline,
  boost,
}: {
  rpm: number
  redline: number
  boost: number
}) {
  const max = Math.ceil((redline * 1.06) / 1000) * 1000
  const R = 70
  const cx = 90
  const cy = 88
  const A0 = 135
  const SWEEP = 270
  const pt = (v: number, r: number) => {
    const a = ((A0 + (v / max) * SWEEP) * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r)
    const [x1, y1] = pt(v1, r)
    const large = ((v1 - v0) / max) * SWEEP > 180 ? 1 : 0
    return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`
  }
  const ticks = []
  for (let v = 0; v <= max; v += 1000) {
    const [x0, y0] = pt(v, R - 2)
    const [x1, y1] = pt(v, R - 9)
    const [tx, ty] = pt(v, R - 20)
    ticks.push(
      <g key={v}>
        <line
          x1={x0}
          y1={y0}
          x2={x1}
          y2={y1}
          stroke="#fff"
          strokeOpacity=".5"
        />
        <text x={tx} y={ty + 3} fontSize="9" textAnchor="middle" fill="#9aa4b2">
          {v / 1000}
        </text>
      </g>,
    )
  }
  const [nx, ny] = pt(Math.min(rpm, max), R - 6)
  return (
    <svg width="180" height="150" viewBox="0 0 180 150">
      <path d={arc(0, max, R)} stroke="#262d38" strokeWidth="6" fill="none" />
      <path
        d={arc(0, Math.min(rpm, max), R)}
        stroke="#51a7d5"
        strokeWidth="6"
        fill="none"
      />
      <path
        d={arc(redline, max, R)}
        stroke="#ef4444"
        strokeWidth="6"
        fill="none"
      />
      {ticks}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill="#fff" />
      <text
        x={cx}
        y={cy + 34}
        textAnchor="middle"
        fontSize="24"
        fontWeight="700"
        fill="#fff"
        className="tabular-nums"
      >
        {Math.round(rpm).toLocaleString()}
      </text>
      <text
        x={cx}
        y={cy + 47}
        textAnchor="middle"
        fontSize="9"
        letterSpacing="2"
        fill="#8f99a8"
      >
        RPM{boost > 0.02 ? `  ·  BOOST ${Math.round(boost * 100)}%` : ""}
      </text>
    </svg>
  )
}

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
          fill="#8f99a8"
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
          strokeOpacity=".05"
        />
        <text
          x={L - 5}
          y={yHp(hv) + 3}
          fontSize="9"
          textAnchor="end"
          fill={AMBER}
        >
          {Math.round(hv)}
        </text>
        <text x={W - 33} y={yNm(nv) + 3} fontSize="9" fill={BLUE}>
          {Math.round(nv)}
        </text>
      </g>,
    )
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {xt}
      {yt}
      <text x={L - 5} y="8" fontSize="9" textAnchor="end" fill={AMBER}>
        hp
      </text>
      <text x={W - 33} y="8" fontSize="9" fill={BLUE}>
        Nm
      </text>
      {prev && prev.length > 1 && (
        <g opacity=".4" strokeDasharray="4 3" fill="none" strokeWidth="1.5">
          <path d={hpPath(prev)} stroke={AMBER} />
          <path d={nmPath(prev)} stroke={BLUE} />
        </g>
      )}
      {curve.length > 1 && (
        <g fill="none" strokeWidth="2.4" strokeLinejoin="round">
          <path d={nmPath(curve)} stroke={BLUE} />
          <path d={hpPath(curve)} stroke={AMBER} />
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
            strokeOpacity=".35"
          />
          <circle cx={x(rpm)} cy={yHp(hp)} r="3.5" fill={AMBER} />
          <circle cx={x(rpm)} cy={yNm(nm)} r="3.5" fill={BLUE} />
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
    <div>
      <div className="text-[9.5px] font-semibold tracking-[0.2em] text-[#8f99a8]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[30px] leading-none font-bold tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
        <span className="text-[11px] font-semibold text-gray-400">{unit}</span>
      </div>
      {sub && (
        <div className="text-[10px] tabular-nums text-gray-500">{sub}</div>
      )}
    </div>
  )
}

const peakOf = (pts: DynoPoint[] | null, k: "hp" | "nm") =>
  pts && pts.length ? Math.max(...pts.map((p) => p[k])) : null

const vs = (v: number, prev: number | null) =>
  prev === null || Math.abs(v - prev) < 1
    ? ""
    : `  ·  ${v > prev ? "+" : "−"}${Math.abs(Math.round(v - prev))} vs last`

/**
 * Rolling-road readout shown while the camera is on the car. The pull itself
 * runs in the dyno system; this only draws its state.
 */
export function DynoHud({ carName }: { carName: string }) {
  const s = useDyno()
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setBoardElement("dyno", ref.current)
    return () => setBoardElement("dyno", null)
  }, [])
  // W / S throttle and brake, Q / E gear down / up.
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
  const pulling = s.phase === "pulling"
  const manual = s.phase === "manual"
  const cooling = s.phase === "cooldown"
  const prevHp = peakOf(s.prev, "hp")
  const prevNm = peakOf(s.prev, "nm")
  const btn =
    "inline-flex items-center justify-center gap-2 border px-3 py-2 text-[12px] font-semibold transition disabled:opacity-40"
  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute bottom-10 left-1/2 z-[95] w-[min(1180px,94vw)] border border-[#51a7d5]/60 bg-[#0b0e14]/90 p-4 text-white shadow-[0_20px_80px_rgba(0,0,0,0.7)] backdrop-blur-md"
      style={{ animation: "dynoIn .5s .7s both cubic-bezier(.2,.8,.2,1)" }}
    >
      <style>{css}</style>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] font-bold">Dyno</span>
          <span className="text-[12px] text-gray-400">
            {carName} · rolling road · wheel power
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.18em] text-[#8f99a8]">
              GEAR
            </span>
            <button
              aria-label="Lower gear"
              disabled={pulling || s.gear <= 1}
              onClick={() => dyno.shift(-1)}
              className={`${btn} border-[#51a7d5] bg-[#51a7d5]/15 hover:bg-[#51a7d5]/30`}
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-[16px] font-bold tabular-nums">
              {s.gear}
            </span>
            <button
              aria-label="Higher gear"
              disabled={pulling || s.gear >= s.gears}
              onClick={() => dyno.shift(1)}
              className={`${btn} border-[#51a7d5] bg-[#51a7d5]/15 hover:bg-[#51a7d5]/30`}
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            disabled={pulling || manual || cooling}
            onClick={() => dyno.beginManual()}
            title="Drive the rollers yourself: W throttle, S brake, Q/E gears"
            className={`${btn} border-[#51a7d5] bg-[#51a7d5]/15 hover:bg-[#51a7d5]/30`}
          >
            Manual
          </button>
          <button
            onClick={() => setFocus("tune")}
            className={`${btn} border-white/15 bg-white/5 text-gray-200 hover:bg-white/10`}
          >
            <SlidersHorizontal size={14} />
            Tuning
          </button>
          {pulling || manual ? (
            <button
              onClick={() => dyno.abort()}
              className={`${btn} min-w-[150px] border-rose-400 bg-rose-500/25 hover:bg-rose-500/40`}
            >
              <Square size={13} fill="currentColor" />
              {manual ? "End run" : "Abort"}
            </button>
          ) : (
            <button
              disabled={cooling}
              onClick={() => dyno.start()}
              className={`${btn} min-w-[150px] border-[#51a7d5] bg-[#51a7d5] hover:bg-[#51a7d5]/85`}
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
      <div className="mt-3 grid grid-cols-[180px_1fr_200px] items-center gap-5">
        <Tach rpm={s.rpm} redline={s.redline} boost={s.boost} />
        <div className="h-[178px]">
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
        <div className="flex flex-col gap-3">
          {s.peakHp && s.peakNm ? (
            <>
              <Big
                label="PEAK POWER"
                value={Math.round(s.peakHp.v).toLocaleString()}
                unit="hp"
                color={AMBER}
                sub={`@ ${Math.round(s.peakHp.rpm).toLocaleString()} rpm${vs(s.peakHp.v, prevHp)}`}
              />
              <Big
                label="PEAK TORQUE"
                value={Math.round(s.peakNm.v).toLocaleString()}
                unit="Nm"
                color={BLUE}
                sub={`@ ${Math.round(s.peakNm.rpm).toLocaleString()} rpm${vs(s.peakNm.v, prevNm)}`}
              />
              <div className="text-[10px] tabular-nums text-gray-400">
                {s.pullTime ? `Pull ${s.pullTime.toFixed(1)} s · ` : ""}
                {Math.round(s.topKmh ?? 0)} km/h at redline · crank figures
                {s.retuned && prevHp !== null && (
                  <span className="block text-[#ffb020]">
                    Tuning changed since last pull
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Big
                label="POWER NOW"
                value={Math.round(s.hp).toLocaleString()}
                unit="hp"
                color={AMBER}
              />
              <Big
                label="TORQUE NOW"
                value={Math.round(s.nm).toLocaleString()}
                unit="Nm"
                color={BLUE}
              />
              <div className="text-[10px] text-gray-500">
                {pulling || manual
                  ? `${Math.round(s.speedKmh)} km/h · ${Math.round(s.whp)} hp at the wheels`
                  : "Start a pull, or hold W to drive the rollers yourself (S brake, Q/E gears)."}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
