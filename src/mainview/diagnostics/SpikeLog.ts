import { sendPerfLog } from "../systems/updater"

const THRESHOLD_MS = 26
const MAX_PER_SEC = 4

class SpikeLog {
  enabled = false
  private phases: [string, number][] = []
  private events: string[] = []
  private last = 0
  private budgetAt = 0
  private budget = MAX_PER_SEC
  private spikes = 0

  begin(dtMs: number, extra: () => string) {
    const now = performance.now()
    if (this.enabled && dtMs > THRESHOLD_MS && this.phases.length) {
      if (now - this.budgetAt > 1000) {
        this.budgetAt = now
        this.budget = MAX_PER_SEC
      }
      if (this.budget-- > 0) {
        let sum = 0
        const parts = this.phases.map(([n, ms]) => {
          sum += ms
          return `${n}=${ms.toFixed(1)}`
        })
        const gap = dtMs - sum
        const ev = this.events.length
          ? ` events=[${this.events.join("; ")}]`
          : ""
        const line = `[spike #${++this.spikes}] frame=${dtMs.toFixed(1)}ms js=${sum.toFixed(1)} outside-js=${gap.toFixed(1)} | ${parts.join(" ")}${ev} | ${extra()}`
        console.warn(line)
        sendPerfLog(line)
      }
    }
    this.phases.length = 0
    this.events.length = 0
    this.last = now
  }

  ph(name: string) {
    const now = performance.now()
    this.phases.push([name, now - this.last])
    this.last = now
  }

  event(name: string) {
    if (this.events.length < 8) this.events.push(name)
  }
}

export const spike = new SpikeLog()
