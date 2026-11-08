import { Vehicle } from "../src/mainview/physics/vehicle/Vehicle"
import { initPhysics } from "../src/mainview/physics/core/PhysicsSystem"
import type { DriveInput } from "../src/mainview/systems/InputManager"
import { electricalPower } from "../src/mainview/systems/carLights"
import { activeCar, makeRig } from "./lib/cars"

void Vehicle
const RAPIER = await initPhysics()
const idle = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  upshiftPressed: false,
  downshiftPressed: false,
  toggleModePressed: false,
  toggleLaunchPressed: false,
  resetPressed: false,
  toggleCameraPressed: false,
  startPressed: false,
  escapePressed: false,
} as DriveInput

function run(
  name: string,
  mk: (t: number) => Partial<DriveInput>,
  v0: number,
  gear: number,
) {
  const s = makeRig(RAPIER, activeCar())
  s.body.setLinvel({ x: 0, y: 0, z: -v0 }, true)
  s.car.gear = gear
  s.car.update(1 / 120, idle)
  s.world.step()
  let min = 9,
    max = 0,
    changes = 0,
    last = -1
  for (let i = 0; i < 6 * 120; i++) {
    const t = Math.round((i / 120) * 100) / 100
    s.car.update(1 / 120, { ...idle, ...mk(t) } as DriveInput)
    s.world.step()
    const e = (s.car as any).engine
    const p = electricalPower(e.ignition, e.cranking, e.crankTime, e.sinceCatch)
    if (t > 1.5) {
      min = Math.min(min, p)
      max = Math.max(max, p)
      if (Math.abs(p - last) > 0.05) changes++
      last = p
    }
  }
  console.log(
    `${name.padEnd(34)} power ${min.toFixed(2)}..${max.toFixed(2)} jumps ${changes}`,
  )
}
// engine off by ignition tap then tap on
const offOn = (t: number) => ({
  toggleIgnitionPressed: t === 0.25 || t === 0.5,
})
run("ign off->on, stationary", offOn, 0, 0)
run("ign off->on, rolling gear2", offOn, 15, 2)
run(
  "ign off->on, rolling + throttle",
  (t) => ({ ...offOn(t), throttle: 1 }),
  15,
  2,
)
run("ign off->on, crank held", (t) => ({ ...offOn(t), crankHeld: t > 1 }), 0, 0)
run(
  "ign off->on, crank held in gear+thr",
  (t) => ({ ...offOn(t), crankHeld: t > 1, throttle: 1 }),
  3,
  1,
)
{
  const s = makeRig(RAPIER, activeCar())
  s.car.update(1 / 120, idle)
  s.world.step()
  const e = (s.car as any).engine
  let line = ""
  for (let i = 0; i < 6 * 120; i++) {
    const t = Math.round((i / 120) * 100) / 100
    s.car.update(1 / 120, {
      ...idle,
      toggleIgnitionPressed: t === 0.25 || t === 0.5,
      crankHeld: t > 1,
    } as DriveInput)
    s.world.step()
    if (i % 30 === 0)
      line += `t=${t} stalled=${e.stalled} ign=${e.ignition} crank=${e.cranking} ct=${e.crankTime.toFixed(2)} sc=${e.sinceCatch.toFixed(1)}\n`
  }
  console.log(line, "dur", e.crankDuration)
}
