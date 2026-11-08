import { useMemo, useRef } from "react"
import {
  Side,
  Kind,
  S,
  R_RIM,
  R_PROG,
  R_HUB,
  START,
  N_BASE,
  N_END,
  NEEDLE_HALF_BASE,
  NEEDLE_HALF_TIP,
  SANS,
  BLUE,
  OFF,
  ang,
  arc,
  sector,
} from "./geometry"
import { buildScale } from "./scale"
import {
  ParkIcon,
  ICON_SIZE,
  ICON_PITCH,
  CruiseIcon,
  DriftIcon,
  TextIcon,
  SafetyIcon,
} from "./icons"

export interface DialRefs {
  needle: { current: SVGGElement | null }
  progress: { current: SVGPathElement | null }
  num: { current: SVGTextElement | null }
  icon: { current: SVGGElement | null }
  icon2: { current: SVGGElement | null }
  icon3: { current: SVGGElement | null }
  icon4: { current: SVGGElement | null }
  cruiseTxt: { current: SVGTextElement | null }
  rim: { current: SVGPathElement | null }
}

export function useDialRefs(): DialRefs {
  return {
    needle: useRef<SVGGElement | null>(null),
    progress: useRef<SVGPathElement | null>(null),
    num: useRef<SVGTextElement | null>(null),
    icon: useRef<SVGGElement | null>(null),
    icon2: useRef<SVGGElement | null>(null),
    icon3: useRef<SVGGElement | null>(null),
    icon4: useRef<SVGGElement | null>(null),
    cruiseTxt: useRef<SVGTextElement | null>(null),
    rim: useRef<SVGPathElement | null>(null),
  }
}

export interface DialProps {
  side: Side
  kind: Kind
  id: string
  maxValue: number
  redFrom?: number
  yellowFrom?: number
  caption: string
  captionColor: string
  refs: DialRefs
}

export function Dial({
  side,
  kind,
  id,
  maxValue,
  redFrom = Infinity,
  yellowFrom = Infinity,
  caption,
  captionColor,
  refs,
}: DialProps) {
  const cx = side === "left" ? 0 : S
  const dir = side === "left" ? 1 : -1
  const sign = side === "left" ? -1 : 1
  const X = (u: number) => (side === "left" ? u : S - u)
  const Y = (v: number) => S - v
  const nx = (u: number) => cx + dir * u

  const scale = useMemo(
    () => buildScale(side, kind, maxValue, redFrom, yellowFrom),
    [side, kind, maxValue, redFrom, yellowFrom],
  )

  const bar = (u0: number, w0: number, u1: number, w1: number) =>
    [
      [u0, -w0],
      [u1, -w1],
      [u1, w1],
      [u0, w0],
    ]
      .map(([u, d]) => `${nx(u)},${S + d}`)
      .join(" ")

  const needle = bar(N_BASE, NEEDLE_HALF_BASE, N_END + 1, NEEDLE_HALF_TIP)

  const iconPos = { x: X(52) - 12, y: Y(86) - 12 }

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="block h-auto w-full">
      <defs>
        <radialGradient
          id={`${id}-face`}
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={S}
          r={R_RIM}
        >
          <stop offset="0%" stopColor="#1c222c" />
          <stop offset="55%" stopColor="#10141a" />
          <stop offset="100%" stopColor="#07090d" />
        </radialGradient>
        <radialGradient
          id={`${id}-hub`}
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={S}
          r={R_HUB}
        >
          <stop offset="0%" stopColor="#04060a" />
          <stop offset="70%" stopColor="#0b0e14" />
          <stop offset="100%" stopColor="#171c25" />
        </radialGradient>
        <linearGradient
          id={`${id}-chrome`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={S}
          y2={S}
        >
          <stop offset="0%" stopColor="#f4f6f9" />
          <stop offset="25%" stopColor="#9aa1ab" />
          <stop offset="50%" stopColor="#e8ecf1" />
          <stop offset="75%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#dfe4ea" />
        </linearGradient>
      </defs>

      {}
      <path
        ref={refs.rim}
        d={arc(side, R_RIM, 0, 90)}
        fill="none"
        stroke={`url(#${id}-chrome)`}
        strokeWidth="6"
        z={999}
      />

      {}
      {scale}
      {}
      <path
        ref={refs.progress}
        d={arc(side, R_PROG, START, START)}
        fill="none"
        strokeWidth="3"
      />

      {}
      <g
        ref={refs.needle}
        transform={`rotate(${sign * START} ${cx} ${S})`}
        style={{ filter: "drop-shadow(0 0 3px rgba(0,0,0,0.7))" }}
      >
        <polygon
          points={needle}
          fill="#e30613"
          stroke="#0b0e14"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </g>

      {}
      <path d={sector(side, R_HUB)} fill={`url(#${id}-hub)`} />
      <path
        d={arc(side, R_HUB, 0, 90)}
        fill="none"
        stroke={`url(#${id}-chrome)`}
        strokeWidth="3.5"
      />
      <path
        d={arc(side, R_HUB - 3.5, 0, 90)}
        fill="none"
        stroke="#000"
        strokeWidth="1"
        opacity="0.8"
      />

      {}
      <text
        ref={refs.num}
        x={X(52)}
        y={Y(34)}
        textAnchor="middle"
        fontSize={kind === "rpm" ? 40 : 32}
        fontWeight={700}
        fill="#ffffff"
        fontFamily={SANS}
        style={{
          fontVariantNumeric: "tabular-nums",
          transformBox: "fill-box",
          transformOrigin: "center",
        }}
      />
      <text
        x={X(52)}
        y={Y(17)}
        textAnchor="middle"
        fontSize="8.5"
        fontWeight={600}
        letterSpacing="2"
        fill={captionColor}
        fontFamily={SANS}
      >
        {caption}
      </text>

      {(kind === "speed"
        ? ([
            [refs.icon, <ParkIcon key="park" />],
            [refs.icon2, <CruiseIcon key="cruise" />],
          ] as const)
        : ([
            [refs.icon, <DriftIcon key="drift" />],
            [refs.icon3, <TextIcon key="tc" label="TC" />],
            [refs.icon4, <TextIcon key="abs" label="ABS" />],
            [refs.icon2, <SafetyIcon key="safe" />],
          ] as const)
      ).map(([ref, icon], i, row) => {
        const r = Math.hypot(iconPos.x + 12 - cx, iconPos.y + 12 - S)
        const a0 = Math.atan2(iconPos.y + 12 - S, iconPos.x + 12 - cx)
        const a = a0 + ((i - (row.length - 1) / 2) * ICON_PITCH) / r
        const x = cx + r * Math.cos(a)
        const y = S + r * Math.sin(a)
        const tilt = (a * 180) / Math.PI + 90
        return (
          <g
            key={i}
            transform={`translate(${x} ${y}) rotate(${tilt}) scale(${ICON_SIZE / 24}) translate(-12 -12)`}
          >
            <g ref={ref} style={{ color: OFF, opacity: 0.85 }}>
              {icon}
            </g>
            {kind === "speed" && i === 1 && (
              <text
                ref={refs.cruiseTxt}
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
        )
      })}
    </svg>
  )
}

export function paintDial(
  refs: DialRefs,
  side: Side,
  frac: number,
  color: string,
  opacity: number,
) {
  const cx = side === "left" ? 0 : S
  const sign = side === "left" ? -1 : 1
  const a = ang(frac)
  refs.needle.current?.setAttribute(
    "transform",
    `rotate(${sign * a} ${cx} ${S})`,
  )
  const p = refs.progress.current
  if (p) {
    p.setAttribute("d", arc(side, R_PROG, START, a))
    p.style.opacity = String(opacity)
    if (p.dataset.c !== color) {
      p.dataset.c = color
      p.setAttribute("stroke", color)
      p.style.filter = `drop-shadow(0 0 4px ${color})`
    }
  }
}

export function paintTelltale(
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
