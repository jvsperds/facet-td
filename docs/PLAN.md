# Facet TD plan

Facet TD is the successor of [GemTD](https://github.com/jvsperds/GemTD). Same game (Dota 2's Gem TD
custom map), rebuilt as an isometric 3D browser game in three.js.

## Source of truth

Game data comes from the original custom map's extracted VPK at `C:\Jasper\Codex\.tmp\gemtd-vpk`:

- `out/scripts/npc/*.txt`: Valve KeyValues for units (creeps, gems, towers), abilities, items, heroes.
- `out/scripts/vscripts/addon_game_mode.lua`: the game mode itself (14.5k lines): waves, combine
  recipes, drafting, rules.
- `out/*_english.txt`: display names and tooltips.

`out2/gemtd2` is a small separate addon, not the main game. GemTD's wiki-scraped data is a
reference only; where it disagrees with the VPK, the VPK wins.

All of it is converted once into two layers:

- `data/baseline/*.json`: everything the original map defines, converted faithfully: values and
  structure as in the VPK, no fixes, no rebalancing. Immutable after conversion; a test checks its
  hash so an accidental edit fails CI. The raw VPK extract is not kept.
- `data/facet/*.json`: Facet TD's own changes (balance, fixes, new content) as overrides on top of
  the baseline. Starts empty.

"What did we change from Gem TD?" is always just `data/facet/`.

## Game modes

| Mode | Data loaded | Rules |
| --- | --- | --- |
| **Classic** | `data/baseline/` only | A faithful port of the Gem TD custom game. No changes, no new features. |
| **Facet** | `data/baseline/` + `data/facet/` | Everything new: rebalancing, fixes, new content and mechanics. |

Classic is the reference: if Classic plays differently from the original map, that is a bug. New ideas
never land in Classic; they go under Facet. New mechanics in code sit behind a Facet-mode check (or
a flag read from `data/facet/`), so Classic's rules stay untouched.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Same as GemTD; one language end to end. |
| Build / dev server | Vite | Fast, already proven in GemTD. |
| 3D | three.js (WebGL renderer) | Mature, small, isometric needs nothing exotic. |
| UI / HUD | Preact + `@preact/signals`, DOM overlay on the canvas | ~4 KB. Panels update when sim state changes; avoids GemTD's 1.7k lines of manual DOM sync. DOM keeps menus accessible. |
| Art | Procedural low-poly, built in code | No asset pipeline, small build, fits "Facet". |
| Audio | Web Audio API | Already used by GemTD. |
| Data | JSON: immutable `data/baseline/` + `data/facet/` overrides, committed | Converted once from the VPK (the original map no longer changes, so no repeatable pipeline). Baseline stays faithful; all changes live in overrides. |
| Persistence | `localStorage` (saves, scores, settings) | Enough for a single-player offline game. |
| Tests | Vitest (data + sim), Playwright (browser smoke test) | Same as GemTD. |
| Lint / format | ESLint + Prettier | Same as GemTD. |
| Ship | Single offline `index.html` (vite-plugin-singlefile) | Open from disk or any static host. |

## Architecture

```
VPK (KV + Lua)  --one-time conversion-->  data/baseline/*.json   (immutable)
                                              +  data/facet/*.json      (our overrides)
                                              |
                                          src/sim        pure rules: no DOM, no three.js,
                                              |           fixed 30 Hz tick, seeded RNG,
                                              |           player actions as commands
                      +-----------------------+----------------------+
                  src/world (three.js)    src/hud (Preact)     src/input
                  reads sim state,        reads sim state,     pointer/keys -> commands
                  draws it                shows it
```

Rules that keep this healthy:

- The sim never imports the view. The view never changes sim state; it only sends commands.
- Same seed + same commands = same game. This gives replays, saves, and testable balance.
- The view interpolates between sim ticks, so rendering frame rate and game speed stay separate.

Code reuse from GemTD: take the sim's structure and tests as a starting point, but re-derive
numbers from the VPK. The 2D renderer and its DOM glue are not reused.

## Multiplayer

Classic includes the original's co-op and race maps (up to 4 players), so multiplayer is part of the
first milestone, not a someday feature. The sim is built for it from day one:

1. **Deterministic sim.** No `Math.sin`/`cos`/`pow`/`exp` or other engine-dependent math, no
   `Math.random`, no wall clock inside `src/sim`; only the seeded RNG and basic arithmetic. A test runs
   the same seed + commands twice and compares the final state. This allows lockstep networking
   (players exchange commands only) or the same sim running on a Node server.
2. **Data version.** A hash of the loaded data (baseline + overrides) is stamped into each build and
   each save. It is also the join check: players and servers must match.
3. **Multiple players in the sim.** The sim models N players (own gold, maze, castle HP as each map
   requires) from the start, even while only single-player is playable.

The JSON is game definitions, not match state, so it never needs syncing; every client ships it.

Transport (WebSocket relay on Node vs WebRTC peer-to-peer) and lobby/matchmaking are decided when
the co-op phase starts.

## Milestones

### Milestone 1: Classic

Everything in the VPK, ported faithfully. Phases:

- **Phase 1, Foundation:** repo scaffold, one-time conversion of the VPK into `data/baseline/`, sim runs
  headless with tests.
- **Phase 1.5, Art and UI direction:** can run alongside phase 1; must finish before phase 2. Settles camera
  angle (true iso vs 2:1 dimetric), shading style, palette, model scale and occlusion limits, how gem
  type and quality read through shape and size (not colour alone), and the HUD layout on desktop and
  mobile. Output: a one-page direction doc, a few reference mockups, a HUD wireframe. Reuses the
  GemTD UI mockup and accessibility audit work.
- **Phase 2, Board:** isometric map, camera (zoom, pan, 90° rotate), cell picking.
- **Phase 3, First playable (1-player map):** draft gems, build the maze, waves, combat, castle HP, minimal HUD.
- **Phase 4, Feel:** effects, lighting, sound, readability.
- **Phase 5, Full 1-player:** the rest of Gem TD's features (special towers, creep abilities, heroes, ...).
- **Phase 6, Co-op and race:** networking, lobby, the `gemtd_coop` and `gemtd_race` rules.

**Exit:** every map and rule in the VPK plays like the original.

### Milestone 2: Facet

The Facet wing opens: new changes on top of Classic.

## Open questions

- The VPK's game script has rules for `gemtd_1p`, `gemtd_coop` and `gemtd_race`, but the VPK only
  contains the `gemtd_1p` map file. Co-op and race layouts must be rebuilt from the script's path
  and stone tables, or from another source. Check during conversion.
