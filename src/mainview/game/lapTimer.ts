import type { LapSnapshot } from "../ui/LapHud"

/** Minimal circuit shape the lap timer needs. */
interface LapCircuit {
  lengthM: number
  progressAt(x: number, z: number): number
}

/** Counts laps, current/last/best lap time and pushes a throttled HUD snapshot. */
export class LapTimer {
  private prevS: number
  private clock = 0
  private startClock: number | null = null
  private lapsDone = 0
  private lastLapT: number | null = null
  private bestLapT: number | null = null
  private hudAcc = 1

  constructor(
    private circuit: LapCircuit,
    startX: number,
    startZ: number,
    private setLap: (s: LapSnapshot | null) => void,
  ) {
    this.prevS = circuit.progressAt(startX, startZ)
    setLap(null)
  }

  /** Car was reset: the current lap no longer counts. */
  cancelLap() {
    this.startClock = null
  }

  /** Call every frame with the car position; `running` is false while paused / not started. */
  update(dt: number, x: number, z: number, running: boolean) {
    const L = this.circuit.lengthM
    const prog = this.circuit.progressAt(x, z)
    if (running) {
      this.clock += dt
      if (this.prevS > L * 0.75 && prog < L * 0.25) {
        if (this.startClock !== null) {
          const t = this.clock - this.startClock
          this.lastLapT = t
          this.bestLapT =
            this.bestLapT === null ? t : Math.min(this.bestLapT, t)
          this.lapsDone++
        }
        this.startClock = this.clock
      } else if (this.prevS < L * 0.25 && prog > L * 0.75) {
        this.startClock = null
      }
      this.hudAcc += dt
      if (this.hudAcc >= 0.1) {
        this.hudAcc = 0
        this.setLap({
          lap: this.lapsDone + 1,
          running: this.startClock !== null,
          currentS: this.startClock === null ? 0 : this.clock - this.startClock,
          lastS: this.lastLapT,
          bestS: this.bestLapT,
          progress: prog / L,
          lengthM: L,
        })
      }
    }
    this.prevS = prog
  }
}
