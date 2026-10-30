# Car Physics Report — Oversteer

Hand-written vehicle dynamics on top of **Rapier3D** (`@dimforge/rapier3d-compat`). One shared simulation pipeline (`CarController`) parameterized per car via `CarPhysicsConfig` (`src/mainview/constants/physics.ts` + `cars.ts`). 11 cars ship; all reuse the same code path.

## 1. World & Simulation

| Item | Value |
|---|---|
| Engine | Rapier3D dynamic rigid bodies |
| Gravity | (0, **-9.81**, 0) m/s² |
| World timestep | **1/120 s** (0.00833 s) |
| Max substeps/frame | **6** |
| Frame dt clamp | **1/30 s** |
| Vehicle update substeps (config) | **8** (max 1/60 s each) |
| CCD | enabled on chassis |
| Linear damping | 0.001 |
| Angular damping | 0.55 |

## 2. Chassis & Rigid Body

- Body: dynamic rigid body, translation `(x, 0.72, z)`, yaw set from road.
- Colliders: (a) cuboid `w/2 × (0.32·h/1.43) × l/2`, mass = chassis mass, friction **0.4**, restitution **0.1**, offset y **-0.1**; (b) cabin cuboid `0.75w × 0.33h × 1.05l`, friction 0.4, restitution 0.1.
- Default dims (BMW M3): **w 1.85 × h 1.43 × l 4.71 m**, wheelbase **2.85**, track **1.58**, ground clearance **0.12**, CoM height **0.5**.
- Default mass: chassis **1650 kg**, front/rear wheel **25 kg** each (inertia `0.5·m·r²`), configured total **1750 kg**.

## 3. Engine

- Power: **850 HP**, torque: **1100 Nm** (defaults).
- Peak power RPM **7200**, peak torque RPM **3500**, redline **7500**, idle **800**, rev limiter **7500**.
- Torque curve: 10-point (RPM → multiplier), e.g. 0→0.30, 3500→1.00, 7500→0.55, 7700→0.00.
- Engine inertia **0.3 kg·m²**; friction torque `50 + 0.015·RPM` (only 25% subtracted from output).
- Output torque: `maxTorque · curveMult · throttle − 0.25·friction`, ×0.25 while shifting, ×0 (limiter cut / neutral).
- Rev limiter cuts fuel above redline; hysteresis resets below `redline − 400`.
- Neutral: RPM blends toward `idle + throttle·(redline − idle)·0.9` (rate 5/s up, exponential decay down).
- Airborne flare: RPM held at `redline − 100` when throttle on and airborne.

## 4. Transmission & Gearbox

- **8 forward gears**: `[4.71, 3.14, 2.10, 1.67, 1.29, 1.00, 0.84, 0.67]` + reverse **3.2** + neutral (0).
- Final drive **3.15**; overall ratio = gear × final drive.
- Shift time: auto **0.15 s**, manual **0.08 s**.
- Torque converter: stall mult **1.7** (fades to 1 by 25 km/h), creep force **1350 N** fwd / **700 N** rev.
- Clutch engagement RPM **1500**, slip time **0.3 s**, launch control RPM **4500** (active).
- Auto shift RPMs: upshift **7200**, downshift **2100**.
- Shift logic: aggression-based (tip-in + brake), kickdown, anti-stall to 1st, hysteresis factor 1.28, min 0.85 s between shifts.
- Manual: W/S throttle/brake even in reverse; auto swaps pedals in reverse.

## 5. Drivetrain

- Default **RWD** (`frontTorqueSplit 0`); AWD variants split 0.30–0.40 to front.
- Torque per driven wheel = `total · split (or 1−split) / 2`.
- Torque caps: gear 1 **2400 Nm**, gear 2 **3800 Nm** (per wheel-side aggregate).
- Feed-in ramp: 0.4→1.0 over 0.5 s on 1st-gear throttle (launch/clutch-dump = 1.0).
- Traction control: cuts up to **88%** torque when slip ratio > 0.15 (gain 0.4).
- LSD params (accel lock 0.4 / decel 0.3 / preload 50) are defined in config but **not wired** into the controller.

## 6. Tire Model (Pacejka)

- Combined (friction ellipse) Magic Formula with longitudinal + lateral coupling.
- Base μ **1.4**; reference load **4000 N**; load sensitivity exp: long **0.9**, lat **0.85** (μ scales as `μ·(Fz/Fref)^(exp−1)`).
- Longitudinal shape: B **10.0**, C **1.65**, D **1.0**, E **0.97**.
- Lateral shape: B **9.0**, C **1.45**, D **1.0**, E **0.97**.
- Slip ratio `sx = (ω·r − vx) / max(|vx|, 2.0)`; slip angle `atan2(vy, max(|vx|,2))`.
- Rolling resistance: `-0.012·Fz·tanh(vx/0.5)`.
- Combined coupling: `fx *= 1/√(1 + 2²·sa²)`, `fy *= 1/√(1 + 2²·sx²)`; friction ellipse renormalization if `√((fx/Dx)²+(fy/Dy)²) > 1`.
- Tire force lag (relaxation length **0.18 m**): first-order low-pass `lag = (lag + dt·rate·res) / (1 + dt·rate)`, `rate = (|vx|+0.5)/0.18`.
- Aligning moment shape defined but not consumed.

## 7. Wheel Spin Dynamics

- Per-wheel inertia `0.5·m·r²` (default 25 kg → **1.36 kg·m²** at r=0.33).
- Update: `ω = (ω + (drive−tire)/I·dt + slipDamp·r/I·dt·roadSpeed) / (1 + dt·slipDamp·r²/I)` (slipDamp **100**).
- Brake torque removes angular velocity linearly; clamps to 0 at zero.
- Slip-damp torque feeds back to wheel.

## 8. Suspension

- Spring **65000 N/m**, damper **4500 N·s/m**, travel **0.12 m**.
- Rest length **0.915 m**, ray lift **0.1 m**, max reach **1.035 m**, droop limit **-0.06 m**.
- Bump stop: stiffness ×1 above 0.1 m compression, gain **12**.
- Force = `k·bump·max(0, compression) − c·pointVel·up + ARB`, clamped `[0, 30000]`.
- ARB: front **15000**, rear **12000**, force limit **4000 N**, based on compression difference /2.
- Load = force; applied as impulse at contact (anchor y averaged).
- Grounded if ray hit within reach.

## 9. Steering

- Max angle **0.6 rad** (34.4°).
- Speed sensitivity: `factor = 1 / (1 + (speed/190)² · 0.6 · 3)`.
- Grip cap: `atan(wheelbase·32 / max(40, v²))`; steer cap = `max(gripCap, 0.05)`.
- Target steer = `clamp(input·maxAngle·factor, −cap, cap)`; rate **6 rad/s**.
- Return speed config **3.0** (not applied in current rate model).

## 10. Brakes

- Front **1800 Nm**, rear **1400 Nm** per wheel (torque at wheel).
- Handbrake: **3500 Nm** on rear wheels (reduced to `2600 − 1400·|steer| − 800·clamp(speed/15,0,1)` when throttle on).
- Reverse gear: brake pedal becomes throttle.
- Parking brake: 3000 Nm holding torque on all wheels.
- ABS: pulses torque ×(0.6 + 0.4·sin(90·t)) when wheel locks (brake>0.7, speed<2 m/s patch).

## 11. Aerodynamics

- Drag: `0.5·ρ·Cd·A·v²` with ρ **1.225**, Cd **0.32**, A **2.2 m²**.
- Downforce: `150 / 27.78² · v²` (N at v m/s) applied as downward impulse.
- Lift coefficient **0.15** defined but unused.

## 12. Assists

- Traction control gain **0.4** (reduced during launch/clutch-dump).
- Stability control **0.2**: ESC yaw torque up to **6000 Nm** when slip angle exceeds deadzone (0.02–0.06), with countersteer assist up to **4500 Nm**.
- Yaw damping: `-angVel.y · 1800` torque.
- ABS enabled, slip threshold **0.15**.

## 13. Per-Car Tuning (11 cars)

| Car | Mass (kg) | Power (HP) | Torque (Nm) | Redline | Gears | Drive | μ | Spring (kN/m) | 0–100 (s) | Top (km/h) |
|---|---|---|---|---|---|---|---|---|---|---|
| BMW M3 | 1750 | 850 | 1100 | 7500 | 8 | RWD | 1.40 | 65 | 4.3 | 360 |
| Audi R8 V10 | 1695 | 640 | 600 | 8700 | 7 | AWD 0.30 | 1.50 | 68 | 3.4 | 342 |
| Audi RS 7 | 2100 | 605 | 850 | 7000 | 8 | AWD 0.40 | 1.50 | 75 | 3.7 | 345 |
| Porsche 911 GT2 | 1640 | 650 | 800 | 7000 | 8 | RWD | 1.25 | 75 | 2.7 | 330 |
| Mercedes G 63 | 2700 | 850 | 1000 | 6500 | 9 | AWD 0.40 | 1.25 | 98 | 4.3 | 319 |
| Lamborghini Urus | 2320 | 700 | 1000 | 6800 | 8 | AWD 0.38 | 1.35 | 88 | 3.9 | 316 |
| Lamborghini Aventador | 1650 | 700 | 690 | 8500 | 7 | AWD 0.30 | 1.55 | 62 | 2.9 | 350 |
| Dodge Challenger SRT8 | 1878 | 425 | 569 | 6400 | 5 | RWD | 1.30 | 52 | 5.0 | 274 |
| Formula 1 | 798 | 950 | 850 | 15000 | 8 | RWD | 1.70 | 120 | 2.6 | 372 |
| Cheetah '84 | 1322 | 270 | 304 | 7700 | 5 | RWD | 1.30 | 55 | 6.0 | 260 |
| Dodge Charger '69 | 1650 | 500 | 750 | 6800 | 6 | RWD | 1.55 | 72 | 4.1 | 308 |

(μ = tire frictionMu; spring = suspension springRate; drive = drivetrain type with front torque split for AWD.)

## 14. Notes

- All cars share one controller; differences come from config overrides only.
- Some config fields are declared but not consumed by the current controller: `differential.*` (LSD), `ackermannFactor`, `targetDampingRatio`, `aero.liftCoefficient`, `pacejka.aligning`, `steering.returnSpeed`. Documented for completeness; tuning them has no effect today.
- Physics is custom (not a vehicle controller library); Rapier is used only for rigid-body integration, collisions, raycasts.