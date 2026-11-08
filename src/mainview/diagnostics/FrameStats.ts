export class FrameStats {
  fps = 0
  stepsPerSec = 0
  stepMs = 0
  frameMs = 0
  maxFrameMs = 0
  dropped = 0
  low1 = 0
  readonly history = new Float32Array(120)
  private histIdx = 0
  private frames = 0
  private steps = 0
  private stepTimeMs = 0
  private maxMs = 0
  private since = 0
  private readonly windowMs: number
  windowTick = false

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  frame(now: number, frameDtMs: number, steps: number, stepTimeMs: number) {
    this.windowTick = false
    if (this.since === 0) this.since = now
    this.frames++
    this.history[this.histIdx] = frameDtMs
    this.histIdx = (this.histIdx + 1) % this.history.length
    this.steps += steps
    this.stepTimeMs += stepTimeMs
    if (frameDtMs > this.maxMs) this.maxMs = frameDtMs
    const span = now - this.since
    if (span >= this.windowMs) {
      this.fps = (this.frames * 1000) / span
      this.stepsPerSec = (this.steps * 1000) / span
      this.stepMs = this.steps > 0 ? this.stepTimeMs / this.steps : 0
      this.frameMs = span / this.frames
      const sorted = Array.from(this.history)
        .filter((v) => v > 0)
        .sort((a, b) => b - a)
      const worst = sorted[Math.floor(sorted.length * 0.01)] ?? 0
      this.low1 = worst > 0 ? 1000 / worst : 0
      this.windowTick = true
      this.maxFrameMs = this.maxMs
      this.frames = 0
      this.steps = 0
      this.stepTimeMs = 0
      this.maxMs = 0
      this.since = now
    }
  }

  text(): string {
    return (
      `${this.fps.toFixed(0)} fps (${this.frameMs.toFixed(1)} ms, max ${this.maxFrameMs.toFixed(1)}), 1% low ${this.low1.toFixed(0)} fps\n` +
      `${this.stepsPerSec.toFixed(0)} steps/s, ${this.stepMs.toFixed(3)} ms/step\n` +
      `dropped ${this.dropped.toFixed(3)} s`
    )
  }
}

export function drawFrameGraph(canvas: HTMLCanvasElement, stats: FrameStats) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const maxMs = 50
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = "rgba(255,255,255,.2)"
  for (const g of [16.7, 33.3]) {
    const y = h - (g / maxMs) * h
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  const n = stats.history.length
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const ms = stats.history[i]
    const bh = Math.min(1, ms / maxMs) * h
    ctx.fillStyle = ms > 33.3 ? "#f55" : ms > 18 ? "#fb4" : "#5d8"
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh)
  }
}
