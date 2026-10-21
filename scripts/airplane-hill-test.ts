/**
 * Integration check for the flyby against the real world: the aircraft's
 * path has to clear the hills that the WorldManager actually generates.
 *
 * The WorldManager is driven headlessly with a stub canvas — the only
 * browser API it needs is the asphalt texture.
 *
 * Run: bun scripts/airplane-hill-test.ts
 */
import * as THREE from "three"
import { WorldManager, roadCenterX } from "../src/mainview/systems/WorldManager"
import {
  passState,
  pathBlocked,
  pickCrossing,
  makePath,
  PASS_HALF,
  PASS_LENGTH,
  type FlybyMode,
} from "../src/mainview/systems/AirplaneFlyby"

// The asphalt texture is the only browser API the world needs.
const ctx2d = { fillStyle: "", fillRect: () => {} }
;(globalThis as any).document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx2d,
  }),
}

let fails = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}${detail ? " — " + detail : ""}`)
}

const scene = new THREE.Scene()
const wm = new WorldManager()
await wm.init(scene, "/")

const carPos = new THREE.Vector3(roadCenterX(0), 0.7, 0)
wm.update(0, carPos, 1)

// The terrain query has to actually see the hills.
{
  let onHill = 0
  let onRoad = 0
  let samples = 0
  for (let s = -400; s < 1200; s += 37) {
    for (let lat = -320; lat <= 320; lat += 40) {
      const x = roadCenterX(s) + lat
      const z = -s
      const h = wm.terrainHeightAt(x, z)
      samples++
      if (h > 1) onHill++
    }
    const h = wm.terrainHeightAt(roadCenterX(s), -s)
    if (h > 0.5) onRoad++
  }
  check(onHill > 0, "hills are detected off the road", `${onHill}/${samples} samples`)
  check(
    onRoad === 0,
    "the road itself is clear of hills",
    `${onRoad} road samples on a hill`,
  )
}

// Every crossing the flyby could pick has to have a path that clears the
// terrain, and the picker has to find one.
{
  const terrainAt = (x: number, z: number) => wm.terrainHeightAt(x, z)
  const modes: FlybyMode[] = ["takeoff", "landing", "cruise"]
  const angles = [20, 45, 90]
  const DEG = Math.PI / 180
  let blocked = 0
  let moved = 0
  let stillBlocked = 0
  let worstClearance = Infinity
  let checked = 0

  for (const mode of modes) {
   for (const deg of angles) {
    const pathFor = (s: number) => makePath(s, deg * DEG, 1, 1)
    for (let base = -600; base < 2000; base += 120) {
      checked++
      if (pathBlocked(pathFor(base), mode, terrainAt)) blocked++
      const s = pickCrossing(base, mode, pathFor, terrainAt, base - 190, 66)
      if (s !== base) moved++
      if (pathBlocked(pathFor(s), mode, terrainAt)) {
        stillBlocked++
        continue
      }
      // How much clearance does the chosen path have?
      const yaw = Math.atan2(
        roadCenterX(s + 4) - roadCenterX(s - 4),
        8,
      )
      const steps = Math.max(16, Math.round(PASS_LENGTH / 15))
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * PASS_LENGTH
        const lateral = t - PASS_HALF
        const p = pathFor(s)
        const x = p.x + (t - PASS_LENGTH / 2) * p.dx
        const z = p.z + (t - PASS_LENGTH / 2) * p.dz
        const h = wm.terrainHeightAt(x, z)
        const st = passState(mode, t, pathFor(s), 0)
        worstClearance = Math.min(worstClearance, st.y - h)
      }
    }
   }
  }

  check(checked > 0, "crossings were checked", `${checked}`)
  check(
    blocked > 0,
    "some crossings really are blocked by hills",
    `${blocked} of ${checked}`,
  )
  check(
    moved > 0,
    "the picker moves blocked crossings",
    `${moved} of ${checked}`,
  )
  check(
    stillBlocked === 0,
    "every chosen crossing has a clear path",
    `${stillBlocked} still blocked`,
  )
  check(
    worstClearance > 4,
    "the chosen path keeps its clearance",
    `worst ${worstClearance.toFixed(1)} m`,
  )
}

// The Globemaster is 52 m across and its belly hangs 9 m below the
// flight path, so it needs more room than the transport. Every crossing
// it is offered has to be clear for the whole aircraft.
{
  const terrainAt = (x: number, z: number) => wm.terrainHeightAt(x, z)
  const SPAN = 52
  const CLEARANCE = 9
  const DEG = Math.PI / 180
  let checked = 0
  let blocked = 0
  let stillBlocked = 0
  let worst = Infinity
  for (const deg of [20, 45, 90]) {
    const pathFor = (s: number) => makePath(s, deg * DEG, 1, 1)
    for (let base = -600; base < 2000; base += 120) {
      checked++
      if (pathBlocked(pathFor(base), "takeoff", terrainAt, SPAN, CLEARANCE)) {
        blocked++
      }
      const s = pickCrossing(
        base,
        "takeoff",
        pathFor,
        terrainAt,
        base - 190,
        66,
        SPAN,
        CLEARANCE,
      )
      if (s < 0) continue
      if (pathBlocked(pathFor(s), "takeoff", terrainAt, SPAN, CLEARANCE)) {
        stillBlocked++
        continue
      }
      // Check the wingtips along the chosen path as well.
      const p = pathFor(s)
      const px = -p.dz
      const pz = p.dx
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * PASS_LENGTH
        const x = p.x + (t - PASS_LENGTH / 2) * p.dx
        const z = p.z + (t - PASS_LENGTH / 2) * p.dz
        const y = passState("takeoff", t, p, 0).y
        for (const side of [-1, 1]) {
          const h = wm.terrainHeightAt(
            x + px * (SPAN / 2) * side,
            z + pz * (SPAN / 2) * side,
          )
          worst = Math.min(worst, y - h)
        }
      }
    }
  }
  check(checked > 0, "the jet's crossings were checked", `${checked}`)
  check(blocked > 0, "the big jet is blocked by more hills", `${blocked} of ${checked}`)
  check(
    stillBlocked === 0,
    "every crossing the jet is given is clear for the whole aircraft",
    `${stillBlocked} still blocked`,
  )
  check(
    worst > CLEARANCE - 1,
    "the jet's wingtips clear the ground",
    `worst ${worst.toFixed(1)} m`,
  )
}

console.log(fails === 0 ? "\nAll hill checks passed" : `\n${fails} check(s) failed`)
if (fails > 0) process.exit(1)
