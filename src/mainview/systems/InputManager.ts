function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = (t.tagName || "").toUpperCase()
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (t.isContentEditable) return true
  return false
}

import { GamepadInput, LOOK_RESET } from "./gamepad"

export interface DriveInput {
  throttle: number
  brake: number
  steer: number
  handbrake: boolean
  upshiftPressed: boolean
  downshiftPressed: boolean
  toggleModePressed: boolean
  toggleLaunchPressed: boolean
  toggleParkPressed: boolean
  toggleTractionPressed: boolean
  toggleStabilityPressed: boolean
  toggleSafetyPressed: boolean
  toggleIgnitionPressed: boolean
  crankHeld?: boolean
  toggleHandbrakePressed: boolean
  toggleAbsPressed: boolean
  resetPressed: boolean
  toggleCameraPressed: boolean
  startPressed: boolean
  pausePressed: boolean
  cruiseSetPressed: boolean
  cruiseUpPressed: boolean
  cruiseTogglePressed: boolean
  toggleTimeOfDayPressed: boolean
  toggleHeadlightsPressed: boolean
  toggleFreeCameraPressed: boolean
}

const IGNITION_HOLD_MS = 450
const IGNITION_TAP = "IgnitionTap"
const HANDBRAKE_HOLD_MS = 300
const HANDBRAKE_TAP = "HandbrakeTap"
const LOOK_EASE = 9

export class InputManager {
  private keys = new Set<string>()
  private edgeQueue = new Set<string>()

  throttle = 0
  brake = 0
  steer = 0

  private spaceDownAt = 0
  private ignDownAt = -1

  private readonly pad = new GamepadInput()
  private padWasConnected = false
  onPadChange: ((connected: boolean, name: string) => void) | null = null

  lookX = 0
  lookY = 0
  lookReset = false
  padConnected = false
  private padHandbrakeDownAt = 0

  private ccHold = new Map<string, number>()
  private ccRepeat = new Map<string, number>()

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.release = this.release.bind(this)
    this.onVisibility = this.onVisibility.bind(this)
  }

  private release() {
    this.keys.clear()
    this.ccHold.clear()
    this.ccRepeat.clear()
  }

  private onVisibility() {
    if (document.visibilityState !== "visible") this.release()
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown)
    window.addEventListener("keyup", this.onKeyUp)
    window.addEventListener("blur", this.release)
    window.addEventListener("contextmenu", this.release)
    document.addEventListener("visibilitychange", this.onVisibility)
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown)
    window.removeEventListener("keyup", this.onKeyUp)
    window.removeEventListener("blur", this.release)
    window.removeEventListener("contextmenu", this.release)
    document.removeEventListener("visibilitychange", this.onVisibility)
  }

  private normalize(e: KeyboardEvent): string {
    return e.code
  }

  private onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e)) return
    const c = this.normalize(e)
    if (c.startsWith("Meta")) this.release()
    if (
      c === "Space" ||
      c.startsWith("Arrow") ||
      c === "KeyW" ||
      c === "KeyA" ||
      c === "KeyS" ||
      c === "KeyD" ||
      c === "KeyQ" ||
      c === "KeyE" ||
      c === "KeyM" ||
      c === "KeyL" ||
      c === "KeyP" ||
      c === "KeyO" ||
      c === "KeyR" ||
      c === "KeyC" ||
      c === "KeyT" ||
      c === "KeyH" ||
      c === "KeyX" ||
      c === "KeyV" ||
      c === "KeyN" ||
      c === "KeyG" ||
      c === "KeyB" ||
      c === "KeyF" ||
      c === "BracketLeft" ||
      c === "BracketRight" ||
      c === "Semicolon" ||
      c === "Escape"
    ) {
      e.preventDefault()
    }
    if (c === "Space" && !e.repeat) this.spaceDownAt = e.timeStamp
    if (!e.repeat && c !== "KeyV") this.edgeQueue.add(c)
    this.keys.add(c)
  }

  private onKeyUp(e: KeyboardEvent) {
    if (this.normalize(e) === "Space" && e.timeStamp - this.spaceDownAt <= HANDBRAKE_HOLD_MS) {
      this.edgeQueue.add(HANDBRAKE_TAP)
    }
    if (this.normalize(e).startsWith("Meta")) this.release()
    this.keys.delete(this.normalize(e))
    this.ccHold.delete(this.normalize(e))
    this.ccRepeat.delete(this.normalize(e))
  }

  requeue(out: DriveInput) {
    const edges: [boolean, string][] = [
      [out.upshiftPressed, "KeyE"],
      [out.downshiftPressed, "KeyQ"],
      [out.toggleModePressed, "KeyM"],
      [out.toggleLaunchPressed, "KeyL"],
      [out.toggleHandbrakePressed, HANDBRAKE_TAP],
      [out.toggleTractionPressed, "KeyX"],
      [out.toggleStabilityPressed, "KeyG"],
      [out.toggleIgnitionPressed, IGNITION_TAP],
      [out.toggleSafetyPressed, "KeyN"],
      [out.toggleAbsPressed, "KeyB"],
    ]
    for (const [on, code] of edges) if (on) this.edgeQueue.add(code)
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  clear() {
    this.ignDownAt = -1
    this.keys.clear()
    this.edgeQueue.clear()
    this.throttle = 0
    this.brake = 0
    this.steer = 0
    this.lookX = 0
    this.lookY = 0
    this.ccHold.clear()
    this.ccRepeat.clear()
  }

  update(dt: number): DriveInput {
    const pad = this.pad.poll(dt)
    const ease = 1 - Math.exp(-dt * LOOK_EASE)
    this.lookX += ((pad?.lookX ?? 0) - this.lookX) * ease
    this.lookY += ((pad?.lookY ?? 0) - this.lookY) * ease
    if (Math.abs(this.lookX) < 0.001) this.lookX = 0
    if (Math.abs(this.lookY) < 0.001) this.lookY = 0
    this.padConnected = !!pad
    if (!!pad !== this.padWasConnected) {
      this.padWasConnected = !!pad
      this.onPadChange?.(!!pad, this.pad.name)
    }
    if (pad) {
      for (const code of pad.edges) this.edgeQueue.add(code)
      const now = performance.now()
      if (pad.handbrakeEdge === "down") this.padHandbrakeDownAt = now
      else if (pad.handbrakeEdge === "up" && now - this.padHandbrakeDownAt <= HANDBRAKE_HOLD_MS) {
        this.edgeQueue.add(HANDBRAKE_TAP)
      }
    }

    const k = this.keys
    const has = (c: string) => k.has(c)
    const ignHeld = has("KeyV") || !!pad?.ignHeld
    if (ignHeld) {
      this.ignDownAt = this.ignDownAt < 0 ? 0 : this.ignDownAt + dt
    } else if (this.ignDownAt >= 0) {
      if (this.ignDownAt * 1000 < IGNITION_HOLD_MS) this.edgeQueue.add(IGNITION_TAP)
      this.ignDownAt = -1
    }

    const throttleTarget = has("KeyW") || has("ArrowUp") ? 1 : 0
    const brakeTarget = has("KeyS") || has("ArrowDown") ? 1 : 0
    const steerTarget =
      (has("KeyA") || has("ArrowLeft") ? 1 : 0) -
      (has("KeyD") || has("ArrowRight") ? 1 : 0)

    const throttleInRate = 3.2
    const throttleOutRate = 4.0
    const tDelta = throttleTarget - this.throttle
    const tRate = tDelta > 0 ? throttleInRate : throttleOutRate
    this.throttle += Math.sign(tDelta) * Math.min(Math.abs(tDelta), tRate * dt)

    const brakeInRate = 3.5
    const brakeOutRate = 5.0
    const bDelta = brakeTarget - this.brake
    const bRate = bDelta > 0 ? brakeInRate : brakeOutRate
    this.brake += Math.sign(bDelta) * Math.min(Math.abs(bDelta), bRate * dt)

    const steerSpeed = steerTarget !== 0 ? 4.5 : 7.0
    this.steer +=
      Math.sign(steerTarget - this.steer) *
      Math.min(Math.abs(steerTarget - this.steer), steerSpeed * dt)

    const edge = (c: string) => {
      if (this.edgeQueue.has(c)) {
        this.edgeQueue.delete(c)
        return true
      }
      return false
    }

    const ccRepeatEdge = (c: string) => {
      if (k.has(c)) {
        const hold = this.ccHold.get(c) ?? -1
        if (hold >= 0) this.ccHold.set(c, hold + dt * 1000)
        const n = this.ccRepeat.get(c) ?? 0
        if (hold > 350 && (hold - 350) >= n * 150) {
          this.ccRepeat.set(c, n + 1)
          return true
        }
      }
      return false
    }
    for (const c of ["BracketLeft", "BracketRight"]) {
      if (this.edgeQueue.has(c)) {
        this.ccHold.set(c, 0)
        this.ccRepeat.set(c, 0)
      }
    }

    const out: DriveInput = {
      throttle: Math.max(this.throttle, pad?.throttle ?? 0),
      brake: Math.max(this.brake, pad?.brake ?? 0),
      steer: Math.max(-1, Math.min(1, this.steer + (pad?.steer ?? 0))),
      handbrake: has("Space") || !!pad?.handbrakeHeld,
      upshiftPressed: edge("KeyE"),
      downshiftPressed: edge("KeyQ"),
      toggleModePressed: edge("KeyM"),
      toggleLaunchPressed: edge("KeyL"),
      toggleParkPressed: false,
      toggleHandbrakePressed: edge(HANDBRAKE_TAP),
      toggleTractionPressed: edge("KeyX"),
      toggleStabilityPressed: edge("KeyG"),
      toggleIgnitionPressed: edge(IGNITION_TAP),
      crankHeld: ignHeld && this.ignDownAt * 1000 >= IGNITION_HOLD_MS,
      toggleSafetyPressed: edge("KeyN"),
      toggleAbsPressed: edge("KeyB"),
      resetPressed: edge("KeyR"),
      toggleCameraPressed: edge("KeyC"),
      startPressed: edge("Enter"),
      pausePressed: edge("KeyP") || edge("Escape"),
      cruiseSetPressed: edge("BracketLeft") || ccRepeatEdge("BracketLeft"),
      cruiseUpPressed: edge("BracketRight") || ccRepeatEdge("BracketRight"),
      cruiseTogglePressed: edge("Semicolon"),
      toggleTimeOfDayPressed: edge("KeyT"),
      toggleHeadlightsPressed: edge("KeyH"),
      toggleFreeCameraPressed: edge("KeyF"),
    }

    this.lookReset = edge(LOOK_RESET)

    this.edgeQueue.clear()
    return out
  }
}
