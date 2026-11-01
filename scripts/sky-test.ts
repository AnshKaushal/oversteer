/**
 * Time-of-day sky tests: rainy and stormy presets, the weather they imply, and the rain system.
 *
 * Run: `bun scripts/sky-test.ts` (exit 1 on any failure).
 */
import * as THREE from "three"
import {
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_PRESETS,
  effectiveWeather,
  isLowLight,
} from "../src/mainview/constants/timeOfDay"
import { Puddles } from "../src/mainview/systems/Puddles"
import { TireSmoke } from "../src/mainview/systems/TireSmoke"
import { RainEffect } from "../src/mainview/systems/RainEffect"

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok - ${name}`)
  else {
    failures++
    console.log(`FAIL - ${name}`, extra ?? "")
  }
}

check("every mode has a preset", TIME_OF_DAY_MODES.every((m) => TIME_OF_DAY_PRESETS[m]?.id === m))
check("rainy and stormy are modes", TIME_OF_DAY_MODES.includes("rainy") && TIME_OF_DAY_MODES.includes("stormy"))
check("only the new skies rain", TIME_OF_DAY_MODES.every((m) => (TIME_OF_DAY_PRESETS[m].rain > 0) === (m === "rainy" || m === "stormy")))
check("only stormy has lightning", TIME_OF_DAY_MODES.every((m) => TIME_OF_DAY_PRESETS[m].lightning === (m === "stormy")))
check("rain and storms turn headlights on", isLowLight("rainy") && isLowLight("stormy"))
check("storm fog is tighter than rain, rain tighter than day", TIME_OF_DAY_PRESETS.stormy.fogFar < TIME_OF_DAY_PRESETS.rainy.fogFar && TIME_OF_DAY_PRESETS.rainy.fogFar < TIME_OF_DAY_PRESETS.day.fogFar)

check("a rainy sky makes dry weather wet", effectiveWeather("dry", "rainy") === "wet")
check("a stormy sky makes dry weather storm", effectiveWeather("dry", "stormy") === "storm")
check("chosen weather that is worse wins", effectiveWeather("storm", "rainy") === "storm")
check("a clear sky leaves the chosen weather", effectiveWeather("damp", "day") === "damp" && effectiveWeather("dry", "night") === "dry")

const scene = new THREE.Scene()
const rain = new RainEffect(scene)
const cam = new THREE.Vector3(0, 2, 0)
rain.setConditions(0, false)
check("no rain, no flash", rain.update(1 / 60, cam) === 0)
rain.setConditions(1, true)
let maxFlash = 0
let bad = false
for (let i = 0; i < 60 * 40; i++) {
  cam.z -= 0.5
  const f = rain.update(1 / 60, cam)
  if (!(f >= 0 && f <= 1)) bad = true
  maxFlash = Math.max(maxFlash, f)
}
check("a storm flashes within 40 s, always within 0..1", maxFlash > 0.8 && !bad, maxFlash)
const pos = (scene.children[0] as THREE.LineSegments).geometry.attributes.position.array as Float32Array
let inBox = true
for (let i = 0; i < pos.length; i += 6) {
  if (!Number.isFinite(pos[i]) || Math.abs(pos[i] - cam.x) > 40 || Math.abs(pos[i + 2] - cam.z) > 40) inBox = false
}
check("rain stays in the box around a moving camera", inBox)
rain.setConditions(0.55, false)
{
  const still = new THREE.Vector3(0, 2, 0)
  for (let i = 0; i < 120; i++) rain.update(1 / 60, still)
  const seg = (scene.children[0] as THREE.LineSegments).geometry.attributes.position.array as Float32Array
  const dz0 = seg[5] - seg[2]
  check("at rest the streaks fall straight", Math.abs(dz0) < 0.05, dz0)
  const fast = new THREE.Vector3(0, 2, 0)
  for (let i = 0; i < 120; i++) {
    fast.z -= 40 / 60
    rain.update(1 / 60, fast)
  }
  // driving toward -z, the rain comes at the car from -z, so each streak's tail trails toward -z
  let leaned = 0
  for (let i = 0; i < seg.length; i += 6) if (seg[i + 5] - seg[i + 2] < -0.3) leaned++
  check("at speed the streaks lean back and stretch", leaned > seg.length / 6 - 2, leaned)
}
let calm = 0
for (let i = 0; i < 60 * 40; i++) calm = Math.max(calm, rain.update(1 / 60, cam))
check("plain rain never flashes", calm === 0)
rain.dispose()

// ---- puddles: a road along z, 16 m wide, grass beyond a 21 m strip
{
  const surf = (x: number, _z: number, r: number) => {
    const across = Math.abs(x)
    if (across + r <= 8) return "road" as const
    if (across - r < 11.5) return null
    return "grass" as const
  }
  const make = () => {
    const group = new THREE.Group()
    const pud = new Puddles(group, surf)
    return { pud, mesh: group.children[0] as THREE.InstancedMesh }
  }
  const car = new THREE.Vector3(0, 0, -100)

  {
    const { pud, mesh } = make()
    pud.setRain(0)
    pud.update(car, 0.016)
    check("no rain, no puddles", mesh.count === 0 && !mesh.visible)
  }

  const rainyCount = (() => {
    const { pud, mesh } = make()
    pud.setRain(0.55)
    pud.update(car, 0.016)
    return mesh.count
  })()
  check("starting in the rain starts wet", rainyCount > 10, rainyCount)

  {
    const { pud, mesh } = make()
    pud.setRain(0.55)
    pud.update(car, 0.016)
    pud.setRain(1)
    pud.update(car, 0.016)
    const justAfter = mesh.count
    for (let i = 0; i < 20; i++) pud.update(car, 1)
    check("rain builds up over a few seconds, then a storm has more puddles", mesh.count > rainyCount && justAfter < mesh.count, [justAfter, mesh.count, rainyCount])

    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    let road = 0, grass = 0, bad = 0
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      m.decompose(p, q, s)
      if (p.y > 0) {
        road++
        if (Math.abs(p.x) + 1.25 * s.x > 8.01) bad++
      } else {
        grass++
        if (Math.abs(p.x) - Math.max(s.x, s.z) < 11.5 - 0.01) bad++
      }
    }
    check("puddles lie on both the road and the grass", road > 3 && grass > 3, [road, grass])
    check("no puddle strays onto the verge or across the road edge", bad === 0, bad)

    const before = Float32Array.from((mesh.instanceMatrix.array as Float32Array).slice(0, 16))
    pud.update(new THREE.Vector3(0, 0, -100.5), 0.016)
    check("a small move keeps the puddles in place", before.every((v, i) => v === (mesh.instanceMatrix.array as Float32Array)[i]))
    pud.setFlash(1)
  }

  // the rain stops: the puddles stay for a while and then dry out
  {
    const { pud, mesh } = make()
    pud.setRain(1)
    pud.update(car, 0.016)
    const wetCount = mesh.count
    pud.setRain(0)
    for (let i = 0; i < 10; i++) pud.update(car, 1)
    check("puddles linger when the rain stops", mesh.count > wetCount * 0.7 && mesh.visible, [mesh.count, wetCount])
    let prev = mesh.count
    let mono = true
    for (let i = 0; i < 40; i++) {
      pud.update(car, 1)
      if (mesh.count > prev) mono = false
      prev = mesh.count
    }
    check("then they shrink away, never reappearing", mono && mesh.count < wetCount * 0.7, [mesh.count, wetCount])
    for (let i = 0; i < 40; i++) pud.update(car, 1)
    check("and are gone after about a minute standing still", mesh.count === 0 && !mesh.visible, mesh.count)
  }

  // driving dries the road much sooner than waiting
  {
    const { pud, mesh } = make()
    pud.setRain(1)
    pud.update(car, 0.016)
    pud.setRain(0)
    const c = car.clone()
    let secs = 0
    let atHalf = -1
    for (let i = 0; i < 400 && mesh.visible; i++) {
      c.z -= 10
      pud.update(c, 0.05)
      secs += 0.05
      if (atHalf < 0 && i === 60) atHalf = mesh.count
    }
    check("driving away dries the road in about a kilometre, well inside the waiting time", !mesh.visible && secs < 60, secs)
    check("partway there, some puddles remain", atHalf > 0, atHalf)
  }

  // changing sky while it keeps raining does not dry anything
  {
    const { pud, mesh } = make()
    pud.setRain(1)
    pud.update(car, 0.016)
    const full = mesh.count
    pud.setRain(0.55)
    for (let i = 0; i < 5; i++) pud.update(car, 1)
    const stormToRain = mesh.count
    pud.setRain(0)
    pud.setRain(1)
    for (let i = 0; i < 30; i++) pud.update(car, 1)
    check("storm to rain keeps most puddles, and a new storm refills them", stormToRain > 0 && stormToRain <= full && mesh.count >= stormToRain, [full, stormToRain, mesh.count])
  }
}

// ---- smoke and spray on wet ground
{
  const live = (arr: Float32Array) => arr.reduce((n, v) => n + (v > 0 ? 1 : 0), 0)
  const run = (wet: number) => {
    const t = new TireSmoke()
    t.wetnessAt = () => wet
    for (let i = 0; i < 40; i++) t.spawn(new THREE.Vector3(0, 0.1, 0), 1)
    const priv = t as unknown as { life: Float32Array; spray: { life: Float32Array } }
    return { smoke: live(priv.life), spray: live(priv.spray.life) }
  }
  const dry = run(0)
  const damp = run(0.3)
  const wet = run(1)
  check("dry ground: smoke and no spray", dry.smoke > 20 && dry.spray === 0, dry)
  check("wet ground: much less smoke", wet.smoke < dry.smoke * 0.4, [wet.smoke, dry.smoke])
  check("wet ground: spray instead", wet.spray > dry.smoke * 0.5, [wet.spray, dry.smoke])
  check("damp is in between", damp.smoke < dry.smoke && damp.smoke > wet.smoke && damp.spray > 0 && damp.spray < wet.spray, [dry, damp, wet])

  {
    const w = new TireSmoke()
    w.wetnessAt = () => 1
    w.spawn(new THREE.Vector3(0, 0.1, 0), 1)
    w.update(0.016)
    const sp = (w as unknown as { spray: { size: Float32Array; alpha: Float32Array; sizeAttr: { version: number } } }).spray
    check("spray droplets have a size and are uploaded to the GPU", Math.max(...sp.size) > 0.15 && sp.sizeAttr.version > 0 && Math.max(...sp.alpha) > 0.3, [Math.max(...sp.size), sp.sizeAttr.version])
  }
  const t = new TireSmoke()
  for (let i = 0; i < 20; i++) t.spawn(new THREE.Vector3(0, 0.1, 0), 1)
  const before = live((t as unknown as { life: Float32Array }).life)
  check("no wetness function means plain smoke", before > 20, before)

  const group = new THREE.Group()
  const pud = new Puddles(group, (x, _z, r) => (Math.abs(x) + r <= 8 ? ("road" as const) : null))
  const mesh = group.children[0] as THREE.InstancedMesh
  pud.setRain(1)
  const car = new THREE.Vector3(0, 0, -100)
  pud.update(car, 0.016)
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  mesh.getMatrixAt(0, m)
  m.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
  check("a point at a puddle's centre is in the puddle", pud.coverageAt(p.x, p.z) === 1)
  check("a point far from any puddle is not", pud.coverageAt(500, 500) === 0)
  pud.setRain(0)
  for (let i = 0; i < 200; i++) pud.update(car, 1)
  check("no puddles once dried", pud.coverageAt(p.x, p.z) === 0)
}

console.log(failures ? `${failures} failed` : "all passed")
process.exit(failures ? 1 : 0)
