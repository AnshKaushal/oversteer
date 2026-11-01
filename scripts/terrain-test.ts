/**
 * Terrain tests: the road is unbounded both ways, hills are the same wherever you
 * come from, and no hill flank is too steep to climb.
 *
 * Run: `bun scripts/terrain-test.ts` (exit 1 on any failure).
 */
import * as THREE from "three"
import { WorldManager, roadArcLength, roadCenterX, ROAD_PERIOD } from "../src/mainview/systems/WorldManager"

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok - ${name}`)
  else {
    failures++
    console.log(`FAIL - ${name}`, extra ?? "")
  }
}

check("road repeats every period", Math.abs(roadCenterX(1234) - roadCenterX(1234 + ROAD_PERIOD)) < 1e-6)
let mono = true
for (let s = -300000; s < 300000; s += 997) if (roadArcLength(s + 50) <= roadArcLength(s)) mono = false
check("road arc length keeps growing far past the old limits, both ways", mono)

// The same place holds the same hills and clouds whichever way the car arrives.
const noop = () => {}
const ctx: any = new Proxy({}, { get: (_t, k) => (k === "createImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : k === "measureText" ? () => ({ width: 0 }) : noop), set: () => true })
;(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) }
const snapshot = (wm: any) => ({
  hills: wm.hills.map((h: any) => `${h.seg}:${h.mesh.position.x.toFixed(2)},${h.mesh.position.z.toFixed(2)}`).join("|"),
})
const drive = async (from: number, to: number) => {
  const wm: any = new WorldManager()
  await wm.init(new THREE.Scene(), "./")
  const step = from < to ? 100 : -100
  for (let s = from; step > 0 ? s <= to : s >= to; s += step) wm.update(0, new THREE.Vector3(roadCenterX(s), 0, -s))
  return snapshot(wm)
}
const fwd = await drive(-3000, 5000)
const rev = await drive(13000, 5000)
check("hills match arriving forward or in reverse", fwd.hills === rev.hills)
const far = await drive(-90000, -80000)
const far2 = await drive(-70000, -80000)
check("and far past the old arc-length limits", far.hills === far2.hills)

const wm: any = new WorldManager()
const steepest = (geo: THREE.BufferGeometry) => {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute
  const idx = geo.getIndex()!
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
  let max = 0
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i)); b.fromBufferAttribute(pos, idx.getX(i + 1)); c.fromBufferAttribute(pos, idx.getX(i + 2))
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize()
    max = Math.max(max, (Math.acos(Math.abs(n.y)) * 180) / Math.PI)
  }
  return max
}
let worst = 0
for (const [r, hMax] of [[35, 45], [70, 45], [120, 160], [220, 160]]) {
  for (let seed = 3; seed < 3 + 311 * 22; seed += 311) {
    worst = Math.max(worst, steepest(wm.makeHillGeometry(r, Math.min(hMax, r * 0.32), seed)))
  }
}
check("no hill flank is steeper than 35 degrees", worst < 35, worst)
console.log(failures ? `${failures} failed` : "all passed")
process.exit(failures ? 1 : 0)
