/** Standard-mapping button indices (Xbox layout; PlayStation pads report the same slots). */
const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const

const STICK_DEADZONE = 0.12
const TRIGGER_DEADZONE = 0.05
/** Steering response exponent: above 1 softens the centre of the stick for fine corrections. */
const STEER_EXPO = 1.5

/** Edge code for "put the camera back behind the car"; not a keyboard key. */
export const LOOK_RESET = "PadLookReset"

/** A button press that maps to the same edge code the keyboard uses. */
const EDGES: [number, string][] = [
  [BTN.a, "Enter"],
  [BTN.x, "KeyH"],
  [BTN.y, "KeyC"],
  [BTN.lb, "KeyQ"],
  [BTN.rb, "KeyE"],
  [BTN.back, "KeyR"],
  [BTN.start, "KeyP"],
  [BTN.l3, "KeyL"],
  [BTN.up, "KeyM"],
  [BTN.down, "KeyV"],
  [BTN.left, "KeyX"],
  [BTN.right, "KeyG"],
  [BTN.r3, LOOK_RESET],
]

export interface PadState {
  throttle: number
  brake: number
  /** Positive steers left, as in `DriveInput`. */
  steer: number
  handbrakeHeld: boolean
  /** Right stick, camera orbit: x positive looks right, y positive looks down (mouse-drag convention). */
  lookX: number
  lookY: number
  /** Edge codes pressed since the previous poll. */
  edges: string[]
  /** The handbrake button went down (true) or up (false) this poll. */
  handbrakeEdge: "down" | "up" | null
}

function stick(v: number): number {
  const a = Math.abs(v)
  if (a <= STICK_DEADZONE) return 0
  const n = (a - STICK_DEADZONE) / (1 - STICK_DEADZONE)
  return Math.sign(v) * Math.pow(n, STEER_EXPO)
}

/** Trigger rise and fall rates (1/s) used while a trigger only reports 0 or 1. */
const DIGITAL_TRIGGER_RISE = 4
const DIGITAL_TRIGGER_FALL = 9

function trigger(b: GamepadButton | undefined): number {
  const v = b?.value ?? (b?.pressed ? 1 : 0)
  if (v <= TRIGGER_DEADZONE) return 0
  return Math.min(1, (v - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE))
}

/**
 * Some macOS web views report pressure-sensitive triggers as plain on/off. A trigger that has never
 * shown an in-between value is treated as digital and eased like a key, so it ramps instead of
 * jumping; one that does report analog values is passed through untouched.
 */
class TriggerChannel {
  private analogSeen = false
  private out = 0

  read(b: GamepadButton | undefined, dt: number): number {
    const raw = trigger(b)
    if (raw > 0.03 && raw < 0.97) this.analogSeen = true
    if (this.analogSeen) {
      this.out = raw
      return raw
    }
    const rate = raw > this.out ? DIGITAL_TRIGGER_RISE : DIGITAL_TRIGGER_FALL
    this.out += Math.sign(raw - this.out) * Math.min(Math.abs(raw - this.out), rate * dt)
    return this.out
  }

  reset() {
    this.out = 0
  }
}

export class GamepadInput {
  private prev = new Map<number, boolean>()
  private prevHandbrake = false
  private readonly rt = new TriggerChannel()
  private readonly lt = new TriggerChannel()
  /** Pads the browser has announced. While zero, nothing is polled at all. */
  private announced = 0

  constructor() {
    if (typeof window === "undefined") return
    // a pad that was already plugged in when the game started
    if (typeof navigator !== "undefined" && navigator.getGamepads?.().some((p) => p)) this.announced = 1
    window.addEventListener("gamepadconnected", () => this.announced++)
    window.addEventListener("gamepaddisconnected", () => {
      this.announced = Math.max(0, this.announced - 1)
    })
  }

  /** The first connected standard-mapping pad, or null. */
  private active(): Gamepad | null {
    if (this.announced === 0) return null
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null
    for (const p of navigator.getGamepads()) {
      if (p && p.connected && p.mapping === "standard") return p
    }
    return null
  }

  /** Short display name of the active pad, e.g. "Xbox Wireless Controller". */
  get name(): string {
    const id = this.active()?.id ?? ""
    return id.replace(/\s*\(.*$/, "").trim() || "Controller"
  }

  poll(dt = 1 / 60): PadState | null {
    const pad = this.active()
    if (!pad) {
      this.prev.clear()
      this.prevHandbrake = false
      this.rt.reset()
      this.lt.reset()
      return null
    }
    const down = (i: number) => !!pad.buttons[i]?.pressed

    const edges: string[] = []
    for (const [i, code] of EDGES) {
      const now = down(i)
      if (now && !this.prev.get(i)) edges.push(code)
      this.prev.set(i, now)
    }

    const hb = down(BTN.b)
    const handbrakeEdge = hb !== this.prevHandbrake ? (hb ? "down" : "up") : null
    this.prevHandbrake = hb

    return {
      throttle: this.rt.read(pad.buttons[BTN.rt], dt),
      brake: this.lt.read(pad.buttons[BTN.lt], dt),
      steer: -stick(pad.axes[0] ?? 0),
      lookX: stick(pad.axes[2] ?? 0),
      lookY: stick(pad.axes[3] ?? 0),
      handbrakeHeld: hb,
      edges,
      handbrakeEdge,
    }
  }
}
