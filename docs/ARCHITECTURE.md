# Architecture

**Start here.** This document is the map of the project: where everything lives, how
the pieces connect, and which files a given change touches.

---

## 1. What the game is

A 4-player first-person co-op horror extraction game in the browser. Players spawn
in a procedurally shuffled maze of hand-authored rooms, find keys, avoid a hunter
that is faster than they are, and hold `E` on the exit door. Proximity voice chat is
core: it is how you coordinate, and it is how you get found.

Design rules are in [`GAMEPLAY.md`](GAMEPLAY.md). This file is about code shape.

---

## 2. The four hard boundaries

Everything else in this document follows from these.

| Boundary | Rule |
| --- | --- |
| **art ⇄ logic** | `art/` may not import from `src/`. Logic drives art through named parts declared in [`art/SHARED_ART.md`](art/SHARED_ART.md). Swapping an art pack changes nothing about how the game plays. |
| **config ⇄ code** | No gameplay constant or user-visible string is written in code. See [`CONFIG.md`](CONFIG.md), [`LOCALISATION.md`](LOCALISATION.md). |
| **sim ⇄ presentation** | The simulation (movement, AI, interactions, run state) runs on a fixed tick and never touches `THREE.Object3D`s or the DOM. Presentation reads sim state and interpolates. This is what makes the host authoritative and clients predictable. |
| **host ⇄ client** | The host runs the only real simulation. Clients predict their own player and interpolate everything else. See [`systems/NETWORKING.md`](systems/NETWORKING.md). |

---

## 3. Folder map

```
stranded/
├─ index.html          Canvas + three UI layers. Nothing else.
├─ vite.config.ts      Build, aliases (@/ @art/ @config/ @shared/)
├─ config/             ALL tunable values + localisation. No code.
├─ assets/             Raw media only (audio, textures, UI images). Served as /.
├─ art/                All 3D content, written in three.js. Never imports src/.
├─ electron/           The desktop shell. A window, a way to serve dist/ to it,
│                      and the profile file. Never imported by src/.
├─ tools/              Dev-only tools. Not shipped; may import both art/ and src/.
├─ docs/               These documents.
└─ src/                All logic.
```

### `src/` — one folder per responsibility

| Folder | Owns | Depends on |
| --- | --- | --- |
| `core/` | Loop (fixed tick + render), `EventBus`, seeded RNG, service registry, time | nothing |
| `config/` | Loading, layering, validating `config/*.json`; typed accessors | `core` |
| `i18n/` | `t()`, locale loading, key fallback | `config` |
| `shared/` | Types and constants used by BOTH client and signalling server: net message shapes, event names, enums. `cosmetics.ts` lives here because `net/` ships a wardrobe choice over the wire and is not allowed to know what a hat looks like | nothing |
| `save/` | Persistence. `localStorage` in browser, OS save dir when packaged. Options, binds, meta progress. **Holds the numbers; never applies them** — `main.tsx` hands them to `render`/`input`/`audio`, which `save/` is not allowed to know about | `config` |
| `input/` | Raw device → **action** ids, rebinding, pointer lock | `config`, `save` |
| `render/` | `WebGLRenderer`, camera rig, lighting rig and its fixed light budget, shader/shadow warm-up, gameplay-feedback layer, material cache, dressed player bodies (`playerBody.ts`) and the off-screen portrait studio (`portraits.ts`) | `config`, `art`, `shared` |
| `world/` | Map generation, room graph, grid ↔ world transforms, collision, doors, containers, spawns, what is visible from where | `config`, `art` (blueprints only), `core` |
| `entities/` | Player, item, container, door, trap state + behaviour | `world`, `config` |
| `ai/` | Enemy state machine, perception (sight/hearing), pathfinding, noise bus | `world`, `entities`, `config` |
| `net/` | WebRTC mesh, host/client sim split, snapshots, prediction, reconciliation, lobby codes | `shared`, `core`, `config` |
| `voice/` | Mic capture, per-peer audio tracks, proximity attenuation, PTT/VAD modes | `net`, `config`, `audio` (its context, `voice` bus and panner settings) |
| `audio/` | Mixer buses, spatial SFX, music/ambience, sound registry | `config`, `assets` |
| `ui/` | Preact screens (`screens/`), per-frame HUD (`hud/`), theme from `config/ui.json` | `i18n`, `config`, `core` |
| `game/` | Orchestration. `Game.ts` owns a run; `Lobby.ts` owns the cabin between runs | everything below |
| `util/` | Small pure helpers: maths, arrays, colour, easing | nothing |

**Dependency direction is strictly downward in that table.** `world/` may import
`config/`; `config/` may never import `world/`. Cross-cutting communication goes
through `core/EventBus` with events declared in `src/shared/events.ts`.

---

## 4. Boot sequence

`src/main.ts` does only this, in order:

```
1. WebGL2 capability check          → fatal error surface if unsupported
2. config.load()                    → merged, validated config
3. save.load()                      → options, key binds, meta progress
4. i18n.init(profile.locale)        → chosen language, or the browser's
   ui.initKeys() / ui.applyTheme()  → key-cap labels, theme → CSS variables
5. render.init()                    → renderer, camera rig, post stack
6. input.init()                     → bindings from config + save overrides
7. audio.init()                     → buses (unlocked on first user gesture)
8. ui.mount()                       → Preact screen manager → main menu
9. loop.start()
```

Nothing after step 2 may read a raw JSON import. Nothing after step 4 may contain
a literal string shown to a player.

**Save comes before i18n**, because the chosen language lives in the profile. A
profile that has never picked one passes nothing and i18n falls back to the browser's
language, so a first run is already in the player's own language if the game has it.

---

## 5. Game states

A single state machine in `src/core/` drives which systems are active.

```
Boot → MainMenu → Lobby → Loading → InRun → Scoreboard → Lobby
                    ↑                  ↓
                    └───── Spectating ─┘
```

| State | Active systems |
| --- | --- |
| `MainMenu` | ui, render, audio |
| `Lobby` | + net (connected), voice, world (`lobbyScene`), entities (player) |
| `Loading` | world generation, art pack load, seed sync. **The whole team leaves it together**: each peer reports `ready` and the host holds everyone until the last one is in, or until `net.json → connection.loadTimeoutSeconds` — see [`systems/NETWORKING.md`](systems/NETWORKING.md) → "Starting together" |
| `InRun` | everything |
| `Spectating` | as `InRun` minus local player control. The camera, the ears, the lights and the culling all move to the player being watched — they have to agree, or a room gets culled around the body you are standing in rather than the one you are looking at. Reached by escaping or by giving up while downed, and left for `Scoreboard` when there is nobody in the map left to watch |
| `Scoreboard` | ui, audio, net (stats exchange), render (the off-screen portrait studio). **Every peer counts its own stats** and broadcasts the whole block; nobody arbitrates, because a player's own client is the only thing that sees every one of their footsteps and a scoreboard is not worth a protocol |

**Voice follows the session, not the run.** It is turned on when a player enters the
lobby and stays on through `Loading` and out the other side, because the load is
exactly when a team is agreeing on a plan. The microphone lifecycle is owned by
`src/main.tsx`; neither `Game` nor `Lobby` touches it.

---

## 6. How a run is put together

```
host picks map + seed + difficulty
        │
        ▼
config/configForRun ─────────► base ⊕ map overrides ⊕ difficulty overrides
        │
        ▼
world/generation ── reads ──► config/world.json  (grid, doors, contents, loot)
        │           reads ──► config/enemy.json  (spawn.regions — how many hunters,
        │                                         and how many locks behind each)
        │           reads ──► art pack blueprint METADATA (footprint, doorWalls, anchors)
        │                     (no 3D objects built yet)
        ▼
  RunLayout  { rooms[], doors[], containers[], items[], playerSpawns[], exitCell,
               enemySpawns[] }
        │
        ├──► sent to clients as (mapId, seed, difficultyId) — clients regenerate identically
        │
        ├──► world/collision  builds the static collision grid
        ├──► ai/navigation    builds the room graph + per-room nav
        └──► world/worldBuilder calls art pack build() per room, up front
```

The generator is **art-agnostic** and the renderer is **layout-agnostic**. Full
detail in [`systems/GENERATION.md`](systems/GENERATION.md).

Because layout derives from `(mapId, seed, difficultyId)`, peers never transmit the
map — they transmit three values and rebuild it. Every `rng` call in generation and
in art `build()` draws from that seed, which is why `Math.random()` is banned in
`art/`. It is also why the number of hunters is not replicated: the difficulty
decides it, and every peer applied the same difficulty.

---

## 7. The frame

```
fixedUpdate (60 Hz)                      render (display Hz)
──────────────────                       ───────────────────
input.sample()                           gameplay feedback (alert, heartbeat, damage)
camera rig from player state             HUD DOM updates (throttled)
one look-ray down the crosshair          renderer.render()
host only: authoritative sim
  ├ player movement + collision
  ├ interactions (doors/chests/items)
  ├ noise bus → enemy hearing
  ├ enemy perception + FSM + pathing
  └ run state (down/revive/escape/win)
remote bodies from the snapshot buffer
culling: portals, then the light budget
net.send(snapshot @ 15 Hz)
voice.updateAttenuation()
```

Sim code lives in plain data structures. The only place a sim value becomes a
`THREE` value is `render/` and the art seam in `world/`.

Culling sits at the end of the fixed step rather than in the render step because
it projects each doorway through the camera, and the camera is set there. Several
frames may be drawn from one tick's answer; the margins in `graphics.json →
culling` are what covers the gap. See [`systems/RENDERING.md`](systems/RENDERING.md).

---

## 8. Noise: the spine of the game

Almost every system feeds one bus.

```
player sprint/footstep ─┐
door open / slam  ──────┤
chest open ─────────────┼──► ai/NoiseBus ──► enemy hearing check ──► alert level
thrown item impact ─────┤     (position,          (per archetype       │
alarm clock ringing ────┤      radius,             hearing config)     ▼
flare charge blast ─────┤      loudness)                     enemy FSM transition
barricade torn off ─────┤
proximity voice ────────┤
item drop ──────────────┘
```

Thrown items are the only noise a player gets to **aim**, which is the whole point
of them. They are also the one emitter the host owns rather than the peer who
caused them: every peer simulates the same arc from the same release state, so four
peers emitting the landing would be four times the noise.

Emitters declare `{ radius, loudness }` in `config/player.json → noise` or
`config/items.json`. The enemy's `hearing` block in `config/enemy.json` decides what
gets through. Every peer emits its own noise and broadcasts it; the host feeds all
of it into the one bus every hunter it is simulating listens to. Events live for a single tick. Propagation is **distance only** — walls and doors do not muffle sound
anywhere in the game, for players or the enemy. Doors cost the enemy *time*, not
hearing.

**Voice deliberately carries further for players than for the enemy** — players hear
each other at `net.json → voice.hearingRange` (22 m), the enemy only within
`hearing.voiceRoomLimit` rooms, and only above `voice.noiseThresholdDb`, so an open
mic picking up small sounds cannot give you away. Full detail in
[`systems/AI.md`](systems/AI.md).

---

## 9. Where to make a change

| Task | Touch |
| --- | --- |
| Tune anything numeric | `config/` only — [`CONFIG.md`](CONFIG.md) |
| Change on-screen text | `config/locales/` — [`LOCALISATION.md`](LOCALISATION.md) |
| Add a room | `art/packs/<pack>/rooms/`, then `npm run validate:art` — [`art/ROOM_FORMAT.md`](art/ROOM_FORMAT.md) |
| Review how rooms *look* | `tools/roomshot` — [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md) |
| Add a whole map | `art/packs/<new>/` + `config/maps.json` — [`art/ART_PACK_CHECKLIST.md`](art/ART_PACK_CHECKLIST.md). Five ship today: `mansion` (Ravenhollow Manor), `viscera` (The Leviathan), `abyss` (Kerberos Deep), `crypt` (Sepulchre of the Nine) and `forge` (Vulcan's Anvil), plus the `test` greybox scaffold |
| Restyle a door / chest / enemy | `art/shared/` — [`art/SHARED_ART.md`](art/SHARED_ART.md) |
| Add a cosmetic hat | `art/shared/characters/hats.ts` + `hatMaterials.ts`, then `config/player.json → customisation.hats` and a `cosmetic.hat.*` key per language — [`art/SHARED_ART.md`](art/SHARED_ART.md) |
| Dress a player body anywhere in `src/` | `src/render/playerBody.ts` — the only file that turns a `Cosmetic` into geometry |
| Add an item | `config/items.json` + a `behaviour` branch in `src/game/Game.ts` + art in `art/shared/props/items/` + locale keys + a weight in `world.json → loot` |
| Change how throwing feels | `config/items.json → defaults.throw` — one block, shared by every throwable |
| Change what stops a thrown item | `src/world/wallGrid.ts` — deliberately NOT the collision world |
| Change how the maze is built | `src/world/generation.ts` — [`systems/GENERATION.md`](systems/GENERATION.md) |
| Change enemy behaviour | `src/ai/` — [`systems/AI.md`](systems/AI.md) |
| Change what gets drawn, or chase a frame-rate problem | `src/render/`, `src/world/visibility.ts` — [`systems/RENDERING.md`](systems/RENDERING.md) |
| Change the lobby cabin's look | `art/shared/lobby/` — review it with `/tools/roomshot.html?map=lobby` |
| Change what the lobby *does* | `src/game/Lobby.ts` + `src/world/lobbyScene.ts` |
| Tune the lobby dart minigame | `config/darts.json` — its own file, never `items.json`. The physics are `src/entities/dart.ts` and the furniture is `art/shared/lobby/darts.ts` |
| Add a menu / screen | `src/ui/screens/` — [`systems/UI.md`](systems/UI.md) |
| Add a language | `config/locales/<code>.json` + `manifest.json`, then `npm run validate:locales` — [`LOCALISATION.md`](LOCALISATION.md) |
| Change how a key looks on screen | `config/input.json → keyLabels` for the word, `src/ui/keys.ts` for the shape |
| Add a HUD element | `src/ui/hud/` + `config/ui.json → hud` |
| Change what the tutorial teaches | `config/ui.json → hud.tutorial.tips` for the order and the key caps, `tutorial.*` locale keys for the words. A **new** tip also needs its trigger reported — `main.tsx` for the cabin, `RunHooks.onTutorial` for the run — see [`systems/UI.md`](systems/UI.md) → "The tutorial" |
| Change net sync | `src/net/` + `src/shared/messages.ts` — [`systems/NETWORKING.md`](systems/NETWORKING.md) |
| Add a sound | `config/audio.json → sounds` + a recipe in `src/audio/recipes.ts` or a file in `assets/audio/` + trigger from logic — [`systems/AUDIO_VOICE.md`](systems/AUDIO_VOICE.md) |
| Replace a sound with a real recording | Drop the file in `assets/audio/` — [`assets/audio/README.md`](../assets/audio/README.md) |
| Add a difficulty, or change what one does | `config/difficulty.json` only — plus a `difficulty.<id>.name` key per language |
| Change how many hunters a difficulty puts on the map | `config/enemy.json → archetypes.<id>.spawn.regions`, overridden per mode in `difficulty.json` |
| Change the desktop shell — window, permissions, where saves go | `electron/` — see "The desktop build" in §10. The browser build must keep working; `src/` may not learn it is packaged |
| Add a save field | `src/save/index.ts`; an *options* field is `src/save/options.ts` plus a control in `src/ui/screens/Options.tsx` and a line in `applyOptions()` in `src/main.tsx` |
| Add a scoreboard stat | `src/world/runStats.ts` (`STAT_IDS`), a `#count()` call in `src/game/Game.ts`, a category in `game.json → scoring`, a `scoreboard.category.*` locale key |
| Change what a run pays out | `config/items.json → items.coinPile / items.diamond`; the exit-door half is `Game.#cashInTreasure()`, and the purse is banked by `bankRun()` in `src/main.tsx` when a player who escaped actually leaves the run |
| Change spectating | `src/game/Game.ts` (`#updateSpectator`, `#eye`) + the `spectate` screen in `src/ui/App.tsx` |
| Change text chat | `src/ui/App.tsx` (`Chat`) + `pushChat`/`openChat` in `src/main.tsx` + `config/ui.json → hud.chat`. Who may read a line is `Game.canHearChatFrom` and nowhere else |

---

## 10. Technology decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Renderer | **three.js** | Required by the brief; art is authored in it directly. |
| Language | **TypeScript, strict** | The art/logic contract is only enforceable with types. A room that forgets an anchor kind should fail to compile, not at 2 a.m. in a playtest. |
| Build | **Vite** | Fast HMR (config JSON edits hot-reload), zero-config TS, standard. |
| UI | **Preact + TSX** for screens, **plain DOM** for HUD | Screens (options, rebinding, lobby, scoreboard) are real UI and benefit from a component model; Preact is 3 kB. HUD updates every frame, so it bypasses the vdom entirely. |
| Netcode | **Host-authoritative WebRTC P2P** | 4 players, low latency, no per-run server cost. One player simulates; peers predict locally. Voice rides the same peer connections. |
| Signalling | **PeerJS public server now; our own later** | PeerJS gets multiplayer working with zero infrastructure. Codes are namespaced peer ids. Self-hosting a small `ws` signalling server is plan step 23, and the seam where Steam lobbies drop in later. |
| Voice | **Native `RTCPeerConnection` audio tracks** | Proximity attenuation needs per-peer `GainNode` control; a wrapper library would only get in the way. |
| Audio | **Tone.js recipes rendered to buffers at boot, played back as raw Web Audio** | Every sound is synthesised, so the game has a full soundtrack with no assets and no licensing. Rendering offline once means playback is a plain buffer source rather than a synth graph per footstep — and a composer's file drops into the *same* `AudioBuffer` slot, so replacing a sound is a file, not a code change. Tone stays live only for the generative score. |
| Physics | **Custom 2D circle-vs-shape** | There is no jumping and no vertical movement. A full physics engine (rapier/cannon) would add a large dependency and a determinism headache to solve a problem that is ~150 lines here. Revisit only if verticality ships. |
| Thrown items | **A ballistic arc tested against the MAZE, not against colliders** (`src/world/wallGrid.ts`) | The one thing in the game with a height, in a world whose collision is a flat 2D test. Run against the collider set, a flask would die on a table leg it visibly flew over — the maze already knows which cell edges are wall, doorway or open floor, and that is exactly the question a throw is asking. The preview line and the flight are the same integration, so the aim never lies. |
| Gameplay feedback (alert wash, heartbeat, damage flash, health vignette) | **A DOM compositing layer** (`src/render/feedback.ts`), not an `EffectComposer` post stack | Every effect the design asks for is a full-screen blend. A DOM layer costs no render targets and no extra passes, and there is no *general* post-processing stack to justify one (see "Deliberately NOT built"). `render/` still owns it. If an effect ever needs the depth buffer, that is the moment to introduce a composer. |
| Pathfinding | **A\* over the room graph + per-room waypoints** | The world is already a graph of rooms; hierarchical pathing on it is cheaper and more controllable than a navmesh, and makes "search a nearby room" trivial to express. |
| State sync | **Seed + snapshots**, not full world replication | The map is a pure function of `(mapId, seed)`, so only entity state crosses the wire. |
| Persistence | **`localStorage`** in a browser, a **file in the OS save directory** when packaged | One `Storage` adapter in `src/save/index.ts` with two implementations, picked by whether the desktop shell is there. No backwards-compat requirement yet; the seam is what matters. |
| Desktop build | **Electron + electron-builder**, serving the *same* bundle over a custom `game://` scheme | The browser build stays the product; the shell adds a window and a save file and nothing else. The custom scheme rather than `file://` is not cosmetic — see "The desktop build" below. |

### The desktop build

`electron/main.cjs` (the window, the bundle, the profile file) and
`electron/preload.cjs` (the one bridge). Both are CommonJS: a preload script
cannot be ESM while `sandbox` is on, and the two halves matching is worth more
than the syntax.

| Command | Does |
| --- | --- |
| `npm run electron:dev` | Opens the shell on the **dev server** — run `npm run dev` first. `STRANDED_DEV_URL` overrides the port Vite fell back to |
| `npm run electron:dist` | Builds, then opens the shell on the **built bundle**. The way to test the packaged loading path without packaging |
| `npm run electron:build` | Builds, then `electron-builder` → `release/` (NSIS installer + portable exe on Windows) |

**Nothing in `src/` knows it is packaged**, with one exception it cannot avoid:
`window.strandedShell` exists or it does not, and `src/save/` picks its storage
adapter on that. There is no desktop-only code path anywhere else.

Four decisions worth knowing.

**The bundle is served over a custom `game://` scheme, not `file://`.** Two
things break under `file://` and both are fatal: it is not a **secure context**
in Chromium, so `getUserMedia` is refused and the entire voice system — the
point of the game — never opens a microphone; and an **absolute asset path**
(`/ui/menu/…`, which is how everything in `assets/` is addressed) has no meaning
under it. A privileged standard scheme fixes both with no local HTTP server.
The handler refuses anything resolving outside `dist/`.

**The renderer keeps every default that isolates it** — context isolation on,
no Node integration, Chromium sandbox on — because it talks to arbitrary peers
over WebRTC. That is why the profile is read and written by the *main* process:
a sandboxed preload has no `fs`, and the renderer never learns the path. The
read is synchronous (`ipcRenderer.sendSync`) because `Save.load()` is, and
`Save.load()` is synchronous because the chosen language lives in the profile
and i18n is initialised from it before anything is drawn.

**`backgroundThrottling` is off.** Chromium throttles timers and rAF in a window
that is not in front; the host simulates the run for everybody, so a host who
alt-tabs must not stop the game for the other three.

**There is no single-instance lock**, deliberately: two copies on one machine is
how the multiplayer is tested.

The save file is `<userData>/profile.json`, written to a temporary name and
renamed over the top — a rename is atomic, so a crash mid-write cannot leave a
half-profile behind, which the game would treat as a fresh one. `userData` is
named from **top-level `productName`** in `package.json`; `app.getName()` does
not see the copy inside the `build` block, and moving it later would silently
strand every existing save.

### Deliberately NOT built

Keep the seams clean for these, but **do not implement any of them** until they are
picked up as plan steps. Adding them speculatively is how a simple codebase stops
being simple.

| Not built | Seam that keeps it cheap later |
| --- | --- |
| **Player flashlight** | Rooms light themselves. Nothing assumes a player-held light, so adding one is additive. |
| **Stamina** | Sprinting is priced in noise alone. `movement` has no resource coupled to it. |
| **Sound occlusion** (walls/doors muffling audio, noise or voice) | Propagation is distance-only everywhere. One rule, one place to change. |
| **Directional movement penalties** | Movement is speed-uniform — backing away from the enemy costs nothing, by design. |
| **Graphics quality tiers / presets** | `graphics.json` is flat. A tier system is a merge layer over it, and the config loader's merge is already generic. |
| **Room streaming** (building and disposing rooms as you walk) | Every room is built up front and culled. `BuiltWorld.updateVisibility` is the seam; at 33 rooms and a 110 ms build there is nothing to gain yet. |
| **Post-processing beyond gameplay feedback** | Only the effects the design calls for exist (alert state, heartbeat proximity, damage). No general bloom/grain/aberration stack. |
| **Accessibility settings** (UI scale, reduce flashing, colourblind modes) | UI sizes derive from one base; effects are driven through a single feedback module. |
| **Config-mismatch detection between peers** | Peers ship `(mapId, seed)` and are assumed to share a build. Hashing config is additive. |
| **Reconnecting after a disconnect** | A dropped player is marked `disconnected`, their items fall where they stood and the run continues. |
| **Host migration** | If the host drops, the run ends. `net.json → hostMigration.enabled` marks the seam. |
| **Anti-cheat** | A host-authoritative P2P game trusts the host. Fine for co-op with friends. |
| **Host-owned movement** (input frames, prediction, reconciliation) | Each peer moves its own player; the host arbitrates only what can be *contested* — items, doors, locks, the hunter, the outcome. `stepPlayer()` is a pure `(state, input, dt)` function, which is the whole seam. Reasons in [`systems/NETWORKING.md`](systems/NETWORKING.md) → "What the host does not own". |
| **Vertical maps** | `world.json → grid.levels` exists but only `1` is supported. |
| **Save format versioning** | No migration path is maintained yet, by explicit decision. |

---

## 11. Related documents

| Doc | Read it when |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Picking up the next piece of work |
| [`GAMEPLAY.md`](GAMEPLAY.md) | You need to know a design rule |
| [`CONFIG.md`](CONFIG.md) | Tuning anything |
| [`LOCALISATION.md`](LOCALISATION.md) | Any user-visible text |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Writing code or committing |
| [`art/ART_GUIDE.md`](art/ART_GUIDE.md) | Any visual work |
| [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md) | Judging how rooms look |
| [`systems/GENERATION.md`](systems/GENERATION.md) | Map layout |
| [`systems/AI.md`](systems/AI.md) | Enemy behaviour |
| [`systems/NETWORKING.md`](systems/NETWORKING.md) | Multiplayer |
| [`systems/AUDIO_VOICE.md`](systems/AUDIO_VOICE.md) | Sound or voice chat |
| [`systems/UI.md`](systems/UI.md) | Menus and HUD |
| [`systems/RENDERING.md`](systems/RENDERING.md) | Lights, culling, frame cost |
