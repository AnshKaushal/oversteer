import { SkyClock } from "../src/mainview/systems/sky/SkyClock"

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok - ${name}`)
  else {
    failures++
    console.log(`FAIL - ${name}`, extra ?? "")
  }
}

const c = new SkyClock(7)
c.setHour(8)
for (let i = 0; i < 4 * 60; i++) c.update(0.25)
check("1 real second = 1 game minute", Math.abs(c.minutes - (8 * 60 + 60)) < 1, c.minutes)

const day = new SkyClock(1)
day.configure({ weatherLive: false, fixed: "day" })
day.setHour(12)
check("clear noon: lamps off", !day.state.lamps)
day.setHour(23)
check("clear night: lamps on", day.state.lamps)
day.setHour(6.4)
check("pre-dawn: lamps on", day.state.lamps)
day.setHour(10)
check("morning: lamps off", !day.state.lamps)

const storm = new SkyClock(2)
storm.configure({ timeLive: false, weatherLive: false, fixed: "day-storm" })
storm.setHour(12)
for (let i = 0; i < 4 * 120; i++) storm.update(0.25)
check("forced storm at noon: lamps on", storm.state.lamps)
check("forced storm: raining + lightning", storm.state.rain > 0.5 && storm.state.preset.lightning)
check("storm soaks road", storm.state.wetness > 0.7 && storm.state.surface === "storm", storm.state.wetness)
storm.configure({ weatherLive: true })
let dried = false
const calm = new SkyClock(3)
calm.forceRegime("clear")
calm.configure({ frequency: "calm" })

const seen = new Set<string>()
const long = new SkyClock(99)
let lastRain = 0
let jump = 0
for (let i = 0; i < 4 * 3600 * 3; i++) {
  const s = long.update(0.25)
  seen.add(long.regimeName())
  jump = Math.max(jump, Math.abs(s.rain - lastRain))
  lastRain = s.rain
  if (s.wetness === 0 && seen.has("rain")) dried = true
}
check("all weather regimes occur", seen.size === 7, [...seen])
check("rain never jumps abruptly", jump < 0.05, jump)
check("roads dry out after rain", dried)
if (failures) process.exit(1)
