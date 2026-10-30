# OverSteer — Project Overview

**OverSteer** is a desktop driving game built as an Electrobun app (Hutch + Cottontail). It is a 3D, third-person car experience: a single hand-written vehicle physics model running on Rapier, rendered with three.js inside a React shell. Repo/package name: `oversteer`.

> This document is the current high-level snapshot of the project. For deeper physics detail see `CAR_PHYSICS_REPORT.md`, `BEAMNG_COMPARISON_REPORT.md`, and `PHYSICS_IMPROVEMENT_PLAN.md`. For build/release steps see `README.md`.

## What the game is

An endless-road driving sandbox at its core: you spawn parked on a procedurally curving four-lane highway and drive as far as you want — the world recycles underneath you forever. There is no traffic, no AI and no finish line in free roam. It is a handling playground. On top of that base the app layers:

- **Free Roam** — endless highway, optional AI traffic (Off/Low/Med/High), airplane fly-bys, time of day.
- **AI Race** — 1–50 AI rivals, 1/2/5/10 km distances, grid start, countdown, live standings, finish line, results screen.
- **Multiplayer Race** — P2P (via Trystero/torrent) or LAN relay (WebSocket on port 9876), shared grid, ready-up, remote car replication, race finish sync.
- **Garage / menu** — car selection, custom paint (per car, persisted), rival pool selection, traffic level, time of day, settings.

## World

- Deterministic sum-of-sines centreline with elevation and banking; ribbon-mesh road that recycles ahead of the car.
- Instanced trees/hills seeded per segment so a stretch looks the same every time.
- Terrain tiles with heightmap, road clearance, LOD.
- 4 time-of-day presets (Sunrise / Day / Evening / Night) affecting sky, fog, sun/moon, ambient light, ground, and auto headlights.
- Airplane fly-by dressing (twin-turboprop transport) crossing the road periodically.

## Vehicle roster (11 cars)

BMW M3 (default), Audi R8 V10, Audi RS 7 Performance, Porsche 911 GT2 (997), Mercedes G 63, Lamborghini Urus, Lamborghini Aventador LP 700-4, Dodge Challenger SRT8, Formula 1 Car, Cheetah '84, 1969 Dodge Charger 426 HEMI. Each car overrides mass, dimensions, engine, transmission, drivetrain (RWD/AWD splits), wheels, suspension, dash redline, and GLB model.

## Vehicle physics

Hand-written model; the car is a single Rapier rigid body. Per frame:

- Suspension (springs, dampers, anti-roll bars), tire forces with friction ellipse, load transfer.
- Brakes, aero, assists (traction control, ABS, ESC with countersteer assist).
- Drivetrain: 800 HP / 1000 Nm torque curve, 8-speed ZF-style auto/manual, torque converter, launch control, fuel-cut rev limiter, hill-hold, reverse.
- Steering is rate-limited and grip-capped. Holding the handbrake disables TC and ESC for drifting.

## Controls (summary)

Throttle `W`/`↑`, brake/reverse `S`/`↓`, steer `A D`/`← →`, shift `Q`/`E` (manual), toggle auto/manual `M`, launch control `L`, cruise control `;` `[` `]`, handbrake `Space`, reset `R`, camera distance `C`, start `Enter`, release mouse `Esc`, mouse orbits camera.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electrobun / Hutch (Bun main process) |
| UI | React 18 + Tailwind CSS v4 (Vite plugin) |
| 3D | three.js |
| Physics | Rapier 3D (WASM) + hand-written vehicle model |
| Build | Vite 6, TypeScript 5.7 |
| Networking | Trystero P2P (torrent) + LAN WebSocket relay |

## Architecture (key paths)

```
src/bun/index.ts                 # main process: window, updater, LAN relay server
src/mainview/
  App.tsx                        # frame loop, camera, pointer lock, HUD wiring
  constants/
    physics.ts                   # CAR_PHYSICS — shared vehicle tunables
    cars.ts                      # per-car overrides (11 cars)
    world.ts                     # WORLD_CONFIG — road/vegetation/environment
    timeOfDay.ts                 # time-of-day presets
  systems/
    road.ts / WorldManager.ts    # analytic road + scene world recycling
    PhysicsSystem.ts             # Rapier world, chassis body, fixed timestep
    CarController.ts             # vehicle physics update (composes vehicle/)
    vehicle/                     # tire, suspension, drivetrain, assists, aero
    InputManager.ts              # keyboard → DriveInput with analog smoothing
    CarVisual.ts                 # GLB load, wheel pivots, per-frame pose
    TireSmoke.ts                 # pooled GPU point-sprite smoke
    AIDriver.ts                  # AI driver profiles + traffic behavior
    AirplaneFlyby.ts             # airplane dressing
    net/                         # multiplayer state protocol, remote cars
    settings.ts                  # resolution/graphics settings
  ui/                            # Dashboard, RaceOverlay, MultiplayerLobby, etc.
scripts/                         # headless checks (smoke-test, drift-matrix, road-test, ...)
```

## Presentation

Chase camera with mouse orbit and speed-based FOV, peripheral speed lines, camera shake, tire smoke, SVG twin-dial dashboard (speedo to 340 km/h, tacho with red band from 7000 rpm), race HUD with live board and results, settings modal for resolution/render scale/shadows.

## Persistence

`localStorage`: selected car, paint per car, rival car pool, traffic level, driver name/color, settings, time of day.

## Build / run

```bash
hutch run install      # install deps
hutch run dev:hmr      # dev with Vite HMR (recommended)
hutch run dev          # dev without HMR
hutch run build        # production build
```

Headless checks: `hutch scripts/smoke-test.ts`, `hutch scripts/drift-matrix.ts`, `hutch scripts/road-test.ts`.

## Notes for future work

`Changes.md` tracks planned improvements (difficulty modes, rewind, weather, dyno mode, etc.). `PHYSICS_IMPROVEMENT_PLAN.md` tracks unused-config wiring, per-vehicle structure, driveline/RPM coupling, tyres, LSD, aero, performance.