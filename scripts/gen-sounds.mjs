/**
 * Generates placeholder sound effects for Oversteer into
 * src/mainview/public/sounds/ (as WAV; convert to .m4a with ffmpeg).
 *
 * Everything here is synthesized from scratch — no license encumbrance.
 *
 *   node scripts/gen-sounds.mjs <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const outDir = process.argv[2] || "src/mainview/public/sounds"
mkdirSync(outDir, { recursive: true })

const SR = 44100

function writeWav(name, samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write("WAVE", 8)
  buf.write("fmt ", 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write("data", 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  writeFileSync(join(outDir, name), buf)
  console.log("wrote", name, `${(n / SR).toFixed(2)}s`)
}

// --- helpers -------------------------------------------------------------

// Simple deterministic noise so output is reproducible.
let seed = 0x9e3779b9 | 0
function noise() {
  seed = (1103515245 * seed + 12345) | 0
  return (seed / 1073741824) % 2 - 1
}

// One-pole lowpass
function lowpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff)
  const dt = 1 / SR
  const a = dt / (rc + dt)
  const out = new Float64Array(samples.length)
  let prev = 0
  for (let i = 0; i < samples.length; i++) {
    prev += a * (samples[i] - prev)
    out[i] = prev
  }
  return out
}

// Make a buffer seamlessly loopable by circular crossfade of the tail.
function makeLoop(x, fadeSec = 0.05) {
  const n = x.length
  const f = Math.min((n / 2) | 0, Math.round(fadeSec * SR))
  const out = new Float64Array(n - f)
  for (let i = 0; i < n - f; i++) {
    if (i < f) {
      const w = i / f
      out[i] = x[n - f + i] * (1 - w) + x[i] * w
    } else {
      out[i] = x[i]
    }
  }
  return out
}

// --- engine loop ---------------------------------------------------------

// Neutral synthesized engine idle. Harmonic pulse train whose fundamental
// pitch is deliberately chosen so the game can pitch-shift it from idle to
// redline without artifacts. All frequencies are integer multiples of the
// loop tempo, so the loop is seamless.
const ENGINE_LOOP_SEC = 2
const F0 = 55.125 // exactly 110 cycles per 2-second loop
{
  const n = SR * ENGINE_LOOP_SEC
  const raw = new Float64Array(n)
  const cycles = F0 * ENGINE_LOOP_SEC // integer → seamless
  const f = cycles / ENGINE_LOOP_SEC
  // Harmonic stack (exhaust-like: strong lows, weak highs)
  const harmonics = [
    [1, 1.0], [2, 0.62], [3, 0.48], [4, 0.33],
    [5, 0.22], [6, 0.16], [8, 0.08], [10, 0.045],
  ]
  const phases = harmonics.map((_, i) => noise() * Math.PI)
  // Slight half-cycle amplitude wobble for combustion roughness (loop-safe)
  for (let i = 0; i < n; i++) {
    const tt = i / SR
    let s = 0
    for (let h = 0; h < harmonics.length; h++) {
      const [mult, amp] = harmonics[h]
      s += amp * Math.sin(2 * Math.PI * f * mult * tt + phases[h])
    }
    // Thump at firing rate × 2 (pseudo-cylinder pattern)
    s *= 0.82 + 0.18 * Math.sin(2 * Math.PI * f * 2 * tt + 0.4)
    raw[i] = s * 0.55
  }
  // Intake suction noise + mechanical clatter bed
  const bedN = new Float64Array(n)
  for (let i = 0; i < n; i++) bedN[i] = noise() * 0.5
  const bed = lowpass(bedN, 420)
  for (let i = 0; i < n; i++) raw[i] += bed[i] * 0.16
  writeWav("engine_loop.wav", makeLoop(raw))
}

// --- road / wind loop ----------------------------------------------------

// Band-limited rolling + wind noise, driven by speed in-game.
{
  const sec = 2
  const n = SR * sec
  const raw = new Float64Array(n)
  for (let i = 0; i < n; i++) raw[i] = noise()
  const lp1 = lowpass(raw, 240) // gravel-ish rumble
  const lp2 = lowpass(raw, 1600) // airy wind
  for (let i = 0; i < n; i++) raw[i] = lp1[i] * 1.4 + lp2[i] * 0.22
  writeWav("road_loop.wav", makeLoop(raw))
}

// --- UI click ------------------------------------------------------------

// Short, dry "tick" for menus.
{
  const dur = 0.06
  const n = Math.round(SR * dur)
  const raw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const tt = i / SR
    const env = Math.exp(-tt * 90) * Math.min(1, (i / (SR * 0.004)) || 0)
    raw[i] =
      (Math.sin(2 * Math.PI * 1250 * tt) * 0.55 +
        Math.sin(2 * Math.PI * 2750 * tt) * 0.25 +
        noise() * 0.3) *
      env
  }
  writeWav("click.wav", raw)
}

// --- transition whoosh ---------------------------------------------------

// Noise sweep used for wipe transitions (ON THE GRID, FREE ROAM, ...)
{
  const dur = 0.55
  const n = Math.round(SR * dur)
  const raw = new Float64Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const tt = i / n
    const env = Math.sin(Math.PI * tt) ** 1.5
    const cut = 500 + 5200 * tt
    const rc = 1 / (2 * Math.PI * cut)
    const a = (1 / SR) / (rc + 1 / SR)
    lp += a * (noise() - lp)
    raw[i] = lp * env * 2.4
  }
  writeWav("whoosh.wav", raw)
}
