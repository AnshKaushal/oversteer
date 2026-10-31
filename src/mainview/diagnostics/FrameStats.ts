/**
 * Rolling frame counters for the measurement overlay: rendered frames per
 * second, physics steps per second, and the wall time physics took.
 */
export class FrameStats {
  fps = 0
  stepsPerSec = 0
  stepMs = 0
  frameMs = 0
  maxFrameMs = 0
  dropped = 0
  private frames = 0
  private steps = 0
  private stepTimeMs = 0
  private maxMs = 0
  private since = 0
  private readonly windowMs: number

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  frame(now: number, frameDtMs: number, steps: number, stepTimeMs: number) {
    if (this.since === 0) this.since = now
    this.frames++
    this.steps += steps
    this.stepTimeMs += stepTimeMs
    if (frameDtMs > this.maxMs) this.maxMs = frameDtMs
    const span = now - this.since
    if (span >= this.windowMs) {
      this.fps = (this.frames * 1000) / span
      this.stepsPerSec = (this.steps * 1000) / span
      this.stepMs = this.steps > 0 ? this.stepTimeMs / this.steps : 0
      this.frameMs = span / this.frames
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
      `${this.fps.toFixed(0)} fps (${this.frameMs.toFixed(1)} ms, max ${this.maxFrameMs.toFixed(1)})\n` +
      `${this.stepsPerSec.toFixed(0)} steps/s, ${this.stepMs.toFixed(3)} ms/step\n` +
      `dropped ${this.dropped.toFixed(3)} s`
    )
  }
}
