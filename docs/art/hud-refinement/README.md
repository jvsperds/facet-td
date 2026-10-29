# Current HUD reskin studies

29 October 2026. Updated to fetched `origin/main` at `da21e57`.

The branch was checked with `git rebase origin/main`; Git reported it already up
to date. These studies replace the earlier layout alternatives with **reskins of
the current HUD**. The previous proposal to move the command card, tools, resource
stats or showcase is withdrawn for this task.

Open [both skins](index.html), [A: Smooth Charcoal](version-a.html), or
[B: Soft Graphite](version-b.html). Switch between Builder, Settings open and Gem
selected captures. The comparison shows screenshots, not a separate simulated HUD.

## What changes

- **A — Smooth Charcoal:** opaque charcoal surfaces, 9–14 px corner radii, flat
  controls and pale-grey emphasis. Removes bevels, hard shadows and amber UI glow.
- **B — Soft Graphite:** cooler, lighter slate surfaces, 16–22 px curves and fine
  neutral outlines. Uses A as its base and adds a more visibly rounded finish.
- Both retain gem colours, gold identification, health/mana meaning, typography,
  content, shortcuts and the current layout. The command card stays bottom centre;
  the showcase stays bottom right; placement slots, menu and run stats stay where
  the current game puts them. No gameplay commands or data are replaced.

The proposed CSS is in [skin-a.css](skin-a.css) and [skin-b.css](skin-b.css).
Apply A after the existing stylesheet; for B, apply A then B. They are paint-only
study overrides. No production source files were edited.

## Focused audit

The remaining reskin problem is the repeated thick dark borders, layered bevels,
hard lower shadows, tiled panel texture and amber decoration in `src/style.css`.
These treatments make each control read as another masonry block. Both options
remove those effects and use a consistent neutral control surface.

The current Dota-style layout is accepted as the base for this request. Small
control sizes, 9 px command labels and truncation remain inherited limitations;
resizing or reorganizing them would exceed this reskin scope. The earlier 48 px
mockup-target claim does not apply to these current-layout studies.

## Evidence

- Fetched all origin updates; no newer main or open PR was found at task time.
- `npm run build` passed against the current source.
- Captured the real game in Chromium at 1440×900 using seed 42, then injected the
  skin CSS. No hand-recreated HUD content or substitute game controls.
- Compared every button and every `data-exclude` panel's x, y, width and height
  before/after both skins in the builder state: identical to 0.01 CSS px.
- Captured and inspected the builder, settings-open and selected-gem states.
- Captures retain the existing interaction handlers because only CSS is injected
  into the game. The review pages switch captures; they do not run the game.
- Integration, responsive screenshots and full accessibility testing remain for
  the chosen skin. Both options preserve existing hit areas and keyboard paths.

## Files

`current-*.png` show the incumbent styling; `version-a*.png` and
`version-b*.png` show the corresponding skins. `board.png` is retained as the
original audit backdrop. The HTML pages load sibling images and work from disk.
The skins are proposals pending selection; neither changes the approved design
baseline or merges into main.
