# Facet TD agent guide

Several agents work on this repo at once. Read this, then `docs/PLAN.md`, before changing anything.

## Log book

The work log is the shared Vault, project **Facet TD** (`Vault/Projects/Facet TD.md`). Use
`Tools/VaultOpsPy/vault-ops.py` from the workspace root for every write.

- One Vault task per phase. Run `start-task` on yours when you begin or resume; it records your agent
  and session so others can see who holds it.
- Log progress with `append-activity`, set `set-next-action` before you stop, and close with
  `complete-task` (outcome, evidence, limits). Use `block-task` if you are stuck on someone else.
- Lasting choices (camera angle, palette, data format) go in a Vault Decision, then link it from
  the task.
- Need something from another phase's agent? Write it in that phase's task with `append-activity`;
  do not edit their files.

## Ownership

| Phase | Vault task | Agent owns | Branch |
| --- | --- | --- | --- |
| 1, Foundation | Facet TD phase 0-1 scaffold and sim copy | `src/`, `data/`, `tests/`, tool config (`package.json`, `vite.config.ts`, ...) | `phase-1/foundation` |
| 1.5, Art and UI direction | Facet TD phase 1.5 art and UI direction | `docs/art/` (direction doc, mockups, HUD wireframe) | `phase-1.5/art-direction` |

- Edit only paths you own. Phase 1.5 writes no code in `src/`.
- `docs/PLAN.md` and this file belong to the lead. Propose changes in your task's activity log.
- Work on your own branch (a separate worktree if another agent shares the checkout). Push freely;
  merging into `main` needs the user's explicit approval.
- Scratch files go in `C:\Jasper\Codex\.tmp\facet-td-<phase>\`, never in the repo.
