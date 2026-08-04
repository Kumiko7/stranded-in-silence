# Claude working notes

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.** It maps the whole
project and links to the modular docs. Read only the docs relevant to the task —
that is what they are for. Do not read the whole codebase to make a scoped change.

## Non-negotiable rules

1. **`art/` never imports from `src/`.** Logic drives art through named parts declared
   in [`docs/art/SHARED_ART.md`](docs/art/SHARED_ART.md).
2. **No hardcoded gameplay values.** Every number lives in `config/`. See
   [`docs/CONFIG.md`](docs/CONFIG.md).
3. **No user-visible strings in code.** Every one is a key in `config/locales/`. See
   [`docs/LOCALISATION.md`](docs/LOCALISATION.md).
4. **No `Math.random()`** in `art/` or in map generation — use the seeded RNG, or peers desync.
5. **Simulation code never touches `THREE` or the DOM.**
6. **Build what was asked, nothing more.** This project is deliberately kept minimal.
   Before adding a mechanic, setting or subsystem nobody asked for, check
   [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) → **"Deliberately NOT built"**.
   Several plausible-sounding features (player flashlight, stamina, sound occlusion,
   quality presets, accessibility settings) were removed on purpose. Keep the seams
   clean for them; do not implement them. If something genuinely seems needed, say so
   and ask rather than adding it quietly.

## Working on a plan step

[`docs/PLAN.md`](docs/PLAN.md) is the task list. For "do step N":

1. Read the step entry, then only the docs it links.
2. `git switch -c step-NN-short-name`
3. Build it. Keep it simple; prefer well-established libraries over custom code.
4. `npm run typecheck` and `npm run dev` must both be clean.
5. Update `docs/PLAN.md` (tick the box) and any system doc whose contract changed,
   **in the same commit**.
6. Merge to `main` with `--no-ff`, push, delete the branch.

## Environment

- Shell is **`pwsh`** (PowerShell 7), not Windows PowerShell 5.
- Windows. Use forward slashes in code; `pwsh` cmdlets in the shell.
- Node 22, Vite, TypeScript strict, three.js, Preact.

## Doc ownership

Keep these true — they are how the next session avoids reading everything:

| Changed | Update |
| --- | --- |
| `config/` | `docs/CONFIG.md` |
| locale namespaces | `docs/LOCALISATION.md` |
| art contracts | `docs/art/ROOM_FORMAT.md`, `docs/art/SHARED_ART.md` |
| how rooms look | review them first — `docs/art/ROOM_REVIEW.md` |
| folder layout, boundaries, tech decisions | `docs/ARCHITECTURE.md` |
| generation / AI / net / audio / UI behaviour | the file in `docs/systems/` |
| a design rule | `docs/GAMEPLAY.md` |
| a step finished | `docs/PLAN.md` |
