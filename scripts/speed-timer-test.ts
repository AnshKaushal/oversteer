import { SpeedTimer } from "../src/mainview/systems/speedTimer"

let fails = 0
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`)
  if (!c) fails++
}
const at = (t: SpeedTimer, i: number) => t.store.get()[i]
const a = 10 * 3.6 // 10 m/s^2 in km/h per second

for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
  const t = new SpeedTimer()
  t.configure([
    { from: 0, to: 100 },
    { from: 100, to: 200 },
  ])
  t.update(0, dt)
  let v = 0
  for (let s = 0; s < 8 / dt; s++) t.update((v += a * dt), dt)
  for (const i of [0, 1]) {
    const r = at(t, i)
    ok(
      r.state === "done" && Math.abs((r.time ?? 0) - 100 / a) < 0.01,
      `run ${i} ~2.78s at dt=${dt.toFixed(4)} (${r.time?.toFixed(3)})`,
    )
  }
}
{
  const t = new SpeedTimer()
  t.configure([{ from: 100, to: 0 }])
  let v = 130
  t.update(v, 0.01)
  for (let s = 0; s < 1000; s++) t.update((v = Math.max(0, v - a * 0.01)), 0.01)
  const r = at(t, 0)
  ok(r.state === "done" && Math.abs((r.time ?? 0) - 100 / a) < 0.02, "100-0 timed")
}
{
  const t = new SpeedTimer()
  t.configure([{ from: 0, to: 100 }])
  let v = 30
  t.update(v, 0.01)
  for (let s = 0; s < 800; s++) t.update((v += a * 0.01), 0.01)
  ok(at(t, 0).state !== "done", "rolling start is not a 0-100")
}
{
  // Stationary jitter must never start, flicker or abort a 0-100.
  const t = new SpeedTimer()
  t.configure([{ from: 0, to: 100 }])
  let flips = 0
  let prev = at(t, 0)?.state
  const dt = 1 / 60
  for (let s = 0; s < 300; s++) {
    t.update(Math.abs(Math.sin(s * 1.7)) * 1.6, dt)
    const st = at(t, 0).state
    if (st !== prev) flips++
    prev = st
  }
  ok(flips <= 1 && at(t, 0).state === "armed", `jitter keeps it armed (${flips} flips)`)
  // Launch out of the jitter: time starts when the car last left rest.
  let v = 0
  const launch0 = 300 * dt
  for (let s = 0; s < 8 / dt; s++) t.update((v += a * dt), dt)
  const r = at(t, 0)
  ok(
    r.state === "done" && Math.abs((r.time ?? 0) - 100 / a) < 0.08,
    `launch after jitter ~2.78s (${r.time?.toFixed(3)}, t0 ${launch0.toFixed(1)})`,
  )
}
if (fails) process.exit(1)
console.log("speed timer OK")
