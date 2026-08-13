# Config Guide

**Read this file alone to tune the game.** You do not need to read any file in `src/`.

## The rule

> There are **no hardcoded gameplay values anywhere in `src/` or `art/`.** Every
> speed, radius, duration, count, colour, volume and threshold lives in `config/`.

If you find yourself typing a number into logic, it belongs in a config file instead.

One deliberate exception: the **sound synthesis recipes** in `src/audio/recipes.ts`
carry their own oscillator frequencies, envelopes and filter settings. Those numbers
are the sound's identity — content, exactly like the literals in `art/` — and they
are the thing an audio file replaces. Everything a designer would tune about a sound
(bus, volume, pitch spread, cooldown, what triggers it) is in `audio.json`. See
[`systems/AUDIO_VOICE.md`](systems/AUDIO_VOICE.md).

## Where to change what

| I want to change… | File | Key |
| --- | --- | --- |
| How fast players walk / sprint / crouch | `player.json` | `movement.*` |
| Default FOV, mouse sensitivity, invert Y | `player.json` | `camera.*` — these are what the options menu *starts from* and what "reset to defaults" returns to |
| How far the FOV slider may be dragged | `player.json` | `camera.fovRange` |
| Revive time, injured/downed rules | `player.json` | `health.*` |
| Camera height while downed | `player.json` | `body.downedEyeHeight` |
| How much slower an injured player is | `player.json` | `movement.injuredSpeedMultiplier` |
| How loud sprinting / chests / voice are | `player.json` | `noise.*` |
| Heartbeat + screen distortion distances | `player.json` | `effects.*` |
| Enemy speed (patrol / search / chase) | `enemy.json` | `archetypes.<id>.movement.*` |
| How well the enemy sees | `enemy.json` | `archetypes.<id>.sight.*` |
| How well the enemy hears | `enemy.json` | `archetypes.<id>.hearing.*` |
| How long the enemy takes to open doors | `enemy.json` | `archetypes.<id>.doors.*` |
| Enemy patrol / search behaviour | `enemy.json` | `archetypes.<id>.patrol.*`, `.search.*` |
| How far from players the enemy spawns | `enemy.json` | `archetypes.<id>.spawn.*` |
| **How many hunters, and where each starts** | `enemy.json` | `archetypes.<id>.spawn.regions` — one entry per hunter, the value being how many locked doors it starts *behind*. `[0]` is one hunter in the players' partition; `hard` uses `[0, 1]` to seal a second past the first lock |
| How far apart two hunters patrol | `enemy.json` | `archetypes.<id>.patrol.avoidOtherHuntersRooms`, `.otherHunterAreaWeight` — a weight multiplier, so they prefer different wings without ever refusing to meet |
| Map size (6×6 → anything) | `world.json` | `grid.width`, `grid.height` |
| Room / cell dimensions | `world.json` | `grid.cellSize`, `ceilingHeight` |
| How maze-y vs loopy the map is | `world.json` | `layout.extraDoorChance`, `deadEndTargetRatio` |
| How many oversized set-piece rooms a map gets | `world.json` | `layout.multiCellRooms.enabled`, `.maxSlots`, `.footprintWeights` — each multi-cell blueprint is used at most once per map |
| Number of locked doors and spare keys | `world.json` | `doors.lockedDoorCount`, `doors.keySpareCount` |
| Chests / lockers / item spawns per room | `world.json` | `contents.*` |
| How long a chest takes to open, locker enter/exit | `world.json` | `containers.*` |
| What chests and floors contain | `world.json` | `loot.chestTable`, `loot.floorTable` — `diamond` is deliberately chest-only |
| Exit door placement and hold time | `world.json` | `exit.*` |
| Item stats and behaviour params | `items.json` | `items.<id>.params.*` |
| How far / fast anything throws, and the aim arc | `items.json` | `defaults.throw.*` — shared by every throwable, because the arc has to be one thing a player learns once |
| What a coin pile is worth | `items.json` | `items.coinPile.params.minValue`, `.maxValue` — rolled from the run seed, so a pile is worth the same to whoever reaches it first |
| How loud a thrown item is | `player.json` | `noise.throwImpact`, `.alarm`, `.blast`, `.wreck` |
| Whether the run purse shows on the HUD | `ui.json` | `hud.coins.enabled`, `.showWhenEmpty` |
| How long a downed player holds before they die | `player.json` | `health.giveUpHoldSeconds` — long enough that it cannot be an accident, short enough that it is not a punishment for having decided |
| How forgiving picking an item up is | `player.json` | `interaction.rayRadius` — items only. Doors and chests are big enough for an exact ray; a key on floorboards is not |
| How much chat is kept, and for how long | `ui.json` | `hud.chat.enabled`, `.maxMessages`, `.messageSeconds`, `.maxLength` |
| What the tutorial teaches, and in what order | `ui.json` | `hud.tutorial.tips` — each `id` is both a locale key (`tutorial.<id>`) and a trigger the code reports, so this orders and dresses the tips rather than inventing them. `keys` are action ids whose caps fill the string's `{key}` gap |
| How long a tutorial tip stays up | `ui.json` | `hud.tutorial.flashSeconds`, `.gapSeconds` — `task` tips ignore both and wait to be done. `hud.tutorial.enabled` removes the feature; the player's own switch is `options.tutorial` in the save profile |
| Which maps exist | `maps.json` | `maps.*` — `mansion`, `viscera`, `abyss`, `crypt`, and the `test` scaffold |
| A map's lobby poster | `maps.json` | `maps.<id>.posterArtId` — an art id from `art/shared/index.ts`; unset or unregistered hangs a blank |
| Lighting, fog, shadows, draw distance | `graphics.json` | top level |
| How many lights are on at once | `graphics.json` | `maxActiveLights` and `shadows.maxCastingLights` — a fixed **budget**, not a cap: the renderer always enables exactly this many, nearest first, because a light count that changes recompiles every shader mid-run. See [`systems/RENDERING.md`](systems/RENDERING.md) |
| How gently a lamp takes or loses one of those slots | `graphics.json` | `lightFadeSeconds` — a switch is a light visibly coming on as you walk up to it |
| How much of the map is drawn | `graphics.json` | `renderDistanceRooms` for the hard limit, `culling.*` for the portal flood inside it |
| How far the brightness slider may be dragged | `graphics.json` | `brightnessRange` — the slider multiplies `exposure`, it does not replace it |
| How far the sensitivity slider may be dragged | `input.json` | `mouse.sensitivityRange` |
| Which buses get a volume slider | `audio.json` | `buses.<id>.labelKey` — a bus without one is not offered (`ui` deliberately has none) |
| Which stats the scoreboard shows, and which way is better | `game.json` | `scoring.categories` — ids must be counters `src/world/runStats.ts` keeps |
| How the lobby cabin is lit | `graphics.json` | `lobby.*` — merged over the block above while the lobby is up |
| Volumes, spatial audio, sound registry | `audio.json` | `buses.*`, `spatial.*`, `sounds.*` |
| Which sound a game event fires | `audio.json` | `cues.*` — noise kinds, alert stings, hold loops |
| How the score reacts to the hunter | `audio.json` | `music.intensityByAlert`, `.proximityWeight`, `.chaseLayerThreshold` |
| Default key bindings | `input.json` | `actions.*` — the options menu rebinds the *primary* key only, and stores overrides in the save profile; this file stays the reset-to-default source |
| Whether an action can be rebound at all | `input.json` | `actions.<id>.rebindable` — `false` draws it locked |
| What is printed on a key cap | `input.json` | `keyLabels.*`, `wideKeys` — letters and digits need no entry |
| Which languages the game offers | `config/locales/manifest.json` | `locales.*` — see [`LOCALISATION.md`](LOCALISATION.md) |
| The fonts, including CJK and Cyrillic fallbacks | `ui.json` | `theme.fontDisplay`, `.fontBody`, `.fontMono` |
| Voice chat range and modes | `net.json` | `voice.hearingRange`, `.fullVolumeRange`, `.falloff`, `.modes` |
| How quiet you can talk without the hunter noticing | `net.json` | `voice.noiseThresholdDb` (and `voice.voiceActivityThresholdDb` for the open-mic gate) |
| Tick rate, interpolation, signalling URL | `net.json` | `simulation.*`, `signalling.*` |
| How smooth remote players and the hunter look | `net.json` | `simulation.interpolationDelayMs`, `.maxExtrapolationMs` — playback runs that far in the past so there is always a sample to interpolate toward |
| How fast a dead peer is noticed | `net.json` | `connection.heartbeatSeconds`, `.timeoutSeconds` |
| How long the host waits at the loading screen | `net.json` | `connection.loadTimeoutSeconds` — after this the run starts without whoever is missing |
| Lobby countdown, player cap, run rules | `game.json` | `lobby.*`, `session.*`, `run.*` |
| How many frames the poster wall has | `game.json` | `lobby.posterSlots` — slots past the map list hang blank |
| Whether the `?` poster hangs at all | `game.json` | `lobby.randomPoster` — a random vote never outranks a specific one, so this is "I don't mind", not "surprise everybody" |
| How a dart flies, and how hard the bull is | `darts.json` | `throw.*`, `wind.*` — deliberately **not** `items.json`: a dart is thrown at a disc four metres away and a flask is thrown down a corridor, and one set of numbers cannot serve both |
| The dartboard's rings and bed order | `darts.json` | `board.*` — fractions of `board.radius`, and `art/shared/lobby/textures.ts` paints the same fractions, so the picture and the scoring cannot disagree |
| How long a dart stays in the board | `darts.json` | `stick.seconds`, `.maxInWorld` |
| What the lobby wardrobe offers | `player.json` | `customisation.colours`, `.defaultColourId` |
| Which hats the wardrobe sells, and for how much | `player.json` | `customisation.hats` — `artId` must resolve in `art/shared/index.ts`, `cost` is in banked coins and `0` means owned from the start. The order here is the order the shop lists them in, so it doubles as the price ladder |
| UI colours, fonts, HUD layout | `ui.json` | `theme.*`, `hud.*` |
| What is behind the main menu | `ui.json` | `menus.mainMenuBackground` — `screenshots` runs the slideshow, anything else leaves the flat gradient |
| Which stills the main menu shows, and how they move | `ui.json` | `menus.background.*` — `images` are files in `assets/ui/menu/`, `holdSeconds`/`fadeSeconds` time the cross-fade, `drift` is the slow creep, `dim`/`grain` are the wash over them. See [`assets/ui/menu/README.md`](../assets/ui/menu/README.md) |
| Difficulty modes | `difficulty.json` | `modes.*` — two ship: `normal` (the base config untouched) and `hard` |
| Which difficulties the lobby lever offers | `difficulty.json` | `modes.<id>.enabled`, in the order the file lists them |
| What a difficulty actually changes | `difficulty.json` | `modes.<id>.overrides` — a deep merge over `enemy`, `world` and `player`, applied at run start. Adding a mode is config only |
| Any on-screen text | `locales/en.json` | see [`LOCALISATION.md`](LOCALISATION.md) |

## How config is loaded

`src/config/` owns loading. The pipeline is a deep merge, later layers winning:

```
1. config/*.json                           base values, checked into git
2. maps.json → maps.<id>.overrides         applied when a map is chosen
3. difficulty.json → modes.<id>.overrides  applied when a run starts
4. player save profile                     options-menu changes (volume, sensitivity, binds)
```

Layer 4 is **not a merge layer**. The options menu writes a small block into the save
profile (`src/save/options.ts`) and `main.tsx` hands those values to the renderer,
input and audio at boot and on every change — the same code path both times, so
"apply" and "restore on load" cannot drift apart. It works that way because these
settings belong to *live subsystems*, not to a run's config snapshot: a volume that
had to be re-merged and re-read would not move while you dragged the slider. Every
default it falls back to is still read from the files above, which is what makes
"reset to defaults" mean exactly "whatever `config/` says".

Layers 2 and 3 are **pure data overlays** — this is why adding a difficulty or a map
requires zero code. The merge is generic, so further overlay layers can be slotted in
later without reworking it. Layers 1–3 together are `configForRun(mapId,
difficultyId)`, and every peer calls it with the same two ids, so the config a run
plays on is never replicated either.

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

1. Put it in the file that owns the system (see the table above). A whole new
   *file* also needs its name in the `required` list in `src/config/index.ts`,
   or a missing one boots silently as `undefined` instead of failing loudly.
2. Add its type to `src/config/types.ts`.
3. Read it via the config accessor — never `import cfg from '../../config/x.json'`.
4. If it is player-facing, add an options-menu entry and a locale key.
5. Note it in the table above if it is something someone would plausibly want to tune.

## Validation

`src/config/validate.ts` checks types and ranges at boot and throws a readable error
naming the file and key path. A missing key falls back to the base layer; an unknown
key is a warning, not an error (so a config can be ahead of the code).

Three scripts check config offline, and all three run without a browser:

| Script | Checks |
| --- | --- |
| `npm run validate:art` | Every room of every pack builds, and nothing about it strands a player |
| `npm run validate:gen` | Every enabled map generates and is solvable, over hundreds of seeds |
| `npm run validate:locales` | Every locale carries every key with the same placeholders, and every config id that needs a label has one |
