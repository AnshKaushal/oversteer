/**
 * High-gear stability: after a hard steer at speed in gears 5-6, releasing the
 * wheel at full throttle must straighten the car instead of leaving it in a
 * steady slide. Run with CAR=<id>.
 */
import {
  initPhysics,
  moveGroundBody,
} from "../src/mainview/physics/core/PhysicsSystem";
import type { DriveInput } from "../src/mainview/systems/InputManager";
import { activeCar, makeRig } from "./lib/cars";

const RAPIER = await initPhysics();
const idle = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
} as DriveInput;
const DEG = 180 / Math.PI;
const HZ = 120;

function betaOf(body: any): number {
  const v = body.linvel();
  const q = body.rotation();
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const rz = 2 * (q.x * q.z - q.w * q.y);
  return (
    Math.atan2(
      v.x * rx + v.z * rz,
      Math.max(1, Math.abs(v.x * fx + v.z * fz)),
    ) * DEG
  );
}

let failed = 0;
for (const gear of [5, 6]) {
  for (const kmh of [100, 140, 180]) {
    const s = makeRig(RAPIER, activeCar());
    s.body.setLinvel({ x: 0, y: 0, z: -kmh / 3.6 }, true);
    s.car.gear = gear;
    s.car.rpm = 5000;
    s.car.autoMode = false;
    s.car.update(1 / HZ, idle);
    s.world.step();
    for (let i = 0; i < 6 * HZ; i++) {
      const t = i / HZ;
      s.car.update(1 / HZ, { ...idle, throttle: 1, steer: t < 2 ? 0.35 : 0 });
      s.world.step();
      if (i % 60 === 0) {
        const p = s.body.translation();
        moveGroundBody(s.gb, p.x, p.z);
      }
    }
    const end = Math.abs(betaOf(s.body));
    const ok = end < 8;
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} | gear ${gear} @ ${kmh} km/h settles after steer release | end beta=${end.toFixed(1)}°`,
    );
  }
}
console.log(
  failed ? `${failed} HIGH-GEAR CHECKS FAILED` : "ALL HIGH-GEAR CHECKS PASSED",
);
process.exit(failed ? 1 : 0);
