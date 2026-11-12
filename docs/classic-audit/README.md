# Classic 1-player: audit, status and handover

Written 12 November 2026 for whoever continues this work. It records the owner's decisions, what the
audit found, what has landed, and what is left. Detailed findings are in [AUDIT.md](AUDIT.md).

## Goal

Finish Classic mode on the 1-player map (`gemtd_1p`) so it plays like the Dota 2 Gem TD custom game,
with a usable HUD and menus on a low-end laptop and on phones.

## Owner decisions (binding)

| Topic | Decision |
| --- | --- |
| Scope | 1-player map only. Co-op and race stay a later phase. |
| Fidelity | Rules and numbers exactly as the original. Interface conveniences are free in Classic. |
| Heroes | Unlocked through local progression with shells, grindy like the original's shop. Gold pays for casts in a run. |
| Difficulty | Normal (the 1-player values) plus three tiers reusing the original's 2, 3 and 4-player multipliers. Endless after wave 50. |
| Replay | Run history and best scores; save and resume. The seed is hidden during play. |
| Extras | Quests and the maze guide. Not: Bush/Night Challenge modes, cosmetic skins. |
| Look | Keep the cave-grey arena and charcoal HUD; polish, do not restyle. |
| Devices | Low-end integrated-GPU laptop and phone (390x844 portrait, 844x390 landscape), equally. |
| Ship | Still one offline `index.html`: no external assets or network calls. |

## The original game script

The 14,507-line `addon_game_mode.lua` is the authority on rules; `src/sim` comments cite its line
numbers. `data/baseline/lua/addon_game_mode.json` holds only its tables, not its function bodies.
Per `docs/PLAN.md` the raw script is not kept in the repo. The owner has it at
`C:\Jasper\Codex\.tmp\gemtd-vpk\out\scripts\vscripts\addon_game_mode.lua`; ask for it before
verifying or porting any rule.

## What has landed

| Stream | State | Notes |
| --- | --- | --- |
| Route search speed | Done | Typed-array A\*, occupancy grid, route and `canBuild` memos, public `game.mazeVersion`. Wave-50 maze in Node: build 134 ms to 3 ms, keep 63 ms to 0.1 ms, combine 54 ms to 0.2 ms. Routes proven identical (`tests/path-equivalence.test.ts`); budgets in `tests/perf-budget.test.ts`. |
| Sim rules | Done | `RunConfig` (`src/sim/config.ts`): difficulty 1-4, hero, up to 4 skills with levels, `sandbox`. Win streak and wave enemy count. Run stats (`src/sim/stats.ts`). Quests (`src/sim/quests.ts`). `Sim.save()` / `Sim.restore()` with `SIM_VERSION`. Rule fixes: thief no longer steals at the castle, rare boss variants rolled, endless replays the creep chosen per wave. |
| Audio | Done, never listened to | `src/audio/`: four volume buses saved under `facet-td:volume`, cave ambience with build/wave/boss moods, optional music, 32 named sounds, 16 attack families, voice limits. |
| Rendering speed | Partial | Chunked wall re-merge, integer signatures, icon studio idle during waves, quality tiers (`facet-td:quality` = `auto`/`high`/`low`), occluder check by cell track, bundle 4.99 MB to 1.85 MB. |
| HUD and UX | Partial | Visible notices, Place gem button, global shortcuts, `?` help overlay, hidden seed, fuller end card, piece-first picking, aim modes shown, phone top-bar stats and bottom sheet, larger touch targets. |

Unit tests: 162 pass. Type check, ESLint and Prettier are clean on `src` and `tests`.

## Known gaps in what landed

- **HUD was stopped part-way.** Desktop and phone portrait were checked in a browser. In phone
  landscape the instruction banner overlaps the draft panel. The new browser specs (visible notices,
  Place button on phone, global zoom keys, help overlay, hidden seed) were not written. Items not
  confirmed done: recipe book as a full-screen sheet on phones, stat-row labels, dead CSS removal
  across `style.css`, `skin-a.css` and `slate.css`.
- **Rendering was stopped before instancing.** Towers and creeps are still per-material clones, so
  draw calls grow about 4.5 per tower (about 270 at wave 45). Before/after numbers for the view
  changes were not reported. Nothing has been measured on a real GPU or phone.
- **Audio:** no volume sliders or music toggle in the settings UI. `combine`, `upgrade`,
  `downgrade`, `error`, `ui-click`, `panel-open`, `panel-close`, `count-up`, `count-down`, `shell`
  and the four `cast*` sounds have no callers.
- **Difficulty 2-4** scales only creep HP and speed. The original also sets creep ability levels to
  the difficulty and lengthens the rage timer with player count.
- **Hero skill gold costs** were not re-checked for skills that charge inside their own scripts
  (qingyi, yixinghuanwei, the tower buffs).
- **Nothing in the HUD uses** difficulty, quests, run stats or saves yet. Heroes are still behind
  `?wip`, which runs the sim with `sandbox: true`.
- **Browser specs:** 12 of 28 fail on the commit before this work (`0c064e8`), so the suite was
  already broken. See AUDIT.md for the list. They have not been repaired.
- `tests/environment.test.ts` ("cutaway keeps every rock column low") times out under CPU load and
  passes alone.
- Repo-wide `npm run lint` fails with 84 errors in `docs/art/model-study` (pre-existing).

## Pending work

1. **Finish HUD and UX:** landscape layout, recipe sheet on phones, the missing specs.
2. **Heroes and progression:** local profile in `localStorage` (shells, owned skills and levels,
   slots, heroes), shell boxes, a loadout screen before a run that builds the `RunConfig`, hero
   casts in the normal HUD paid with gold, cast sounds. Proposed economy numbers are in AUDIT.md;
   keep them in one tunable file.
3. **Title, menu and replay:** difficulty select, endless, run history and best scores from
   `game.stats`, autosave each wave and resume with `Sim.save()`/`restore()`, quests screen paying
   shells, settings with volume sliders, music toggle and quality tier. Extend the end-of-run card
   with the full stats.
4. **Models and effects:** stones as real joined walls, larger and more readable towers and creeps
   at default zoom, projectiles, hit and death effects, floor effects, the top-view backdrop.
5. **Instancing** for creeps, stones and towers; target 120 draw calls on laptop, 80 on phone.
6. **Maze guide:** in the original, non-race maps show four guide mazes per player: slot 0 is the
   player's own saved maze (else `maze_coop0`), then `maze_coop1`, `maze_coop2`, `maze_coop4` for
   one player (script lines 3031-3135; panel clicks toggle the markers, 3173-3270). The layouts are
   37x37 tables in `data/baseline/lua/addon_game_mode.json`. An earlier check found no orientation
   of them covering the 1-player pre-placed stones, so verify the mapping before drawing them.
7. **Creep ability levels and rage timing by difficulty.**
8. **Repair the browser specs**, then a full pass with screenshots on desktop, phone portrait and
   landscape in both views.

## Working notes

- Run browser specs here with a local config that sets
  `use.launchOptions.executablePath: '/opt/pw-browsers/chromium'` and keeps the swiftshader args;
  the installed Chromium is older than `@playwright/test` expects. Do not commit that config.
- Headless Chromium renders with software GL: script time, draw calls and triangle counts are
  meaningful; frame rate and GPU cost are not.
- Changing rules invalidates saves: bump `SIM_VERSION` in `src/sim/sim.ts`.
- Running five agents in parallel exhausted the owner's usage limit twice; two at a time is safer.
