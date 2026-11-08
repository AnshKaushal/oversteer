import {
  Side,
  Kind,
  R_BAND,
  R_TICK,
  R_LABEL,
  SANS,
  ang,
  pt,
  arc,
} from "./geometry"

export const MAX_MINOR_TICKS = 30
export const MAX_MAJOR_LABELS = 9

export function smallestNiceStep(maxValue: number, maxCount: number) {
  for (let e = 0; e <= 6; e++) {
    for (const m of [1, 2, 4, 5]) {
      const step = m * 10 ** e
      if (Math.ceil(maxValue / step - 1e-9) <= maxCount) return step
    }
  }
  return maxValue
}

export function subdivideStep(
  maxValue: number,
  major: number,
  maxTicks: number,
) {
  for (const d of [4, 5, 2, 1]) {
    const minor = major / d
    if (Number.isInteger(maxValue) && !Number.isInteger(minor)) continue
    if (Math.ceil(maxValue / minor - 1e-9) <= maxTicks) return minor
  }
  return major
}

export function buildScale(
  side: Side,
  kind: Kind,
  maxValue: number,
  redFrom: number,
  yellowFrom: number,
) {
  const out: React.ReactNode[] = []
  const isRpm = kind === "rpm"
  const unitMax = isRpm ? maxValue : maxValue
  const major = smallestNiceStep(unitMax, MAX_MAJOR_LABELS)
  const minor = subdivideStep(unitMax, major, MAX_MINOR_TICKS)
  const n = Math.floor(unitMax / minor + 1e-6)

  for (let i = 0; i <= n; i++) {
    const v = i * minor
    const frac = v / maxValue
    const a = ang(frac)
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6
    const red = isRpm && v >= redFrom
    const yellow = isRpm && v >= yellowFrom && !red
    const p1 = pt(side, R_TICK, a)
    const p2 = pt(side, R_TICK - (isMajor ? 21 : 10), a)
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
      const lp = pt(side, R_LABEL, a)
      const label = isRpm ? Math.round(v / 1000) : Math.round(v)
      out.push(
        <text
          key={"l" + i}
          x={lp.x}
          y={lp.y + 4.6}
          textAnchor="middle"
          fontSize="13"
          fontWeight={600}
          fontFamily={SANS}
          fill={red ? "#ff6a60" : yellow ? "#facc15" : "#d9dee6"}
        >
          {label}
        </text>,
      )
    }
  }

  if (isRpm && redFrom < maxValue) {
    out.push(
      <path
        key="band"
        d={arc(side, R_BAND, ang(redFrom / maxValue), ang(1))}
        fill="none"
        stroke="#e30613"
        strokeWidth="4"
      />,
    )
  }
  return out
}
