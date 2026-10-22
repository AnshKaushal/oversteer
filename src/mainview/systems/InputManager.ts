function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = (t.tagName || "").toUpperCase()
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (t.isContentEditable) return true
  return false
}

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
  resetPressed: boolean
  toggleCameraPressed: boolean
  startPressed: boolean
  pausePressed: boolean
  cruiseSetPressed: boolean
  cruiseUpPressed: boolean
  cruiseTogglePressed: boolean
  toggleTimeOfDayPressed: boolean
  toggleHeadlightsPressed: boolean
}

export class InputManager {
  private keys = new Set<string>()
  private edgeQueue = new Set<string>()

  throttle = 0
  brake = 0
  steer = 0

  // Cruise control hold-repeat: first extra tap after ~350ms, then every 150ms.
  private ccHold = new Map<string, number>()
  private ccRepeat = new Map<string, number>()

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown)
    window.addEventListener("keyup", this.onKeyUp)
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown)
    window.removeEventListener("keyup", this.onKeyUp)
  }

  private normalize(e: KeyboardEvent): string {
    return e.code
  }

  private onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e)) return
    const c = this.normalize(e)
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
      c === "BracketLeft" ||
      c === "BracketRight" ||
      c === "Semicolon" ||
      c === "Escape"
    ) {
      e.preventDefault()
    }
    if (!e.repeat) this.edgeQueue.add(c)
    this.keys.add(c)
  }

  private onKeyUp(e: KeyboardEvent) {
    if (isTypingTarget(e)) return
    this.keys.delete(this.normalize(e))
    this.ccHold.delete(this.normalize(e))
    this.ccRepeat.delete(this.normalize(e))
  }

  clear() {
    this.keys.clear()
    this.edgeQueue.clear()
    this.throttle = 0
    this.brake = 0
    this.steer = 0
    this.ccHold.clear()
    this.ccRepeat.clear()
  }

  update(dt: number): DriveInput {
    const k = this.keys
    const has = (c: string) => k.has(c)

    const throttleTarget = has("KeyW") || has("ArrowUp") ? 1 : 0
    const brakeTarget = has("KeyS") || has("ArrowDown") ? 1 : 0
    const steerTarget =
      (has("KeyA") || has("ArrowLeft") ? 1 : 0) -
      (has("KeyD") || has("ArrowRight") ? 1 : 0)

    // BeamNG-style keyboard temporal slew rate filtering (inRate / outRate)
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
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      handbrake: has("Space"),
      upshiftPressed: edge("KeyE"),
      downshiftPressed: edge("KeyQ"),
      toggleModePressed: edge("KeyM"),
      toggleLaunchPressed: edge("KeyL"),
      toggleParkPressed: edge("Space"),
      resetPressed: edge("KeyR"),
      toggleCameraPressed: edge("KeyC"),
      startPressed: edge("Enter"),
      pausePressed: edge("KeyP") || edge("Escape"),
      cruiseSetPressed: edge("BracketLeft") || ccRepeatEdge("BracketLeft"),
      cruiseUpPressed: edge("BracketRight") || ccRepeatEdge("BracketRight"),
      cruiseTogglePressed: edge("Semicolon"),
      toggleTimeOfDayPressed: edge("KeyT"),
      toggleHeadlightsPressed: edge("KeyH"),
    }

    this.edgeQueue.clear()
    return out
  }
}
