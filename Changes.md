# Changes that we need to do in the app:

1. No full screen in windows and scrollbars showing in the side view in AI race.
2. Multiplayer (Already in making)
3. Different types of maps like F1, mountains, city etc.
4. Different difficulty modes (Easy, medium, hard):
   - In easy, the AI cars are easily beatable (AI is given freedom to choose between 0x - 1x throttle) and no fight mode. Its the easiest mode (duh).
   - In medium, the AI cars are slighly harder to beat (AI is given freedom to choose between 0.75x - 1x throttle) and variable fight mode.
   - In hard mode, which is currenly implemented, its full throttle and full fight mode.

> Need inspiration on what can be improved in easy/medium/hard mode.

1. Cars going underground when overturned, i think its a positioning fix.
2. Better animations when opening app, navigating, results and menu, while creating a better design (UI/UX)
3. Description error messages or window messages instead of "mainview"
4. ~~Multiple cars instead of just the M3, each with different physics and design.~~ DONE (twelve cars, one `CarSpec` file each in `src/mainview/data/cars/`; see `AddingCars.md`).
5. Maps difficulty modes as well (based on factors such as elevation, curves, vegetation, blockers etc)
6. Camera fix on the car
7. Rewind 5 seconds (like forza horizon)
8. Lights on the car, weather, time of day etc (environmental changes, for later)
9. ~~Possibly AWD, RWD, 2WD, FWD etc?~~ DONE (`drivetrain.frontTorqueSplit` per car: M3 RWD 0/100, R8 30/70, G 63 40/60, Urus 38/62).
10. Lookout for real car physics engine that can be used here.
11. Add dyno mode.

## Multiplayer netcode v2

- State packets are binary (72 bytes, was about 330 of JSON) and sent from the physics tick at 60 Hz.
- Remote cars are placed by sender time, with an adaptive delay and Hermite interpolation. They no longer lead the true position, and brake lights use the real brake input.
- F1 packets were rejected (rpm above 9000); fixed.
- Breaking change: protocol version 2. Old and new builds refuse each other with a version message, so everyone in a room must update. Car data that differs between peers is flagged.
- Net constants live in `src/mainview/data/net.ts`.

## Release 2.0.0 notes

Physics and multiplayer overhaul (`feat/physics`, phases P0 to P8).

- **Data-driven cars:** twelve cars, each one validated `CarSpec` file; no per-car code, no tuned numbers in systems (`audit-literals` enforces it). Adding a car is documented in `AddingCars.md`.
- **Vehicle model:** per-wheel suspension, Pacejka tyres with relaxation and combined slip, wheel dynamics, turbo, torque converter, differentials, aero and impact damage, split into components under `physics/vehicle/components/`. Fixed 120 Hz step.
- **World:** surfaces (asphalt, grass, dirt, gravel, sand) and weather (dry, damp, wet, storm) scale grip.
- **Multiplayer:** binary 72-byte state at 60 Hz, sender-time interpolation with adaptive delay, solid ghost bodies, paint and car sync, protocol version check, spec-hash check. "New Window (multiplayer test)" in the app menu (Cmd/Ctrl+N).
- **Controls and pause menu:** the key list now matches the game (handbrake latch, shift, mode, launch, TC/ESC/ABS, safety aids, ignition, cruise, lights, time of day, camera).
- **Tools:** `scripts/dyno.ts` (engine curve and full-throttle pull per car), `run-per-car`, `golden-master`, `audit-literals`, the net test suite.
- **Docs:** README, GAME_OVERVIEW and AddingCars rewritten for the current code.
- **Retune:** every car now reaches roughly 320-360 km/h (power and final drive in each car's data), and `tested` figures match the dyno. Twelfth car added: Mercedes-AMG SL 65 (lamps split out of its body mesh by `scripts/prepare-mercedes-sl65.ts`).
- **Versioning:** releases are numbered from v2.0.0. The workflow (`.github/workflows/release.yml`) ignores tags below v2, so the first run publishes v2.0.0 and each run after bumps the patch. `package.json` and `electrobun.config.ts` read 2.0.0; CI stamps the real number into the config.
