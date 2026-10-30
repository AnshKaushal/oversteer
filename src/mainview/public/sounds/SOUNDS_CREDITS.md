# Sound assets

| File | Type | Source | License |
| --- | --- | --- | --- |
| `engine_loop.m4a` | Engine (player, AI, remote — pitch-shifted in-game) | Synthesized by `scripts/gen-sounds.mjs` — placeholder | CC0 (self-made) |
| `road_loop.m4a` | Wind / tire-roll noise layer | Synthesized by `scripts/gen-sounds.mjs` — placeholder | CC0 (self-made) |
| `whoosh.m4a` | Menu wipe transition | Synthesized by `scripts/gen-sounds.mjs` — placeholder | CC0 (self-made) |
| `click.m4a` | UI click | Synthesized by `scripts/gen-sounds.mjs` — placeholder | CC0 (self-made) |
| `skid.m4a` | Tire squeal loop | Google Assistant Sound Library | CC-BY 4.0 |
| `gear_shift.m4a` | Gear shift itch | Google Assistant Sound Library | CC-BY 4.0 |
| `impact.m4a` | Car impact + scrape | Google Assistant Sound Library | CC-BY 4.0 |
| `ambience.m4a` | Outdoor ambience bed | Google Assistant Sound Library | CC-BY 4.0 |

Sources:

- Google Assistant Sound Library, https://developers.google.com/assistant/tools/sound-library — "Tires Squeal Continuous", "Gear Shifter", "Car Impact and scrape", "Forest Wind Summer". Licensed under Creative Commons Attribution 4.0; audio in this game qualifies as the attribution when this file is distributed alongside.

These are PLACEHOLDERS. To swap in real recordings, keep the same filenames (or
update `src/mainview/systems/AudioEngine.ts`) — the audio engine is fully
data-driven by URL.
