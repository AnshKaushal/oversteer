/**
 * Gamepad input tests: deadzones, analog triggers, edges, handbrake tap/hold and
 * keyboard merging, against a fake navigator.getGamepads.
 *
 * Run: `bun scripts/gamepad-test.ts` (exit 1 on any failure).
 */
import { InputManager } from "../src/mainview/systems/InputManager"

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok - ${name}`)
  else {
    failures++
    console.log(`FAIL - ${name}`, extra ?? "")
  }
}

const buttons = (over: Record<number, number> = {}) =>
  Array.from({ length: 17 }, (_, i) => ({
    pressed: (over[i] ?? 0) > 0.5,
    touched: false,
    value: over[i] ?? 0,
  }))

let pad: any = null
const setPad = (axes: number[], over: Record<number, number> = {}) => {
  announce(true)
  pad = { connected: true, mapping: "standard", axes, buttons: buttons(over) }
}
;(globalThis as any).navigator = { getGamepads: () => [pad] }
const handlers: Record<string, (() => void)[]> = {}
;(globalThis as any).window ??= {
  addEventListener(name: string, fn: () => void) {
    ;(handlers[name] ??= []).push(fn)
  },
  removeEventListener() {},
}
// the browser announces a pad before it can be polled; nothing is polled until then
let announced = false
const announce = (on: boolean) => {
  if (on === announced) return
  announced = on
  for (const fn of handlers[on ? "gamepadconnected" : "gamepaddisconnected"] ??
    [])
    fn()
}

const im = new InputManager()
const DT = 1 / 60

setPad([0, 0])
let o = im.update(DT)
check(
  "idle pad gives no input",
  o.throttle === 0 && o.brake === 0 && o.steer === 0,
)

setPad([0.05, 0])
check("stick inside the deadzone is ignored", im.update(DT).steer === 0)

setPad([-1, 0])
check("stick full left is steer +1", Math.abs(im.update(DT).steer - 1) < 1e-6)
setPad([1, 0])
check("stick full right is steer -1", Math.abs(im.update(DT).steer + 1) < 1e-6)

setPad([-0.5, 0])
const half = im.update(DT).steer
check("steering curve softens the centre", half > 0 && half < 0.35, half)

{
  const a = new InputManager()
  setPad([0, 0], { 7: 0.5 })
  let r = a.update(DT)
  check(
    "analog trigger passes through",
    r.throttle > 0.4 && r.throttle < 0.6,
    r.throttle,
  )
  setPad([0, 0], { 7: 1 })
  r = a.update(DT)
  check(
    "an analog trigger is not eased once it has shown in-between values",
    r.throttle > 0.99,
    r.throttle,
  )

  const d = new InputManager()
  setPad([0, 0], { 7: 1 })
  r = d.update(DT)
  check(
    "an on/off trigger ramps instead of jumping",
    r.throttle > 0 && r.throttle < 0.2,
    r.throttle,
  )
  for (let i = 0; i < 30; i++) r = d.update(DT)
  check("and still reaches full", r.throttle > 0.99, r.throttle)
  setPad([0, 0], {})
  r = d.update(DT)
  check("and lets off quickly", r.throttle < 1 && r.throttle > 0.5, r.throttle)
}
setPad([0, 0], { 6: 1 })
o = im.update(DT)
check("brake trigger", o.brake > 0 && o.brake <= 1)

setPad([0, 0], {})
im.update(DT)
setPad([0, 0], { 5: 1 })
check("RB is an upshift edge", im.update(DT).upshiftPressed)
check("a held RB fires once", !im.update(DT).upshiftPressed)
setPad([0, 0], { 4: 1 })
check("LB is a downshift edge", im.update(DT).downshiftPressed)

setPad([0, 0], { 1: 1 })
o = im.update(DT)
check("B holds the handbrake", o.handbrake)
setPad([0, 0], {})
o = im.update(DT)
check(
  "a quick tap of B latches the handbrake",
  o.toggleHandbrakePressed && !o.handbrake,
)

setPad([0, 0], { 8: 1, 9: 1 })
o = im.update(DT)
check("Back resets and Start pauses", o.resetPressed && o.pausePressed)

setPad([0, 0], { 7: 1 })
pad.mapping = ""
check("a non-standard pad is ignored", im.update(DT).throttle === 0)

setPad([0, 0, 1, -1])
im.update(DT)
check(
  "camera stick eases in instead of jumping",
  im.lookX > 0 && im.lookX < 0.4,
  im.lookX,
)
for (let i = 0; i < 90; i++) im.update(DT)
check(
  "right stick right looks right, up looks up",
  im.lookX > 0.99 && im.lookY < -0.99,
  [im.lookX, im.lookY],
)
setPad([0, 0, 0.05, 0])
for (let i = 0; i < 180; i++) im.update(DT)
check(
  "right stick deadzone, and it eases back to zero",
  im.lookX === 0 && im.lookY === 0,
  [im.lookX, im.lookY],
)
check("pad connected flag", im.padConnected)

setPad([0, 0], { 11: 1 })
im.update(DT)
check(
  "R3 asks for a camera reset once",
  im.lookReset && !im.update(DT).toggleLaunchPressed && !im.lookReset,
)

setPad([0, 0], {})
im.update(DT)
setPad([0, 0], { 12: 1, 13: 1, 14: 1, 15: 1 })
o = im.update(DT)
check(
  "D-pad: up mode, down engine, left traction, right stability",
  o.toggleModePressed &&
    o.toggleIgnitionPressed &&
    o.toggleTractionPressed &&
    o.toggleStabilityPressed,
)
check(
  "D-pad does not toggle ABS or the safety group",
  !o.toggleAbsPressed && !o.toggleSafetyPressed,
)

const events: [boolean, string][] = []
const im2 = new InputManager()
im2.onPadChange = (c, n) => events.push([c, n])
pad = null
announce(false)
im2.update(DT)
setPad([0, 0])
pad.id =
  "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"
im2.update(DT)
im2.update(DT)
pad = null
announce(false)
im2.update(DT)
check(
  "connect and disconnect each notify once, with a short name",
  events.length === 2 &&
    events[0][0] &&
    events[0][1] === "Xbox Wireless Controller" &&
    !events[1][0],
  events,
)

pad = null
announce(false)
check("unplugging stops input", im.update(DT).throttle === 0)

console.log(failures ? `${failures} failed` : "all passed")
process.exit(failures ? 1 : 0)
