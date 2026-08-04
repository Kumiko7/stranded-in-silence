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
| `shared/` | Types and constants used by BOTH client and signalling server: net message shapes, event names, enums | nothing |
| `save/` | Persistence. `localStorage` in browser, OS save dir when packaged. Options, binds, meta progress | `config` |
| `input/` | Raw device → **action** ids, rebinding, pointer lock | `config`, `save` |
| `render/` | `WebGLRenderer`, camera rig, lighting rig, post-processing, room streaming, material cache | `config`, `art` |
| `world/` | Map generation, room graph, grid ↔ world transforms, collision, doors, containers, spawns | `config`, `art` (blueprints only), `core` |
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
3. i18n.init()                      → locale from save profile or browser
4. save.load()                      → options, key binds, meta progress
5. render.init()                    → renderer, camera rig, post stack
6. input.init()                     → bindings from config + save overrides
7. audio.init()                     → buses (unlocked on first user gesture)
8. ui.mount()                       → Preact screen manager → main menu
9. loop.start()
```

Nothing after step 2 may read a raw JSON import. Nothing after step 3 may contain
a literal string shown to a player.

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
| `Loading` | world generation, art pack load, seed sync |
| `InRun` | everything |
| `Spectating` | as `InRun` minus local player control |
| `Scoreboard` | ui, audio, net (stats exchange) |

**Voice follows the session, not the run.** It is turned on when a player enters the
lobby and stays on through `Loading` and out the other side, because the load is
exactly when a team is agreeing on a plan. The microphone lifecycle is owned by
`src/main.tsx`; neither `Game` nor `Lobby` touches it.

---

## 6. How a run is put together

```
host picks map + seed
        │
        ▼
world/generation ── reads ──► config/world.json  (grid, doors, contents, loot)
        │           reads ──► art pack blueprint METADATA (footprint, doorWalls, anchors)
        │                     (no 3D objects built yet)
        ▼
  RunLayout  { rooms[], doors[], containers[], items[], playerSpawns[], exitCell }
        │
        ├──► sent to clients as (mapId, seed) — clients regenerate identically
        │
        ├──► world/collision  builds the static collision grid
        ├──► ai/navigation    builds the room graph + per-room nav
        └──► render/streaming calls art pack build() per room, on demand
```

The generator is **art-agnostic** and the renderer is **layout-agnostic**. Full
detail in [`systems/GENERATION.md`](systems/GENERATION.md).

Because layout derives from `(mapId, seed)`, peers never transmit the map — they
transmit two values and rebuild it. Every `rng` call in generation and in art
`build()` draws from that seed, which is why `Math.random()` is banned in `art/`.

---

## 7. The frame

```
fixedUpdate (30 Hz)                      render (display Hz)
──────────────────                       ───────────────────
input.sample()                           camera rig from interpolated player state
local player prediction                  art object transforms from sim state
host only: authoritative sim             room streaming in/out
  ├ player movement + collision          post-processing (alert, heartbeat, damage)
  ├ interactions (doors/chests/items)    HUD DOM updates (throttled)
  ├ noise bus → enemy hearing            renderer.render()
  ├ enemy perception + FSM + pathing
  └ run state (down/revive/escape/win)
net.send(snapshot @ 15 Hz)
voice.updateAttenuation()
```

Sim code lives in plain data structures. The only place a sim value becomes a
`THREE` value is `render/`, in the render step.

---

## 8. Noise: the spine of the game

Almost every system feeds one bus.

```
player sprint/footstep ─┐
door open / slam  ──────┤
chest open ─────────────┼──► ai/NoiseBus ──► enemy hearing check ──► alert level
thrown item impact ─────┤     (position,          (per archetype       │
proximity voice ────────┤      radius,             hearing config)     ▼
item drop ──────────────┘      loudness)                        enemy FSM transition
```

Emitters declare `{ radius, loudness }` in `config/player.json → noise` or
`config/items.json`. The enemy's `hearing` block in `config/enemy.json` decides what
gets through. Every peer emits its own noise and broadcasts it; the host feeds all
of it into the one bus its enemy listens to. Events live for a single tick. Propagation is **distance only** — walls and doors do not muffle sound
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
| Add a whole map | `art/packs/<new>/` + `config/maps.json` — [`art/ART_PACK_CHECKLIST.md`](art/ART_PACK_CHECKLIST.md) |
| Restyle a door / chest / enemy | `art/shared/` — [`art/SHARED_ART.md`](art/SHARED_ART.md) |
| Add an item | `config/items.json` + a behaviour in `src/entities/items/behaviours/` + art in `art/shared/props/items/` + locale keys |
| Change how the maze is built | `src/world/generation.ts` — [`systems/GENERATION.md`](systems/GENERATION.md) |
| Change enemy behaviour | `src/ai/` — [`systems/AI.md`](systems/AI.md) |
| Change the lobby cabin's look | `art/shared/lobby/` — review it with `/tools/roomshot.html?map=lobby` |
| Change what the lobby *does* | `src/game/Lobby.ts` + `src/world/lobbyScene.ts` |
| Add a menu / screen | `src/ui/screens/` — [`systems/UI.md`](systems/UI.md) |
| Add a HUD element | `src/ui/hud/` + `config/ui.json → hud` |
| Change net sync | `src/net/` + `src/shared/messages.ts` — [`systems/NETWORKING.md`](systems/NETWORKING.md) |
| Add a sound | `config/audio.json → sounds` + a recipe in `src/audio/recipes.ts` or a file in `assets/audio/` + trigger from logic — [`systems/AUDIO_VOICE.md`](systems/AUDIO_VOICE.md) |
| Replace a sound with a real recording | Drop the file in `assets/audio/` — [`assets/audio/README.md`](../assets/audio/README.md) |
| Add a difficulty | `config/difficulty.json` only |
| Add a save field | `src/save/index.ts` (a real schema lands with step 35) |

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
| Gameplay feedback (alert wash, heartbeat, damage flash, health vignette) | **A DOM compositing layer** (`src/render/feedback.ts`), not an `EffectComposer` post stack | Every effect the design asks for is a full-screen blend. A DOM layer costs no render targets and no extra passes, and there is no *general* post-processing stack to justify one (see "Deliberately NOT built"). `render/` still owns it. If an effect ever needs the depth buffer, that is the moment to introduce a composer. |
| Pathfinding | **A\* over the room graph + per-room waypoints** | The world is already a graph of rooms; hierarchical pathing on it is cheaper and more controllable than a navmesh, and makes "search a nearby room" trivial to express. |
| State sync | **Seed + snapshots**, not full world replication | The map is a pure function of `(mapId, seed)`, so only entity state crosses the wire. |
| Persistence | **`localStorage`**, adapter-swapped for OS save dir when packaged | No backwards-compat requirement yet; the adapter seam is what matters. |

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
| **Post-processing beyond gameplay feedback** | Only the effects the design calls for exist (alert state, heartbeat proximity, damage). No general bloom/grain/aberration stack. |
| **Accessibility settings** (UI scale, reduce flashing, colourblind modes) | UI sizes derive from one base; effects are driven through a single feedback module. |
| **Config-mismatch detection between peers** | Peers ship `(mapId, seed)` and are assumed to share a build. Hashing config is additive. |
| **Reconnecting after a disconnect** | A dropped player is marked `disconnected` and the run continues. |
| **Host migration** | If the host drops, the run ends. `net.json → hostMigration.enabled` marks the seam. |
| **Anti-cheat** | A host-authoritative P2P game trusts the host. Fine for co-op with friends. |
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
