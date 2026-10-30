# Physics Comparison Report — Oversteer vs. BeamNG.drive

**Date:** 2026-10-28  
**Basis:** `CAR_PHYSICS_REPORT.md` (Oversteer) + BeamNG.drive public physics documentation and JBeam/powertrain references (fetched via EXA).  
**Question answered:** Does Oversteer avoid “one car generalised to all cars” physics, and how closely does it match BeamNG.drive’s real-world, per-vehicle approach?

---

## 1. Executive Summary

Oversteer is a **rigid-body, single-controller** vehicle model. It is *parameterised* per car through `CarPhysicsConfig` (mass, engine, transmission, suspension, tyres, aero, assists), and those overrides are genuine and varied across the 11 cars. That is a real step away from “one car for everyone.”

However, BeamNG.drive is a **soft-body (node/beam), per-component** simulator: every vehicle is a unique physical structure, and behaviour emerges from thousands of springs/masses plus a detailed, modular powertrain. Oversteer shares the *same code path* for all cars and simulates none of that structure, deformation, or modularity.

**Overall weighted match to BeamNG.drive: ~44%.**  
Excluding the soft-body paradigm and damage (which Oversteer does not attempt), the **functional vehicle-dynamics subset matches ~57%**.

---

## 2. Methodology

Each category is scored 0–100 against BeamNG.drive’s documented behaviour, then weighted by its importance to “real-world, per-car” fidelity. Per-car uniqueness is scored separately because it is the explicit goal of this comparison.

| Weight | Meaning |
|---|---|
| 15–20 | Defining paradigm (soft-body, uniqueness, damage) |
| 8–12 | Core vehicle dynamics |
| 4–7 | Secondary systems |

---

## 3. Category Comparison

| # | Category | Weight | Match % | Weighted | Notes |
|---|---|---:|---:|---:|---|
| 1 | Physics paradigm (soft-body node/beam vs rigid body) | 20 | 10 | 2.0 | BeamNG: deformable node/beam @ 2 kHz. Oversteer: Rapier rigid bodies @ 120 Hz. |
| 2 | Per-vehicle uniqueness (structure + components) | 15 | 45 | 6.8 | Oversteer varies config values, but shares one controller and no per-car structure. |
| 3 | World / simulation step | 8 | 20 | 1.6 | Gravity matches (9.81). Timestep 1/120 s vs BeamNG 1/2000 s. |
| 4 | Chassis / rigid body | 8 | 25 | 2.0 | Mass values realistic; cuboid colliders vs node-beam mass distribution. |
| 5 | Engine model | 10 | 70 | 7.0 | Torque curve, RPM, redline, inertia, friction, rev limiter, idle all present. |
| 6 | Transmission / gearbox | 8 | 65 | 5.2 | Gear ratios, final drive, shift times, torque converter, clutch, auto logic. |
| 7 | Drivetrain / differential | 6 | 50 | 3.0 | RWD/AWD split present. LSD params defined but **not wired**. |
| 8 | Tyre model | 12 | 50 | 6.0 | Pacejka Magic Formula vs BeamNG physical pressure-wheel model. Slip/load/rolling resistance present. |
| 9 | Wheel spin dynamics | 6 | 75 | 4.5 | Inertia, slip damping, brake torque, clamping all present. |
| 10 | Suspension | 8 | 70 | 5.6 | Spring/damper/travel/ARB/bump-stop present; simplified vs bounded beams. |
| 11 | Steering | 5 | 65 | 3.3 | Max angle, speed sensitivity, grip cap present; `returnSpeed` unused. |
| 12 | Brakes | 5 | 75 | 3.8 | Front/rear torque, handbrake, ABS present. |
| 13 | Aerodynamics | 5 | 55 | 2.8 | Global Cd·A drag + downforce present; BeamNG uses per-triangle aero. |
| 14 | Assists (TC/ESC/ABS) | 4 | 70 | 2.8 | TC, ESC yaw torque, yaw damping, ABS present. |
| 15 | Damage / deformation | 10 | 0 | 0.0 | BeamNG core feature; Oversteer has none. |
| 16 | Config field utilisation | 5 | 60 | 3.0 | Several declared fields are not consumed (see §6). |
| | **Total** | **135** | | **59.2** | |

**Overall weighted match = 59.2 / 135 = 43.9% ≈ 44%.**

Functional subset (excluding rows 1, 3, 15): 55.6 / 97 = **57.3%**.

---

## 4. Per-Car Uniqueness Audit

Oversteer ships 11 cars. Unlike a single shared preset, each car overrides real parameters:

- **Mass & dimensions**: chassis mass 770–2570 kg, wheelbase 2.45–3.29 m, CoM height 0.35–0.75 m.
- **Engine**: power 270–950 HP, torque 304–1100 Nm, redline 6400–15000 RPM, distinct torque curves.
- **Transmission**: 5–9 gears, final drive 2.86–5.0, shift times, launch control RPM.
- **Drivetrain**: RWD vs AWD with front split 0.30–0.40.
- **Tyres**: radius 0.32–0.45 m, μ 1.25–1.70, reference load per car.
- **Suspension**: spring 52–120 kN/m, damper, travel 0.08–0.16 m, ARB.
- **Aero**: Cd 0.28–0.70, frontal area 1.4–2.7 m², downforce 40–1000 N@100 km/h.
- **Assists**: TC 0–0.55, ESC 0–0.2, countersteer 1500–5500 Nm, ABS on/off.

This is a genuine per-car tuning layer and is the main reason Oversteer does **not** reduce to “one car.” But it is *parametric*, not *structural*: BeamNG cars differ in node/beam layout, suspension geometry, engine placement, and component topology, which Oversteer cannot represent.

**Per-car uniqueness score: 45%.**

---

## 5. What Matches BeamNG Well

- Engine torque curve + RPM-based power delivery.
- Gearbox ratios, final drive, shift timing, torque converter, clutch engagement.
- Combined Pacejka-style longitudinal/lateral tyre forces with load sensitivity.
- Slip ratio / slip angle definitions with low-speed guards.
- Rolling resistance, tyre relaxation lag.
- Wheel spin inertia + slip damping + brake torque.
- Spring/damper/travel suspension with bump stops and ARB.
- Steering speed sensitivity and grip cap.
- Brakes, handbrake, ABS pulsing.
- Drag + downforce aero model.
- TC / ESC / yaw damping / ABS assists.

---

## 6. Key Gaps vs. BeamNG.drive

### 6.1 Paradigm (biggest gap)
- BeamNG is **soft-body** (nodes + beams, 2 kHz). Oversteer is **rigid-body** (Rapier, 120 Hz). No deformation, no energy absorption through structure, no damage propagation.

### 6.2 Per-vehicle structure
- BeamNG vehicles are unique JBeam structures with real component topology. Oversteer uses one `CarController` and varies scalars.

### 6.3 Unused / half-wired config fields
Declared in `CarPhysicsConfig` but not consumed by the controller:
- `differential.*` (LSD accel/decel/preload) — defined, not applied.
- `ackermannFactor` — defined, not applied.
- `targetDampingRatio` — defined, not applied.
- `aero.liftCoefficient` — defined, unused (F1 sets -2.5 with no effect).
- `pacejka.aligning` — defined, not consumed.
- `steering.returnSpeed` — defined, not applied.
- `simulation.raycastDistance`, `chassisRaycastDistance` — config only.

### 6.4 Tyre model fidelity
- BeamNG uses a physical pressure-wheel model; Pacejka is only an optional mod. Oversteer commits to Pacejka, which is empirical and requires per-tyre calibration that is not present (all cars share B/C/D/E).

### 6.5 Aerodynamics
- BeamNG computes aero per triangle (drag/lift per surface, stall). Oversteer uses a single global Cd, area, and downforce coefficient.

### 6.6 Damage
- None. BeamNG’s handling changes as parts bend/break; Oversteer handling is invariant to impacts.

---

## 7. Recommendations (to move toward BeamNG-style realism)

1. **Wire the unused fields** (LSD, ackermann, damping ratio, aligning moment, return speed, lift) — cheapest, immediate fidelity gain.
2. **Per-car tyre data**: give each car its own Pacejka B/C/D/E and slip stiffness instead of sharing one curve.
3. **Per-car aero surfaces**: replace global Cd/downforce with per-vehicle aero maps (front/rear balance, stall).
4. **Differential model**: implement LSD with accel/decel ramps and preload (params already exist).
5. **Steering geometry**: implement ackermann + caster + toe change per suspension travel.
6. **Suspension geometry**: per-car camber/toe change, bump steer, roll centre (currently scalar spring/damper only).
7. **Damage layer**: at minimum, speed-dependent deformation affecting aero and alignment (not full soft-body).
8. **Higher fidelity step**: consider 240–500 Hz vehicle update for stability at high speed.
9. **Long term**: node/beam or multi-body chassis if true BeamNG parity is the goal (large rewrite).

---

## 8. Conclusion

Oversteer has moved beyond “one generic car” by giving each of its 11 cars distinct, real-world-ish parameters (mass, powertrain, tyres, suspension, aero, assists). That earns a **45% per-car uniqueness score** and keeps the functional dynamics subset at **~57%** of BeamNG.drive.

But the defining BeamNG traits — soft-body node/beam structure, 2 kHz integration, emergent deformation/damage, and modular per-vehicle component topology — are absent. Until those are addressed, the **overall match remains ~44%**. The highest-ROI next step is wiring the already-declared-but-unused fields and adding per-car tyre/aero/differential models, which would lift the functional score toward ~70% without a paradigm change.

---

## Sources (EXA)

- BeamNG Soft-body Physics: https://www.beamng.com/game/about/physics/
- BeamNG Architecture: https://documentation.beamng.com/beamng_tech/architecture/
- BeamNG JBeam sections: https://docs.beamng.com/modding/vehicle/sections/
- BeamNG Pressure Wheels: https://docs.beamng.com/modding/vehicle/sections/wheels/
- BeamNG Triangles / Aero: https://documentation.beamng.com/modding/vehicle/sections/triangles/
- BeamNG Tire Physics Changes: https://www.beamng.com/game/news/blog/tire-physics-changes/
- BeamNG Tire Development (Parts 1 & 2): https://www.beamng.com/game/news/patch/a-look-at-tire-development-in-beamng-part-1/
- BeamNG Technical Paper: https://beamng.tech/blog/2021-06-21-beamng-tech-whitepaper/bng_technical_paper.pdf
- BeamNG Vehicle Controller: https://documentation.beamng.com/modding/vehicle/vehicle_system/controller/main/vehiclecontroller/