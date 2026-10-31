# OverSteer: Architecture Overview

How the game is put together and where to change things. Car numbers are not documented here: they live in `src/mainview/data/cars/<id>.ts`, and that file is the reference. For adding a car see [AddingCars.md](AddingCars.md); for the history of the physics work see [PHYSICS_UPGRADE_PLAN.md](PHYSICS_UPGRADE_PLAN.md).

1. [What the game is](#1-what-the-game-is)
2. [Layers](#2-layers)
3. [Data: the car spec](#3-data-the-car-spec)
4. [The fixed step](#4-the-fixed-step)
5. [The vehicle pipeline](#5-the-vehicle-pipeline)
6. [World, surfaces and weather](#6-world-surfaces-and-weather)
7. [AI, racing and traffic](#7-ai-racing-and-traffic)
8. [Multiplayer](#8-multiplayer)
9. [Controls](#9-controls)
10. [Testing](#10-testing)
11. [Where tuning goes](#11-where-tuning-goes)

---

## 1. What the game is

A desktop driving game on an Electrobun shell: React 18 and three.js for the view, Rapier 3D (WASM) for rigid bodies, and a hand-written vehicle model on top. Twelve cars, an endless deterministic road, AI rivals and traffic, races of 1 to 10 km, and peer-to-peer or LAN multiplayer. The gearbox is automatic only; launch control and managed power are safety aids.

## 2. Layers

| Layer       | Where                                    | Job                                                                  |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Shell       | `src/bun/index.ts`                       | Window, menu (including a second test window), LAN relay on port 9876 |
| Data        | `src/mainview/data/`                     | Car specs, schema and validation, tyre/engine/crash presets, surfaces, netcode tuning, world constants |
| Physics     | `src/mainview/physics/`                  | Rapier world and fixed stepper (`core/`), the vehicle model (`vehicle/`) |
| Systems     | `src/mainview/systems/`                  | World, AI, visuals, lights, paint, smoke, input, settings, netcode (`net/`) |
| UI          | `src/mainview/ui/`, `App.tsx`            | Frame loop, camera, HUD, menus, race overlay, lobby, settings        |
| Tools       | `scripts/`                               | Headless tests, dyno, audits, model prep scripts                     |

Dependencies point downwards: physics imports data, never systems or UI. Headless scripts import physics and data directly, which is why the same code is tested without the app.

## 3. Data: the car spec

`CarSpec` (`data/schema.ts`) is the single description of a car. `data/cars/index.ts` registers them, and `data/validate.ts` checks every spec at load (dev throws, production skips a bad car with a log).

- **Build helpers**: `engineBuild` (inertia, friction and response from layout, cylinders, displacement and flywheel), `tyre(preset, overrides)` (sport, street, race), `CRASH.*` (open, sport, road, heavy).
- **No defaults in code.** A tuned number in a system is a bug: add a schema field, fill it in each car, validate it. `scripts/audit-literals.ts` enforces this (`scripts/audit-allowlist.json` holds the few accepted constants).
- **Other data**: `data/surfaces.ts` (surface and weather grip), `data/net.ts` (netcode), `data/world.ts` (gravity, physics rate, step budget), `data/units.ts`.

## 4. The fixed step

Physics runs at a fixed 120 Hz (`FIXED_DT`) with a bounded number of substeps per frame (`maxSubsteps`), so results do not depend on the frame rate. `PhysicsSystem` owns the Rapier world, the stepper and the pose history; the frame loop in `App.tsx` interpolates the rendered pose between the last two steps. On each fixed tick the loop reads input, runs `Vehicle.update`, steps Rapier, runs AI and the netcode send. Everything a test needs (`makeRig`, `stepVehicleOnce`) is the same path.

## 5. The vehicle pipeline

`physics/vehicle/Vehicle.ts` builds the components from a spec and runs them in a fixed order each tick:

1. **Kinematics**: body speed, slip and heading from the rigid body.
2. **Input handling**: reverse swap, mode, launch, assists, ignition, handbrake latch.
3. **Steering**: speed-sensitive, rate-limited, grip-aware; alignment (camber, caster) and aligning torque.
4. **Direction shift and launch**: park/drive/reverse logic, launch staging.
5. **Engine**: rpm from the coupled drivetrain (or free-revving), torque from the curve and throttle map, turbo, rev limiter, engine braking.
6. **Gearbox and shift logic**: automatic shifting with torque converter; aggression estimates the driver's intent.
7. **Assists**: traction control, ESC, ABS act on the requested torques and brakes.
8. **Wheel solver**: per wheel, suspension (spring, damper, anti-roll, bump stops) gives load, the tyre model (Pacejka with combined slip, relaxation, camber thrust, surface and weather scale) gives forces, wheel dynamics integrates wheel speed against driveline and brake torque (differentials: open, limited-slip, centre).
9. **Body forces**: tyre and aero forces (drag, lift, downforce, yaw effects, active aero), damping, creep, impact response, self-righting and the velocity limiter.

Each stage is a file in `components/` with its parameters in the spec. Output is `CarTelemetry` (`Telemetry.ts`), which the dashboards, AI and netcode read.

## 6. World, surfaces and weather

`systems/WorldManager.ts` builds a deterministic road (centreline, elevation, banking, from `systems/road.ts` and `constants/world.ts`) as ribbons that recycle ahead of the car, with trees and hills seeded per segment, so a stretch looks the same each pass. Colliders carry a surface (`asphalt`, `grass`, `dirt`, `gravel`, `sand`); weather (`dry`, `damp`, `wet`, `storm`) scales grip through `surfaceGrip`. Time of day moves the sun and moon. `AirplaneFlyby` adds aircraft; `TireSmoke` and `carLights` handle smoke and lamps.

## 7. AI, racing and traffic

`AIDriver` drives rivals and traffic cars along the road with the same `Vehicle` model as the player. A race has a grid, staged start, countdown and standings (`RaceTypes.ts`, `ui/RaceOverlay.tsx`); distance is 1, 2, 5 or 10 km, rivals 1 to 50. Traffic is off, low, medium or high. Rivals cycle through the car registry.

## 8. Multiplayer

Rooms run over WebRTC (Trystero) or the LAN relay. Netcode is documented in detail in `PHYSICS_UPGRADE_PLAN.md` (P7); in short:

- **Wire**: a 72-byte binary state (smallest-three quaternion, quantised velocity and angular velocity, steer, speed, rpm, gear, pedals, flags, progress, per-wheel speed and compression, smoke) sent on the fixed tick at 60 Hz. Protocol version 2; a version mismatch is refused in the handshake.
- **Timeline**: `NetClock` estimates each sender's clock offset, delay adapts to send interval, jitter, queue peaks and loss (slew limited). `SnapshotBuffer` interpolates with Hermite splines and extrapolates for at most 120 ms with fading velocity.
- **Remote cars** (`RemoteCar`) are kinematic-driven ghost bodies with real wheel speeds and compression, brake lights and smoke. They are solid to the local car with whole-car mass scaled by `massScale`; a ghost that overlaps the local car stays non-solid until clear. `correction.ts` softens the local car's response to remote contacts and hard hits.
- **Spec check**: HELLO carries a hash of the car data; a mismatch is flagged and logged.
- All tuning is in `data/net.ts`. `NetDiagPanel` shows live delay, jitter, loss and correction.

For testing, the app menu has **New Window (multiplayer test)** (Cmd/Ctrl+N), which opens a second window on the same dev server.

## 9. Controls

| Input | Action |
| --- | --- |
| `W`/`↑`, `S`/`↓`, `A` `D`/`←` `→` | Throttle, brake and reverse, steer |
| `Space` | Handbrake (tap to latch, hold to engage) |
| `E` / `Q`, `M` | Shift up / down, transmission mode |
| `L` | Launch control |
| `X` `G` `B` `N` | Traction control, stability control, ABS, all safety aids |
| `V` | Engine on / off |
| `;` `[` `]` | Cruise toggle, set / resume |
| `H` `T` | Headlights, time of day |
| `R` `C` | Put car back on road, camera |
| `P` / `Esc`, `Enter` | Pause, start |

## 10. Testing

Everything runs headless with bun. See the README for commands.

| Area | Scripts |
| --- | --- |
| Data | `validate-cars`, `audit-literals --fail` |
| Whole car | `smoke-test`, `feel-test`, `chassis-tests`, `drift-matrix`, `handling-report`, `car-matrix` |
| Components | `component-tests`, `suspension-test`, `tire-model-test`, `wheel-dynamics-test`, `engine-realism`, `tire-curves` |
| World | `world-tests`, `seam-test`, `road-test`, `airplane-*-test` |
| Netcode | `net-codec-test`, `net-protocol-test`, `net-interp-test`, `net-correction-test`, `net-contact-repro` |
| Regression | `golden-master` (recorded baseline), `fixed-step-test`, `perf-bench` |
| Models | `car-visual-check`, `light-info`, `light-materials-test` |
| Tools | `dyno`, `run-per-car` (any suite over every car, with `known-failures.json`) |

Honest limits: the tests exercise the physics and the netcode logic headlessly; the real renderer, WebRTC transport and feel on a keyboard are only checked by running the app. Trystero's data channel is reliable and ordered, so a lossy link shows as delay, not as dropped packets.

## 11. Where tuning goes

| To change | Edit |
| --- | --- |
| How a car drives | `data/cars/<id>.ts` (compare with `scripts/dyno.ts`) |
| A tyre compound or engine build | `data/tyres.ts`, `data/engines.ts` |
| Crash behaviour | `data/crash.ts` |
| Grip on a surface or in weather | `data/surfaces.ts` |
| Netcode delay, smoothing, collision feel | `data/net.ts` |
| Road, trees, environment | `constants/world.ts` |
| How a part behaves for every car | its file in `physics/vehicle/components/`, then run the per-car suites and the golden master |
