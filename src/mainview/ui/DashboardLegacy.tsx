import { useEffect, useRef } from "react"
import type { CarTelemetry } from "../systems/CarController"

const RED_FROM_RPM = 6750
const MAX_RPM = 8000
const MAX_KMH = 340

const RED = "#ff3b30"
const AMBER = "#ffb020"
const OFF = "#3a4350"

const SANS = 'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'

function angleFor(frac: number) {
  return -120 + Math.max(0, Math.min(1, frac)) * 240
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

interface GaugeRefs {
  needleRef: { current: SVGGElement | null }
  numRef: { current: SVGTextElement | null }
  rimRef?: { current: SVGCircleElement | null }
  iconRef: { current: SVGGElement | null }
}

function ParkIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4.6 6.2a8.5 8.5 0 0 0 0 11.6" />
      <path d="M19.4 6.2a8.5 8.5 0 0 1 0 11.6" />
      <circle cx="12" cy="12" r="6.6" />
      <path
        d="M10.1 15.6V8.4h2.4a2.1 2.1 0 0 1 0 4.2h-2.4"
        strokeLinejoin="round"
      />
    </g>
  )
}

function DriftIcon() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 14V11.6l2.2-3.2h7.6l3.2 3.2h3.4V14z" />
      <circle cx="7.2" cy="14.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="14.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 18.6c2-1.8 4 1.8 6 0s4 1.8 6 0 4 1.8 6 0" />
      <path d="M3 22c2-1.8 4 1.8 6 0s4 1.8 6 0 4 1.8 6 0" />
    </g>
  )
}

function paintTelltale(
  el: SVGGElement | null,
  on: boolean,
  color: string,
  lit: boolean,
) {
  if (!el) return
  el.style.color = on ? color : OFF
  el.style.opacity = on ? (lit ? "1" : "0.12") : "0.85"
  el.style.filter = on && lit ? `drop-shadow(0 0 4px ${color})` : "none"
}

function BmwDial({
  title,
  unit,
  maxLabel,
  redFrom,
  redRpm,
  yellowRpm,
  refs,
  id,
  modeLabel,
}: {
  title: string
  unit: string
  maxLabel: number
  redFrom: number
  redRpm: number
  yellowRpm: number
  refs: GaugeRefs
  id: string
  modeLabel?: string
}) {
  const CX = 100,
    CY = 100,
    CR = 78
  const ticks: React.ReactNode[] = []
  const isRpm = maxLabel <= 10
  // Tick counts are derived so labelled ticks always land on integers:
  // rpm dials get one label per 1000 rpm (maxLabel must be whole), speed
  // dials one per 20 km/h. (A 7000-rpm dial with the old fixed 40 steps
  // labelled 3.5→"4" twice — hence this.)
  const steps = isRpm
    ? Math.round(maxLabel * 5)
    : maxLabel % 20 === 0
      ? (maxLabel / 20) * 4
      : 68
  const labelEvery = isRpm ? 5 : maxLabel % 20 === 0 ? 4 : 8

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps
    const a = angleFor(frac)
    const labelled = i % labelEvery === 0 || i === steps
    const p1 = polar(CX, CY, CR, a)
    const p2 = polar(CX, CY, CR - (labelled ? 12 : 6), a)
    const rpm = frac * maxLabel * 1000
    const red = isRpm && rpm >= redRpm
    const yellow = isRpm && rpm >= yellowRpm && !red
    ticks.push(
      <line
        key={i}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={
          red
            ? "#e30613"
            : yellow
              ? "#facc15"
              : labelled
                ? "#f2f4f7"
                : "rgba(242,244,247,0.45)"
        }
        strokeWidth={labelled ? 2.6 : 1.2}
        strokeLinecap="round"
      />,
    )
    if (labelled) {
      const pt = polar(CX, CY, CR - 25, a)
      const val = isRpm
        ? Math.round(frac * maxLabel)
        : Math.round((frac * maxLabel) / 10) * 10
      ticks.push(
        <text
          key={"t" + i}
          x={pt.x}
          y={pt.y + 5}
          textAnchor="middle"
          fontSize="12.5"
          fill={red ? "#ff5a5a" : yellow ? "#facc15" : "#e8ebef"}
          fontFamily={SANS}
          fontWeight={600}
        >
          {val}
        </text>,
      )
    }
  }

  const r0 = polar(CX, CY, CR - 1, angleFor(redFrom))
  const r1 = polar(CX, CY, CR - 1, angleFor(1))
  const largeArc = (1 - redFrom) * 240 > 180 ? 1 : 0
  const tip = polar(CX, CY, CR - 6, 0)
  const tail = polar(CX, CY, 14, 180)

  return (
    <svg viewBox="0 0 200 200" className="h-auto w-full">
      <defs>
        <radialGradient id={`${id}-face`} cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#1b2029" />
          <stop offset="55%" stopColor="#101319" />
          <stop offset="100%" stopColor="#07090c" />
        </radialGradient>
        <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4f6f9" />
          <stop offset="25%" stopColor="#9aa1ab" />
          <stop offset="50%" stopColor="#e8ecf1" />
          <stop offset="75%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#dfe4ea" />
        </linearGradient>
      </defs>

      <circle
        ref={refs.rimRef}
        cx={CX}
        cy={CY}
        r={CR + 9}
        fill="none"
        stroke={`url(#${id}-chrome)`}
        strokeWidth="6"
      />
      <circle
        cx={CX}
        cy={CY}
        r={CR + 5.5}
        fill="none"
        stroke="#04060a"
        strokeWidth="1.5"
        opacity="0.9"
      />
      <circle
        cx={CX}
        cy={CY}
        r={CR + 4}
        fill={`url(#${id}-face)`}
        stroke="#232a35"
        strokeWidth="1"
      />

      {redFrom < 1 && (
        <path
          d={`M ${r0.x} ${r0.y} A ${CR - 1} ${CR - 1} 0 ${largeArc} 1 ${r1.x} ${r1.y}`}
          fill="none"
          stroke="#e30613"
          strokeWidth="4"
          opacity="0.95"
          strokeLinecap="round"
        />
      )}
      {ticks}

      <text
        x={CX}
        y={CY - 18}
        textAnchor="middle"
        fontSize="9"
        fill="#8f99a8"
        fontFamily={SANS}
        letterSpacing="3"
        fontWeight={600}
      >
        {title}
      </text>
      <text
        ref={refs.numRef}
        x={CX}
        y={CY + 42}
        textAnchor="middle"
        fontSize="30"
        fill="#ffffff"
        fontFamily={SANS}
        fontWeight={700}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        0
      </text>
      <text
        x={CX}
        y={CY + 56}
        textAnchor="middle"
        fontSize={modeLabel ? "8" : "8.5"}
        fill={
          modeLabel ? (modeLabel === "AUTO" ? "#7db8ec" : "#cbd5e1") : "#8f99a8"
        }
        fontFamily={SANS}
        letterSpacing={modeLabel ? "1.5" : "2.5"}
        fontWeight={600}
      >
        {modeLabel ?? unit}
      </text>

      {/* Telltale lights: parking brake (speed dial) / traction control / drift (rpm dial) */}
      <g transform={`translate(${CX - 12} 96)`}>
        <g ref={refs.iconRef} style={{ color: OFF, opacity: 0.85 }}>
          {isRpm ? <DriftIcon /> : <ParkIcon />}
        </g>
      </g>

      <g ref={refs.needleRef}>
        <line
          x1={tail.x}
          y1={tail.y}
          x2={tip.x}
          y2={tip.y}
          stroke="#e30613"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle
          cx={CX}
          cy={CY}
          r="10"
          fill="#14181f"
          stroke="#c7ced8"
          strokeWidth="1.6"
        />
        <circle cx={CX} cy={CY} r="5.2" fill="#1c69b4" />
        <path
          d={`M ${CX} ${CY - 5.2} A 5.2 5.2 0 0 1 ${CX + 5.2} ${CY} L ${CX} ${CY} Z`}
          fill="#ffffff"
          opacity="0.92"
        />
        <path
          d={`M ${CX} ${CY + 5.2} A 5.2 5.2 0 0 1 ${CX - 5.2} ${CY} L ${CX} ${CY} Z`}
          fill="#ffffff"
          opacity="0.92"
        />
        <circle cx={CX} cy={CY} r="1.6" fill="#0b0e13" />
      </g>
    </svg>
  )
}

export default function DashboardLegacy({ tele }: { tele: CarTelemetry }) {
  const teleRef = useRef(tele)
  teleRef.current = tele
  const dashMaxRpm = tele.dash?.maxRpm ?? MAX_RPM
  const dashRedFrom = tele.dash?.redFromRpm ?? RED_FROM_RPM
  const dashYellowFrom = dashRedFrom - 1000
  const dashMaxKmh = tele.dash?.maxKmh ?? MAX_KMH
  const dashRef = useRef({ maxRpm: dashMaxRpm, red: dashRedFrom, yellow: dashYellowFrom, kmh: dashMaxKmh })
  dashRef.current = { maxRpm: dashMaxRpm, red: dashRedFrom, yellow: dashYellowFrom, kmh: dashMaxKmh }
  const spdNeedle = useRef<SVGGElement | null>(null)
  const spdNum = useRef<SVGTextElement | null>(null)
  const spdIcon = useRef<SVGGElement | null>(null)
  const rpmNeedle = useRef<SVGGElement | null>(null)
  const rpmNum = useRef<SVGTextElement | null>(null)
  const rpmRim = useRef<SVGCircleElement | null>(null)
  const rpmIcon = useRef<SVGGElement | null>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let dRpm = 0,
      dKmh = 0
    // BMW-style digital readout: the needle sweeps live, but the number
    // steps at 2 Hz off the damped speed — no flickering last digit.
    let lastNumT = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = teleRef.current
      const dash = dashRef.current
      dRpm += (t.rpm - dRpm) * (1 - Math.exp(-dt * 14))
      dKmh += (Math.abs(t.speedKmh) - dKmh) * (1 - Math.exp(-dt * 10))

      if (rpmNeedle.current) {
        rpmNeedle.current.setAttribute(
          "transform",
          `rotate(${angleFor(dRpm / dash.maxRpm)} 100 100)`,
        )
      }

      if (spdNeedle.current) {
        spdNeedle.current.setAttribute(
          "transform",
          `rotate(${angleFor(dKmh / dash.kmh)} 100 100)`,
        )
      }

      if (rpmNum.current) {
        rpmNum.current.textContent = t.gearLabel
        rpmNum.current.setAttribute(
          "fill",
          t.gearLabel === "R"
            ? "#ff5a5a"
            : t.gearLabel === "N"
              ? "#f5b942"
              : "#ffffff",
        )
      }

      if (rpmRim.current) {
        const limiter = dRpm >= dash.red
        const warning = dRpm >= dash.yellow
        const flash = limiter ? (Math.sin(now * 0.045) > 0 ? 1 : 0.10) : 1

        rpmRim.current.setAttribute(
          "stroke",
          limiter ? `rgba(227,6,19,${flash})` : "url(#bmw-rpm-chrome)",
        )

        rpmRim.current.setAttribute(
          "stroke-width",
          limiter ? String(6 + flash * 2) : warning ? "7" : "6",
        )

        rpmRim.current.style.filter = limiter
          ? flash > 0.5
            ? "drop-shadow(0 0 5px rgba(227,6,19,0.95))"
            : "none"
          : warning
            ? "drop-shadow(0 0 5px rgba(250,204,21,0.85))"
            : "none"
      }

      // Telltales: parking brake (steady red) and traction control / drift
      // (blinking amber), same behaviour as the modern cluster.
      paintTelltale(spdIcon.current, !!t.parkingBrake, RED, true)
      const blink = Math.floor(now / 170) % 2 === 0
      paintTelltale(rpmIcon.current, !!t.drift, AMBER, blink)

      if (spdNum.current && now - lastNumT >= 500) {
        lastNumT = now
        spdNum.current.textContent = String(Math.round(dKmh))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const launching = tele.launchArmed || tele.launching
  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      style={{ fontFamily: SANS }}
    >
      {launching && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 rounded-xl border-4 border-red-500 bg-[#14090b] px-8 py-2">
          <div className="text-center text-xl font-bold tracking-[0.2em] text-red-500">
            {tele.launching ? "Launch" : "Launch control ready"}
          </div>
          {!tele.launching && (
            <div className="mt-0.5 text-center text-[11px] tracking-[0.18em] text-red-200/80">
              Let go of S to take off
            </div>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="w-[clamp(150px,20vw,25vw)]">
          <BmwDial
            title="SPEED"
            unit="KM/H"
            maxLabel={dashMaxKmh}
            redFrom={2}
            redRpm={Infinity}
            yellowRpm={Infinity}
            refs={{ needleRef: spdNeedle, numRef: spdNum, iconRef: spdIcon }}
            id="bmw-spd"
          />
        </div>

        <div className="w-[clamp(150px,20vw,25vw)]">
          <BmwDial
            title="POWER"
            unit=""
            maxLabel={dashMaxRpm / 1000}
            redFrom={dashRedFrom / dashMaxRpm}
            redRpm={dashRedFrom}
            yellowRpm={dashYellowFrom}
            refs={{
              needleRef: rpmNeedle,
              numRef: rpmNum,
              rimRef: rpmRim,
              iconRef: rpmIcon,
            }}
            id="bmw-rpm"
            modeLabel={tele.autoMode ? "AUTO" : "MANUAL"}
          />
        </div>
      </div>
    </div>
  )
}
