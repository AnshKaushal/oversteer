# OverSteer

A desktop driving game with a hand-written vehicle physics model. Pick one of twelve cars, race AI rivals or friends over an endless procedurally curving highway, dodge traffic, or just drive. Built as an Electrobun app (Hutch + Cottontail) with a React + three.js view and a vehicle model running on Rapier, stepped at a fixed 120 Hz.

## Downloading a build

Grab the latest DMG (macOS) or Setup zip (Windows) from the [Releases page](../../releases). On macOS, the app is not Apple-signed, so the first open is blocked by Gatekeeper: try opening it once, then System Settings → Privacy & Security → **Open Anyway** (or run `xattr -cr /Applications/OverSteer.app` if that button is missing). It opens normally from then on.

## The game

- **Twelve cars, all data** — every car is one `CarSpec` file: mass, engine and torque curve, gearing, differential, tyres, suspension, aero, crash behaviour, dash scale. No per-car code. See [AddingCars.md](AddingCars.md).
- **Vehicle model** — a single Rapier rigid body with per-wheel suspension, a Pacejka tyre model with relaxation and combined slip, wheel dynamics, engine with turbo and torque converter, automatic gearbox, differentials (open, limited-slip, centre), aero and impact damage. Each part is its own component under `physics/vehicle/components/`.
- **Safety aids** — traction control, ESC, ABS, launch control and cruise control, each toggled in-game. The handbrake latches (tap) or holds.
- **World** — deterministic road with elevation and banking, hills and trees, time of day with sun and moon, surfaces (asphalt, grass, dirt, gravel, sand) and weather (dry, damp, wet, storm) that scale tyre grip, tyre smoke, car lights, and aircraft fly-bys.
- **Racing and traffic** — races of 1 to 10 km against 1 to 50 AI rivals, with a grid, countdown and standings; optional traffic (off, low, medium, high).
- **Multiplayer** — peer-to-peer rooms over WebRTC (Trystero) or a LAN relay hosted by the app. Binary 72-byte car state at 60 Hz, sender-time interpolation with adaptive delay, Hermite smoothing, capped extrapolation, and solid-body collisions between cars. Peers share paint and car choice, and compare a hash of the car data.
- **Presentation** — chase camera with mouse orbit, speed FOV and shake, SVG dashboards (modern and legacy), settings for graphics, and a live netcode diagnostics panel.

## Controls

| Input             | Action                                                                |
| ----------------- | --------------------------------------------------------------------- |
| `W` / `↑`         | Throttle                                                              |
| `S` / `↓`         | Brake in gear/neutral, throttle in reverse                            |
| `A` `D` / `←` `→` | Steer                                                                 |
| `Space`           | Handbrake (tap to latch, hold to engage)                              |
| `E` / `Q`         | Shift up / down (manual mode)                                         |
| `M`               | Transmission mode                                                     |
| `L`               | Launch control (arm with throttle and brake at a standstill)          |
| `X` / `G` / `B`   | Traction control / stability control / ABS                            |
| `N`               | Safety aids on / off                                                  |
| `V`               | Engine on / off                                                       |
| `;`               | Toggle cruise control                                                 |
| `[` `]`           | Cruise: set or slow down / resume or speed up                         |
| `H`               | Headlights                                                            |
| `T`               | Time of day                                                           |
| `R`               | Put the car back on the road                                          |
| `C`               | Camera view                                                           |
| `P` / `Esc`       | Pause                                                                 |
| `Enter`           | Start                                                                 |
| Mouse             | Orbit the camera; eases back behind the car after a couple of seconds |

## Tech stack

| Layer   | Choice                                        |
| ------- | --------------------------------------------- |
| Shell   | Electrobun / Hutch                            |
| UI      | React 18 + Tailwind CSS v4 (Vite plugin)      |
| 3D      | three.js                                      |
| Physics | Rapier 3D (WASM) + hand-written vehicle model |
| Build   | Vite 6, TypeScript 5.7                        |

## Getting started

Install Hutch first (it owns packages, scripts and bundling):

```bash
# macOS / Linux
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh

# Windows PowerShell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
```

Then, in the repo:

```bash
hutch run install      # install dependencies
hutch run dev:hmr      # development with Vite HMR (recommended)
hutch run dev          # development without HMR (bundled assets)
hutch run build        # production build → build/ and artifacts/
hutch run build:canary # canary-channel build
```

### How HMR works

`hutch run dev:hmr` starts the Vite dev server on `http://localhost:5173`, then launches Electrobun against it — React components update instantly instead of reloading. `hutch run dev` skips the server and loads the bundled assets from `views://mainview/index.html`.

### Headless scripts

Physics, netcode and data checks run outside the app through bun (or `hutch scripts/<name>.ts`). Most take `CAR=<id>` for one car, or run across every car with `run-per-car`:

```bash
bun scripts/validate-cars.ts                      # spec validation
bun scripts/run-per-car.ts scripts/smoke-test.ts  # any car suite across all cars
bun scripts/golden-master.ts                      # recorded behaviour baseline (--record to update)
bun scripts/audit-literals.ts --fail              # no tuned numbers hidden in code
CAR=bmw-m3 bun scripts/dyno.ts                    # engine curve and full-throttle pull
bun scripts/net-codec-test.ts                     # netcode (also net-protocol/-interp/-correction/-contact)
bun scripts/world-tests.ts                        # road, surfaces, seams
```

Other suites: `feel-test`, `chassis-tests`, `component-tests`, `suspension-test`, `tire-model-test`, `wheel-dynamics-test`, `engine-realism`, `drift-matrix`, `perf-bench`. Run the per-car suites and the golden master after any change to physics, and `npx tsc --noEmit -p .` after any change at all. Accepted failures are listed in `scripts/known-failures.json`.

## Project structure

```
src/bun/index.ts            # Electrobun main process: window, menu, LAN relay
src/mainview/
├── App.tsx                 # frame loop, camera, HUD, race and multiplayer wiring
├── data/
│   ├── cars/<id>.ts        # one complete CarSpec per car (the only place car numbers live)
│   ├── cars/index.ts       # the registry
│   ├── schema.ts           # CarSpec types
│   ├── validate.ts         # spec checks, run at load and by scripts/validate-cars.ts
│   ├── engines.ts tyres.ts crash.ts   # build helpers and presets
│   ├── surfaces.ts         # surfaces and weather
│   ├── net.ts              # netcode tuning
│   └── world.ts            # gravity, physics rate, step budget
├── physics/
│   ├── core/               # Rapier world, fixed stepper, pose history, surfaces
│   └── vehicle/
│       ├── Vehicle.ts      # builds components from a spec, runs them in order
│       └── components/     # engine, gearbox, driveline, tyres, suspension, aero, assists...
├── systems/
│   ├── WorldManager.ts     # road, trees, hills, physics ground
│   ├── AIDriver.ts         # rivals and traffic
│   ├── CarVisual.ts        # GLB load, wheel pivots, per-frame pose
│   ├── carLights.ts carTint.ts TireSmoke.ts AirplaneFlyby.ts InputManager.ts settings.ts
│   └── net/                # codec, clock, snapshot buffer, correction, remote car, manager
├── constants/world.ts      # WORLD_CONFIG: road, vegetation, environment
├── ui/                     # dashboards, race overlay, lobby, settings, paint picker
├── models/ public/models/  # GLB assets
scripts/                    # headless checks and model prep (see above)
```

## Releases

`.github/workflows/release.yml` runs on every push to `main` and can also be run by hand from the _Actions → Build & Release → Run workflow_ tab. Each run publishes one GitHub Release:

1. **Version** — reads the newest `vX.Y.Z` tag from v2.0.0 up and bumps the patch (`v2.0.3` → `v2.0.4`). Older v1 tags are ignored, so the first run publishes `v2.0.0`.
2. **Build** — a macOS (arm64) job and a Windows (x64) job install Hutch, run `hutch run install`, stamp the new version into `electrobun.config.ts`, and run `hutch run build` (stable channel).
3. **Release** — both platforms' artifacts are attached to a new tag/release, with auto-generated notes.

Assets on each release:

- `OverSteer-<version>-macOS-ARM64.dmg`
- `OverSteer-<version>-Windows-x64-Setup.zip`
- `stable-*-update.json` and `stable-*.tar.zst` — Electrobun's updater files, kept under their original names so the updater protocol still resolves them

Versions come from git tags only; the stamped config is a CI artefact and is not committed back. Two dispatches cannot race for the same number — the workflow serialises itself with a concurrency group.

## Docs

- [AddingCars.md](AddingCars.md) — how to add a car, step by step.
- [GAME_OVERVIEW.md](GAME_OVERVIEW.md) — architecture: the fixed step, the vehicle pipeline, data, world, netcode and tests.
- [Changes.md](Changes.md) — release notes.
- [PHYSICS_UPGRADE_PLAN.md](PHYSICS_UPGRADE_PLAN.md) — the physics upgrade plan and what each phase delivered.

Where to change things:

- `src/mainview/data/cars/<id>.ts` — a car's behaviour (every number, no defaults)
- `src/mainview/physics/vehicle/components/` — one file per part of the car; `Vehicle.ts` wires them
- `src/mainview/data/net.ts` — netcode tuning
- `src/mainview/systems/WorldManager.ts` and `constants/world.ts` — the world
