import { useEffect, useMemo, useRef } from "react"
import { isPaused } from "../../app/pauseState"
import type { CarTelemetry } from "../../physics/vehicle/Vehicle"
import {
  RED_FROM_RPM,
  MAX_RPM,
  SANS,
  BLUE,
  AMBER,
  RED,
  OFF,
  ease,
} from "./geometry"
import { paintTelltale } from "./Dial"
import { NeedleGhosts, blurNeedle } from "./needleBlur"
import { smallestNiceStep, subdivideStep } from "./scale"
import {
  ParkIcon,
  CruiseIcon,
  DriftIcon,
  TextIcon,
  SafetyIcon,
  ICON_SIZE,
} from "./icons"

// One round dial: RPM on a 270° sweep (open at the bottom), speed and gear
// in the hub. Same palette, rim, needle and telltales as the twin cluster.
const C = 200
const R_RIM = 192
const R_PROG = 180
const R_TICK = 180
const R_LABEL = 138
const R_HUB = 104
const A0 = 135
const SWEEP = 270
const N_BASE = 20
const N_END = 178

const ang = (frac: number) => A0 + Math.max(0, Math.min(1, frac)) * SWEEP
const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}
const arc = (r: number, d0: number, d1: number) => {
  const p0 = pt(r, d0)
  const p1 = pt(r, d1)
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`
}

const NEEDLE = [
  [N_BASE, -9],
  [N_END, -1.6],
  [N_END, 1.6],
  [N_BASE, 9],
  [-26, 6],
  [-26, -6],
]
  .map(([u, d]) => `${C + u},${C + d}`)
  .join(" ")

interface Refs {
  needle: SVGGElement | null
  progress: SVGPathElement | null
  rim: SVGCircleElement | null
  speed: SVGTextElement | null
  gear: SVGTextElement | null
  park: SVGGElement | null
  cruise: SVGGElement | null
  cruiseTxt: SVGTextElement | null
  drift: SVGGElement | null
  tc: SVGGElement | null
  abs: SVGGElement | null
  esc: SVGGElement | null
}

export function SingleDialDashboard({ tele }: { tele: CarTelemetry }) {
  const teleRef = useRef(tele)
  teleRef.current = tele

  const maxRpm = tele.dash?.maxRpm ?? MAX_RPM
  const redFrom = tele.dash?.redFromRpm ?? RED_FROM_RPM
  const yellowFrom = redFrom - 1000
  const dashRef = useRef({ maxRpm, red: redFrom, yellow: yellowFrom })
  dashRef.current = { maxRpm, red: redFrom, yellow: yellowFrom }

  const r = useRef<Refs>({
    needle: null,
    progress: null,
    rim: null,
    speed: null,
    gear: null,
    park: null,
    cruise: null,
    cruiseTxt: null,
    drift: null,
    tc: null,
    abs: null,
    esc: null,
  })

  const scale = useMemo(() => {
    const out: React.ReactNode[] = []
    const major = smallestNiceStep(maxRpm, 9)
    const minor = subdivideStep(maxRpm, major, 40)
    const n = Math.floor(maxRpm / minor + 1e-6)
    for (let i = 0; i <= n; i++) {
      const v = i * minor
      const a = ang(v / maxRpm)
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6
      const red = v >= redFrom
      const yellow = v >= yellowFrom && !red
      const p1 = pt(R_TICK, a)
      const p2 = pt(R_TICK - (isMajor ? 21 : 10), a)
      out.push(
        <line
          key={"k" + i}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={
            red
              ? "#ff3b30"
              : yellow
                ? "#facc15"
                : isMajor
                  ? "#f1f3f6"
                  : "rgba(255,222,212,0.5)"
          }
          strokeWidth={isMajor ? 2.4 : 1.1}
          strokeLinecap="round"
        />,
      )
      if (isMajor) {
        const lp = pt(R_LABEL, a)
        out.push(
          <text
            key={"l" + i}
            x={lp.x}
            y={lp.y + 7}
            textAnchor="middle"
            fontSize="20"
            fontWeight={700}
            fontFamily={SANS}
            fill={red ? "#ff6a60" : yellow ? "#facc15" : "#d9dee6"}
          >
            {Math.round(v / 1000)}
          </text>,
        )
      }
    }
    if (redFrom < maxRpm)
      out.push(
        <path
          key="band"
          d={arc(R_TICK, ang(redFrom / maxRpm), ang(1))}
          fill="none"
          stroke="#e30613"
          strokeWidth="4"
        />,
      )
    return out
  }, [maxRpm, redFrom, yellowFrom])

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    let last = start
    let dRpm = 0
    let dKmh = 0
    let lastNumT = -1e9
    let lastGear = ""
    let popT = -1e9
    const BOOT = 1500

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (isPaused()) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = teleRef.current as CarTelemetry
      const dash = dashRef.current
      const e = r.current

      const boot = now - start
      const booting = boot < BOOT
      let tRpm = t.rpm
      let tKmh = Math.abs(t.speedKmh)
      if (booting) {
        const k = boot / BOOT
        const f = k < 0.5 ? ease(k * 2) : 1 - ease((k - 0.5) * 2)
        tRpm = f * dash.maxRpm
        tKmh = f * 300
      }
      dRpm += (tRpm - dRpm) * (1 - Math.exp(-dt * 14))
      dKmh += (tKmh - dKmh) * (1 - Math.exp(-dt * 10))

      const limiter = !booting && dRpm >= dash.red
      const warning = !booting && dRpm >= dash.yellow
      const flash = limiter ? (Math.sin(now * 0.045) > 0 ? 1 : 0.1) : 1
      const color = limiter ? "#ff2d2d" : warning ? "#facc15" : BLUE

      const a = ang(dRpm / dash.maxRpm)
      e.needle?.setAttribute("transform", `rotate(${a} ${C} ${C})`)
      blurNeedle(e.needle, a, C, C, dt)
      const p = e.progress
      if (p) {
        p.setAttribute("d", arc(R_PROG, A0, a))
        p.style.opacity = String(limiter ? flash : 0.9)
        if (p.dataset.c !== color) {
          p.dataset.c = color
          p.setAttribute("stroke", color)
          p.style.filter = `drop-shadow(0 0 4px ${color})`
        }
      }
      const rim = e.rim
      if (rim) {
        rim.setAttribute(
          "stroke",
          limiter ? `rgba(227,6,19,${flash})` : "url(#sd-chrome)",
        )
        rim.style.filter = limiter
          ? flash > 0.5
            ? "drop-shadow(0 0 5px rgba(227,6,19,0.95))"
            : "none"
          : warning
            ? "drop-shadow(0 0 5px rgba(250,204,21,0.85))"
            : "none"
      }

      if (e.speed && (booting || now - lastNumT >= 250)) {
        lastNumT = now
        e.speed.textContent = String(Math.round(dKmh))
      }

      const gear = t.gearLabel
      const g = e.gear
      if (g) {
        if (g.textContent !== gear) g.textContent = gear
        if (gear !== lastGear) {
          lastGear = gear
          popT = now
        }
        const k = Math.max(0, 1 - (now - popT) / 260)
        g.style.transform = `scale(${1 + 0.28 * k * k})`
        g.setAttribute(
          "fill",
          gear === "R" ? "#ff5a5a" : gear === "N" ? "#f5b942" : "#ffffff",
        )
      }

      const blink = Math.floor(now / 170) % 2 === 0
      paintTelltale(e.park, booting || t.parkingBrake, RED, true)
      paintTelltale(e.cruise, booting || !!t.cruiseOn, BLUE, true)
      if (e.cruiseTxt) {
        const ct = t.cruiseOn ? String(Math.round(t.cruiseTargetKmh ?? 0)) : ""
        if (e.cruiseTxt.textContent !== ct) e.cruiseTxt.textContent = ct
      }
      paintTelltale(e.drift, booting || !!t.drift, AMBER, booting || blink)
      paintTelltale(
        e.tc,
        booting || t.tractionControl !== false,
        AMBER,
        booting || !t.tractionActive || blink,
      )
      paintTelltale(
        e.abs,
        booting || t.absOn !== false,
        AMBER,
        booting || !t.absActive || blink,
      )
      paintTelltale(
        e.esc,
        booting || t.stabilityControl !== false,
        AMBER,
        booting || !t.stabilityActive || blink,
      )
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const caption = !tele.engineOn
    ? tele.cranking
      ? "STARTING"
      : tele.ignitionOn === false
        ? "IGNITION OFF"
        : "HOLD V TO START"
    : tele.autoMode
      ? "AUTO"
      : "MANUAL"
  const captionColor = !tele.engineOn
    ? "#ff5a5a"
    : tele.autoMode
      ? "#7db8ec"
      : "#cbd5e1"

  const icons: [keyof Refs, JSX.Element][] = [
    ["park", <ParkIcon key="p" />],
    ["cruise", <CruiseIcon key="c" />],
    ["drift", <DriftIcon key="d" />],
    ["tc", <TextIcon key="t" label="TC" />],
    ["abs", <TextIcon key="a" label="ABS" />],
    ["esc", <SafetyIcon key="s" />],
  ]
  const PITCH = 34

  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      style={{ fontFamily: SANS }}
    >
      <div className="absolute inset-x-0 bottom-0 flex justify-end px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="w-[clamp(200px,24vw,320px)]">
          <svg viewBox="0 0 400 400" className="block h-auto w-full">
            <defs>
              <radialGradient id="sd-face" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#1c222c" />
                <stop offset="55%" stopColor="#10141a" />
                <stop offset="100%" stopColor="#07090d" />
              </radialGradient>
              <radialGradient id="sd-hub" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#04060a" />
                <stop offset="70%" stopColor="#0b0e14" />
                <stop offset="100%" stopColor="#171c25" />
              </radialGradient>
              <linearGradient
                id="sd-chrome"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="400"
                y2="400"
              >
                <stop offset="0%" stopColor="#f4f6f9" />
                <stop offset="25%" stopColor="#9aa1ab" />
                <stop offset="50%" stopColor="#e8ecf1" />
                <stop offset="75%" stopColor="#6b7280" />
                <stop offset="100%" stopColor="#dfe4ea" />
              </linearGradient>
            </defs>

            <circle cx={C} cy={C} r={R_RIM} fill="url(#sd-face)" />
            <circle
              ref={(el) => void (r.current.rim = el)}
              cx={C}
              cy={C}
              r={R_RIM}
              fill="none"
              stroke="url(#sd-chrome)"
              strokeWidth="6"
            />
            {scale}
            <g
              ref={(el) => void (r.current.needle = el)}
              transform={`rotate(${A0} ${C} ${C})`}
              style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,0.7))" }}
            >
              <NeedleGhosts
                render={(props, i) => (
                  <g key={i} {...props}>
                    <polygon points={NEEDLE} fill="#e30613" />
                  </g>
                )}
              />
              <polygon
                points={NEEDLE}
                fill="#e30613"
                stroke="#0b0e14"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </g>

            <circle cx={C} cy={C} r={R_HUB} fill="url(#sd-hub)" />
            <circle
              cx={C}
              cy={C}
              r={R_HUB}
              fill="none"
              stroke="url(#sd-chrome)"
              strokeWidth="3.5"
            />
            <circle
              cx={C}
              cy={C}
              r={R_HUB - 3.5}
              fill="none"
              stroke="#000"
              strokeWidth="1"
              opacity="0.8"
            />

            <text
              ref={(el) => void (r.current.gear = el)}
              x={C}
              y={C - 36}
              textAnchor="middle"
              fontSize="36"
              fontWeight={700}
              fill="#ffffff"
              fontFamily={SANS}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            <text
              ref={(el) => void (r.current.speed = el)}
              x={C}
              y={C + 28}
              textAnchor="middle"
              fontSize="66"
              fontWeight={700}
              fill="#ffffff"
              fontFamily={SANS}
              style={{ fontVariantNumeric: "tabular-nums" }}
            />
            <text
              x={C}
              y={C + 46}
              textAnchor="middle"
              fontSize="11"
              fontWeight={600}
              letterSpacing="2"
              fill="#8f99a8"
              fontFamily={SANS}
            >
              KM/H
            </text>
            <text
              x={C}
              y={C + 72}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight={600}
              letterSpacing="2"
              fill={captionColor}
              fontFamily={SANS}
            >
              {caption}
            </text>

            {icons.map(([key, icon], i) => (
              <g
                key={key}
                transform={`translate(${C + (i - (icons.length - 1) / 2) * PITCH} ${C + 150}) scale(${ICON_SIZE / 24}) translate(-12 -12)`}
              >
                <g
                  ref={(el) => void (r.current[key] = el as never)}
                  style={{ color: OFF, opacity: 0.85 }}
                >
                  {icon}
                </g>
                {key === "cruise" && (
                  <text
                    ref={(el) => void (r.current.cruiseTxt = el)}
                    x="12"
                    y="-2"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight={700}
                    fill={BLUE}
                    fontFamily={SANS}
                  />
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}
