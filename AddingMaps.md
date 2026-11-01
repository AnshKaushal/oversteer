# Maps

Maps live in `src/mainview/maps/`. Each one is a `GameMap` (`maps/types.ts`)
registered in `maps/index.ts`. A map never depends on another map.

| id | folder | what it is |
| --- | --- | --- |
| `highway` | `maps/highway/` | The original endless highway (traffic, races, multiplayer, airport). |
| `circuit` | `maps/circuit/` | A closed race circuit generated from a seed. Free roam with a lap timer. |

## Adding a map

1. Create `maps/<id>/index.ts` exporting a `GameMap`:
   - `features` - `airport`, `traffic`, `races`, `multiplayer`. The menu and
     `App.tsx` hide or skip anything a map does not support.
   - `create(options)` returns a `MapInstance`: `road` (`spawnPose`,
     `nearestPose`), `world` (a `MapWorld`), plus `linear` (a `LinearRoad`, only
     for z = -s corridors that AI and traffic can follow) or `circuit`.
2. Add it to `MAPS` in `maps/index.ts`.
3. If it has options, add a section for them in `ui/MapPicker.tsx`.

## Circuit options (`maps/circuit/config.ts`)

`seed`, `lengthM`, `twistiness` (0..1), `widthM`, `gravelM`, `runoffM`,
`barriers`, `barrierHeightM`, `kerbs`, `startLine`, `treesPer100m`,
`treeBandM`, `treeScale`. Vegetation % comes from Settings. The same seed always
gives the same track.

How a track is made (`generate.ts`): a closed curve from a few random harmonics
(always simple, never crosses itself), then the curvature is reshaped so gentle
bends become straights and the turning moves into corners, then the loop is
closed again numerically. A candidate is rejected if a corner is tighter than
32 m or two sections run too close together; the roughness is lowered and it
retries, ending on an ellipse if nothing passes.

## Not done yet on the circuit

- No AI rivals, traffic, races or multiplayer. `AIDriver` and the race code
  follow `z = -s`; they need a path-following road model before they can run on
  a loop.
- Flat ground, no elevation or banking.
- Trees are visual only.
- `AirplaneFlyby`/`Airport` and `ui/RaceOverlay.tsx` (`roadGapM`) still use the
  highway road directly.

## Circuit: racing, scenery, multiplayer

- Rivals use `CircuitDriver` (pure pursuit plus curvature-based speed planning), supplied by `MapInstance.rivalDriver`.
- Race progress on a loop is cumulative distance (`CircuitInfo.progressTracker()`); race "distance" buttons count laps (laps × track length).
- `GameMap.gapM` supplies the live race gap; the circuit uses a signed difference.
- Scenery reuses `low_poly_tree_pack.glb` (trees, clouds) and the shared hills in `systems/Hills.ts`; hills are placed outside the track corridor with colliders. A procedural tree fallback is used if the GLB fails to load.
- Multiplayer: `START_RACE` carries the map spec; the circuit seed is `startTimeMs`, so every peer builds the same track. `NET.protocolVersion` is 3.
