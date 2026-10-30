import * as THREE from "three"

/**
 * Central audio system for Oversteer.
 *
 * Architecture:
 * - One THREE.AudioListener attached to the (recreated per session) camera.
 *   Its AudioContext starts suspended; calls `unlock()` from the first user
 *   gesture (see App.tsx).
 * - Loop layers: engine (dual detuned copies of one sample for a "big engine"
 *   feel), tire skid, road/wind, ambience.
 * - One-shots: UI click, gear shift dirt, impact, wipe whoosh — round-robin
 *   pooled THREE.Audio instances.
 * - Positional engine per AI/remote car via THREE.PositionalAudio parented to
 *   the car's visual group, so pan + distance attenuation come for free.
 *
 * All buffers live in src/mainview/public/sounds/ and load relative to
 * document base — see SOUNDS_CREDITS.md for the placeholder sources.
 */

const SOUND_URLS = {
  engine: "sounds/engine_loop.m4a",
  road: "sounds/road_loop.m4a",
  skid: "sounds/skid.m4a",
  ambient: "sounds/ambience.m4a",
  click: "sounds/click.m4a",
  shift: "sounds/gear_shift.m4a",
  impact: "sounds/impact.m4a",
  whoosh: "sounds/whoosh.m4a",
} as const

export interface FrameAudio {
  started: boolean
  paused: boolean
  /** Player telemetry; both optional (defaults = parked idle). */
  rpm?: number
  idleRpm?: number
  redlineRpm?: number
  throttle?: number
  kmh?: number
  /** Tire squeal intensity 0..1 (same formula as tire smoke). */
  skid?: number
}

/** Controls a single car's positional engine sound. */
export interface CarEngineSound {
  /** Absolute rpm (idle→redline range was given at creation), distVol 0..1. */
  update(rpm: number, distVol?: number): void
  dispose(): void
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

// Smooth parameter changes toward targets so volume jumps never click.
export class AudioEngine {
  listener = new THREE.AudioListener()
  private loader = new THREE.AudioLoader()
  private loaded = false
  private loadPromise: Promise<void> | null = null
  private baseUrl = ""

  private loops: Partial<Record<keyof typeof SOUND_URLS, THREE.Audio>> = {}
  private pools = new Map<keyof typeof SOUND_URLS, THREE.Audio[]>()
  private carEngines = new Set<CarEngineSoundImpl>()

  private master = 1
  private pauseDuck = 1
  private targets = {
    engine: 0,
    engineRate: 0.55,
    skid: 0,
    road: 0,
    ambient: 0,
  }
  private lastImpact = 0
  private poolIdx = 0

  constructor() {
    // Load relative to the app base so dev/build behave the same.
    const base = import.meta.env.BASE_URL || "./"
    this.baseUrl = base.endsWith("/") ? base : base + "/"
  }

  /** Resume the context after a user gesture (autoplay policy). */
  unlock() {
    if (this.listener.context.state === "suspended") {
      this.listener.context.resume().catch(() => {})
    }
  }

  setVolume(v: number) {
    this.master = clamp(v, 0, 1)
    this.listener.setMasterVolume(this.master)
  }

  /** Fetch + decode every sound and create loop/one-shot nodes. */
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = (async () => {
      const entries = Object.entries(SOUND_URLS) as [
        keyof typeof SOUND_URLS,
        string,
      ][]
      const buffers = new Map<keyof typeof SOUND_URLS, AudioBuffer>()
      await Promise.all(
        entries.map(async ([name, url]) => {
          try {
            buffers.set(name, await this.loader.loadAsync(this.baseUrl + url))
          } catch (e) {
            console.warn(`[audio] failed to load ${url}`, e)
          }
        }),
      )
      // Loops (must outlive sessions — created once)
      for (const name of ["engine", "road", "skid", "ambient"] as const) {
        const audio = new THREE.Audio(this.listener)
        const buf = buffers.get(name)
        if (!buf) continue
        audio.setBuffer(buf)
        audio.setLoop(true)
        this.loops[name] = audio
      }
      // One-shot pools (round-robin so overlapping hits don't cut each other)
      for (const name of ["click", "shift", "impact", "whoosh"] as const) {
        const buf = buffers.get(name)
        if (!buf) continue
        const pool: THREE.Audio[] = []
        const size = name === "impact" ? 6 : 3
        for (let i = 0; i < size; i++) {
          const audio = new THREE.Audio(this.listener)
          audio.setBuffer(buf)
          pool.push(audio)
        }
        this.pools.set(name, pool)
      }
      this.loaded = true
    })()
    return this.loadPromise
  }

  /** Stop everything session-bound (called when App rebuilds the world). */
  resetSession() {
    for (const engine of Array.from(this.carEngines)) engine.dispose()
    for (const name of ["skid", "road"] as const) {
      this.loops[name]?.stop()
    }
  }

  private playOneShot(name: keyof typeof SOUND_URLS, vol: number, rate = 1) {
    if (!this.loaded || vol <= 0.001) return
    const pool = this.pools.get(name)
    if (!pool || pool.length === 0) return
    const audio = pool[this.poolIdx++ % pool.length]
    audio.stop()
    audio.setVolume(vol)
    audio.setPlaybackRate(rate)
    try {
      audio.play()
    } catch {}
  }

  uiClick() {
    this.playOneShot("click", 0.5, 0.94 + Math.random() * 0.12)
  }
  uiWhoosh(big = false) {
    this.playOneShot("whoosh", big ? 0.55 : 0.35, big ? 0.9 : 1.1)
  }
  shiftBlip() {
    this.playOneShot("shift", 0.45, 0.95 + Math.random() * 0.1)
  }
  impactHit(strength: number, rate?: number) {
    const now = performance.now()
    if (now - this.lastImpact < 140) return
    this.lastImpact = now
    const vol = 0.25 + clamp(strength, 0, 1) * 0.75
    const r = rate ?? 0.85 + Math.random() * 0.3
    this.playOneShot("impact", vol, r)
  }

  /**
   * Attach a pitch-shiftable engine to a car's visual group. Uses the same
   * engine sample; two slightly detuned layers give it body.
   */
  addCarEngine(
    group: THREE.Object3D,
    idleRpm = 800,
    redlineRpm = 7500,
  ): CarEngineSound | null {
    if (!this.loaded) return null
    const buf = this.loops.engine?.buffer
    if (!buf) return null
    const impl = new CarEngineSoundImpl(this.listener, buf, idleRpm, redlineRpm)
    this.carEngines.add(impl)
    group.add(impl.audio)
    return impl
  }

  /** Per-frame driver for player loops + ambience + pause ducking. */
  update(dt: number, frame: FrameAudio) {
    this.pauseDuck += ((frame.paused ? 0.3 : 1) - this.pauseDuck) * Math.min(1, dt * 6)

    const engine = this.loops.engine
    const skid = this.loops.skid
    const road = this.loops.road
    const ambient = this.loops.ambient
    if (!engine || !skid || !road || !ambient) return

    const idle = frame.idleRpm ?? 800
    const redline = frame.redlineRpm ?? 7500
    const rpm = clamp(frame.rpm ?? idle, 0, redline)
    const norm = clamp((rpm - idle) / Math.max(1, redline - idle), 0, 1)
    const throttle = frame.throttle ?? 0

    // Engine doppler replay: rate maps idle→redline; half a detuned octave of
    // body from the second layer at a slightly faster rate.
    const rate = 0.55 + norm * 1.75
    const targetEngine = frame.started
      ? (0.34 + throttle * 0.32 + norm * 0.3) * this.pauseDuck
      : 0.14 * this.pauseDuck // garage/menu idle hum

    if (frame.started && !frame.paused) {
      if (!engine.isPlaying) engine.play()
      if (!road.isPlaying) road.play()
      if (!ambient.isPlaying) ambient.play()
    }
    // Skid only runs while squealing; ambient hums in menus too.
    if (!frame.started) {
      if (!engine.isPlaying) engine.play()
      if (!ambient.isPlaying) ambient.play()
    }

    const k = Math.min(1, dt * 5)
    this.targets.engineRate += (rate - this.targets.engineRate) * k
    engine.setPlaybackRate(this.targets.engineRate)
    this.targets.engine += (targetEngine - this.targets.engine) * Math.min(1, dt * 4)
    engine.setVolume(this.targets.engine)

    const skidVol = clamp(frame.skid ?? 0, 0, 1)
    this.targets.skid += ((skidVol > 0.26 ? (skidVol - 0.26) * 1.35 : 0) - this.targets.skid) * Math.min(1, dt * 10)
    if (this.targets.skid > 0.004) {
      if (!skid.isPlaying) skid.play()
      skid.setVolume(Math.min(0.8, this.targets.skid * 0.85) * this.pauseDuck)
      skid.setPlaybackRate(0.9 + skidVol * 0.25)
    } else if (skid.isPlaying) {
      skid.stop()
    }

    const kmh = Math.abs(frame.kmh ?? 0)
    const roadTarget = Math.pow(clamp(kmh / 240, 0, 1), 1.4) * 0.5 * this.pauseDuck
    this.targets.road += (roadTarget - this.targets.road) * Math.min(1, dt * 3)
    road.setVolume(this.targets.road)
    road.setPlaybackRate(0.8 + clamp(kmh / 180, 0, 1) * 0.5)

    const ambTarget = 0.16 * this.pauseDuck
    this.targets.ambient += (ambTarget - this.targets.ambient) * Math.min(1, dt * 2)
    ambient.setVolume(this.targets.ambient)
  }
}

class CarEngineSoundImpl implements CarEngineSound {
  audio: THREE.PositionalAudio
  private shadow: THREE.PositionalAudio
  private idleRpm: number
  private redlineRpm: number
  private disposed = false

  constructor(
    listener: THREE.AudioListener,
    buffer: AudioBuffer,
    idleRpm: number,
    redlineRpm: number,
  ) {
    this.idleRpm = idleRpm
    this.redlineRpm = redlineRpm
    this.audio = new THREE.PositionalAudio(listener)
    this.shadow = new THREE.PositionalAudio(listener)
    for (const a of [this.audio, this.shadow]) {
      a.setBuffer(buffer)
      a.setLoop(true)
      a.setRefDistance(7)
      a.setRolloffFactor(1.6)
      a.setDistanceModel("exponential")
      a.setMaxDistance(260)
    }
  }

  update(rpm: number, distVol = 1) {
    if (this.disposed || this.audio.parent === null) return
    const norm = clamp(
      (rpm - this.idleRpm) / Math.max(1, this.redlineRpm - this.idleRpm),
      0,
      1,
    )
    const rate = 0.55 + norm * 1.75
    const vol = clamp(0.35 + norm * 0.5, 0, 1) * clamp(distVol, 0, 1)
    if (vol <= 0.002) {
      if (this.audio.isPlaying) this.audio.stop()
      if (this.shadow.isPlaying) this.shadow.stop()
      return
    }
    if (!this.audio.isPlaying) {
      this.audio.play()
      // Half-period offset so the two layers don't phase-cancel.
      this.shadow.play()
      this.shadow.setPlaybackRate(1)
    }
    this.audio.setPlaybackRate(rate)
    this.shadow.setPlaybackRate(rate * 1.006)
    this.audio.setVolume(vol)
    this.shadow.setVolume(vol * 0.7)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    try {
      this.audio.stop()
      this.shadow.stop()
    } catch {}
    this.audio.parent?.remove(this.audio)
    this.shadow.parent?.remove(this.shadow)
  }
}
