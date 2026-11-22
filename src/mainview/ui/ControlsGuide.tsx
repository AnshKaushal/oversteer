import { useEffect, useState } from "react"

type Device = "keyboard" | "gamepad"

interface Binding {
  keys: string
  action: string
}

interface Group {
  title: string
  rows: Binding[]
}

const KEYBOARD: Group[] = [
  {
    title: "Drive",
    rows: [
      { keys: "W  ↑", action: "Throttle" },
      { keys: "S  ↓", action: "Brake, or reverse when stopped" },
      { keys: "A D  ← →", action: "Steer" },
      { keys: "Space", action: "Handbrake (tap to latch, hold to use)" },
      { keys: "E / Q", action: "Shift up / down (manual mode)" },
      { keys: "M", action: "Change transmission mode" },
      { keys: "R", action: "Put the car back on the road" },
    ],
  },
  {
    title: "Driver aids",
    rows: [
      { keys: "N", action: "All aids on / off" },
      { keys: "X", action: "Traction control" },
      { keys: "G", action: "Stability control" },
      { keys: "B", action: "ABS" },
      { keys: "L", action: "Launch control (hold W + S at a standstill)" },
      { keys: ";", action: "Cruise control on / off" },
      { keys: "[  ]", action: "Cruise: set or slower / resume or faster" },
    ],
  },
  {
    title: "Car and view",
    rows: [
      { keys: "V", action: "Engine on / off" },
      { keys: "H", action: "Headlights" },
      { keys: ",  .  /", action: "Left indicator, right indicator, hazards" },
      { keys: "C", action: "Camera view" },
      { keys: "F", action: "Free camera" },
      { keys: "Mouse", action: "Orbit the camera" },
      { keys: "T", action: "Time of day" },
    ],
  },
  {
    title: "Game",
    rows: [
      { keys: "P  Esc", action: "Pause" },
      { keys: "Enter", action: "Start" },
    ],
  },
]

const GAMEPAD: Group[] = [
  {
    title: "Drive",
    rows: [
      { keys: "RT / LT", action: "Throttle / brake" },
      { keys: "Left stick", action: "Steer" },
      { keys: "B", action: "Handbrake (tap to latch, hold to use)" },
      { keys: "RB / LB", action: "Shift up / down (manual mode)" },
      { keys: "Back", action: "Put the car back on the road" },
    ],
  },
  {
    title: "Car and view",
    rows: [
      { keys: "X", action: "Headlights" },
      { keys: "Y", action: "Camera view" },
      { keys: "Right stick", action: "Orbit the camera" },
      { keys: "R3", action: "Camera back behind the car" },
      { keys: "D-pad ↑", action: "Transmission mode" },
      { keys: "D-pad ↓", action: "Engine on / off" },
    ],
  },
  {
    title: "Driver aids",
    rows: [
      { keys: "D-pad ←", action: "Traction control" },
      { keys: "D-pad →", action: "Stability control" },
      { keys: "L3", action: "Launch control" },
    ],
  },
  {
    title: "Game",
    rows: [
      { keys: "Start", action: "Pause" },
      { keys: "A", action: "Start" },
    ],
  },
]

export function useInputDevice(): Device {
  const [device, setDevice] = useState<Device>(() =>
    typeof navigator !== "undefined" &&
    Array.from(navigator.getGamepads?.() ?? []).some(Boolean)
      ? "gamepad"
      : "keyboard",
  )

  useEffect(() => {
    const onKey = () => setDevice("keyboard")
    window.addEventListener("keydown", onKey)
    let raf = 0
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? []
      for (const p of pads) {
        if (!p) continue
        if (p.buttons.some((b) => b.pressed)) setDevice("gamepad")
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener("keydown", onKey)
      cancelAnimationFrame(raf)
    }
  }, [])

  return device
}

export function ControlsGuide({ className = "" }: { className?: string }) {
  const auto = useInputDevice()
  const [pick, setPick] = useState<Device | null>(null)
  const device = pick ?? auto
  const groups = device === "keyboard" ? KEYBOARD : GAMEPAD

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Controller type"
        className="mb-4 flex gap-[3px]"
      >
        {(["keyboard", "gamepad"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={device === d}
            onClick={() => setPick(d)}
            className={`px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] outline-none transition-colors focus-visible:bg-[#efefef] focus-visible:text-[#0a0a0a] ${
              device === d
                ? "bg-[#51a7d5] text-[#0a0a0a]"
                : "bg-[#0a0a0a] text-[#efefef]/70 hover:bg-[#efefef] hover:text-[#0a0a0a]"
            }`}
          >
            {d === "keyboard" ? "Keyboard" : "Gamepad"}
          </button>
        ))}
      </div>

      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em] text-[#51a7d5]">
              {g.title}
            </h3>
            <dl>
              {g.rows.map((r) => (
                <div
                  key={r.action}
                  className="flex items-baseline justify-between gap-4 border-b border-[#efefef]/10 py-2"
                >
                  <dt className="text-[14px] text-[#efefef]/80">{r.action}</dt>
                  <dd className="shrink-0 whitespace-pre border border-[#efefef]/30 px-2 py-0.5 text-[12px] font-bold tracking-wider text-[#efefef]">
                    {r.keys}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
