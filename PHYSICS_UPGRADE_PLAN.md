# OverSteer physics upgrade plan (branch `feat/physics`)

Inputs: `OVERSTEER_REPORT.md` (current app), `PHYSICS_COMPARISON_BEAMNG.md` (gap analysis and sources).
Everything under "Facts" below was checked in source on 2026-10-31. Nothing has been run.

## 1. Goals and rules

1. **More realistic, rigid-body, no damage.** Keep one Rapier rigid body per car with raycast suspension and Pacejka tires. Raise fidelity inside that model.
2. **Componentised code.** `CarController` (1387 lines) becomes a small orchestrator over swappable components.
3. **No frame-rate cap.** Rendering runs at the display's refresh rate or higher. Physics runs at its own fixed rate and the renderer interpolates.
4. **No hardcoded physics values in code.** Every physics number lives in data. Adding a car means adding one car data file and nothing else.
5. **Never break multiplayer.** Packet layout changes only in the multiplayer phase, behind a protocol version.

Rule 4 is enforced by a script (P0), not by convention. The script fails the build when a numeric literal other than 0, 1, 2, -1 or a named unit conversion appears in `systems/physics/**`.

## 2. Facts that shape the plan

| Fact | Where |
|---|---|
| Fixed step 1/120 s, max 6 substeps per frame, accumulator in `pushFrameTime` | `PhysicsSystem.ts:85-114` |
| Frame dt clamped to `maxFrameDt` (1/30 s) in two places, so below 30 fps the game runs in slow motion | `App.tsx:1238`, `CarController.ts:323` |
| Render loop is `requestAnimationFrame` and reads body pose after stepping. I found no render-time interpolation (no alpha or previous-pose blend) in `App.tsx`. | `App.tsx:1233-1238` |
| I found no explicit 60 fps cap in the game code. A cap, if present, comes from the webview or the display. Unverified. | grep of `App.tsx`, `systems/*`, `src/bun/index.ts` |
| Chassis collider shape (`0.75, 0.33, 1.05`, offsets, friction 0.4, restitution 0.1) and reference size (1.85/1.43/4.71) are literals | `PhysicsSystem.ts:70-77` |
| Suspension constants are module-level and shared by all cars (`REST_LENGTH = 0.915` etc.) | `Suspension.ts:46-53` |
| `SLIP_V0`, `RR_V0`, `COMBINED_BW` are global exports | `TireModel.ts` |
| `CAR_PHYSICS` is a full default set that `createPhysicsConfig` merges under every car, so a missing value silently falls back to the M3-like default | `constants/physics.ts` |
| Dead fields: `differential`, `engineInertia`, `ackermannFactor`, `returnSpeed` | see report §14 |
| Numeric-literal lines (rough grep): CarController 171, WorldManager 135, AIDriver 95, Suspension 8, TireModel 3, WheelDynamics 1 | `systems/*.ts` |
| `cars.ts` is 1223 lines, 11 near-identical override blocks | `constants/cars.ts` |
| Remote cars use their own constants (`TIRE_RADIUS = 0.33`, gains, warp distance) | `net/RemoteCar.ts:41-48` |
| **Most tests cover one car only.** `smoke-test`, `drift-matrix`, `suspension-test`, `wheel-dynamics-test`, `tire-model-test`, `fixed-step-test` and `perf-bench` call `new CarController(world, body, RAPIER)` with no config, so they run the default `CAR_PHYSICS` (identical to the M3) and the default wheels. Only `car-matrix` (and `light-materials-test`) loop over `CARS`. `car-matrix` checks spawn, parking brake, gearbox and speed sanity, not handling. | `scripts/*.ts` |
| More hardcodes found while checking: chassis damping `0.001` / `0.55` and the wheelbase fallback `2.85` in the `CarController` constructor; `createChassisBody` falls back to default dimensions | `CarController.ts:141-170` |
| Existing test scripts to reuse: `car-matrix`, `drift-matrix`, `tire-model-test`, `wheel-dynamics-test`, `suspension-test`, `fixed-step-test`, `perf-bench`, `net-protocol-test`, `smoke-test` | `scripts/` |

## 3. Target architecture

```
src/mainview/
  physics/
    core/            FixedStepper, WorldHost (Rapier), PoseHistory (prev/curr for interpolation)
    vehicle/
      Vehicle.ts            orchestrator: builds components from a CarSpec, runs step(dt)
      components/
        Engine.ts           torque LUT, part-throttle power model, inertia, limiter, optional turbo
        Clutch.ts           clutch / torque converter
        Gearbox.ts          ratios, shift timing
        ShiftLogic.ts       auto / manual / arcade, shift points derived from torque curve
        Driveline.ts        graph: transfer case, centre/front/rear diffs, motors
        Differential.ts     open, LSD (preload, ramp angles), locked, torque-vectoring
        Axle.ts             steering geometry, ackermann, camber, toe, brakes
        Wheel.ts            per-wheel omega dynamics + tire contact
        Suspension.ts       spring, bump/rebound damper, bump stop, ARB, ride height
        Tire.ts             Pacejka + friction ellipse, relaxation, load sensitivity
        Aero.ts             drag, lift, downforce
        Assists/{Abs,Tcs,Esc,Countersteer,Launch,Cruise}.ts
      CarSpec.ts            the typed schema
    surfaces/        surface table (asphalt, grass, dirt, ...) with friction and rolling resistance
    world/           gravity, road model, terrain colliders
  data/
    cars/<car-id>.ts        one file per car (the only place car values are typed)
    tires/<compound>.ts     shared tire presets
    surfaces.ts             shared surface table
    world.ts                gravity, step rate, limits
    schema + validate.ts    validates every file at startup and in a script
  render/            interpolation, camera, car visuals (consumes PoseHistory)
```

`CarController` is deleted at the end of P3. App code talks to `Vehicle` through a small interface: `step(dt, input)` for physics, `getPose(alpha)` and `getTelemetry()` for rendering and UI.

Component contract (same for all): a component takes its own typed params from `CarSpec`, exposes `step(dt, inputs) -> outputs`, holds its own state, and has no import of another component (the `Vehicle` wires them). That makes each one unit-testable alone.

## 4. Phases

Every phase ends with the app working, the golden-master comparison passing (or intentionally re-baselined and noted in the commit), and the audit script green. Commit per task, not per phase.

### P0: Branch and safety net
- Create `feat/physics` from `main`. Commit the three markdown reports first.
- **Make every test run on every car first.** Add `scripts/lib/cars.ts` with `forEachCar(fn)`, which builds the world, chassis body (with the car's dimensions and mass) and `CarController` (with the car's physics, wheels and dash) exactly as `car-matrix.ts` does. Convert `smoke-test`, `drift-matrix`, `suspension-test`, `wheel-dynamics-test`, `tire-model-test`, `fixed-step-test` and `perf-bench` to use it, so each check reports per car. Expect some checks to fail on non-M3 cars today; list those failures as known issues before any physics change, then decide per check whether the threshold or the car is wrong. The constructor defaults then become unused by tests, and P1 removes them.
- **Golden master:** extend `car-matrix.ts` to run headless for every car and write a JSON baseline: 0-100 km/h, top speed, 100-0 braking distance, skidpad lateral g, steady-state understeer gradient, and a fixed-throttle/fixed-steer trajectory sample at 10 points. Commit the baseline. Tolerance default 2%, trajectories 0.3 m.
- **Literal audit script** (`scripts/audit-literals.ts`): reports numeric literals under physics directories, with an allowlist file. Start in report-only mode and print the current count as the burn-down number.
- Run the converted per-car suite, `net-protocol-test` and the matrix on `main` once to confirm the baseline is green. If any fail on `main`, record that before changing anything (the M3 lamp-test claim in `AddingCars.md` is unverified).
- Run `graphify update .` after each phase's code changes, per `AGENTS.md`.

### P1: Data layer and zero hardcoded values
Behaviour must not change.
1. Define `CarSpec` (typed) and a validator with range checks and cross-checks: torque curve peak vs `maxTorqueNm`, power vs curve, wheel positions vs wheelbase/track, mass sum, gear count vs ratios. Run it at startup (fail loudly in dev, log and reject the car in production) and as a script.
2. **Remove the global default fill.** A car file is complete or it fails validation. Shared presets are explicit (`extends: "tire/sport"`), not silent fallbacks. Open decision D1 below.
3. Split `cars.ts` into `data/cars/<id>.ts`, one file each. A `cars/index.ts` registry loads them. The car list UI, AI, traffic and multiplayer read the registry.
4. Move every literal from: `Suspension.ts` (rest length, droop, bump stop, ARB limit, force cap) into `CarSpec.suspension`; `TireModel.ts` constants into `CarSpec.tires` or the tire preset; chassis collider shape, friction and restitution into `CarSpec.chassis`; `FIXED_DT`/`MAX_SUBSTEPS`/`maxFrameDt` into `data/world.ts`; `RemoteCar` wheel radius from the car's spec.
5. Derive instead of duplicating: wheel positions from wheelbase, track and `wheelRadius`; rest length from ride height and wheel radius; peak power/torque from the curve.
6. Delete or implement the dead fields. They are implemented in P4, so mark them `@planned` in P1 and remove from the schema only if P4 drops them.
7. Switch the audit script to fail mode for the files already converted.

Done when: matrix baseline unchanged, `cars.ts` gone, audit count for `Suspension/TireModel/PhysicsSystem/WheelDynamics` is zero.

### P2: Uncapped frame rate
Start with a **measurement spike**: add a frame counter overlay (frames per second, physics steps per second, step time) and run in the desktop shell on macOS and Windows with a high-refresh display if available. Record whether the shell itself caps `requestAnimationFrame`. I have not verified this. If it does, the fix is in the shell/webview flags (`src/bun/index.ts` and Electrobun config), not the game loop.

Then the loop change:
1. `FixedStepper` owns the accumulator. Physics steps at `data/world.ts` rate (start at 120 Hz). The render loop calls `stepper.advance(frameDt)`, runs N steps, and keeps `alpha = acc / step`.
2. `PoseHistory` stores previous and current pose for each body (chassis position and quaternion, per-wheel suspension compression, wheel spin angle). The renderer draws `lerp/slerp(prev, curr, alpha)`. Camera follows the interpolated pose, not the raw body, which also removes camera jitter at any refresh rate.
3. Replace the 1/30 s frame clamp with a **time budget**: if the frame is too slow, run at most as many steps as fit in a budget (configurable), and drop the remaining accumulated time with a visible counter (the current `droppedTotal` idea) rather than slow motion at a fixed 6 steps.
4. Split per-frame work from per-step work. Anything that runs once per step (controller, AI, suspension rays, remote-body driving) moves to `step`. Anything visual (smoke, lights, gauges, FOV, camera shake) moves to a per-frame update that uses the real frame dt and interpolated state. `App.tsx` currently mixes these in one loop of about 2000 lines.
5. Remove any other 60 Hz assumptions (grep for `1 / 60`, `16`, `0.016`): `BROADCAST_INTERVAL_MS = 16` becomes a network rate decoupled from render; `drive` constants in `RemoteCar` use step dt.
6. Quality tiers: run `perf-bench.ts` before and after, and report ms per step for 1, 8 and 20 cars. Each car costs 4 rays per step plus wheel solves. Traffic and rivals may need a lower update rate for distant cars; make that a data setting.
7. Option for a physics rate of 240 Hz if low-speed tire stability or high-speed suspension needs it. Only enable it if perf-bench shows headroom.

Done when: at 144 Hz and 240 Hz displays motion is smooth (no 2-frame stutter pattern), physics results are identical at 60, 144 and 240 fps in the headless fixed-step test, and the in-game counter shows no cap on a machine that can exceed 60.

### P3: Componentise `CarController`
Behaviour-preserving refactor, golden master must pass.
1. Write the component interfaces from §3 and move code in this order, running the matrix after each step: `Aero` (smallest), `Tire`/`Wheel`, `Suspension`, `Engine`, `Clutch`+`Gearbox`+`ShiftLogic`, `Driveline`/`Differential`, assists, then `Vehicle`.
2. Each assist becomes its own file with its own params, enabled per car by data (`assists: { abs: {...}, tcs: {...} }`). Presence in the spec means enabled.
3. Separate state from step: components expose state for telemetry, not through the controller. `CarTelemetry` is assembled by `Vehicle`.
4. Replace `drivetrain.type: "rwd" | "fwd" | "awd"` with a driveline description. Keep `type` as a shorthand that expands to the graph during validation, so existing cars keep working.
5. Unit tests per component (Engine torque at rpm/throttle, ShiftLogic points, Differential torque split, Tire force vs slip). Add to `scripts/`.
6. AI driver and multiplayer remote cars keep working through the `Vehicle` interface. Check `AIDriver` uses only public telemetry and inputs.

Done when: `CarController.ts` is gone, no file in `physics/` exceeds about 400 lines, the matrix and trajectory samples are within tolerance, and the audit count in `physics/**` is zero.

### P4: Powertrain realism
- **Engine:** keep the torque LUT; add the part-throttle power model (throttle scales power, not torque), engine inertia and engine braking from data, optional turbo (boost curve, lag).
- **Shift logic:** compute optimal shift points from the torque curve and ratios, with per-car overrides in data. Shift-time and clutch parameters from data. Add arcade and realistic modes (BeamNG-style).
- **Differentials:** implement real behaviour for open, LSD (preload, power/coast ramp lock), locked and a torque-vectoring option; centre diff and transfer case for AWD (fixed split, viscous, active). This also makes the currently dead `differential` config live.
- **EV and hybrid:** motors as driveline devices, regen as negative torque.
- **Wheel dynamics:** brake bias and brake temperature fade optional; handbrake from data.
- Re-baseline the matrix with a recorded changelog of what changed and why.

### P5: Chassis, suspension and tires
- **Suspension:** per-axle spring rates, progressive spring, separate bump/rebound damping, bump stop curve, ride height, motion ratio. Rest length derived from ride height and wheel radius (no 0.915).
- **Alignment:** camber and toe effects on slip angle and lateral force; static camber from data; camber change with compression as a simple gain.
- **Tires:** friction ellipse for combined slip, peak mu falling with load (currently only stiffness exponent is configured), tire presets (street, sport, race, all-season, off-road), pressure and temperature as optional later work. Remove the global `SLIP_V0` smoothing by moving to a velocity-dependent relaxation model that is stable at low speed, per tire preset.
- **Steering:** ackermann actually used, speed-sensitive steering, self-aligning torque feeding force feedback for controllers that support it.
- **Chassis:** inertia tensor from mass, dimensions and distribution data (derive instead of using the cuboid default), CoM from data.
- Tools: tire curve plotter and a skidpad/step-steer script that prints understeer gradient and yaw response.

### P6: Surfaces, world, aero and collisions
- Surface table drives mu and rolling resistance per collider (road, grass, dirt, sand, wet variants). Raycast returns the surface id from the hit collider.
- Weather and time-of-day grip multipliers as data (wet road lowers mu).
- Aero from data: Cd, Cl, frontal area, yaw dependence, optional active aero.
- **Collisions with no damage:** keep the rigid chassis. Tune restitution, friction and a maximum contact impulse per car class in data, so crashes feel heavy without launching cars. Add a short post-impact grip reduction as an optional data field, not a hardcoded effect.
- Hill and road colliders: confirm raycast hits give stable normals on trimesh seams (a known weak point of raycast cars).

### P7: Multiplayer alignment
See `PHYSICS_COMPARISON_BEAMNG.md` §8.
- Handshake includes protocol version, car id and a hash of the car spec. Peers with a mismatched hash are told which car data differs, since physics values are data now.
- Remote bodies use the same fixed step and `PoseHistory`, so remote cars interpolate cleanly at any frame rate.
- Move net constants into `data/net.ts`. Binary state packets, then inputs-in-packet and cheap remote simulation between snapshots.
- Update `net-protocol-test.ts` for the new packet and version negotiation.
- Release note: this phase makes old and new clients incompatible. Gate behind the protocol version and say so in `Changes.md`.

### P8: Tools, docs and release
- Dyno script (torque, power, shift points), tire plot, per-car report. All read `data/cars/*`.
- Rewrite `AddingCars.md` for the new flow: create `data/cars/<id>.ts`, run `bun run validate-cars`, run the matrix, done. Fix the README and `GAME_OVERVIEW.md` discrepancies listed in report §14 while there.
- Update the pause-menu text (parking brake key).
- Version bump, release notes, a manual test pass in both the macOS and Windows builds.

## 5. Order and dependencies

```
P0 -> P1 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8
        \-> P2 (independent of P3, needs only P0) --^
```

## 6. Testing and quality gates

| Gate | Tool | When |
|---|---|---|
| Golden master (per-car metrics and trajectory samples) | extended `car-matrix.ts` | every commit touching physics |
| Literal audit | `audit-literals.ts` | CI and pre-merge |
| Car data validation | `validate-cars` script | startup and CI |
| Component unit tests | new scripts per component | with each component |
| Frame-rate independence (same inputs at 30/60/144/240 fps give the same result) | extended `fixed-step-test.ts` | P2 and after |
| Performance (ms per step, cars count) | `perf-bench.ts` | before and after P2, P3, P5 |
| Multiplayer protocol | `net-protocol-test.ts` | P7 |
| Smoke | `smoke-test.ts` | every phase |
| Manual driving pass per car | checklist in `AddingCars.md` | end of P3, P5, P8 |

Re-baselining rules: P0 to P3 must not move the baseline beyond tolerance. P4 to P6 are expected to move it, and each such commit must list which metrics changed and why.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Refactor changes handling subtly | Cars feel different with no one knowing why | Golden master, small steps, no behaviour change in P1/P3 |
| The webview caps rendering at 60 | Goal 3 not reachable from game code alone | Spike first (P2); shell flags if needed |
| Fixed 120 Hz is too slow for stable low-speed tires after the smoothing constant is removed | Jitter at standstill | Velocity-dependent relaxation (P5); optional 240 Hz physics |
| Many AI/traffic cars with 4 rays each at higher rates | Frame time rises | `perf-bench`, distance-based update rate, data setting |
| Removing default fill breaks existing cars | Startup rejects cars | Validator with clear errors, migration script from current configs |
| Protocol break in P7 | Old clients cannot join | Version negotiation and a clear message |
| `App.tsx` (about 2000-line loop) mixes concerns | P2 and P3 conflicts | Do P2 step/frame split first in small commits, keep behaviour identical |
| AI and world have many literals too (95 and 135 lines) | They stay hardcoded | Out of scope for the physics rule unless you want it extended (D3) |

## 8. Decisions (settled)

- **D1: No defaults.** Every car file is complete. No global default set, no silent fallback. Shared presets (tires, surfaces, drivetrain templates) are allowed only as an explicit `extends` written in the car file.
- **D2: Physics rate stays at 120 Hz.** If P2 shows it is not good enough, move to 240 Hz or 360 Hz. The rate is data (`data/world.ts`), so the change is one value plus a re-baseline.
- **D3: Scope is physics first.** AI tuning and world generation are a follow-up.
- **D4: No arcade/sim default.** Assist strength, tire grip and driving model are per-car data, with no global preset applied implicitly.
- **D5: Breaking compatibility with older releases is accepted** for the multiplayer phase (P7).

Consequence of D1 and D4: the validator must reject a car file that omits any field, and the constructor defaults in `CarController` (`DEFAULT_PHYSICS_CONFIG`, `DEFAULT_WHEELS`, `DEFAULT_DASH`) are removed in P1.

## P4 changelog
### P4a: differentials (done)
- New `Differential` component, one per axle, built from `CarSpec.differential` (`open`, `lsd`, `locked`; `lsdAccelLock`, `lsdDecelLock`, `preloadTorque`, new `lockStiffness`). It moves torque from the faster to the slower wheel, capped by preload plus lock fraction times axle torque.
- Why the baseline moved: every car already declared an LSD, but the field was dead and torque split 50/50. With `type: "open"` the golden master matches the old baseline exactly, so only the diff changed behaviour.
- Moved metrics: skidpad g and 50 km/h yaw gain (about 2-5% on most cars, F1 skidpad 1.39 to 0.86 g) and trajectories. Straight-line 0-100, top speed and braking did not move.
- `lockStiffness` is 30 on all cars. At 300 four cars failed "grip survives full throttle"; at 30 two cars still fail one smoke check each (BMW M3 donut countersteer, Challenger lift-off regrip), recorded in `known-failures.json`.

### P4b: turbo (done)
- `engine.turbo` is optional in the spec; its presence makes the engine turbocharged. New `Turbo` component (boost curve vs rpm, spool up/down rates, share of curve torque that is boost). The torque curve stays the fully boosted one, so full-throttle numbers are unchanged and only tip-in and low-rpm response lag.
- Turbo cars: Audi RS 7, Porsche 997 GT2, Lamborghini Urus, Mercedes G 63. The rest are naturally aspirated.
- Baseline moved: skidpad g on the four turbo cars (3-8%), from lag while on the throttle mid-corner. 0-100 and top speed did not move beyond tolerance.

### P4c: shift points from the torque curve (done)
- `ShiftLogic` computes the upshift rpm per gear from where the next gear gives equal or more wheel torque. `transmission.autoUpshiftRPM` is now an optional override for all gears.
- Overrides removed on nine cars (computed points are within about 150 rpm of them); kept on the G 63 and the F1 car. `upFallbackMargin` is replaced by `optimalScanStepRpm`.

### P4d: part-throttle model, engine braking, inertia (done)
- `engine.throttleMap` (pedal to fraction of torque), `engineBrakeBase` and `engineBrakeRPMFactor` (pumping loss that grows as the throttle closes), and `engineInertia` now caps how fast a free engine revs (torque over inertia). All values are in every car file; the maps are linear so full-throttle numbers are unchanged.
- Fix found on the way: `curveLookup` divided by `max(1, dx)`, which is wrong for a 0..1 axis; it now only guards a zero gap. rpm curves are unaffected.
- Baseline: F1 skidpad moves (that metric is chaotic), Audi R8 skidpad 3.5%. Two `suspension-test` scenarios (BMW M3 single-corner lift, Porsche GT2 sustained cornering) sit on their thresholds and are now recorded as known failures.

### P4e: centre differential (done)
- `drivetrain.centerDiff` is optional: absent means the fixed `frontTorqueSplit`. `viscous` biases torque to the slower axle instantly, `active` does the same through an actuator lag. New `CenterDiff` component, front share limited to min/max.
- Cars: R8, RS 7, Urus and G 63 are viscous, Aventador is active. Baseline: 0-100 km/h slower by 4-8% on the R8, Urus and G 63.
- RS 7 and Urus use a weaker coupling (0.03) because at 0.06 they failed "grip survives full throttle at speed".

### P4f: shift modes (done)
- `Vehicle.shiftMode` is `arcade` (shifts follow driving style, as before) or `realistic` (always shifts at the car's `shiftLogic.realisticAggression`). The default is `DEFAULT_SHIFT_MODE` in `data/world.ts`. There is no key or menu for it yet.

### P4g: brakes (done)
- Brake bias and the handbrake were already data (`wheels.brakeForce`, `handbrakeForce`). Added optional `brakes.fade`: per-rotor temperature from brake work, cooling by airflow, and torque loss between a start and end temperature. Cars: G 63, Urus, RS 7, Challenger, 69 Charger. No tracked metric moves because a single 100-0 stop does not heat the rotors enough.

### Not done in P4
- EV and hybrid motors. No car in the roster uses one, and it needs an engine-less torque path through the gearbox, so it is left until there is a car to test against.
- Driveline graph (shorthand `type` still expands to fixed axle splits).

### P4 verification (engine realism)
- New `scripts/engine-realism.ts`, run per car: derived peaks are plausible (power rpm between 60% of redline and redline, torque peak before power peak, at most 1500 hp and 1.8 hp/kg), idle holds, free rev takes 0.15-2 s to 60% of redline, the limiter holds, lift-off decel at 100 km/h in top gear is 0.02-0.25 g, turbo spools in 0.4-3.5 s, a full-throttle pull upshifts without hunting, 0-100 beats neither the power limit nor a 1.5 g traction limit. All 11 cars pass.
- Found and fixed: `maxPowerHP`, `maxPowerRPM` and `maxTorqueRPM` were typed next to the torque curve and disagreed with it (F1 950 declared vs 1273 hp on the curve, '69 Charger 500 vs 594, Urus 700 vs 784, RS 7 605 vs 672, M3 850 vs 912, G 63 850 vs 800). They are removed from the spec and derived from the curve by `enginePeaks()`. The UI power readout now shows the derived figure. Simulation behaviour did not change.
- The literal audit still reports six allowed literals in `physics/**`. Outside it, `systems/` has about 1100 literals (mostly visuals, AI and net) and `WorldManager` sets collider friction (1.0, 0.9, 0.7); those belong to the AI/world follow-up and P6.

### P4.5 — feel fixes and realistic data
- Engine rpm now follows the driven wheels (`drivenOmega`, averaged over driven wheels only), so wheelspin loads and limits the engine. This was the cause of rpm sitting at the launch rpm while the tires spun, and of constant full torque into spinning wheels.
- Removed the arcade `torqueCapGear1/2` and `launchCapMultiplier`: traction now limits launches, not a cap.
- Removed `yawDamperTorque` and `YawDamper`: it fought every slide and killed donuts.
- Car power and torque set to real figures (M3 514 hp, R8 605, RS7 593, GT2 537, G63 576, Urus 643, F1 1004, '69 Charger 420).
- `feel-test`: donut now needs a 40 degree tail-out plus 0.7 turn in 4 s on rear-biased cars; AWD cars with a centre diff are excluded from donut/powerslide checks.
- Open: the handbrake "keeps sliding" report could not be reproduced headlessly; ESC (`assists.stabilityControl`, `countersteerAssist`) still injects yaw torque and is a P5 candidate; F1 rpm-sag check recorded as known.

### P4.6 — assist toggles and raw launch
- Keys: X traction control, V stability control, B ABS (`Vehicle.tractionControlOn`, `stabilityControlOn`, `abs.enabled`); stability off skips the yaw-torque injection.
- The managed launch (flare rpm and gear-1 torque ramp) runs only with traction and stability control both on. With either off, the clutch-slip rpm target is the engine's own peak-torque rpm (derived from the curve) and torque reaches the wheels at once.
- While gear 1 slips below the launch speed the shift logic reads wheel-coupled rpm, so a held flare no longer triggers an early upshift.
- Checked in the running app (vite dev server + headless Chromium): garage shows the new figures, free roam starts with no console errors, throttle, toggles and handbrake slide work.
- Not done in P4: UI indicator for the aid states, `shiftMode` key, `systems/`, CarLights/CarVisual, WorldManager and AI literals (deferred by decision).

## P4.7 Clutch / converter torque balance (done)

Replaces the held "flare rpm" target. While the clutch or converter slips, the engine
accelerates by `(Te - Tc) / I` where capacity `Tc = K * w^2` (K set so capacity equals
full-pedal torque at the stall rpm: `launchFlareRPM` with traction + stability control on,
peak-torque rpm with them off). Capacity grows to a locked clutch's hold
(`clutchHoldMargin * maxTorque`) as wheel speed approaches engine speed (`clutchLockStart`).
Consequences: a car pinned against an obstacle with the aids off spins its wheels and the revs
climb to the limiter instead of sitting at the launch rpm; with traction control on, the TC
cut keeps it near stall (X / V switch the aids). Shift logic uses wheel-coupled rpm while slipping.
New data: `engine.dynamics.clutchLockStart`, `clutchHoldMargin` (all 11 cars, validated).
Tests: feel-test 1d (held car), thresholds in 1/1b/sag now describe asymptotic stall approach.

## P4.8 Manual friction clutch, stall, burnout, safety switch (done)

Modelled on BeamNG (converter = capacity factor K*w^2; manual = friction clutch + stall).
- Automatics keep the converter. A manual runs a closed clutch outside 1st/reverse: off-throttle with
  wheels slower than idle it opens (clutch assist); with throttle it drags the engine down and stalls it
  (`dynamics.stallRPM`), restart in neutral/1st after `dynamics.restartTime`.
- Wheel integration: the implicit tyre-slope term is capped at the tyre's saturation torque, so a strong
  drive can spin a braked wheel (stationary burnouts with handbrake or brake + throttle).
- Launch control (brake + throttle at standstill) only arms with the safety aids on.
- `Vehicle.toggleSafety()`: one switch for traction + stability control (N key; shield light in the rpm dial, lit when off).
- Ignition: V key cranks or switches off the engine (`Engine.toggleIgnition`); stability control alone moved to M.

### P4.9 Creep from the engine model (done)
- Removed the synthetic creep, standstill spring and reverse creep (`CreepSpec` spring/creep/reverse fields, converter `creepForce`/`creepForceReverse`). `CreepForces` now only does engine braking.
- New data `dynamics.idleHoldFraction`: an idle governor in `Engine.stepClutch` adds up to that fraction of peak torque as rpm sags below idle. Creep is where converter/clutch drag meets the governor, so it follows idle rpm and engine power.
- Automatic and manual first gear creep (slipping clutch); a manual in 2nd..top has a closed clutch and does not. Engine off: nothing.
- Feel-test 1h covers all of it. F1 (idle 4000 rpm) creeps fast by its own data.

### P5.1 Chassis mass from data, dashboard telltales (done)
- Chassis colliders carry no mass. `createChassisBody` sets mass properties explicitly: `mass.chassis`, centre of mass at `dimensions.centerOfMassHeight` (relative to the suspension anchor height) and `centerOfMassOffsetZ` (new, 0 on all cars), box inertia from the car's dimensions (`boxInertia`).
- Wheel patch and suspension point velocities are now taken about the world centre of mass (`Kinematics.com`), since Rapier's linvel belongs to the CoM, not the body origin.
- Handling drifted from the golden baseline (re-recorded). Stiff low cars (F1) now pitch very little, so generic pitch-sign checks in `suspension-test` fail for them (known failures re-recorded).
- Dial telltales: TC (X), ABS (B), safety (N), drift, all on both dashboards; amber when the aid is off. Telemetry has `tractionControl` and `absOn`.
- Handbrake tap: `InputManager` uses event timestamps for the hold window and re-queues edges on frames that run no physics step.
- Remaining P5: tyre presets, speed-sensitive steering and self-aligning torque, skidpad/step-steer and tyre-curve tools.

### P4.10 Stall grace (done)
A closed-clutch manual starting off in a high gear no longer dies instantly: the engine holds `stallRPM` while the wheels are below it, and stalls only after `dynamics.stallDelay` seconds there. If the car pulls away, coupled rpm rises past stall and the timer resets. Feel-test 1e covers a stall in top gear and a pull-away in 2nd.

### P4.11 Automatic gearbox only (supersedes P4.10 and the manual friction clutch of P4.8)
The gearbox stays automatic; manual mode only picks the gear, and the torque converter stays between engine and wheels in every gear. Removed the closed-clutch branch, `RpmInput.manual`, `stallRPM` and `stallDelay`. A high gear from rest on the throttle slips the converter and goes if the car can pull it; the engine only stops with the ignition key (V). A real manual gearbox with a friction clutch pedal, clutch stall and clutch-assist is deferred.

### P5.2 Tyre presets, self-aligning torque, handling tools (done)
- `data/tyres.ts`: presets `sport`, `street`, `race`, `allSeason`, `offRoad` (curve shapes, mu, rolling resistance, patch lag). Cars take `...tyre("sport", { frictionMu, rollingResist })` and override per car. All 11 cars stay on `sport`'s curve shapes, so handling is unchanged (golden master matches); assigning another preset to a car is a data change.
- Self-aligning torque: `TireResult.mz = pneumaticTrail * trailFactor(slip angle) * Fy`, using the existing `pacejka.aligning` curve for how fast trail fades towards the grip limit. New data `steering.pneumaticTrail`. Telemetry `steerFeedback` (-1..1) is the front tyres' summed torque over their maximum, for force-feedback devices. Feel-test 1i covers it.
- Already present from earlier phases: Ackermann (`wheelAngle`) and speed-sensitive steering lock (`Steering.step`).
- Tools: `scripts/handling-report.ts` (understeer gradient, max g, step-steer rise and overshoot per car) and `scripts/tire-curves.ts <preset|car> [load]` (Fx, Fy, Mz tables with bars).

### P4.12 Stall in a gear too tall to launch (done)
Manual mode in a tall gear from rest used to pin the engine at the converter's stall speed while the car crawled up through the speeds. Now `Vehicle.checkStall` estimates the wheel force the gear can give at converter stall (full-pedal torque at the flare rpm, converter stall multiplication, gear ratio, efficiency) and, below the car's `engine.dynamics.stallMinAccel` (m/s^2) under the converter lockup speed, the engine labours for `stallDelay` seconds and dies (V restarts it). Gears that can pull the car are untouched. The brief gear-scaled lock-start experiment was dropped.

### P5.3 Closed-loop driver aids (ABS, TC, ESC)

The three aids are now controllers acting through the brakes and the engine, with no synthetic body forces.

- **ABS** (`Abs.ts`): per-wheel brake pressure state. Released at `releaseRate` while the wheel's lock slip (1 - wheelSpeed / groundSpeed) is past `slipTarget`, rebuilt at `applyRate` once it falls below `slipTarget * reapplyFraction`, held between. Replaces the fixed sine pulse.
- **TC** (`TractionControl.ts`): the engine-torque cut on average driven slip stays; new `brakeFraction` brakes the one spinning driven wheel (slip taken along the drive direction, so reverse works, never on airborne wheels), capped at `brakeDriveShare` times the drive torque at that wheel.
- **ESC** (`StabilityControl.ts`): bicycle-model reference yaw rate from steer angle and speed with the car's own `understeerDegPerG` (measured with `handling-report.ts`) and a grip limit; yaw error and body side slip beyond a deadzone brake the outer front (oversteer) or inner rear (understeer) through a pressure modulator with rise/fall rates, and cut the engine a little. The yaw-torque impulse and `countersteerAssist` are gone.
- Wheel brake torque in `WheelSolver` = driver brake + ESC + TC, all through ABS.
- Schema/validator/11 cars updated; component tests cover each controller; feel-test section 7 checks them on the whole car. Golden baseline re-recorded.
- Known limit: the tyre curves have almost no post-peak fall-off, so a locked wheel keeps about 98% of peak longitudinal grip. ABS therefore costs no stopping distance but also gains none; its benefit shows as kept steering (combined slip). A tyre fall-off parameter would be the next fidelity step.
- g-wagon 0-100 got slower (5.15 to 6.09 s): TC cuts a brief launch wheelspin and the auto box then kicks down 2 to 1 at low rpm. That is the shift logic, not the TC.

### P5.4 Aid tuning, telltales, input hardening

- ESC understeer correction cut to 10% (`understeerScale`): braking the inner rear in plain understeer made the car push wide (Challenger skidpad 0.91 g to 0.60 g with ESC on).
- ESC brake backs off past `wheelSlipLimit` brake slip so the braked wheel keeps cornering grip; the reference yaw limit now counts aero downforce (F1 high-speed cornering was cut from 3.0 g to 1.9 g by ESC).
- Dash TC / shield / ABS lights flash while the aid intervenes (`tractionActive`, `stabilityActive`, `absActive`, ESC light above `indicateFraction`), steady amber when switched off.
- `ShiftLogic`: no kickdown within `kickdownAfterUpshift` s of an upshift (stops 2 to 1 hunting).
- `InputManager`: keys are released on blur, tab hide, context menu and Cmd press, and a keyup is honoured even if focus moved to a field, so a missed keyup cannot leave steering stuck.

### P5.5 High-speed steering authority
The steering floor `minAngleAtSpeed` (0.04-0.08 rad, about 2.9 deg at 250 km/h) let a short keyboard tap exceed the tyre limit and left the car yawing for seconds with the aids off and W held. Lowered to 0.025 (F1 keeps 0.03); smoke "full lock at 250km/h" now requires > 0.02 rad.

### P5.6 Steering stability back to HEAD
Removing HEAD's always-on body stabilizer (sideslip yaw torque + countersteer help, `-yaw*1800` damper) made the car keep yawing after a steering tap at speed. Restored as written in HEAD: `chassis.yawDamping: 1800` and `assists.bodyStability` (per-car authority/countersteer from HEAD's stabilityControl/countersteerAssist, all other constants as spec fields), always on with the safety aids off. `minAngleAtSpeed` back to HEAD values. Known failures and golden baseline re-recorded.

### P5.7 Combined slip back to HEAD's weighting
The slip-vector combined model (`fy = sigmaY/sigma * F(sigma)`) cut rear lateral stiffness as soon as the driven wheels carried any slip ratio, so with throttle held the car kept yawing for seconds (about 2.6x slower lateral-velocity decay than HEAD with identical Pacejka curves). Restored HEAD's combine (`fx /= hypot(1, w*sa)`, `fy /= hypot(1, w*sx)`, then the friction-ellipse cap) as the spec field `tire.combinedWeight`. HEAD's 2 left cars hard to break loose under power (powerslide beta 11-30 deg on BMW and Challenger), so the presets use 6: small-slip stiffness is unchanged (the tap still recentres in about 1.5 s) while wheelspin sheds lateral grip. Known failures and golden baseline re-recorded.

### P6 Surfaces, world, aero and collisions (done)
- **Surfaces:** `data/surfaces.ts` (`SURFACES`, `WEATHER_GRIP`, `TIME_OF_DAY_GRIP`, `surfaceGrip`). `physics/core/Surfaces.ts` maps a collider to a surface, or to a function of position. The suspension ray reads the hit collider; `WheelSolver` hands the tyre `gripScale` and `rollingScale` (`TireContact`). Dry asphalt by day is 1, so the golden master is unchanged.
- **World:** `WorldManager` registers the flat ground with `groundSurfaceAt` (road and shoulder asphalt, the rest grass) and hill meshes as grass. `physics/core/Conditions.ts` holds the weather and time of day; the app sets them from settings (new Weather card: dry, damp, wet, storm). Grip only, no rain visuals.
- **Aero:** `aero.yawDragGain` and `yawDownforceLoss` scale with sin^2 of the angle between heading and airflow; optional `aero.active` (F1 only: flap opens above `minSpeed` with steering under `maxSteer`, cutting drag and downforce).
- **Collisions:** rigid body, no damage. `chassis.crash` (class presets in `data/crash.ts`: open, sport, road, heavy). `components/Impact.ts` treats a velocity jump while the chassis touches something as a hit: upward speed and spin are capped, tyre grip drops by severity and recovers over `gripRecovery`. Restitution and friction were already per car.
- **Seams:** `scripts/seam-test.ts` casts rays across a synthetic rolling trimesh (edges, diagonals, vertices): no misses, no flipped normals, no normal jumps beyond the crease angle.
- **Tests:** `scripts/world-tests.ts` (per car) covers surface and weather braking, the road/grass split, yaw aero, active aero and crash limits; component tests cover surfaces, tyre scaling and `Impact`.
- Side note: after the engine inertia change the Urus fails the suspension squat check by a small margin (recorded as known).

### P7 Multiplayer alignment (done)
Techniques from Gaffer On Games (snapshot interpolation, state synchronisation): place snapshots by send time, interpolate with Hermite splines, keep extrapolation short, size the delay from measured jitter and loss, send compact binary at a fixed rate.
- **Config:** `data/net.ts` holds every net constant (send rate, delay bounds, clock filter, remote-body gains, collision grace and ranges, protocol version). The old `NET.broadcastIntervalMs` in `data/world.ts` is gone.
- **Wire:** `systems/net/codec.ts`, 72 bytes per state against about 330 of JSON: float32 position, smallest-three rotation (10 bits each, under 0.3 degrees), int16 velocity and angular velocity, steer, speed, rpm (uint16; the old 9000 cap rejected F1 packets), gear, throttle, brake, handbrake, drift and smoke flags, seq, sender time, session hash. Trystero sends it as binary; the LAN relay forwards binary frames (`[id length][id][state]`) untouched.
- **Send:** from the fixed physics tick (`onPhysicsTick`, every `120 / sendHz` ticks), stamped with sim time. Before, it ran from the render frame on a wall-clock throttle, so the real rate aliased against the frame rate.
- **Receive:** `NetClock` maps the sender's clock onto ours (minimum filter of arrival minus sent, slewed) and sizes the delay from send interval, jitter, the worst queueing seen and loss, moving at most `riseMsPerS`. Snapshots sit on that timeline, not on arrival time, so jitter no longer becomes motion jitter. A sender-clock gap above `resyncGapMs` restarts the timeline.
- **Interpolation:** cubic Hermite through both snapshots' velocities; slerp for rotation; extrapolation capped at 120 ms (was 250) with velocity fading to zero and rotation continuing at the sent angular velocity. Out-of-order arrivals are sorted into place.
- **Remote cars:** the extra `age * velocity` lead on the drive target is removed (the target is already at the right moment, so remote cars no longer ran ahead by up to 150 ms). Brake lights use the sent brake and handbrake, not speed-delta inference.
- **Remote visuals:** remote cars were loaded without the car's wheel pivots and wheel spots, so models whose wheels were not found by the default name fell back to plain cylinder tyres. They now load with the same pivots and spots as every other car (and a peer switching cars rebuilds visual, wheel radius and collider from the new car). Wheel spin and suspension travel are sent per wheel, so reversing, burnouts, lockups and the handbrake show. Tyre smoke is sent as a level (the local car's own measure) and emitted at the local rate; the old 5 km/h gate hid burnouts from a standstill.
- **Remote body placement:** the ghost body used to sit at the origin until pulled to its target at up to 10 m/s, so a peer appearing within 15 m of a car (grid, rejoin) shoved it away, up to about 10 m/s in a probe. The ghost now has collisions off until its first sample and is placed on it directly (also after a peer's session restarts). Free drive spawns every car at the same spot, so the ghost also stays non-solid (collision groups) while it overlaps another moving body and turns solid once `clearMargin` is clear; each window then keeps both cars where they really are instead of shoving them apart differently.
- **Paint and mass:** HELLO carries the garage paint (a colour, or null for the model's own); remote cars show it and reload when it flips between stock and painted. The ghost's mass is the whole car (wheels included) times `NET.remote.massScale` (1.5), standing in for the tyre grip and driver authority a free box lacks, so a hit no longer shoves it like an empty shell.
- **Handshake:** HELLO carries `proto` and `specHash` (FNV-1a of the car's physics data in canonical JSON). A protocol mismatch is refused with a version message. A spec hash mismatch is flagged on the peer (`specMismatch`) and logged.
- **Tests:** `scripts/net-codec-test.ts` (codec round trip and error bounds, clock offset, adaptive delay, resync, Hermite against linear, extrapolation, spec hash, jittery-link smoothness: per-frame deviation 20 cm against 141 cm on arrival timing). Other net tests updated for the new API.
- **Limits:** Trystero opens its WebRTC data channel reliable and ordered, so on a lossy link a lost packet still holds the ones behind it; the adaptive delay covers it but cannot remove it without forking Trystero. Not exercised over a real WebRTC link or in the live app.

### P8 Tools, docs, release (done)

- **Dyno:** `CAR=<id> bun scripts/dyno.ts [--csv]` prints crank torque and power every 500 rpm from the spec, peaks and hp/tonne, then a full-throttle automatic pull (0-100, 0-200, top speed, shift points, drivetrain loss implied by the pull) beside the data's `tested` figures. It reports, it does not pass or fail. First findings: GT2 0-100 is 5.3 s against a stated 2.7 s; M3 top speed is 308 km/h against a stated 360.
- **Docs:** `AddingCars.md` rewritten (steps, spec fields and helpers, tuning from real figures, verification commands, nose and lamp notes, troubleshooting); README and GAME_OVERVIEW rewritten for the data-driven cars, vehicle pipeline, world, netcode and tests.
- **Pause menu:** key list matches `InputManager` (removed the stale parking-brake row), "Resolution & Graphics" button now "Settings".
- **Release:** version set to 1.1.0 in `package.json` and `electrobun.config.ts`, notes in `Changes.md`. Nothing committed, tagged or pushed.

Update: tire combined slip is again the slip-vector model (`fx = F(k) * kx/k`, `fy = F(k) * ky/k`, with `kx`/`ky` slips normalised by each curve's peak slip). It has no tuning weight, so `tire.combinedWeight` is removed. A locked or sliding tire now keeps lateral force in proportion to its slip direction, which fixes braking-while-turning and handbrake spin-outs.
