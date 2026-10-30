# Oversteer: Realistic Physics, AI and Multiplayer Plan

Prepared 28 Oct 2026. Based on `CAR_PHYSICS_REPORT.md`, `BEAMNG_COMPARISON_REPORT.md` and `PHYSICS_IMPROVEMENT_PLAN.md`, plus the decisions made in chat: rigid-body Rapier, believable sim with real specs, competitive racing through classes and Balance of Performance (BoP), AI opponents and multiplayer.

Revised after reading the OverSteer project overview. The plan now builds on what the game already has (AI Race, P2P and LAN multiplayer, headless scripts, an endless procedural road) and changes the multiplayer model, the AI design and the tyre-wear priority to fit.

## 1. Goal and definition of done

The goal is a believable rigid-body racing sim in which every car matches its real-world specs and behaves distinctively, across OverSteer's free roam, AI Race and Multiplayer Race modes. Races stay competitive through classes and Balance of Performance (BoP), never by faking engine numbers. AI and multiplayer run on exactly the same physics as the player.

The project is done when:

- Every car lands within tolerance of published real-world figures: 0-100 km/h within 5%, 100-0 braking distance within 8%, top speed within 3%, skidpad lateral g within 7%.
- Cars feel different from each other in ways a driver can describe: understeer vs oversteer on throttle, how they rotate on lift-off, how the limit is communicated through the steering.
- Rivals drive the same physics through the same controls as the player, and finish a seeded 10 km race within a few percent of the solver's predicted time.
- A 50-rival AI Race holds a stable frame rate on a mid-range machine (exact target set from the Phase 0 measurement).
- A multiplayer lobby of up to 8 players stays smooth and fair (cap confirmed by testing).
- A headless test suite proves all of the above and runs in `bun test`.

Not a goal: BeamNG parity, soft-body deformation, structural damage. The BeamNG percentage in the comparison report is a useful mental model but not a target, because its weights were chosen by hand.

## 2. Starting point: what the game already has

The project already has most of the scaffolding, so this plan upgrades and re-validates what exists instead of building from scratch.

| Area | Already in the project | Gap this plan closes |
| --- | --- | --- |
| Physics code | `systems/vehicle/` split into tyre, suspension, drivetrain, assists, aero; `CarController` composes it | Shared `CAR_PHYSICS` tunables; `CarController` still uses three.js vectors, so it is not yet renderer-free; dead config fields |
| Headless checks | `scripts/smoke-test`, `drift-matrix`, `road-test` | No real-world scenarios (0-100, braking, skidpad) with tolerances and pass/fail |
| World | Deterministic analytic road with elevation and banking, seeded per segment, recycled forever | Races are point-to-point (1, 2, 5, 10 km), not laps; float precision far from the origin is unverified |
| AI | `AIDriver.ts` with driver profiles and traffic behaviour; AI Race with 1-50 rivals | Tuned to the current arcade physics; no speed plan derived from real grip; 50-car performance budget unknown |
| Multiplayer | Trystero P2P and LAN WebSocket relay (port 9876), remote car replication, finish sync | No physics authority or prediction; no car-to-car contact model |
| Car data | 11 cars with per-car overrides | Docs disagree on the default car (overview: 800 HP / 1000 Nm; physics report: 850 HP / 1100 Nm); numbers are arcade |
| Planned work | `Changes.md`: difficulty modes, rewind, weather, dyno mode | Rewind needs snapshot/restore; weather needs wet-grip tyres; dyno mode doubles as a validation tool |

Two consequences differ from my first draft. Races last 1-4 minutes on an endless road, so long-stint tyre wear matters little. And multiplayer already exists as P2P, so a dedicated physics server is the wrong default.

## 3. Decisions to make now

These shape everything else, so settle them first.

**D1. A renderer-free simulation core.** `systems/vehicle/` is already modular, but `CarController` still depends on three.js vectors and the frame loop. Move vehicle physics into a module with no THREE, DOM or React imports. It takes inputs and a fixed dt and exposes serialisable state (`snapshot()` / `restore()`). That one change enables regression tests, the AI speed solver, rewind from `Changes.md`, and multiplayer state replication.

**D2. Fixed-rate loops at two speeds.** Rapier runs the chassis at 120 Hz. Wheels, tyres, clutch and driveline run at 500-1000 Hz in plain TypeScript inside each chassis step. The stiffness lives in the tyre and driveline, not in the chassis, so this is cheaper than raising the whole world step to 240 Hz.

**D3. Real specs are the source of truth.** Each car has a data sheet of real figures with a source note. Anything the sim cannot reproduce is tuned in the model (tyre curve, inertia), not by inflating engine numbers. Your current M3 (850 HP, 360 km/h) and G63 (850 HP) are arcade numbers and get replaced.

**D4. Multiplayer model: keep P2P and LAN, make each player's own car authoritative.** Each peer simulates its own car with the full sim; others are interpolated. Cars start as non-colliding ghosts and contact is added later. A server-authoritative physics server was my first-draft default, but with Trystero P2P and a LAN relay already in place it would add a hosted component and rollback cost for little gain in friend lobbies. Details in section 7. Revisit only if you add public matchmaking.

**D5. Determinism check for Rapier.** Verify whether the standard `@dimforge/rapier3d-compat` build gives identical results across machines for your use. The deterministic build (`@dimforge/rapier3d-deterministic-compat`) exists for this. You do not need lockstep netcode, but determinism between your server and clients makes prediction corrections much smaller.

**D6. Endless-road precision.** Driving "as far as you want" means world coordinates can grow large, and 32-bit physics degrades with distance (jitter in suspension and tyre forces). Verify whether the world recycles by moving the road or by moving the car. If the car's coordinates grow, add a floating origin that rebases the physics world periodically, and test a 50 km drive before any tyre work.

## 4. Target architecture

- `src/sim/` (new) is pure TypeScript with no rendering, shared by the game view and the Bun process. It grows out of `systems/vehicle/` and `CarController`, and adds `Driveline` (engine, clutch, gearbox, differentials), `Tyre`, `Aero`, `Assists` and the Rapier chassis wrapper.
- `src/sim/data/` holds `CarSpec` (real-world data sheet with sources) and `CarTuning` (fitted model parameters). They stay separate so you can always see what is real and what is fitted. This replaces the shared `CAR_PHYSICS` plus `cars.ts` overrides.
- `src/mainview/` keeps rendering, input, UI, audio, camera, `CarVisual`, `WorldManager` and `App.tsx`, and only reads sim state.
- `src/bun/` keeps the window, updater and LAN relay. Lobby rules (class, BoP) and finish validation can live here.
- `src/ai/` splits `AIDriver.ts`: traffic behaviour stays as is, and a new race driver follows the road's racing line and speed profile.
- `scripts/` and `tests/`: the existing `smoke-test`, `drift-matrix` and `road-test` become pass/fail scenarios, joined by the lap-free benchmark route, the speed solver and the BoP calculator.

Rule for every config field, old or new: it must have a consumer and a test, or it does not exist. Apply this especially to Phase 2 ideas like hardpoints, roll centres and caster, which are useless unless the tyre or steering code reads them.

## 5. Phased plan

Effort figures are rough solo-developer guesses and will drift. Treat them as relative sizes.

### Phase 0. Foundation: headless sim, scenarios, telemetry (1-2 weeks)

- Extract the sim core per D1: replace three.js vectors with plain math, and add `snapshot()` / `restore()`.
- Remove any wall-clock or frame-rate dependency. The sim advances only through `step(inputs, dt)`.
- Extend `smoke-test`, `drift-matrix` and `road-test` into pass/fail scenarios: standing 0-100, rolling 100-0 braking, burnout in 1st, 3rd-gear pull, 100 m skidpad, slalom, step-steer, lift-off in a corner. Run them on a flat straight test road, not the endless road, so numbers are comparable.
- Telemetry recorder to CSV: per wheel omega, slip ratio, slip angle, Fz, Fx, Fy, drive and brake torque; engine RPM, gear, clutch state; chassis yaw rate and g.
- Timing counters for world step, wheels, tyres and driveline, plus a 50-rival AI Race step cost. This number decides the AI performance plan in section 8.
- Add headless smoke tests for a 10 km AI Race and a two-peer multiplayer race. Run them after every phase so the existing modes do not rot.

**Exit:** `bun test` runs every scenario for all 11 cars and writes CSVs, a headless 10 km AI Race finishes, and baseline timings and numbers are saved.

### Phase 1. Car data sheets and cleanup (1 week)

- Create `CarSpec` for each car from published sources: power and torque curve points, mass and distribution, wheelbase, track, CoM height estimate, gearing, final drive, tyre sizes, drag area, downforce, measured 0-100, braking and top speed.
- Settle the existing conflict (overview says 800 HP / 1000 Nm, the physics report says 850 HP / 1100 Nm): spec sheets become the only source, and the physics report is regenerated from code.
- Fix the arcade numbers. Decide which cars stay in the roster and which get real specs (the Cheetah '84 and the F1 car need the most care).
- Wire or delete every dead field: differential, ackermann, damping ratio, lift coefficient, aligning, `returnSpeed`, raycast distances. Add a test that fails if a declared field has no consumer.
- Build the planned dyno mode early as a tool: it plots each car's torque and power curve against its spec sheet.

**Exit:** every car has a sourced spec; no dead config.

### Phase 2. Strip the crutches (1 week)

Chassis angular damping 0.55, yaw damping torque `1800·ω`, the ESC torque, the steering grip cap, the 2 m/s slip-ratio floor and the ABS hack all stabilise the car artificially and will hide or fight the realistic tyre and driveline models.

- Put each behind a flag, then turn them all off and measure what breaks.
- Replace each with its proper fix: a stiffer low-speed tyre formulation instead of the slip floor, a real tyre curve instead of a steering grip cap, real wheel-slip-based ABS.
- Keep ESC, TC and ABS only as optional assists on cars that have them in reality, modelled as controllers acting on brakes and engine torque (not as free yaw torque).

**Exit:** the car is driveable with all crutches off, at least at moderate speed, and scenario results are recorded for comparison.

### Phase 3. Driveline coupling (2-3 weeks)

This fixes the burnout and 1st-gear RPM bug properly.

- Engine as a rotating inertia with a torque curve and internal friction. Remove the neutral RPM blending and the airborne flare hack.
- Clutch as a torque-limited friction coupling with lock and slip states. In slip, engine and gearbox input exchange `clutchTorque` equal and opposite.
- Gearbox reflects wheel and diff inertia back to the engine via ratio squared.
- With the clutch locked, engine RPM follows wheel speed. Under wheelspin, RPM rises with wheel speed through the ratio, so a burnout in 1st climbs to the shift point.
- Auto-shift logic uses engine RPM and load, not wheelspin-blocked heuristics. Launch control remains a separate explicit mode.
- Per-gear torque caps go away; physical limits (clutch capacity, tyre grip) replace them.
- Telemetry: `drivelineSlip`, clutch torque, engine load.

**Exit:** burnout RPM tracks wheel speed, releasing throttle lets RPM fall, upshift happens at limiter with tyres spinning, standing-start 0-100 within 10% of spec before tyre work.

### Phase 4. Tyre model, part one (3 weeks)

Tyre behaviour at the limit is the largest contributor to realistic feel.

- Per-car, and ideally per-axle, Pacejka parameters instead of the shared B/C/D/E.
- Separate peak friction and load sensitivity for longitudinal and lateral.
- Camber input from suspension, so camber gain begins to matter.
- Aligning moment `Mz` output, feeding steering.
- Better low-speed handling of slip: use a stiffness-based or relaxation-based formulation so you can drop the 2 m/s floor.
- Speed-dependent rolling resistance and separate longitudinal and lateral relaxation lengths.
- Fit each car's tyre parameters to its skidpad g and braking distance using the headless harness (automated parameter search, not hand tuning).

**Exit:** skidpad g and braking distance within tolerance for every car; a slip-angle sweep shows a progressive build-up and gentle falloff past peak.

### Phase 5. Chassis, weight transfer and inertia (2 weeks)

- Replace the two-cuboid inertia with per-car mass distribution: CoM position (fore-aft and height), yaw, pitch and roll inertia from real or estimated values. An F1 car and a G63 must not share inertia shapes.
- Verify weight transfer (longitudinal and lateral) against hand-calculated values in tests.
- Suspension: spring and damper by wheel rate and motion ratio, ARB, bump stops, ride height. Add camber gain and roll centre only to the extent Phase 4's tyre model reads them.
- Tune ride and roll frequencies per car so each one pitches and rolls in character.

**Exit:** lateral weight transfer and body roll in the step-steer scenario match calculated values within 10%.

### Phase 6. Differentials (1-2 weeks)

- Open, locked, and clutch-type LSD with preload and separate power and coast ramps. Torsen-style option if a car needs it.
- Front, rear and centre differentials for AWD, with an adjustable or fixed torque split.
- Differential inertia goes into the Phase 3 driveline.
- Telemetry for lock and split.

**Exit:** an LSD car pulls out of a corner measurably differently from an open-diff car, and lift-off rotation changes with coast lock.

### Phase 7. Steering and feedback (2 weeks)

- Steering geometry: Ackermann, caster trail, and a steering rack ratio.
- Self-centring and wheel feel from the tyre aligning moment plus caster trail. Delete the scripted return-speed.
- Steering damper and friction.
- Keyboard and gamepad: speed-sensitive input filtering that mimics hand speed and not a fake grip cap. Wheel and force-feedback output if you plan to support wheels.

**Exit:** steering goes light as the front tyres saturate and self-centres without scripting.

### Phase 8. Aerodynamics (1-2 weeks)

- Drag and lift with front and rear split and a centre of pressure, applied at that point.
- Ride-height and yaw sensitivity as a later option.
- Real downforce for the F1 car (several times its own weight at speed). Your current figure is far too low.

**Exit:** high-speed balance and top speed match specs; telemetry shows front and rear aero load.

### Phase 9. Tyre warm-up and pressure, wear optional (1-2 weeks)

Races here run 1-10 km, roughly 1-4 minutes, so long-stint temperature and wear change little. Cold tyres at the start and pressure still affect feel, so keep those and defer the rest.

- Surface temperature from friction heating and ambient air, with grip as a function of temperature, so cold tyres start with less grip.
- Cold pressure and hot-pressure rise, affecting contact patch and stiffness.
- Surface types (asphalt, kerb, gravel) with grip multipliers. Wet grip is the hook for the planned weather feature.
- Wear and core temperature only if you add longer races or time trials.

**Exit:** the first minute of a run shows measurable warm-up in the telemetry, and a pressure change shifts balance in the expected direction.

### Phase 10. Retune and validate (2 weeks, then ongoing)

- Rerun the full scenario suite on all cars against the data sheets.
- Lock the numbers into automated regression tests with tolerances. A physics change that moves 0-100 or skidpad outside tolerance fails the build.
- Update `CAR_PHYSICS_REPORT.md` from the actual code and tests.

## 6. Racing classes and BoP

- **Classes.** Group cars by real performance: for example classic muscle (Charger '69, Challenger SRT8, Cheetah '84), road sports and super-SUV, GT supercars, and the F1 car racing only itself. The Garage's rival pool selection and AI Race presets then default to same-class rivals.
- **BoP within a class.** Adjust ballast (and where it sits), power restriction by torque-curve scaling, tyre grip, and a max-RPM cap. Never change the underlying spec sheet.
- **Automated BoP.** Use the speed solver and the headless sim on a fixed benchmark route (a seeded 5 km stretch of the deterministic road) and adjust ballast and restrictor until finish times converge within a target gap, for example 0.5%. Re-run whenever a car or the road generator changes.
- BoP values are shown to players, as in real series, and are part of the multiplayer lobby rules.

## 7. Multiplayer plan

Keep the existing Trystero P2P and LAN relay, and make each player's own car authoritative. Contact between cars comes last.

**Model.** Each peer simulates its own car with the full sim and sends state at 20-30 Hz: position, orientation, velocities, steering, wheel speeds and gear or RPM for visuals and audio. Remote cars are interpolated with short extrapolation. Because the road is deterministic, peers only need to agree on the seed, car, paint, grid slot, class and BoP, and start time.

**Why not a physics server.** P2P has no server, and the LAN relay only passes messages. A server-authoritative sim would add a hosted component and prediction with rollback over a sim that runs wheels at 500-1000 Hz. In friend lobbies cheating is a small risk, so owner authority is far cheaper. The price is weaker fairness in contact, so revisit this only if you add public matchmaking.

**Staged delivery:**

1. Port the state protocol and remote-car replication to the new sim's snapshot fields. Version the protocol and include a car-spec and BoP checksum, so mismatched builds are rejected.
2. Non-contact races, which is today's behaviour. The lobby host validates finishes from reported progress along the road centreline and rejects speeds the car's spec cannot reach.
3. Soft contact: each peer collides its own car against interpolated remote cars treated as kinematic bodies. After a heavy hit, ghost the car briefly. Accept that two peers may disagree slightly about a collision.
4. Optional: for small lobbies, let the host simulate every car for contact only if stage 3 feels bad.

**AI in multiplayer.** Keep rivals out of multiplayer at first. If you add them, the host simulates them and replicates them like players.

**Other items:** the lobby and ready-up already exist and gain class and BoP rules; quantise state to keep bandwidth small; handle reconnect and late finishers.

Start stage 1 after Phase 4 and stage 2 once the Phase 6 driveline is in. Stage 3 waits until the sim is stable.

## 8. AI plan

The race driver's skill depends on the tyre and driveline models, but the current AI Race and traffic modes must keep working while those change, so the plan starts with a bridge step.

**Principles:** AI drives through the same controls as the player (steer, throttle, brake, gear) on the same physics, with no hidden grip or speed. Traffic behaviour in `AIDriver.ts` stays separate from the new race driver.

1. **Bridge.** After Phase 2, retune the existing AI so AI Race still finishes and rivals stay on the road. This is a stopgap, tested by the Phase 0 headless race.
2. **Road sampling.** The centreline is analytic, so curvature, elevation and banking can be computed exactly ahead of each car. Sample a 1-2 km look-ahead window every 5-10 m and cache it per seeded segment. No track editor is needed.
3. **Racing line.** Choose a lateral offset across the four lanes that minimises curvature within the road edges, with margins for traffic and neighbouring rivals.
4. **Speed profile.** For each sample, derive a limit speed from the car's own grip, aero and load (`v = sqrt(μ·g / κ)` refined for load sensitivity and downforce), then run a forward pass for acceleration and a backward pass for braking. The same solver is the benchmark and BoP tool, and predicts each car's finish time.
5. **Driver controller.** Pure-pursuit or Stanley steering toward the line, and a longitudinal controller tracking the speed profile, including TC and ABS use.
6. **Skill and variation.** Difficulty is the fraction of the grip limit used, plus reaction delay, brake-point error and consistency. This is where the planned difficulty modes plug in. Avoid rubber-banding by default; if you add catch-up, make it an explicit option.
7. **Racecraft.** Overtaking and defending, traffic avoidance, spin recovery, and start-grid behaviour.
8. **Performance with up to 50 rivals.** Use the Phase 0 measurement. A likely design is full-rate simulation for cars near the player and a cheaper step (same tyre model, no high-rate inner loop) for distant rivals. Test that the cheaper step keeps finish times within a set tolerance of the full one.
9. **Tests.** Headless 10 km races for every car on several seeds. Fail if a rival leaves the road, spins out, or finishes more than a set percentage off the solver's predicted time.

## 9. Realistic milestones

| Milestone | Contents | Result |
| --- | --- | --- |
| M1: Foundation | Phases 0, 1, 2 plus the AI bridge | Renderer-free sim, real data sheets, crutches off, AI Race and multiplayer still run |
| M2: Feel core | Phases 3, 4, 5, 6 | Realistic driveline, tyres, weight transfer and differentials |
| M3: AI | Section 8 | Competitive race driver on all cars, 50 rivals within budget |
| M4: Online | Multiplayer stages 1-3 | Non-contact, then soft-contact races on the new sim |
| M5: Depth | Phases 7, 8, 9 | Steering feel, aero split, tyre warm-up and pressure |
| M6: Balance | BoP automation, Phase 10 | Balanced classes and a regression-tested sim |

A rough total is 3 days solo, depending on tuning time. M2 decides whether the game feels real, so it deserves the most care. Every milestone must leave AI Race and Multiplayer Race working, which is what the Phase 0 smoke tests are for. You can swap M3 and M4 if online play matters more to you than rival quality.

## 10. Risks and how to handle them

- **Numerical stiffness.** Realistic tyres at low speed blow up easily. Mitigation: the high-rate inner loop, damped integration for wheel slip, and tests at 0-5 km/h.
- **Endless-road precision.** Large coordinates degrade 32-bit physics (see D6). Mitigation: a floating origin and a 50 km drive test.
- **50-rival cost.** Rapier bodies plus a high-rate inner loop per car may not fit the frame budget. Mitigation: measure in Phase 0, then use a cheaper step for distant rivals.
- **Regressions in existing modes.** Every physics change can break AI Race and multiplayer. Mitigation: headless race smoke tests after every phase.
- **Tuning time.** Fitting 11 cars by hand takes forever. Mitigation: automated fitting against the headless harness.
- **Rapier limits.** One ray per wheel and cuboid colliders restrict body behaviour. Accept it and do not chase structural effects.
- **Scope creep.** Wet weather, damage and pit stops could each take a month. Treat them as post-M6 unless racing needs them.
- **Real data gaps.** CoM height, inertia and tyre curves are rarely published. Estimate them, record the method, and calibrate to published outputs (skidpad, 0-100, braking).

## 11. What to do first

1. Decide D1-D6, especially D4 (owner-authoritative multiplayer) and D6 (floating origin).
2. Do Phase 0: extract the sim core, extend the existing scripts, and record baselines for all 11 cars, including the 50-rival timing.
3. Build the `CarSpec` data sheets and decide which cars stay and which get real specs.
4. Run the crutches-off experiment (Phase 2) early. It shows how much of the current handling is real and how much is damping.
5. Only then dive into the driveline and tyres.
