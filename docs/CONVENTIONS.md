# Conventions

## Code

- **TypeScript, strict.** No `any` in committed code; use `unknown` and narrow.
- **No hardcoded gameplay values.** → [`CONFIG.md`](CONFIG.md)
- **No user-visible strings in code.** → [`LOCALISATION.md`](LOCALISATION.md)
- **`art/` never imports `src/`.** → [`art/ART_GUIDE.md`](art/ART_GUIDE.md)
- **No `Math.random()` in `art/` or in generation.** Use the seeded RNG.
- Units are metres and seconds. Suffix a name with the unit when it is not obvious
  (`reviveHoldSeconds`, `pitchClampDegrees`).
- Simulation code does not touch `THREE` or the DOM. Presentation code does not
  mutate simulation state.
- Prefer plain data + functions over classes, except where an object genuinely owns
  a lifecycle (renderer, peer connection, screen manager).
- One responsibility per file. If you cannot name a file in two words, split it.
- Comments explain **why**, not what. The code says what.

### Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files: modules | `camelCase.ts` | `noiseBus.ts` |
| Files: classes / components | `PascalCase.ts(x)` | `ScreenManager.ts`, `Lobby.tsx` |
| Types / interfaces | `PascalCase` | `RoomBlueprint` |
| Config keys, ids | `lowerCamelCase` | `chaseSpeed`, `flashGrenade` |
| Locale keys | `dot.separated.camelCase` | `hud.interact.pickUp` |
| Art ids | `category.name` | `door.standard`, `mansion.library` |
| Events | `domain:verb` | `run:started`, `door:opened` |

### Imports

Use the path aliases, not deep relative chains:

```ts
import { grid } from '@config';
import { NoiseBus } from '@/ai/noiseBus';
import type { RoomBlueprint } from '@art/lib/contract';
import type { Snapshot } from '@shared/messages';
```

## Git workflow

`main` is always working. All work happens on a branch and merges back when it runs.

```bash
git switch -c step-07-room-contract
```

Branch names: `step-NN-short-name` for plan steps, `fix-short-name`,
`art-<pack>-<thing>` for art work.

Commit messages: imperative, one line, scope prefix.

```
world: add spanning-tree room connector
art(mansion): add flooded kitchen room
config: raise chase speed on hard
docs: update PLAN after step 7
```

Merging a finished step:

```bash
git switch main
git merge --no-ff step-07-room-contract
git push
git branch -d step-07-room-contract
```

Use `--no-ff` so each step stays a visible unit in history.

> On this machine the shell is **`pwsh`**, not Windows PowerShell 5. Multi-line
> strings use here-strings with the closing `'@` at column 0.

## Definition of done for a plan step

1. It runs — `npm run dev` loads with no console errors.
2. `npm run typecheck` passes.
3. No new hardcoded values or strings (see rules above).
4. Docs updated: at minimum tick the step in [`PLAN.md`](PLAN.md); update the relevant
   system doc if the design changed.
5. Merged into `main` on a `--no-ff` merge.

## Keeping docs true

Docs are load-bearing here — they are how the next session avoids reading the whole
codebase. When a step changes a contract, **update the doc in the same commit**:

| Changed | Update |
| --- | --- |
| Anything in `config/` | [`CONFIG.md`](CONFIG.md) table |
| A locale key namespace | [`LOCALISATION.md`](LOCALISATION.md) |
| Room blueprint / art contract | [`art/ROOM_FORMAT.md`](art/ROOM_FORMAT.md), [`art/SHARED_ART.md`](art/SHARED_ART.md) |
| Folder layout or a boundary | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Generation, AI, net, audio, UI behaviour | the file in `docs/systems/` |
| A design rule | [`GAMEPLAY.md`](GAMEPLAY.md) |
| Step finished | [`PLAN.md`](PLAN.md) |
