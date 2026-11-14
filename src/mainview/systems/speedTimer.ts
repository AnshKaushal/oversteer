import { createStore } from "./liveStore"

export interface SpeedRun {
  from: number
  to: number
}

export const DEFAULT_SPEED_RUNS: SpeedRun[] = [
  { from: 0, to: 100 },
  { from: 100, to: 200 },
  { from: 100, to: 0 },
]

export interface RunView {
  from: number
  to: number
  state: "idle" | "armed" | "running" | "done"
  /** Live elapsed while running, final time when done (seconds). */
  time: number | null
  best: number | null
}

interface RunState extends RunView {
  t0: number
  /** Runs from 0: when the car last left (near-)standstill. */
  leftAt: number
}

const ARM_EPS = 1 // km/h treated as "standing still" for runs from 0
const LAUNCH_KMH = 3 // a run from 0 only starts once the car is really moving

/**
 * Times speed gates (0-100, 100-200, 100-0...) from the speed the car reports
 * each frame. Gate crossings are interpolated between frames, so results do
 * not depend on the frame rate. All runs are tracked at once, so one pull
 * gives 0-100 and 100-200 together.
 */
export class SpeedTimer {
  readonly store = createStore<RunView[]>([])
  private runs: RunState[] = []
  private key = ""
  private clock = 0
  private prev = 0
  private bests = new Map<string, number>()
  private lastPush = 0

  configure(all: SpeedRun[]) {
    const runs = all.filter((r) => r.from !== r.to)
    const key = JSON.stringify(runs)
    if (key === this.key) return
    this.key = key
    this.runs = runs.map((r) => ({
      ...r,
      state: "idle",
      time: null,
      best: this.bests.get(`${r.from}-${r.to}`) ?? null,
      t0: 0,
      leftAt: 0,
    }))
    this.push(true)
  }

  reset() {
    for (const r of this.runs) {
      r.state = "idle"
      r.time = null
    }
    this.prev = 0
    this.push(true)
  }

  update(speedKmh: number, dt: number) {
    const v = Math.abs(speedKmh)
    const t0 = this.clock
    this.clock += dt
    const v0 = this.prev
    this.prev = v
    for (const r of this.runs) {
      const up = r.to > r.from
      // Time at which the speed crossed `g` during this frame.
      const cross = (g: number) =>
        v === v0 ? this.clock : t0 + (dt * (g - v0)) / (v - v0)
      const atStart = up
        ? r.from === 0
          ? v < ARM_EPS
          : v <= r.from
        : v >= r.from
      const fromRest = up && r.from === 0
      // Jitter around standstill must not start (or flicker) a run from 0.
      if (fromRest && v >= ARM_EPS && v0 < ARM_EPS)
        // Extrapolate the crossing back to true zero speed along this
        // frame's slope, so the 1 km/h "rest" band is not timed away.
        r.leftAt = cross(ARM_EPS) - (ARM_EPS * dt) / (v - v0)
      const pastStart = fromRest ? v > LAUNCH_KMH : up ? v > r.from : v < r.from
      if (r.state === "done" || r.state === "idle") {
        if (atStart) r.state = "armed"
      }
      if (r.state === "armed" && pastStart) {
        r.state = "running"
        r.t0 = fromRest
          ? Math.min(r.leftAt, this.clock)
          : Math.max(t0, Math.min(this.clock, cross(r.from)))
        r.time = this.clock - r.t0
      }
      if (r.state === "running") {
        const finished = up ? v >= r.to : v <= r.to
        const aborted = up
          ? fromRest ? v < ARM_EPS : v < r.from
          : v > r.from
        if (finished) {
          const time = Math.max(0, cross(r.to) - r.t0)
          r.time = time
          r.state = "done"
          const k = `${r.from}-${r.to}`
          const b = this.bests.get(k)
          if (b === undefined || time < b) this.bests.set(k, time)
          r.best = this.bests.get(k) ?? null
          this.push(true)
        } else if (aborted) {
          r.state = atStart ? "armed" : "idle"
          r.time = null
        } else {
          r.time = this.clock - r.t0
        }
      }
    }
    this.push(false)
  }

  private push(force: boolean) {
    if (!force && this.clock - this.lastPush < 0.05) return
    this.lastPush = this.clock
    this.store.set(
      this.runs.map(({ from, to, state, time, best }) => ({
        from,
        to,
        state,
        time,
        best,
      })),
    )
  }
}

export const speedTimer = new SpeedTimer()
