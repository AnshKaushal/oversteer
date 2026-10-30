# Physics Improvement Plan — Oversteer

**Scope:** Keep the project **rigid-body** (Rapier3D). No soft-body, no damage. Goal: remove generalised/unused physics, make every vehicle unique and realistically coupled (engine ↔ clutch ↔ gearbox ↔ diff ↔ wheels ↔ tyres), improve tyre/aero/steering/LSD, and raise simulation fidelity/performance.

**Companion docs:** `CAR_PHYSICS_REPORT.md`, `BEAMNG_COMPARISON_REPORT.md`.

---

## Phase 0 — Baseline & Instrumentation (no behaviour change)

1. Add a debug/profiling toggle in `src/mainview/systems/PhysicsSystem.ts` and `CarController.update()` to print:
   - world step time, controller update time, tyre eval time, substep count.
   - per-wheel: `omega`, `slipRatio`, `driveTorque`, `tireTorque`, `brakeTorque`, `rpm`, `gear`.
2. Record a reproducible test scenario (straight-line 0–100, burnout in 1st, 3rd-gear pull, braking, corner) and save telemetry CSV.
3. **Files:** `PhysicsSystem.ts`, `CarController.ts`, `TireModel.ts`, `WheelDynamics.ts`.

**Acceptance:** Baseline timings + telemetry captured before any physics change.

---

## Phase 1 — Wire All Half-Wired / Unused Config

**Problem:** `CarPhysicsConfig` declares fields that have no effect (`differential.*`, `ackermannFactor`, `targetDampingRatio`, `aero.liftCoefficient`, `pacejka.aligning`, `steering.returnSpeed`, raycast distances).

Tasks:
1. **LSD (Phase 5 prerequisite):** consume `differential.lsdAccelLock`, `lsdDecelLock`, `preloadTorque` in the differential torque split.
2. **Ackermann:** implement toe difference between inner/outer front wheels using `steering.ackermannFactor` in `CarController` steering solve.
3. **Damping ratio:** replace raw `damperRate` usage with `targetDampingRatio`-derived critical damping where `targetDampingRatio` is set; keep `damperRate` as override fallback.
   - **File:** `src/mainview/systems/Suspension.ts`.
4. **Aligning moment:** consume `pacejka.aligning` in `TireModel` to output `Mz`; feed it to steering self-centering (Phase 6).
5. **Lift coefficient:** add speed-dependent lift (can be negative/downforce) in aero solve; currently only `downforceAt100kmh` is used.
   - **File:** `CarController.ts` aero block.
6. **Raycast distances:** use `simulation.raycastDistance` / `chassisRaycastDistance` instead of hardcoded `MAX_REACH`/`RAY_LIFT` constants in `Suspension.ts`.
7. **Remove or repurpose `steering.returnSpeed`:** recommended removal from `physics.ts` and `cars.ts` once aligning-moment self-centering is implemented; keep current steering otherwise. (Decision in Phase 6.)

**Files:** `physics.ts`, `cars.ts`, `CarController.ts`, `Suspension.ts`, `TireModel.ts`.

**Acceptance:** No declared config field is silently ignored; grep for each field shows a consumer.

---

## Phase 2 — Per-Vehicle Structure (still rigid body)

**Problem:** One `CarController` + flat config. Need per-vehicle component topology while keeping Rapier rigid body.

Tasks:
1. Introduce a `VehicleBuild` / `VehicleProfile` layer:
   - `src/mainview/vehicles/VehicleProfile.ts` (new): chassis mass distribution, engine mount position, drivetrain layout, differential type, suspension geometry, aero centre of pressure, tyre set.
   - `src/mainview/vehicles/VehicleFactory.ts` (new): builds `CarController` + chassis body + wheels from a profile instead of `createPhysicsConfig({})`.
2. Move per-car data from `cars.ts` overrides into structured profile objects:
   - Engine position (front/mid/rear) → affects weight transfer and yaw inertia.
   - Drivetrain layout (RWD/FWD/AWD + transfer case).
   - Suspension geometry (hardpoints, camber/toe curves, roll centres).
   - Tyre set (size + Pacejka set).
   - Aero (Cd, area, downforce split, CoP height).
3. Keep `CarDefinition` as the visual + profile reference; `physics` becomes derived from profile.
4. Add per-car chassis inertia overrides (currently Rapier computes from collider mass; allow `inertiaTensor` override for F1 vs SUV).

**Files:** `cars.ts`, `physics.ts`, `PhysicsSystem.ts`, `CarController.ts`, new `vehicles/*`.

**Acceptance:** Each car is constructed from its own profile; no two cars share identical component topology unless intended (e.g., platform mates).

---

## Phase 3 — Fix Wheel Spin / RPM Coupling (burnout + 1st-gear issue)

**Problem:** Tyres can spin at full speed while RPM stays low / car remains in 1st gear. Need driveline inertia and clutch coupling.

Tasks:
1. Add a driveline model:
   - `EngineState`: inertia `Ie`, RPM, friction, torque output.
   - `Clutch`: engagement RPM, slip torque, lock state.
   - `Gearbox`: current ratio, inertia reflected to engine.
   - `Differential`: ratio + LSD (Phase 5).
   - `WheelSet`: per-wheel inertia (already exists).
2. Couple engine RPM to wheel speed:
   - When clutch locked: `engineRPM = wheelOmega * gearRatio * 60/(2π)` (+ driveline compliance).
   - When slipping: engine RPM can exceed wheel-coupled RPM by slip amount; apply clutch slip torque to both sides.
   - Remove the current `throttleFlare` hack that decouples RPM from wheel speed.
3. Burnout behaviour:
   - Allow wheel omega to rise under drive torque when tyre torque is low.
   - RPM should rise with wheel speed through the (slipping) clutch/gear ratio, not stay pinned.
   - Auto-shift logic must distinguish engine RPM (for shift points) from wheel speed; do not block upshift solely on `slipRatioAvg > 0.24` unless a dedicated “traction event” flag is set.
4. Add a driveline slip telemetry field (`drivelineSlip`) to `CarTelemetry`.

**Files:** `CarController.ts`, `WheelDynamics.ts`, new `src/mainview/systems/Driveline.ts`.

**Acceptance:** In a 1st-gear burnout, RPM tracks wheel speed; releasing throttle lets RPM fall; auto upshift occurs when engine RPM crosses threshold even if tyres are spinning (unless launch control active).

---

## Phase 4 — Tyre Model Upgrade (50% → target 75%+)

Tasks:
1. Per-car tyre data in profile (Pacejka B/C/D/E, load exponents, relaxation length, rolling resistance) instead of one shared set.
2. Add camber angle input (from suspension geometry) to `TireModel.eval`.
3. Add aligning moment (`Mz`) output using `pacejka.aligning`.
4. Improve combined slip: keep friction ellipse but use per-tyre `muX/muY` and load sensitivity.
5. Rolling resistance: make speed-dependent (current `tanh(vx/0.5)` is coarse).
6. Relaxation length: per-tyre and speed-aware; consider separate long/lat relaxation lengths.
7. Optional (later): tyre temperature/wear state (start as no-op hooks).

**Files:** `TireModel.ts`, `CarController.ts`, `physics.ts`, `cars.ts`/profiles.

**Acceptance:** Each car uses its own tyre parameter set; aligning moment feeds steering; telemetry shows per-tyre loads and slip.

---

## Phase 5 — Drivetrain & LSD (serious wiring)

Tasks:
1. Implement differential torque distribution:
   - Open diff: equal torque, speed difference allowed.
   - LSD: torque bias based on `accelLock`/`decelLock` + `preloadTorque`; lock factor = `preload + lock * (driveTorque or brakeTorque)`.
   - Apply per-axle: front diff, rear diff, centre transfer case (AWD).
2. Reflect differential inertia into driveline (Phase 3).
3. Wire `drivetrain.type` and `frontTorqueSplit` into the differential model instead of simple split.
4. Add torque caps per gear (already exist) at the differential output, not per-wheel aggregate only.
5. Telemetry: `diffLockFront`, `diffLockRear`, `centreSplit`.

**Files:** new `src/mainview/systems/Differential.ts`, `CarController.ts`, `physics.ts`.

**Acceptance:** LSD params affect handling (lift-off oversteer, power-on understeer) and are visible in telemetry.

---

## Phase 6 — Steering Realism Decision

**User choice:** remove `returnSpeed` or improve realism.

Recommended: **Improve realism (keep current as fallback).**
Tasks:
1. Implement self-centering from tyre aligning moment + caster trail:
   - `steerTorque = sum(Mz_front) + casterTrail * lateralForce`.
   - Apply as a torque to the steering input rate.
2. Remove `steering.returnSpeed` from config once aligning-based centering is active (or keep as gain multiplier).
3. Add speed-dependent steering rack ratio (currently only max angle scales).
4. Add steering damper (small velocity-proportional resistance).

If choosing **remove only**: delete `returnSpeed` from `physics.ts`/`cars.ts` and leave current rate model.

**Files:** `CarController.ts`, `TireModel.ts`, `physics.ts`, `cars.ts`.

**Acceptance:** Steering self-centres after corner exit without scripted return; config no longer contains dead `returnSpeed` (if removed).

---

## Phase 7 — Aerodynamics Upgrade

Tasks:
1. Replace single global downforce with front/rear split (`downforceFront`, `downforceRear`) and CoP height.
2. Add speed-dependent drag (optional Cd vs speed curve) and yaw sensitivity (side force).
3. Apply aero forces at the correct point (CoP), not chassis centre.
4. Per-car aero maps in profile (F1 high downforce vs SUV low).

**Files:** `CarController.ts`, `physics.ts`, profiles.

**Acceptance:** High-speed balance changes with aero split; telemetry shows front/rear aero loads.

---

## Phase 8 — Performance (target: stable high-fidelity step)

Tasks:
1. Profile baseline (Phase 0) and identify hot paths (tyre eval, suspension raycasts, allocations).
2. Reduce per-frame allocations in `CarController.update()` (reuse `THREE.Vector3`, avoid spread input copies where possible).
3. Increase fixed world timestep to **1/240 s** (evaluate cost) with max 8 substeps; keep vehicle update substeps.
4. Consider 2–4 vehicle substeps per world step for fast cars; cap angular velocity (already does).
5. Optional: move physics step to a Web Worker if main-thread budget is exceeded.
6. Keep CCD on chassis (already).

**Files:** `PhysicsSystem.ts`, `CarController.ts`, `Suspension.ts`.

**Acceptance:** No frame drops in the test scenario; telemetry shows stable step time; handling improves at high speed.

---

## Phase 9 — Validation & Regression

Tasks:
1. Re-run the Phase 0 test scenarios after each phase; compare 0–100, top speed, braking distance, lap/telemetry.
2. Add unit tests for:
   - `TireModel` (slip 0 → ~0 force, peak at expected slip).
   - `WheelDynamics` (brake clamps omega to 0).
   - Differential torque split.
   - Config wiring (every field consumed).
3. Update `CAR_PHYSICS_REPORT.md` and `BEAMNG_COMPARISON_REPORT.md` with new match percentages.

**Files:** tests (new), docs.

**Acceptance:** Regression suite green; updated reports reflect new match scores.

---

## Suggested Order (shortest path to biggest gain)

1. Phase 1 (wire unused) — low risk, immediate fidelity.
2. Phase 3 (RPM/wheel coupling) — fixes the reported burnout/1st-gear issue.
3. Phase 5 (LSD) — makes drivetrain realistic.
4. Phase 4 (tyre data + aligning) — lifts tyre score.
5. Phase 2 (per-vehicle structure) — architectural foundation.
6. Phase 7 (aero split).
7. Phase 6 (steering self-centering).
8. Phase 8 (performance).
9. Phase 9 (validation).

---

## References

**Local:**
- `src/mainview/constants/physics.ts` — `CAR_PHYSICS`, `CarPhysicsConfig`, `createPhysicsConfig`.
- `src/mainview/constants/cars.ts` — per-car overrides.
- `src/mainview/systems/CarController.ts` — main pipeline, RPM, shifting, aero, assists.
- `src/mainview/systems/Suspension.ts` — spring/damper/ARB/raycast.
- `src/mainview/systems/WheelDynamics.ts` — wheel spin integration.
- `src/mainview/systems/TireModel.ts` — Pacejka implementation.
- `src/mainview/systems/PhysicsSystem.ts` — world step, chassis body.

**External (BeamNG, via EXA):**
- Soft-body overview: https://www.beamng.com/game/about/physics/
- Architecture: https://documentation.beamng.com/beamng_tech/architecture/
- JBeam sections: https://docs.beamng.com/modding/vehicle/sections/
- Pressure wheels: https://docs.beamng.com/modding/vehicle/sections/wheels/
- Aero (triangles): https://documentation.beamng.com/modding/vehicle/sections/triangles/
- Tire physics changes: https://www.beamng.com/game/news/blog/tire-physics-changes/
- Tire development Part 1/2: https://www.beamng.com/game/news/patch/a-look-at-tire-development-in-beamng-part-1/
- Technical paper: https://beamng.tech/blog/2021-06-21-beamng-tech-whitepaper/bng_technical_paper.pdf
- Vehicle controller: https://documentation.beamng.com/modding/vehicle/vehicle_system/controller/main/vehiclecontroller/