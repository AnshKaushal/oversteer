# Handoff: Oversteer perf & quality roadmap

Branch: `perf/phase2-shadow-cache` (pushed). Source of the plan: `Oversteer Performance & Quality Report.md` (untracked, repo root).

## Done

**Phase 1:** quick fixes from the report.

**Phase 2 (about 80%)**
- AO at half res, blur pass removed, depth-aware upsample inside `finalPass.ts`, 8 taps under TAAU. A full-res depth copy in `depthAO.ts` fixed the blue flicker (feedback loop).
- Two-map shadows (`systems/shadowCache.ts`): static casters cached, cars (registered via `registerDynamicCaster`) drawn dynamically. Hooks `renderer.shadowMap.render`. The sun only updates on a coarse 8 m cell or a 0.2° angle change.
- `GpuTimer` + `AutoQuality` (max(cpu, gpu) p90). Auto changes are runtime-only and no longer overwrite saved settings.
- Motion blur: cached mask list, skipped when the camera is still, flat footprint mask under cars so the car's shadow isn't blurred.
- Sky env cache, reflection plane reuse and internal-scale rendering, grass/rocks hidden in reflections, `freezeStatic` on static meshes, dev-only `getError`.
- Fixes this session: street-light shadows now refresh every frame (they lagged at every 3rd frame), car materials use `shadowSide = DoubleSide` (hollow ring shadow under overhead lights), per-tree shadow fade (half-cut tree shadows), street lights skip airport clear zones, airport connector now joins the main road (`ROAD_JOIN` 7.6) with a proper curved mouth (`roadRibbon`).
- Found and fixed: `ShadowCache` marked itself dirty on every pass that had no sun, so the static map re-baked almost every frame. It now ignores sun-less passes.

## Not verified (needs eyes in the game)
- **Ghost car shadow left behind while driving** (last user report, screenshot of a dark car-shaped blob ahead/behind the car). Likely the re-bake bug above, but not confirmed. My drive-and-screenshot harness landed on the main menu, not in a race. Re-check by driving fast on the highway.
- Airport junction after the fillet rebuild: look for grass gaps, wedge shapes, z-fighting with the main road.
- AO edges at 8 taps, puddles without grass, auto-quality settling, shadow popping at cell edges, hitches from static refresh, photo-mode shadows, bloom darker (AO now applied after bloom).
- GPU HUD showed ~43 ms in the menu scene (garage); check whether that's real or the timer including extra passes.

## Remaining
1. Resize without reallocating render targets (allocate max once, change viewport/UVs). Biggest leftover Phase 2 item.
2. Telemetry object reuse.
3. `MIP_BIAS` tied to render scale.
4. Blur mask from a small scene: skipped, because cars are in the main scene and `overrideMaterial` is ignored for non-Scene roots.
5. Phase 3: car velocity buffer (would also replace the footprint workaround), cascaded + contact shadows, AgX vs ACES A/B, preset re-tune, benchmark matrix (harness notes in memory `graphics-effects-benchmark-state`, now stale).

## Notes
- Prettier here: no semicolons, trailing commas (`prettier --no-semi --trailing-comma all`). Plain `prettier --write` reformats whole files.
- Scratchpad harnesses (Chrome CDP): `lib.ts`, `err.ts`, `drive.ts`, `gap.ts` under the session scratchpad; may be gone after cleanup.
- `graphify update .` was run after the latest code changes.
