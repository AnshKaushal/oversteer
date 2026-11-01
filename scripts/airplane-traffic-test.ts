/**
 * Runs the flyby the way the game does: the traffic is loaded over HTTP,
 * a pass is started, the aircraft is flown and its propeller is turned.
 *
 * The browser bits are stubbed: a canvas for the shadow texture and a
 * ProgressEvent for three.js's file loader.
 *
 * Run: bun scripts/airplane-traffic-test.ts
 */
import * as THREE from "three"
import { AirplaneFlyby, AIRCRAFT } from "../src/mainview/systems/AirplaneFlyby"
import { roadCenterX, roadYaw } from "../src/mainview/systems/WorldManager"

let fails = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}${detail ? " — " + detail : ""}`)
}

// The shadow texture needs a canvas; three's loader needs a progress event.
const ctx2d = {
  fillStyle: "",
  fillRect: () => {},
  save: () => {},
  restore: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  fillText: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }),
}
;(globalThis as any).document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx2d,
  }),
}
;(globalThis as any).ProgressEvent = class {
  lengthComputable = false
  loaded = 0
  total = 0
}

// A seeded random, so the traffic the test sees is the same every run.
let seed = 20240521
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
;(Math as any).random = rand

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname
    const file = Bun.file(`src/mainview/public${path}`)
    if (!(await file.exists())) return new Response("nope", { status: 404 })
    return new Response(file)
  },
})
const base = `http://localhost:${server.port}/`

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 2500)
const carS = 300
const carPos = new THREE.Vector3(roadCenterX(carS), 0.7, -carS)
const yaw = roadYaw(carS)
const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
camera.position.copy(carPos).addScaledVector(fwd, -5.8)
camera.position.y = 1.7
camera.lookAt(carPos)
camera.updateMatrixWorld(true)

const flyby = new AirplaneFlyby(() => 0)
const loaded = await flyby.init(scene, base)
check(loaded, "the traffic loaded")

// Every aircraft is in the scene, hidden until it flies.
const roots = scene.children.filter((c) => c.type === "Group")
check(
  roots.length >= AIRCRAFT.length,
  "every aircraft was put in the scene",
  `${roots.length} groups for ${AIRCRAFT.length} aircraft`,
)

// Fly a lot of passes and see what turns up in the sky.
const seen = new Set<string>()
let propTurned = 0
let passes = 0
// Take-offs and landings are long now, so give the sky five minutes.
for (let step = 0; step < 60 * 300; step++) {
  const dt = 1 / 60
  flyby.update(dt, carS, 40, true)
  // Look for the aircraft that is in the air and note its props.
  for (const ac of (flyby as any).aircraft as any[]) {
    if (!ac.root.visible) continue
    seen.add(ac.spec.file)
    for (const p of ac.props) {
      const q = p.node.quaternion
      if (Math.abs(q.w) < 0.999) propTurned++
    }
  }
  const f = (flyby as any).flight
  if (f && f.traveled > 1) passes++
}
check(seen.size >= 2, "more than one kind of aircraft flew", [...seen].join(", "))
check(passes > 10, "passes kept running", `${passes} frames of flying`)
check(propTurned > 0, "a propeller turned")

// The Cessna's propeller is the one that had to be cut out of the body.
{
  const ac = ((flyby as any).aircraft as any[]).find(
    (a) => a.spec.prop === "merged",
  )
  check(!!ac, "the Cessna is in the traffic")
  if (ac) {
    check(ac.props.length === 1, "the Cessna has one propeller", `${ac.props.length}`)
    const node = ac.props[0].node
    const before = node.quaternion.clone()
    for (let i = 0; i < 30; i++) {
      node.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(ac.props[0].axis, 0.3),
      )
    }
    const turned = before.angleTo(node.quaternion)
    check(turned > 1, "the propeller turns about its hub", turned.toFixed(2) + " rad")
  }
}

// The propeller has to turn at a steady rate, not wind itself up.
{
  const ac = ((flyby as any).aircraft as any[]).find(
    (a) => a.spec.prop === "merged",
  )
  if (ac) {
    const node = ac.props[0].node
    // How far the prop turns in one frame, measured against the frame
    // before it.
    const steps: number[] = []
    let prev = node.quaternion.clone()
    // Wait for the Cessna's turn, then watch it for a few frames.
    for (let i = 0; i < 60 * 600 && steps.length < 25; i++) {
      flyby.update(1 / 60, carS, 40, true)
      if (!ac.root.visible) {
        prev = node.quaternion.clone()
        continue
      }
      steps.push(prev.angleTo(node.quaternion))
      prev = node.quaternion.clone()
    }
    const first = steps[0] ?? 0
    const later = steps[Math.min(20, steps.length - 1)] ?? 0
    check(
      first > 0.1 && Math.abs(first - later) < 0.01,
      "the propeller turns at a steady rate",
      `${first.toFixed(4)} rad/frame, then ${later.toFixed(4)}`,
    )
  }
}

// The world only ever has one aircraft in the air.
{
  const visible = ((flyby as any).aircraft as any[]).filter(
    (a) => a.root.visible,
  )
  check(visible.length <= 1, "only one aircraft is in the air at a time", String(visible.length))
}

// The airfield: the runway holds the whole landing roll-out and the start
// of a take-off, and stays well clear of the main road.
{
  const { layoutAirport, airportBlocked, RUNWAY_LENGTH, RUNWAY_WIDTH } = await import(
    "../src/mainview/systems/Airport"
  )
  const { makePath, passState } = await import("../src/mainview/systems/AirplaneFlyby")
  const DEG = Math.PI / 180
  let worstOff = 0
  let minRoad = Infinity
  let n = 0
  for (const deg of [35, 50, 70, 90]) {
    for (let sC = 400; sC < 2400; sC += 200) {
      const landing = makePath(sC, deg * DEG, 1, 1)
      const takeoff = makePath(sC, deg * DEG, -1, 1)
      const lay = layoutAirport(landing)
      if (airportBlocked(lay, () => 0)) continue
      n++
      const inRunway = (x: number, z: number) => {
        const dx = x - lay.cx
        const dz = z - lay.cz
        const along = dx * lay.ux + dz * lay.uz
        const across = -dx * lay.uz + dz * lay.ux
        return Math.max(Math.abs(along) - RUNWAY_LENGTH / 2, Math.abs(across) - RUNWAY_WIDTH / 2)
      }
      // The landing roll: touchdown to a full stop.
      for (let t = 0.85 * landing.length; t < 0.85 * landing.length + 600; t += 10) {
        const st = passState("landing", t, landing, 0)
        worstOff = Math.max(worstOff, inRunway(st.x, st.z))
      }
      // The take-off roll.
      for (let t = -600; t < -300; t += 10) {
        const st = passState("takeoff", t, takeoff, 0)
        worstOff = Math.max(worstOff, inRunway(st.x, st.z))
      }
      // The runway's distance from the road.
      for (let a = -RUNWAY_LENGTH / 2; a <= RUNWAY_LENGTH / 2; a += 50) {
        const x = lay.cx + lay.ux * a
        const z = lay.cz + lay.uz * a
        for (let s = -z - 300; s <= -z + 300; s += 5) {
          minRoad = Math.min(minRoad, Math.hypot(roadCenterX(s) - x, -s - z))
        }
      }
    }
  }
  check(n > 10, "airfields were laid out", `${n}`)
  check(worstOff <= 0, "landing and take-off rolls stay on the runway", `${worstOff.toFixed(1)} m outside`)
  check(minRoad > 40, "the runway keeps clear of the road", `${minRoad.toFixed(0)} m`)
  // The lamps light at night only.
  {
    const { AirportView } = await import("../src/mainview/systems/Airport")
    const lay = layoutAirport(makePath(900, 60 * DEG, 1, 1))
    const view = new AirportView(lay)
    const lamps = view.group.children.find((c) => c.type === "Points") as THREE.Points
    for (let i = 0; i < 120; i++) view.step(1 / 60)
    const day = lamps.visible
    view.lit = true
    view.step(1 / 60)
    const count = lamps.geometry.getAttribute("position").count
    check(!day && lamps.visible, "the airfield lamps are off by day and on at night", `${count} lamps`)
    check(count > 100, "the airfield has runway, taxi and approach lamps", `${count}`)
    // Fence, light towers and the control tower.
    let posts = 0
    view.group.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) posts += (o as THREE.InstancedMesh).count
    })
    const box = new THREE.Box3().setFromObject(view.group)
    check(posts >= 20, "the road side of the airfield is fenced", `${posts} posts`)
    check(box.max.y >= 28, "the control tower stands tall", `${box.max.y.toFixed(0)} m`)
    // Every layout that fits has its fence and gate clear of the road.
    let nearest = Infinity
    for (let sC = 400; sC < 2400; sC += 200) {
      for (const deg of [40, 60, 90]) {
        const l = layoutAirport(makePath(sC, deg * DEG, 1, -1))
        if (airportBlocked(l, () => 0)) continue
        const nx = -l.uz
        const nz = l.ux
        for (const [a, b] of [[-510, -60], [-510, 60], [510, -60], [510, 60]]) {
          const x = l.cx + l.ux * a + nx * b
          const z = l.cz + l.uz * a + nz * b
          for (let s = -z - 300; s <= -z + 300; s += 5) {
            nearest = Math.min(nearest, Math.hypot(roadCenterX(s) - x, -s - z))
          }
        }
      }
    }
    check(nearest > 20, "the fenced corners keep off the road", `${nearest.toFixed(0)} m`)
    view.dispose()
  }
  check(
    airportBlocked(layoutAirport(makePath(900, 60 * DEG, 1, 1)), () => 25),
    "an airfield is refused on a hill",
  )
}

// A parked car gets traffic from one airfield only, landing and taking
// off in turn.
{
  const parked = new AirplaneFlyby(() => 0)
  await parked.init(new THREE.Scene(), base)
  const modes: string[] = []
  const views = new Set<unknown>()
  let last: unknown = null
  let lastMode = ""
  for (let step = 0; step < 60 * 420; step++) {
    parked.update(1 / 60, carS, 0, true)
    const f = (parked as any).flight
    if (f && f !== last) {
      last = f
      lastMode = f.mode
      modes.push(f.mode)
      views.add((parked as any).airport?.view)
    }
  }
  // Cruises may come before the first airfield; from then on it is all airfield traffic.
  const first = modes.findIndex((m) => m !== "cruise")
  const air = first < 0 ? [] : modes.slice(first)
  check(modes.length >= 4, "a parked car sees several flights", modes.join(","))
  check(air.length >= 3, "airfield traffic follows", modes.join(","))
  check(air.every((m) => m !== "cruise"), "later flights are all airfield traffic", modes.join(","))
  check(air.every((m, i) => i === 0 || m !== air[i - 1]), "landings and take-offs alternate", modes.join(","))
  const fields = [...views].filter(Boolean)
  check(fields.length <= 2, "one airfield serves the parked car", `${fields.length} airfields`)
  void lastMode
  parked.dispose()
}

flyby.dispose()
server.stop(true)
console.log(fails === 0 ? "\nAll traffic checks passed" : `\n${fails} check(s) failed`)
if (fails) process.exit(1)
