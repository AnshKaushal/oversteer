import { useEffect, useRef } from "react"
import { isPaused } from "../../app/pauseState"
import type { CarTelemetry } from "../../physics/vehicle/Vehicle"
import {
  RED_FROM_RPM,
  MAX_RPM,
  MAX_KMH,
  SANS,
  BLUE,
  AMBER,
  RED,
  ease,
} from "./geometry"
import { useDialRefs, Dial, paintDial, paintTelltale } from "./Dial"

export function TwinDialDashboard({ tele }: { tele: CarTelemetry }) {
  const teleRef = useRef(tele)
  teleRef.current = tele

  const dashMaxRpm = tele.dash?.maxRpm ?? MAX_RPM
  const dashRedFrom = tele.dash?.redFromRpm ?? RED_FROM_RPM
  const dashYellowFrom = dashRedFrom - 1000
  const dashMaxKmh = tele.dash?.maxKmh ?? MAX_KMH
  const dashRef = useRef({
    maxRpm: dashMaxRpm,
    red: dashRedFrom,
    yellow: dashYellowFrom,
    kmh: dashMaxKmh,
  })
  dashRef.current = {
    maxRpm: dashMaxRpm,
    red: dashRedFrom,
    yellow: dashYellowFrom,
    kmh: dashMaxKmh,
  }

  const spd = useDialRefs()
  const rpm = useDialRefs()

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

      const boot = now - start
      const booting = boot < BOOT
      let tRpm = t.rpm
      let tKmh = Math.abs(t.speedKmh)
      if (booting) {
        const k = boot / BOOT
        const f = k < 0.5 ? ease(k * 2) : 1 - ease((k - 0.5) * 2)
        tRpm = f * dash.maxRpm
        tKmh = f * dash.kmh
      }

      dRpm += (tRpm - dRpm) * (1 - Math.exp(-dt * 14))
      dKmh += (tKmh - dKmh) * (1 - Math.exp(-dt * 10))

      paintDial(spd, "left", dKmh / dash.kmh, BLUE, 0.9, dt)
      if (spd.num.current && (booting || now - lastNumT >= 500)) {
        lastNumT = now
        spd.num.current.textContent = String(Math.round(dKmh))
      }

      const limiter = !booting && dRpm >= dash.red
      const warning = !booting && dRpm >= dash.yellow
      const flash = limiter ? (Math.sin(now * 0.045) > 0 ? 1 : 0.1) : 1
      paintDial(
        rpm,
        "right",
        dRpm / dash.maxRpm,
        limiter ? "#ff2d2d" : warning ? "#facc15" : BLUE,
        limiter ? flash : 0.9,
        dt,
      )

      const rim = rpm.rim.current
      if (rim) {
        rim.setAttribute(
          "stroke",
          limiter ? `rgba(227,6,19,${flash})` : "url(#dial-rpm-chrome)",
        )
        rim.setAttribute(
          "stroke-width",
          limiter ? String(6 + flash * 2) : warning ? "6" : "6",
        )
        rim.style.filter = limiter
          ? flash > 0.5
            ? "drop-shadow(0 0 5px rgba(227,6,19,0.95))"
            : "none"
          : warning
            ? "drop-shadow(0 0 5px rgba(250,204,21,0.85))"
            : "none"
      }

      const gear = t.gearLabel
      const g = rpm.num.current
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
      paintTelltale(spd.icon.current, booting || t.parkingBrake, RED, true)
      paintTelltale(spd.icon2.current, booting || !!t.cruiseOn, BLUE, true)
      if (spd.cruiseTxt.current) {
        const ct = t.cruiseOn ? String(Math.round(t.cruiseTargetKmh ?? 0)) : ""
        if (spd.cruiseTxt.current.textContent !== ct)
          spd.cruiseTxt.current.textContent = ct
      }
      paintTelltale(
        rpm.icon2.current,
        booting || t.stabilityControl !== false,
        AMBER,
        booting || !t.stabilityActive || blink,
      )
      paintTelltale(
        rpm.icon3.current,
        booting || t.tractionControl !== false,
        AMBER,
        booting || !t.tractionActive || blink,
      )
      paintTelltale(
        rpm.icon4.current,
        booting || t.absOn !== false,
        AMBER,
        booting || !t.absActive || blink,
      )
      paintTelltale(
        rpm.icon.current,
        booting || !!t.drift,
        AMBER,
        booting || blink,
      )
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="pointer-events-none absolute inset-0 select-none"
      style={{ fontFamily: SANS }}
    >
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between">
        <div className="w-[clamp(190px,25vw,340px)]">
          <Dial
            side="left"
            kind="speed"
            id="dial-spd"
            maxValue={dashMaxKmh}
            caption="KM/H"
            captionColor="#8f99a8"
            refs={spd}
          />
        </div>
        <div className="w-[clamp(190px,25vw,340px)]">
          <Dial
            side="right"
            kind="rpm"
            id="dial-rpm"
            maxValue={dashMaxRpm}
            redFrom={dashRedFrom}
            yellowFrom={dashYellowFrom}
            caption={
              !tele.engineOn
                ? tele.cranking
                  ? "STARTING"
                  : tele.ignitionOn === false
                    ? "IGNITION OFF"
                    : "HOLD V TO START"
                : tele.autoMode
                  ? "AUTO"
                  : "MANUAL"
            }
            captionColor={
              !tele.engineOn ? "#ff5a5a" : tele.autoMode ? "#7db8ec" : "#cbd5e1"
            }
            refs={rpm}
          />
        </div>
      </div>
    </div>
  )
}
