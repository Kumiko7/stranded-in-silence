# Config Guide

**Read this file alone to tune the game.** You do not need to read any file in `src/`.

## The rule

> There are **no hardcoded gameplay values anywhere in `src/` or `art/`.** Every
> speed, radius, duration, count, colour, volume and threshold lives in `config/`.

If you find yourself typing a number into logic, it belongs in a config file instead.

## Where to change what

| I want to change… | File | Key |
| --- | --- | --- |
| How fast players walk / sprint / crouch | `player.json` | `movement.*` |
| Sprint stamina | `player.json` | `stamina.*` |
| FOV, mouse sensitivity, head bob | `player.json` | `camera.*` |
| Revive time, injured/downed rules | `player.json` | `health.*` |
| How loud sprinting / chests / voice are | `player.json` | `noise.*` |
| Heartbeat + screen distortion distances | `player.json` | `effects.*` |
| Enemy speed (patrol / search / chase) | `enemy.json` | `archetypes.<id>.movement.*` |
| How well the enemy sees | `enemy.json` | `archetypes.<id>.sight.*` |
| How well the enemy hears | `enemy.json` | `archetypes.<id>.hearing.*` |
| How long the enemy takes to open doors | `enemy.json` | `archetypes.<id>.doors.*` |
| Enemy patrol / search behaviour | `enemy.json` | `archetypes.<id>.patrol.*`, `.search.*` |
| How far from players the enemy spawns | `enemy.json` | `archetypes.<id>.spawn.*` |
| Map size (6×6 → anything) | `world.json` | `grid.width`, `grid.height` |
| Room / cell dimensions | `world.json` | `grid.cellSize`, `ceilingHeight` |
| How maze-y vs loopy the map is | `world.json` | `layout.extraDoorChance`, `deadEndTargetRatio` |
| Number of locked doors and spare keys | `world.json` | `doors.lockedDoorCount`, `doors.keySpareCount` |
| Chests / lockers / item spawns per room | `world.json` | `contents.*` |
| What chests and floors contain | `world.json` | `loot.chestTable`, `loot.floorTable` |
| Exit door placement and hold time | `world.json` | `exit.*` |
| Item stats and behaviour params | `items.json` | `items.<id>.params.*` |
| Which maps exist | `maps.json` | `maps.*` |
| Lighting, fog, post-processing, quality tiers | `graphics.json` | `default.*`, `tiers.*` |
| Volumes, spatial audio, sound registry | `audio.json` | `buses.*`, `spatial.*`, `sounds.*` |
| Default key bindings | `input.json` | `actions.*` |
| Voice chat range and modes | `net.json` | `voice.*` |
| Tick rate, interpolation, signalling URL | `net.json` | `simulation.*`, `signalling.*` |
| Lobby countdown, player cap, run rules | `game.json` | `lobby.*`, `session.*`, `run.*` |
| UI colours, fonts, HUD layout | `ui.json` | `theme.*`, `hud.*` |
| Difficulty modes | `difficulty.json` | `modes.*` |
| Any on-screen text | `locales/en.json` | see [`LOCALISATION.md`](LOCALISATION.md) |

## How config is loaded

`src/config/` owns loading. The pipeline is a deep merge, later layers winning:

```
1. config/*.json                 base values, checked into git
2. maps.json → maps.<id>.overrides       applied when a map is chosen
3. difficulty.json → modes.<id>.overrides  applied when a run starts
4. graphics.json → tiers.<tier>          applied from the player's quality setting
5. player save profile                   options-menu changes (volume, sensitivity, binds)
6. ?config= URL param / dev overrides    local experimentation only
```

Layers 2–4 are **pure data overlays** — this is why adding a difficulty or a map
requires zero code.

Config is imported at build time (`import.meta.glob`), so in `npm run dev` editing a
JSON file hot-reloads the running game. Values read once at boot (grid size,
renderer settings) need a page refresh; values read per frame (speeds) apply live.

## Conventions

- Units are **metres and seconds**, always. Angles are degrees only when the key
  ends in `Degrees`; otherwise radians.
- Colours are hex strings (`"#0a0b12"`), optionally with alpha (`"#0e1017e6"`).
- Ranges are two-element arrays `[min, max]` and are sampled uniformly.
- Weighted tables are `{ "<id>": <weight> }`; weights are relative, not percentages.
- `"$doc"` and `"$note"` keys are documentation and are stripped at load. Add them freely.
- A key ending in `Seconds`, `Metres`, `Hz`, `Db`, `Degrees` states its unit — prefer
  that over a bare name.

## Adding a new config value

1. Put it in the file that owns the system (see the table above).
2. Add its type to `src/config/types.ts`.
3. Read it via the config accessor — never `import cfg from '../../config/x.json'`.
4. If it is player-facing, add an options-menu entry and a locale key.
5. Note it in the table above if it is something someone would plausibly want to tune.

## Validation

`src/config/validate.ts` checks types and ranges at boot and throws a readable error
naming the file and key path. A missing key falls back to the base layer; an unknown
key is a warning, not an error (so a config can be ahead of the code).
