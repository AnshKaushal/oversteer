import { NET } from "../../data/net"

export class NetClock {
  private deltas: number[] = []
  private offset = 0
  private ready = false
  private lastT = -Infinity
  private lastSeq = -1
  private jitter = 0
  private peak = 0
  private loss = 0
  private interval: number = 1000 / NET.sendHz
  private delay: number = NET.interp.minDelayMs
  private lastArrival = 0

  get delayMs(): number {
    return this.delay
  }
  get jitterMs(): number {
    return this.jitter
  }
  get lossRate(): number {
    return this.loss
  }
  get offsetMs(): number {
    return this.offset
  }

  reset(): void {
    this.deltas.length = 0
    this.ready = false
    this.lastT = -Infinity
    this.lastSeq = -1
    this.jitter = 0
    this.peak = 0
    this.loss = 0
  }

  observe(senderT: number, seq: number, arrivalMs: number): boolean {
    let restarted = false
    if (
      this.ready &&
      Math.abs(senderT - this.lastT) > NET.clock.resyncGapMs
    ) {
      this.reset()
      restarted = true
    }
    const gap = this.lastT === -Infinity ? 0 : senderT - this.lastT
    if (gap > 0 && gap < 200) this.interval += (gap - this.interval) * 0.05
    if (this.lastSeq >= 0 && seq > this.lastSeq) {
      const lost = seq - this.lastSeq - 1
      this.loss += ((lost > 0 ? Math.min(1, lost / (lost + 1)) : 0) - this.loss) * 0.05
    }
    this.lastSeq = seq
    this.lastT = Math.max(this.lastT, senderT)

    const d = arrivalMs - senderT
    this.deltas.push(d)
    if (this.deltas.length > NET.clock.window) this.deltas.shift()
    let min = Infinity
    for (let i = 0; i < this.deltas.length; i++) if (this.deltas[i] < min) min = this.deltas[i]
    if (!this.ready) {
      this.offset = min
      this.ready = true
    } else {
      const diff = min - this.offset
      const k = NET.clock.slewMs
      this.offset += diff > k ? k : diff < -k ? -k : diff
    }
    const queue = Math.max(0, d - this.offset)
    this.peak = Math.max(queue, this.peak * NET.clock.peakDecay)
    this.jitter += (queue - this.jitter) * (queue > this.jitter ? 0.25 : 0.04)

    const I = NET.interp
    const want = clampN(
      this.interval * (I.intervals + (this.loss > 0.01 ? I.lossIntervals : 0)) +
        Math.max(this.jitter * I.jitterGain, this.peak),
      I.minDelayMs,
      I.maxDelayMs,
    )
    const dtS = Math.max(0, Math.min(0.25, (arrivalMs - this.lastArrival) / 1000))
    this.lastArrival = arrivalMs
    const up = I.riseMsPerS * dtS
    this.delay += want > this.delay ? Math.min(up, want - this.delay) : -Math.min(up / 5, this.delay - want)
    return restarted
  }

  toLocal(senderT: number): number {
    return senderT + this.offset
  }
}

const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
