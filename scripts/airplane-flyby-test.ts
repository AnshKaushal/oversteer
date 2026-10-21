/**
 * Checks the cinematic flyby: the aircraft has to cross the road on a
 * fixed line at an angle between 20 and 90 degrees, stay at a believable
 * height and speed, fade in and out, drop a shadow, and never wander
 * outside what the camera and the fog can actually show.
 *
 * Run: bun scripts/airplane-flyby-test.ts
 */
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import {
  passState,
  pathBlocked,
  pickCrossing,
  prepareAircraft,
  viewFade,
  AIRCRAFT,
  shadowState,
  makePath,
  CROSS_LEAD,
  CRUISE_ALT,
  CRUISE_LEAD,
  PASS_HALF,
  PASS_LENGTH,
  type FlybyMode,
  type TerrainAt,
} from "../src/mainview/systems/AirplaneFlyby"
import { roadCenterX, roadYaw } from "../src/mainview/systems/WorldManager"

let fails = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}${detail ? " — " + detail : ""}`)
}

const MODES: FlybyMode[] = ["takeoff", "landing", "cruise"]
const ANGLES = [20, 35, 55, 70, 90]
const CROSSINGS = [0, 400, 1500, -900, 6200]
const FOG_FAR = 800
const DEG = Math.PI / 180

// 1. The path is at an angle to the road, between 20 and 90 degrees.
for (const deg of ANGLES) {
  for (const side of [1, -1] as const) {
    for (const drift of [1, -1] as const) {
      const sCross = 700
      const path = makePath(sCross, deg * DEG, side, drift)
      const yaw = roadYaw(sCross)
      // The road's direction of travel, and the path's.
      const tx = Math.sin(yaw)
      const tz = -Math.cos(yaw)
      const along = Math.abs(path.dx * tx + path.dz * tz)
      const angle = Math.acos(Math.min(1, along)) / DEG
      check(
        angle > 19 && angle < 91,
        `path sits at ${deg} degrees to the road`,
        `measured ${angle.toFixed(1)} deg (side=${side}, drift=${drift})`,
      )
    }
  }
}

// 2. The path crosses the road: the aircraft is over the centreline at
//    the middle of the pass.
for (const deg of ANGLES) {
  const sCross = 540
  const path = makePath(sCross, deg * DEG, 1, 1)
  const mid = passState("takeoff", path.length / 2, path, 0)
  const lateral = Math.hypot(mid.x - roadCenterX(sCross), mid.z + sCross)
  check(lateral < 1, `a ${deg} degree path crosses the road`, `${lateral.toFixed(2)} m off centre`)
}

// 3. The path is fixed: the same path always produces the same line.
{
  const path = makePath(900, 40 * DEG, 1, -1)
  const a = passState("takeoff", 120, path, 0)
  const b = passState("takeoff", 120, path, 0)
  check(
    a.x === b.x && a.y === b.y && a.z === b.z && a.heading === b.heading,
    "the flight path does not move",
    `(${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.z.toFixed(1)})`,
  )
}

// 4. The nose points along the path.
for (const deg of ANGLES) {
  const path = makePath(700, deg * DEG, -1, 1)
  const st = passState("cruise", 300, path, 0)
  const nx = Math.sin(st.heading)
  const nz = Math.cos(st.heading)
  const dot = nx * path.dx + nz * path.dz
  check(Math.abs(dot - 1) < 0.001, `the nose points along the ${deg} degree path`, `dot=${dot.toFixed(4)}`)
}

// 5. Height and speed stay believable.
for (const mode of MODES) {
  let minY = Infinity
  let maxY = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const deg of ANGLES) {
    const path = makePath(300, deg * DEG, 1, 1)
    for (let t = 0; t <= PASS_LENGTH; t += 5) {
      const st = passState(mode, t, path, t / 50)
      minY = Math.min(minY, st.y)
      maxY = Math.max(maxY, st.y)
      minV = Math.min(minV, st.speed)
      maxV = Math.max(maxV, st.speed)
    }
  }
  if (mode === "cruise") {
    // The cloud layer tops out at 127 m, so a cruise has to be above it.
    check(
      minY > 130,
      "cruise flies above the cloud layer",
      `${minY.toFixed(1)}-${maxY.toFixed(1)} m (clouds top out at 127 m)`,
    )
  } else {
    check(
      minY > 5 && maxY < 60,
      `${mode} stays below the cloud layer`,
      `${minY.toFixed(1)}-${maxY.toFixed(1)} m`,
    )
  }
  check(
    minV > 30 && maxV < 80,
    `${mode} stays at a sensible airspeed`,
    `${(minV * 3.6).toFixed(0)}-${(maxV * 3.6).toFixed(0)} km/h`,
  )
}

// 6. Take-off climbs, landing descends, cruise holds height.
const climb = (mode: FlybyMode) => {
  const path = makePath(300, 90 * DEG, 1, 1)
  const a = passState(mode, 0, path, 0).y
  const b = passState(mode, PASS_LENGTH, path, 0).y
  return b - a
}
check(climb("takeoff") > 35, "take-off climbs away", `${climb("takeoff").toFixed(1)} m`)
check(climb("landing") < -35, "landing comes down", `${climb("landing").toFixed(1)} m`)
check(Math.abs(climb("cruise")) < 2, "cruise holds height", `${climb("cruise").toFixed(1)} m`)

// 7. The pitch matches the manoeuvre.
const pitch = (mode: FlybyMode, t: number) => {
  const path = makePath(300, 90 * DEG, 1, 1)
  return (passState(mode, t, path, 0).pitch * 180) / Math.PI
}
check(pitch("takeoff", 0) > 8, "take-off starts nose up", `${pitch("takeoff", 0).toFixed(1)} deg`)
check(pitch("takeoff", PASS_LENGTH) < 3, "take-off levels off", `${pitch("takeoff", PASS_LENGTH).toFixed(1)} deg`)
check(pitch("landing", PASS_LENGTH) < -4, "landing ends nose down", `${pitch("landing", PASS_LENGTH).toFixed(1)} deg`)

// 8. It fades in and out at the ends of the pass.
for (const mode of MODES) {
  const path = makePath(300, 60 * DEG, 1, 1)
  const o0 = passState(mode, 0, path, 0).opacity
  const oMid = passState(mode, PASS_LENGTH / 2, path, 0).opacity
  const oEnd = passState(mode, PASS_LENGTH, path, 0).opacity
  check(o0 < 0.02, `${mode} fades in from nothing`, `opacity=${o0.toFixed(3)}`)
  check(oMid > 0.98, `${mode} is solid across the road`, `opacity=${oMid.toFixed(3)}`)
  check(oEnd < 0.02, `${mode} fades out to nothing`, `opacity=${oEnd.toFixed(3)}`)
}

// 9. The view fade: solid while it is in shot, gone once it has left.
check(viewFade(0) === 1, "solid in the middle of the frame")
check(viewFade(0.8) === 1, "solid near the edge of the frame")
check(viewFade(1.2) === 0, "gone once it is past the edge")
check(viewFade(-1.2) === 0, "gone on the other side as well")
{
  let monotonic = true
  let prev = 1
  for (let x = 0; x <= 1.4; x += 0.01) {
    const f = viewFade(x)
    if (f > prev + 1e-9) monotonic = false
    prev = f
  }
  check(monotonic, "the view fade only ever gets fainter")
}

// 10. The shadow sits on the ground, offset along the sun, and fades with
//     the aircraft's height.
{
  const path = makePath(700, 60 * DEG, 1, 1)
  const st = passState("cruise", 200, path, 0)
  const sh = shadowState(st, 1)
  check(sh.y > 0 && sh.y < 1, "the shadow is on the ground", `y=${sh.y.toFixed(2)}`)
  const dx = sh.x - st.x
  const dz = sh.z - st.z
  check(dx > 0 && dz > 0, "the shadow slides away from the sun", `+${dx.toFixed(1)} x +${dz.toFixed(1)} z`)
  check(
    Math.abs(dx / dz - 2) < 0.01,
    "the shadow offset follows the sun's angle",
    `ratio=${(dx / dz).toFixed(2)}`,
  )
  const low = shadowState(passState("takeoff", 0, path, 0), 1)
  const high = shadowState(passState("takeoff", 400, path, 0), 1)
  check(high.alpha < low.alpha, "the shadow fades as the aircraft climbs", `${low.alpha.toFixed(2)} -> ${high.alpha.toFixed(2)}`)
  check(high.span > low.span, "the shadow spreads as the aircraft climbs", `${low.span.toFixed(0)} -> ${high.span.toFixed(0)} m`)
  check(shadowState(st, 0).alpha === 0, "no shadow when the aircraft is invisible")
}

// 11. Hills in the way push the crossing along the road.
{
  const hillS = 500
  const hillX = roadCenterX(hillS)
  const hillZ = -hillS
  const withHill: TerrainAt = (x, z) => {
    const d = Math.hypot(x - hillX, z - hillZ)
    return d < 120 ? 60 : 0
  }
  const flat: TerrainAt = () => 0
  const pathFor = (s: number) => makePath(s, 60 * DEG, 1, 1)

  check(pathBlocked(pathFor(hillS), "takeoff", withHill), "a hill in the path is detected")
  check(!pathBlocked(pathFor(hillS), "takeoff", flat), "clear ground is not flagged")
  check(!pathBlocked(pathFor(hillS + 400), "takeoff", withHill), "a crossing well clear of the hill is fine")

  const moved = pickCrossing(hillS, "takeoff", pathFor, withHill, hillS, 0)
  check(Math.abs(moved - hillS) > 100, "the crossing is moved off the hill", `${hillS} -> ${moved}`)
  check(!pathBlocked(pathFor(moved), "takeoff", withHill), "the new crossing has a clear path")
  check(pickCrossing(hillS, "takeoff", pathFor, flat, hillS, 0) === hillS, "a clear crossing is left where it is")
  const ahead = pickCrossing(hillS, "takeoff", pathFor, withHill, hillS, 100)
  check(ahead >= hillS + 100, "the crossing is not moved behind the car", `${ahead}`)
}

// 12. The chase camera can actually see it: the pass has to be framed, not
//     parked off the edge of the screen.
{
  const cam = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 2500)
  const carS = 300
  const carPos = new THREE.Vector3(roadCenterX(carS), 0.7, -carS)
  const yaw = roadYaw(carS)
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
  cam.position.copy(carPos).addScaledVector(fwd, -5.8)
  cam.position.y = 1.7
  cam.lookAt(carPos)
  cam.updateMatrixWorld(true)

  for (const deg of ANGLES) {
    for (const mode of MODES) {
      // A cruise crosses further down the road, because it is high.
      const lead = mode === "cruise" ? CRUISE_LEAD : CROSS_LEAD
      const path = makePath(carS + lead, deg * DEG, 1, 1)
      let visible = 0
      let total = 0
      let crossX = 0
      let crossY = 0
      let solidAtCross = 0
      for (let t = 0; t <= PASS_LENGTH; t += 20) {
        const st = passState(mode, t, path, 0)
        const p = new THREE.Vector3(st.x, st.y, st.z).project(cam)
        total++
        if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) visible++
        if (t === PASS_LENGTH / 2) {
          crossX = p.x
          crossY = p.y
          solidAtCross = viewFade(p.x) * st.opacity
        }
      }
      // A square-on pass sweeps 400 m either side of the road, so most of
      // it is behind or beside the camera; what matters is that the
      // crossing itself is framed and solid.
      check(
        visible / total > 0.3,
        `a ${deg} degree ${mode} pass is on screen for a good part of its run`,
        `${((visible / total) * 100).toFixed(0)}% of the pass`,
      )
      check(
        Math.abs(crossX) < 0.9 && crossY > -0.2 && crossY < 0.95,
        `a ${deg} degree ${mode} crossing is framed`,
        `ndc=(${crossX.toFixed(2)}, ${crossY.toFixed(2)})`,
      )
      check(
        solidAtCross > 0.9,
        `a ${deg} degree ${mode} crossing is fully solid`,
        `opacity=${solidAtCross.toFixed(2)}`,
      )
    }
  }
}

// 13. The pass stays inside the fog and the camera's far plane.
for (const deg of ANGLES) {
  const path = makePath(300, deg * DEG, 1, 1)
  let maxDist = 0
  for (let t = 0; t <= PASS_LENGTH; t += 5) {
    const st = passState("takeoff", t, path, 0)
    maxDist = Math.max(
      maxDist,
      Math.hypot(st.x - roadCenterX(300), st.z + 300),
    )
  }
  check(
    maxDist < FOG_FAR + 200,
    `a ${deg} degree pass stays inside the visible range`,
    `furthest ${maxDist.toFixed(0)} m (fog ends at ${FOG_FAR} m)`,
  )
}

// 14. Every aircraft: prepared size, facing and propellers.
for (const spec of AIRCRAFT) {
  const buf = await Bun.file(`src/mainview/models/${spec.file}`).arrayBuffer()
  const gltf: any = await new GLTFLoader().parseAsync(buf, "")
  const model = gltf.scene
  model.updateMatrixWorld(true)

  const { props, span } = prepareAircraft(model, spec)
  check(
    props.length === (spec.prop === "separate" ? 4 : spec.prop === "merged" ? 1 : 0),
    `${spec.file} propeller parts found`,
    `found ${props.length}`,
  )

  // The props must spin about the thrust axis, which is the direction
  // the nose points.
  {
    // Where the nose points in the model's own space, before the yaw.
    const nose = new THREE.Vector3(-Math.sin(spec.yaw), 0, Math.cos(spec.yaw))
      .applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
      .normalize()
    let worst = 0
    for (const p of props) {
      const q = p.node.getWorldQuaternion(new THREE.Quaternion())
      const axis = p.axis.clone().applyQuaternion(q).normalize()
      worst = Math.max(worst, 1 - Math.abs(axis.dot(nose)))
    }
    check(
      worst < 0.02,
      `${spec.file} propellers spin about the thrust axis`,
      `worst deviation ${(worst * 57.3).toFixed(2)} deg`,
    )
  }

  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  // The span ends up along X and the fuselage along Z.
  check(
    Math.abs(size.x - spec.span) < 0.6,
    `${spec.file} is scaled to a believable span`,
    `${size.x.toFixed(1)} m across`,
  )
  check(
    size.z > spec.span * 0.6 && size.z < spec.span * 1.6,
    `${spec.file} fuselage length is believable`,
    `${size.z.toFixed(1)} m long`,
  )
  check(
    size.y < spec.span * 0.5,
    `${spec.file} height is believable`,
    `${size.y.toFixed(1)} m tall`,
  )

  // The nose must point along +Z now. The tail fin is the tallest part
  // of the aircraft, so the highest points of the model have to be
  // behind the middle.
  let finTop = -Infinity
  let finZ = 0
  let finN = 0
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const pos = m.geometry.getAttribute("position")
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(pos, i)
        .applyMatrix4(m.matrixWorld)
      finTop = Math.max(finTop, v.y)
    }
  })
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const pos = m.geometry.getAttribute("position")
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(pos, i)
        .applyMatrix4(m.matrixWorld)
      if (v.y > finTop * 0.92) {
        finZ += v.z
        finN++
      }
    }
  })
  finZ = finN ? finZ / finN : 0
  check(
    finZ < -2,
    `${spec.file} nose faces +Z`,
    `the tall fin sits at z=${finZ.toFixed(1)}`,
  )

  // The centre of mass is where the group origin is.
  const centre = box.getCenter(new THREE.Vector3())
  check(
    Math.abs(centre.x) < 0.4 && Math.abs(centre.y) < 0.4 && Math.abs(centre.z) < 0.4,
    `${spec.file} is centred on its origin`,
    `(${centre.x.toFixed(2)}, ${centre.y.toFixed(2)}, ${centre.z.toFixed(2)})`,
  )
}

// 15. The traffic: three aircraft, each with a model, a speed and a set
//     of manoeuvres.
check(AIRCRAFT.length >= 3, "the sky has more than one kind of traffic", `${AIRCRAFT.length} types`)
{
  const files = new Set(AIRCRAFT.map((a) => a.file))
  check(files.size === AIRCRAFT.length, "every aircraft is a different model")
  let allThere = true
  for (const a of AIRCRAFT) {
    if (!(await Bun.file(`src/mainview/models/${a.file}`).exists())) allThere = false
    if (a.modes.length === 0) allThere = false
    if (a.span < 5 || a.span > 60) allThere = false
  }
  check(allThere, "every aircraft has a model, a span and a manoeuvre")
  const speeds = AIRCRAFT.map((a) => a.speed)
  check(
    new Set(speeds).size === speeds.length,
    "the aircraft fly at different speeds",
    speeds.join(", "),
  )
}

// 16. The Cessna's propeller is cut out of its body, so it can turn.
{
  const spec = AIRCRAFT.find((a) => a.prop === "merged")!
  const buf = await Bun.file(`src/mainview/models/${spec.file}`).arrayBuffer()
  const gltf: any = await new GLTFLoader().parseAsync(buf, "")
  const model = gltf.scene
  model.updateMatrixWorld(true)
  const body = model.getObjectByName("awionetka_airplane_0") as THREE.Mesh
  const before = body.geometry.index!.count / 3
  const { props } = prepareAircraft(model, spec)
  const after = body.geometry.index!.count / 3
  check(
    after < before,
    "the propeller is cut out of the body mesh",
    `${before} -> ${after} triangles`,
  )
  const bladeTris = props[0]
    ? (props[0].node.children[0] as THREE.Mesh).geometry.index!.count / 3
    : 0
  check(
    bladeTris > 0 && before - after === bladeTris,
    "the cut-out triangles became the propeller",
    `${bladeTris} triangles on the prop`,
  )
  // The prop has to sit at the front of the aircraft, at the nose.
  const hub = props[0]!.node.getWorldPosition(new THREE.Vector3())
  const nose = new THREE.Vector3(0, 0, 1)
  check(
    hub.z > 1.5,
    "the propeller is at the nose of the aircraft",
    `hub z=${hub.z.toFixed(2)}`,
  )
  // And it has to be balanced: the blades have to sit on opposite sides
  // of the hub, or the prop wobbles as it turns.
  const blade = props[0]!.node.children[0] as THREE.Mesh
  const bb = new THREE.Box3().setFromObject(blade)
  const straddleX = bb.min.x < hub.x && bb.max.x > hub.x
  const straddleY = bb.min.y < hub.y && bb.max.y > hub.y
  check(
    straddleX || straddleY,
    "the blades sit on opposite sides of the hub",
    `hub ${hub.toArray().map((n) => n.toFixed(2)).join(",")} blades ${bb.min.toArray().map((n) => n.toFixed(2)).join(",")}..${bb.max.toArray().map((n) => n.toFixed(2)).join(",")}`,
  )
}

console.log(fails === 0 ? "\nAll flyby checks passed" : `\n${fails} check(s) failed`)
if (fails > 0) process.exit(1)
