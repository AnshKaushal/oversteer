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
for (let step = 0; step < 60 * 60; step++) {
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
    for (let i = 0; i < 240; i++) {
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
      first > 0.1 && Math.abs(first - later) < 1e-6,
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

flyby.dispose()
server.stop(true)
console.log(fails === 0 ? "\nAll traffic checks passed" : `\n${fails} check(s) failed`)
if (fails) process.exit(1)
