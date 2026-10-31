# Adding a Car

A car is one data file. Everything the game needs (physics, tyres, wheel
positions, dash scale, paint rules) lives in a `CarSpec`; no system code
changes. The menu, rivals and multiplayer pick the car up from the registry.

1. [Steps](#steps)
2. [The spec](#the-spec)
3. [Tuning from real figures](#tuning-from-real-figures)
4. [Verify](#verify)
5. [Nose direction](#nose-direction)
6. [Lamps](#lamps)
7. [Troubleshooting](#troubleshooting)

---

## Steps

1. **Model.** Put the GLB in `src/mainview/models/` and the same file in
   `src/mainview/public/models/` (the first is what the game imports, the
   second is what the dev server and the build serve). Use lowercase with
   underscores: `my_car.glb`.
2. **Orient it.** The nose must face +Z (see [Nose direction](#nose-direction)).
   Fix the file, not the spec.
3. **Spec file.** Copy the closest existing car in `src/mainview/data/cars/`
   to `<id>.ts` (kebab-case id, e.g. `my-car.ts`) and edit it. Copy a car of
   the same layout (FWD/RWD/AWD, turbo or not) so the structure fits; do not
   copy its handling, set the numbers from the car you are adding.
4. **Register.** In `src/mainview/data/cars/index.ts` import it and add it to
   `ALL_CARS`. Order is menu order. Invalid specs throw in dev and are
   skipped (with a log) in a production build.
5. **Verify** with the [commands below](#verify).

---

## The spec

`CarSpec` is defined in `src/mainview/data/schema.ts`. The top level:

| Field          | What it is                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `id`           | Unique kebab-case id. Also what multiplayer peers announce.                                               |
| `name`/`shortName` | Menu name and the short label for the HUD.                                                            |
| `modelFile`    | `models/<file>.glb`.                                                                                      |
| `pivots`       | How to find the four wheel nodes in the GLB: `{ pattern: "^Wheel_" }` (regex) or `{ names: [...] }`.      |
| `wheels`       | Four `WheelDef`s `{ x, z, front, left }` in metres, body space, front is -z. Order FL, FR, RL, RR.        |
| `dash`         | `{ maxRpm, redFromRpm, maxKmh }`, the dial scale only.                                                    |
| `tested`       | `{ zeroToHundredS, topSpeedKmh }`: the real car's figures, for comparison with `scripts/dyno.ts`.         |
| `defaultTint`  | Paint colour (number) or `null` to keep the model's own colours.                                          |
| `paintMatch`   | Optional material-name substrings that count as body paint.                                               |
| `paintTexture` | Optional `{ keepMap, neutralize }` for models whose paint is baked into a texture.                        |
| `physics`      | Everything below.                                                                                         |

`physics` sections: `dimensions`, `mass`, `chassis` (damping, `crash`
preset, collider boxes, `remote` ghost friction), `engine`, `transmission`,
`differential`, `drivetrain`, `wheels` (tyres, suspension, steering, brakes),
`aero`, `assists`, `brakes`, `kinematics`, `cruise`, `launch`, `shiftLogic`,
`creep`, `contact`, `selfRight`, `limits`.

Helpers keep a spec short and consistent:

- `engineBuild({ layout, cylinders, displacementL, flywheel })` derives the
  rotating inertia, friction and response from the engine build. `flywheel`
  is `"road" | "sport" | "race"`.
- `tyre("sport" | "street" | "race", overrides)` gives a full compound
  (grip, Pacejka curves, relaxation); override only what differs.
- `CRASH.open | sport | road | heavy` picks the impact behaviour.

Rules the specs follow:

- **Per-car numbers live in the spec.** Do not add `if (car === ...)` or a
  tuned constant to a system; add a field to the schema and the validator.
- **Automatic gearbox only.** Launch flare, launch control and managed power
  belong to the safety aids and are configured under `assists`/`launch`.
- Wheel `x`/`z` come from the model (measure the pivots, e.g. with
  `car-visual-check.ts`); wheelbase and track are derived from them.

---

## Tuning from real figures

Start from published numbers, not from another car's feel:

1. Mass, wheelbase, track, centre of mass height, power, torque, gear ratios,
   final drive, tyre size, drag and frontal area, brake sizes.
2. Fill `engine.maxTorqueNm` and `torqueCurve` (relative to the peak) so the
   power peak lands where the real car's does.
3. Run the dyno and compare with the real figures:

```bash
CAR=<id> bun scripts/dyno.ts          # add --csv for the pull as rows
```

It prints crank torque and power every 500 rpm, the peaks, hp/tonne, then a
full-throttle automatic pull: 0-100, 0-200, top speed, shift points and the
drivetrain loss the pull implies. `tested` is the real car's claim and is
there to compare against; a gap means check the data (gearing, tyre radius,
drag, torque curve), not the script.

---

## Verify

```bash
bun scripts/validate-cars.ts                     # spec validation, all cars
CAR=<id> bun scripts/smoke-test.ts               # drives the one car
bun scripts/run-per-car.ts scripts/feel-test.ts  # a suite across every car
bun scripts/run-per-car.ts scripts/chassis-tests.ts
bun scripts/audit-literals.ts --fail             # no stray tuned numbers in code
bun scripts/golden-master.ts                     # existing cars unchanged
npx tsc --noEmit -p .
```

`scripts/known-failures.json` lists accepted failures per car and suite. If a
new car fails a check, fix the data; only add a known failure when the check
does not apply to that car, and say why in the entry.

Models: `bun scripts/car-visual-check.ts <id>` (wheel pivots found and
classified) and `bun scripts/light-info.ts <id>` (lamp detection).

Multiplayer: peers compare a hash of the whole spec. If two builds disagree
on a car's data, the peer is flagged as a spec mismatch and a warning is
logged, so ship the same data to everyone.

---

## Nose Direction

All models face +Z. This is how the forward direction was determined for each one.

| Car         | Evidence                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audi R8** | Headlight meshes sit at z ≈ +1.85 and rear lights at z ≈ -2.0.                                                                                                             |
| **BMW M3**  | The axle overhangs are 1.07 m and 0.85 m. The real M3 has a longer rear overhang (1.01 m) than front (0.92 m), so the long-overhang axle (z = -1.33) is the rear.          |
| **G-Wagen** | The `wheelF` nodes are at z = +1.41 and `wheelB` at z = -1.45. The overhangs of 0.87 m and 1.05 m match the real front and rear, since the spare wheel hangs off the back. |
| **Urus**    | The wheel diameter (0.84 m) and wheelbase (3.03 m) read off the model match the real car. The bumper-chunk pattern also matches the BMW's.                                 |
| **997 GT2** | Authored nose-towards -Z, like most Sketchfab exports: the plate, the rear wing and the wide 325/30 rear tyres all sit at +Z. `scripts/prepare-porsche-gt2.ts` bakes the half turn into the file. |

### Models that need editing before they are usable

Most GLBs can be dropped in as they are. Some do not:

- **The nose is the wrong way round.** Bake a 180° yaw into the file rather
  than rotating it in the registry — `scripts/prepare-porsche-gt2.ts` shows
  how to do it on the glTF JSON, which keeps the embedded textures intact
  (a three.js re-export loses them, because the loader cannot decode
  images outside a browser).
- **The lamps are not red.** The 997 GT2 ships its rear lenses as unlit
  blue-grey glass. The prep script gives that material a red base colour
  and a red emissive so `carLights` can find it and brighten it under
  braking.
- **The wheel pivots have unusable names.** Sketchfab calls them
  `fl.001_17` and friends, and the loader strips the dots, so the spec
  would have to spell them out. The prep script renames them to
  `Wheel_FL`/`FR`/`RL`/`RR` instead.

---

## Lamps

Headlights never take paint, and tail lights glow under braking. **Nothing about this needs editing in the car spec.**

- **`carTint`** skips emissive materials when it looks for paint. Previously the M3's white headlight strip was repainted, which gave black cars black headlights.
- **`carLights`** finds each car's red lamps by their **glowing** colour —
  the emissive, not the base colour. A red-painted car is red too, and
  taking the paint for a lamp made the whole body glow when the brakes
  came on. On the G-Wagon that was very visible: its shell, glass and
  lights share one material, so the headlights and the indicators turned
  red along with the tail lights.

### Checking a new model

Run the inspection script to see what the lamp detection finds on a new GLB:

```bash
bun scripts/light-info.ts <car-id>
```

And check the model the way the game loads it — scaled, yawed a half turn
and centred, with its four wheel pivots found and classified:

```bash
bun scripts/car-visual-check.ts <car-id>
```

Run the test script to guard both behaviours:

```bash
bun scripts/light-materials-test.ts
```

### Lamps baked into the body material

If `light-info.ts` shows no lamp and no `lit` material, the lenses are painted
into a shared texture. Split them out in the file instead of special-casing the
car in code: `scripts/prepare-mercedes-sl65.ts` moves the lamp triangles (picked
by position and by the lens colours in the texture) into primitives named
`SL_Headlight` and `SL_Taillight`, with a warm-white and a red emissive. The
existing detection then lights them (headlights on `H`, tail lamps on braking).
Check the selection with `--debug out.json` before writing the file.

### Known limitation

A car whose lamps are baked into one shared texture (the G-Wagen) has nothing separable to glow, so it is left out of the glow behaviour by design.

The idle brightness of a tail lamp is `emissiveIntensity * 10 * 0.5`, so an
authored strength of 0.2 gives the resting level of 1.0 that the test
expects. The M3 still ships with 10, which is why that check fails today.

---

## Troubleshooting

| Symptom                                             | Likely cause                                                      | Fix                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Spec rejected at startup                            | A field is missing or out of range                                | Run `bun scripts/validate-cars.ts` for the exact message                     |
| Car has plain cylinder wheels                       | The pivot search did not find exactly 4 pivots                    | Adjust `pivots.pattern`, or list the nodes in `pivots.names`                 |
| Brake discs or calipers spin as wheels              | Their names match the pattern but are larger than the 2.5% cutoff | Use `pivots.names` with an explicit list                                     |
| Car drives backwards or lights are at the wrong end | The model faces -Z                                                | Rotate the GLB so the nose is at max-Z                                       |
| Wheels float or sink                                | `wheels[].x/z` or `dimensions` do not match the model             | Re-measure the pivots; check `groundClearance` and suspension rest length    |
| Black car has black headlights                      | A headlight material is not marked emissive                       | Check the material with `bun scripts/light-info.ts <car-id>`                 |
| Tail lights do not glow when braking                | Lamps are baked into a shared texture, or are not a glowing red   | Run `light-info.ts`. Baked textures cannot be fixed without separate meshes  |
| Paint changes tyres, trim or glass                  | Generic material names (`Cylinder`, `Plane`) fall to the heuristic, which tints every light material | List the GLB's materials (names, base colour, texture), find which one is the shell, set `paintMatch` with anchored regexes (`^Cylinder$`) and `paintTexture` with `neutralize` set to the shell's flat texture colour (the SL 65 is the worked example) |
| Top speed or 0-100 far from `tested`                | Gearing, tyre radius, drag or torque curve are off                | `CAR=<id> bun scripts/dyno.ts`, then correct the data                        |
| Multiplayer shows a spec mismatch                   | Peers run different data for that car                             | Update both builds to the same commit                                        |
