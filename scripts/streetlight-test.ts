/**
 * Street light tests: lamps stand beside the road, point their arm across it, are
 * identical whichever way the road is driven, and light only when asked.
 *
 * Run: `bun scripts/streetlight-test.ts` (exit 1 on any failure).
 */
import * as THREE from "three"
import { StreetLights } from "../src/mainview/systems/StreetLights"
import { roadCenterX } from "../src/mainview/systems/WorldManager"

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok - ${name}`)
  else {
    failures++
    console.log(`FAIL - ${name}`, extra ?? "")
  }
}

const noop = () => {}
const ctx: any = new Proxy(
  {},
  {
    get: (_t, k) =>
      k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop,
    set: () => true,
  },
)
;(globalThis as any).document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx,
    style: {},
  }),
}
;(globalThis as any).ProgressEvent ??= class {
  constructor(
    public type: string,
    init?: object,
  ) {
    Object.assign(this, init)
  }
}
const make = async () => {
  const group = new THREE.Group()
  const sl: any = new StreetLights(group, roadCenterX)
  await sl.load(`file://${process.cwd()}/src/mainview/public/`)
  return { group, sl }
}

const { group, sl } = await make()
check(
  "the model loads into poles, heads and pools",
  !!sl.poles && !!sl.heads && !!sl.pools,
)
check(
  "lamps are visible by day, just not lit",
  group.children[0].visible && sl.headMat.emissiveIntensity === 0,
)
sl.setEnabled(true)
sl.setLit(true)
sl.update(5000, new THREE.Vector3(roadCenterX(5000), 0, -5000))
check("lamps are placed along both ways of the road", sl.count > 20, sl.count)

let sides = new Set<number>()
let ok = true
for (let i = 0; i < sl.count; i++) {
  const hx = sl.head[i * 3],
    hz = sl.head[i * 3 + 2]
  const s = -hz
  const across = hx - roadCenterX(s)
  sides.add(Math.sign(across))
  const dist = Math.abs(across)
  if (dist < 5 || dist > 11) ok = false
  // the aim point is nearer the road centre than the head
  const ax = sl.aim[i * 3]
  if (Math.abs(ax - roadCenterX(s)) >= dist) ok = false
}
check(
  "lamps stand 5-11 m off the centre line, alternating sides, lights aimed at the road",
  ok && sides.size === 2,
)

const snap = (carS: number) => {
  sl.firstK = Number.NaN
  sl.update(carS, new THREE.Vector3(roadCenterX(carS), 0, -carS))
  const seen = new Map<string, boolean>()
  for (let i = 0; i < sl.count; i++)
    seen.set(
      `${sl.head[i * 3].toFixed(2)},${sl.head[i * 3 + 2].toFixed(2)}`,
      true,
    )
  return seen
}
const a = snap(5000)
const b = snap(5010)
let shared = 0
for (const k of a.keys()) if (b.has(k)) shared++
check("the same place always gets the same lamp", shared > a.size - 4, [
  shared,
  a.size,
])

sl.setLit(true)
sl.update(5000, new THREE.Vector3(sl.head[0], 0, sl.head[2]))
const lit = sl.spots.filter((s: any) => s.intensity > 0).length
check("the nearest lamps cast real light", lit >= 3, lit)
sl.setLit(false)
check(
  "by day the lights are off",
  sl.spots.every((s: any) => s.intensity === 0) &&
    sl.headMat.emissiveIntensity === 0,
)
sl.setLit(true)
sl.setEnabled(false)
check(
  "turned off in settings, nothing is drawn",
  !group.children[0].visible && sl.spots.every((s: any) => s.intensity === 0),
)

console.log(failures ? `${failures} failed` : "all passed")
process.exit(failures ? 1 : 0)
