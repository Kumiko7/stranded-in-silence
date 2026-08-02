# Build Plan

Each step is sized for **one working session**. They are ordered so the game is
playable as early as possible: single-player core first, multiplayer second, content
and polish third.

**To work on this:** say *"do step 7"* or *"change step 4 so the fog is thicker"*.
Update this file at the end of every step — tick the box, set the status, and note
anything that changed about the design.

**Scope discipline:** build what the step says and nothing more. Check
[`ARCHITECTURE.md`](ARCHITECTURE.md) → "Deliberately NOT built" before adding
anything that was not asked for.

**Status key:** ☐ not started · ◐ partially done · ☑ done

---

## Where it is right now — Slice 1: a walkable map

A deliberately minimal vertical slice through the whole architecture is **playable**:

- Main menu with a lobby code, copy button, join field and start
- Multiplayer over PeerJS (public signalling), star topology, host relays
- No lobby — Start drops you straight into a run; joining does the same
- A 6×6 maze generated from the **test art pack**, doors matched between neighbours
- First-person movement with collision, sprint and crouch
- `E` opens and closes doors — the only interaction
- Hold `E` on the exit door to escape, then back to the main menu

Deliberately not in it yet: enemy, locked doors, keys, chests, lockers, items,
voice chat, lobby, audio.

Because it is a slice rather than a sequence of finished steps, several steps below
are `◐` — the part this slice needed is done, the rest is not. Each one lists what
is still missing.

---

## Phase 0 — Foundation

### ☑ 1. Project scaffold
**Goal:** repo, folder structure, build pipeline, docs, a page that boots.
**Touches:** `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/core/`, `src/main.ts`, `src/ui/ui.css`, all of `config/`, all of `docs/`.
**Done when:** `npm run dev` renders a placeholder scene with no console errors; `npm run typecheck` passes; repo pushed to GitHub.
**Status:** done. Config files and locale file are written but not yet *loaded* — that is step 2.

### ◐ 2. Config + localisation systems
**Goal:** make `config/` and `config/locales/` actually drive the game.
**Touches:** `src/config/{index,types,load,merge,validate}.ts`, `src/i18n/`, `src/save/` (stub).
**Details:** deep-merge layering (base → map → difficulty → save profile), `$doc`/`$note` key stripping, boot-time validation with readable errors, `t()` with `{placeholder}` substitution and safe fallback. Keep the merge generic so further overlay layers slot in later, but add only these.
**Done when:** `t('game.title')` renders the title from `en.json`, and changing a value in `config/graphics.json` visibly changes the running dev build.
**Still missing:** difficulty overlay, save-profile layer, `validate.ts`, locale switching UI.

### ◐ 3. Core engine services
**Goal:** the plumbing every later step assumes.
**Touches:** `src/core/{rng,services,gameState,time}.ts`, `src/shared/events.ts`.
**Details:** seeded RNG with named sub-streams (`splitmix32`/`xoroshiro`), service registry, game state machine (`Boot → MainMenu → Lobby → Loading → InRun → Scoreboard`), typed event catalogue. `Loop` and `EventBus` already exist from step 1.
**Done when:** state transitions are driven by events and logged; RNG produces identical sequences for identical seeds.
**Still missing:** the game state machine is ad-hoc in `main.tsx`; `EventBus` exists but nothing uses it; no service registry. Seeded RNG with named streams is done.

### ◐ 4. Renderer + lighting rig
**Goal:** the horror look, fully config-driven.
**Touches:** `src/render/{Renderer,cameraRig,lighting,postfx,materialCache}.ts`.
**Details:** WebGLRenderer + tone mapping + fog + ambient from `config/graphics.json`; the `minAmbientFloor` guarantee; a minimal effect layer carrying **only** the gameplay feedback the design calls for (enemy alert state, heartbeat proximity, damage flash, injured/downed vignette). No flashlight, no quality tiers, no general post stack — see [`ARCHITECTURE.md`](ARCHITECTURE.md) "Deliberately NOT built".
**Done when:** the scene is dark but navigable on room lighting alone, with no player-held light.
**Still missing:** the gameplay-feedback effect layer (alert state, heartbeat, damage flash). Renderer, ambient/fog from config, nearest-N light activation and distance culling are done. Light values in config are real three.js units — the renderer applies no hidden scaling.

### ◐ 5. Input system
**Goal:** raw devices → action ids, rebindable.
**Touches:** `src/input/{index,bindings,pointerLock,actionState}.ts`.
**Details:** load defaults from `config/input.json`, overlay save-profile rebinds, `isDown/justPressed/holdProgress` per action, pointer lock lifecycle, `labelFor(action)` for HUD prompts, mouse buttons as bindable keys.
**Done when:** every action in `input.json` reports correctly, and rebinding one at runtime takes effect immediately.
**Still missing:** runtime rebinding and its persistence. Action mapping, pointer lock, `labelFor()` and consume-on-read edge/look state are done.

### ◐ 6. UI shell + main menu
**Goal:** the game has a front end.
**Touches:** `src/ui/{ScreenManager.ts,theme.ts,components/}`, `src/ui/screens/{MainMenu,Options,Credits}.tsx`.
**Details:** Preact mount into `#screen-root`, theme from `config/ui.json` → CSS vars, reusable Button/Slider/Select/Tabs/Modal components with keyboard nav and focus states, main menu over the 3D backdrop. Options tabs can be stubs beyond Graphics/Audio.
**Done when:** menus navigate by keyboard and mouse, look like a game, and all text comes from `en.json`.
**Still missing:** Options and Credits screens, a reusable component set, and full keyboard navigation. Main menu, pause and escaped overlays plus the minimal HUD are done.

---

## Phase 1 — Single-player core

*The game becomes playable solo. Multiplayer is layered on afterwards, which is why
the simulation is written host-authoritative from the start.*

### ☑ 7. Art contract + collision
**Goal:** the types that make art swappable, plus the physics.
**Touches:** `art/lib/contract.ts`, `art/lib/{geometry,textures,greeble}.ts`, `src/world/{collision,grid}.ts`.
**Details:** `RoomBlueprint`, `RoomBuildContext`, `BuiltRoom`, `ArtPack`, `Collider`, anchor kinds — exactly as specified in [`art/ROOM_FORMAT.md`](art/ROOM_FORMAT.md). 2D circle-vs-box/circle resolution with sliding, broadphase over the room grid.
**Done when:** a hand-written test room compiles against the contract and a debug capsule slides along its walls.
**Note:** world dimensions reach art through `ctx.dims`, so art imports nothing but `three` and the contract — not even config.

### ◐ 8. Test art pack + art validation
**Goal:** a functional pack so world systems can be built and tested before real art exists.
**Touches:** `art/packs/test/`, `art/shared/`, `scripts/validateArt.ts`, `npm run validate:art`.
**Details:** kit shell that cuts door openings; plain rooms with full anchor sets; validator checking the [`ROOM_FORMAT.md §8`](art/ROOM_FORMAT.md#8-authoring-checklist) checklist.
**Still missing:** the validator script. The pack exists with 8 blueprints (empty, pillars, crates, table, shelves, and one dead-end closet per side), shared door/exit-door/player art, and a shell that cuts openings correctly on all four sides.

### ◐ 9. Map generation
**Goal:** the maze.
**Touches:** `src/world/generation/{index,slots,connect,assign,lock,contents,validate}.ts`.
**Details:** the full pipeline in [`systems/GENERATION.md`](systems/GENERATION.md) — 1×1 slots, spanning tree + loops, blueprint assignment by door mask, spawn/exit placement, locked doors + key placement in the still-reachable region, content rolls, validation and re-roll.
**Done when:** the same seed always produces the same map; 500 generated maps all pass validation; a debug top-down view renders the layout.
**Still missing:** locked doors, key placement, room contents, the validation/re-roll pass, and the debug map view. Spanning-tree-plus-loops connection, blueprint assignment by door-mask superset, spawn/exit placement and per-seed determinism are done and verified across peers.

### ◐ 10. Room streaming + world assembly
**Goal:** turn a `RunLayout` into a walkable 3D world.
**Touches:** `src/world/{worldBuilder,roomStreaming}.ts`, `src/render/streaming.ts`.
**Details:** build art per room on demand within `renderDistanceRooms`, dispose beyond it, place shared art at anchors, register colliders.
**Done when:** you can fly a debug camera through a generated map with rooms loading and unloading cleanly.
**Still missing:** actual streaming — all 36 rooms are built up front and only *hidden* beyond `renderDistanceRooms`. Fine at this size; revisit if room cost grows.

### ☑ 11. Player controller
**Goal:** first-person movement that feels right.
**Touches:** `src/entities/player/{controller,movement,camera}.ts`.
**Details:** WASD + mouse look, walk/sprint/crouch with `player.json` speeds and accelerations, crouch height lerp, head bob, collision + sliding, footstep timing. Speed is uniform in every direction — no backpedal or strafe penalty. No stamina; sprinting costs noise only. Written as a pure `(state, input, dt) → state` step so prediction reuses it verbatim in step 25.
**Done when:** you can walk a generated map and the movement feels good with only config changes.

### ☑ 12. Interaction system
**Goal:** `E` does things.
**Touches:** `src/entities/interaction/{raycast,interactable,holdProgress}.ts`, `src/ui/hud/interactPrompt.ts`.
**Details:** forward sphere-cast, `Interactable` interface (`canInteract`, `verbKey`, `mode: press|hold`, `holdSeconds`, `onComplete`), hold progress with the look-away grace from `player.json → interaction`, prompt HUD.
**Done when:** looking at a test object shows a localised prompt and holding E fills a ring and fires.
**Note:** the interaction ray is cast during the sim step, so the camera matrix is updated explicitly before casting — otherwise it would use the previous frame's transform.

### ◐ 13. Doors
**Goal:** the game's core tactical object.
**Touches:** `src/entities/door.ts`, `art/shared/props/door.ts`, `art/shared/props/exitDoor.ts`.
**Details:** open/close on press, swing animation via the `hinge` part, locked state + `lockIndicator`, noise emission on open/slam, collider toggling, exit door with glow and hold-to-escape.
**Done when:** doors open, close, block movement when closed, and refuse to open when locked.
**Still missing:** locked state, noise emission. Open/close with swing animation, collider toggling at half-swing, the exit door with glow and hold-to-escape, and network-synced door state are done.

### ☐ 14. Chests, lockers and items
**Goal:** loot and hiding.
**Touches:** `src/entities/{chest,locker,item,inventory}.ts`, `art/shared/props/{chest,locker,items/}.ts`.
**Details:** hold-to-open chest for `world.json → containers.chestOpenHoldSeconds` (loud, drives the `lid` part), locker enter/exit timings from the same block with the camera moving to `insideAnchor`, two-slot inventory with drop-on-replace, pickup/drop, item attachment to `handLeft`/`handRight`.
**Done when:** you can open a chest, take a key, carry two items, and hide in a locker.

### ☐ 15. Keys, locked doors and the exit
**Goal:** the run is completable.
**Touches:** `src/entities/items/behaviours/unlock.ts`, `src/world/runState.ts`.
**Details:** key item unlocks a door and is consumed, exit door hold completes the run, win/lose evaluation per [`GAMEPLAY.md §6`](GAMEPLAY.md).
**Done when:** you can play a full solo run from spawn to escape.

### ☐ 16. Noise bus
**Goal:** the spine described in [`ARCHITECTURE.md §8`](ARCHITECTURE.md).
**Touches:** `src/ai/noiseBus.ts`, emitters across `src/entities/`.
**Details:** `{ position, radius, loudness, kind, sourceId }` events from footsteps, doors, chests, item drops, later voice. Debug visualiser.
**Done when:** a debug overlay shows noise pulses with correct radii from every emitter.

### ☐ 17. Enemy: navigation and patrol
**Goal:** something walks the map.
**Touches:** `src/ai/{navigation,roomGraph,pathfinding}.ts`, `src/ai/states/patrol.ts`, `art/shared/characters/ghost.ts`.
**Details:** room-graph A\* with door costs, within-room steering between `patrolPoint` anchors, unvisited-room weighting, door opening delays.
**Done when:** the ghost roams a full map without getting stuck, preferring rooms it has not recently visited.

### ☐ 18. Enemy: perception
**Goal:** it notices you.
**Touches:** `src/ai/perception/{sight,hearing}.ts`.
**Details:** sight cone + LOS raycast + acquire/lose timers + crouch and darkness modifiers; hearing against the noise bus with door attenuation and position jitter, per [`systems/AI.md`](systems/AI.md).
**Done when:** a debug overlay shows the sight cone and heard-noise markers, and both respect their config values.

### ☐ 19. Enemy: chase, search, attack
**Goal:** the full state machine.
**Touches:** `src/ai/states/{investigate,search,chase,attack}.ts`, `src/ai/enemy.ts`.
**Details:** the FSM in [`systems/AI.md`](systems/AI.md), including locker searching, the post-attack slowdown window, and ignoring downed players.
**Done when:** it hunts you, loses you, searches convincingly, and returns to patrol.

### ☐ 20. Health, downing and revive
**Goal:** stakes.
**Touches:** `src/entities/player/health.ts`, `src/world/runState.ts`.
**Details:** healthy → injured → downed ladder, injured speed/noise penalties, downed immobility, hold-E revive to injured, give-up → dead, invulnerability windows, lose condition.
**Done when:** the enemy can injure and down you, and a second (debug) player can revive you.

### ☐ 21. Horror feedback layer
**Goal:** the player always knows how much trouble they are in.
**Touches:** `src/render/postfx/effects.ts`, `art/shared/vfx/`, `src/audio/` hooks.
**Details:** distinct visuals for patrolling / alerted / chasing, heartbeat + distortion ramping between `effects.heartbeatStartDistance` and `heartbeatMaxDistance`, damage flash, injured and downed vignettes. Keep it to exactly these — no general post-processing stack.
**Done when:** each alert level and proximity band is unmistakable without reading any text.

### ☐ 22. HUD
**Goal:** the in-game interface.
**Touches:** `src/ui/hud/*`.
**Details:** every element in [`systems/UI.md`](systems/UI.md) — crosshair, hand slots, health vignette, teammate list, voice indicator, objective hints. Plain DOM, config-toggleable.
**Done when:** all elements update correctly and each can be disabled from `config/ui.json`.

**Milestone: a complete single-player run is playable end to end.**

---

## Phase 2 — Multiplayer

### ◐ 23. Signalling server + lobby codes
**Goal:** players can find each other.
**Touches:** `src/server/{index,rooms,codes}.ts`, `src/shared/messages.ts`, `npm run signal`.
**Details:** `ws` server, 6-digit code allocation from `game.json → session`, code expiry, SDP/ICE relay. No game state.
**Done when:** two browser tabs exchange a code and complete a WebRTC handshake.
**Still missing:** our own server. Slice 1 uses **PeerJS's public signalling server** with codes as namespaced peer ids — verified working between two tabs. Self-hosting removes the third-party dependency and is where Steam lobbies plug in.

### ◐ 24. Peer mesh + transport
**Goal:** reliable plumbing between peers.
**Touches:** `src/net/{peerMesh,channels,transport,serialization}.ts`.
**Details:** full mesh `RTCPeerConnection`s, the two data channels from `config/net.json → channels`, connection lifecycle and error surfaces, compact binary snapshot encoding.
**Done when:** 4 tabs connect, exchange heartbeats, and disconnects are detected and reported.
**Still missing:** full mesh (slice 1 is a **star** with the host relaying), the separate unreliable state channel, and binary encoding — messages are JSON on one reliable channel. Connect/join/leave and peer tracking work.

### ◐ 25. Host-authoritative simulation + prediction
**Goal:** everyone sees the same world.
**Touches:** `src/net/{host,client,prediction,reconciliation,interpolation}.ts`.
**Details:** input frames up, snapshots down, client prediction reusing the step-11 movement function, reconciliation thresholds, interpolation delay, `(mapId, seed)` run start.
**Done when:** four players walk around one generated map with smooth remote motion under simulated 100 ms latency.
**Still missing:** all of the authority. Slice 1 broadcasts each player's own transform and interpolates remotes — there is no authoritative sim, no input frames, no reconciliation. The host owns only the run seed. `stepPlayer()` is already a pure `(state, input, dt)` function so prediction can reuse it verbatim.

### ☐ 26. Networked world interactions
**Goal:** doors, chests, items and the exit work for everyone.
**Touches:** `src/net/replication/`, entity modules from steps 13–15.
**Details:** host-decided interaction results on the `events` channel, optimistic local feedback, item ownership and hand slots, exit progress.
**Done when:** two players cannot dupe an item, and door state is consistent for all four.

### ☐ 27. Networked enemy and run state
**Goal:** the hunter is shared.
**Touches:** `src/net/replication/enemy.ts`, `src/world/runState.ts`.
**Details:** AI on host only, enemy transform + alert level in snapshots, networked injure/down/revive/escape, win and lose resolution, disconnect handling per [`systems/NETWORKING.md`](systems/NETWORKING.md).
**Done when:** a full 4-player run resolves correctly in win, wipe and partial-escape cases.

### ☐ 28. Proximity voice chat
**Goal:** the reason the game works.
**Touches:** `src/voice/{capture,peerAudio,attenuation,modes,vad}.ts`, pause-menu control.
**Details:** mic capture, per-peer tracks and gain nodes, **distance-only** attenuation (walls and doors never muffle voice), off / open-mic / push-to-talk switched by one control, voice as a noise emitter, spectator channel separation.
**Done when:** four players hear each other positionally, all three modes work, and the enemy reacts to speech only at close range.

### ☐ 29. Lobby scene and flow
**Goal:** the pre-run experience.
**Touches:** `art/shared/lobby/`, `src/ui/screens/{Lobby,Join}.tsx`, `src/world/lobbyScene.ts`.
**Details:** 3D lobby room with the poster wall (hold E on a poster to vote), player list, ready states, `autoStartSeconds` / `allReadyStartSeconds` countdown, join-by-code screen, host/join from the main menu.
**Done when:** four players join by code, vote on a poster, and the run starts on the countdown.

**Milestone: the game is fully multiplayer.**

---

## Phase 3 — Content and polish

### ☐ 30. Mansion art pack I — kit, materials and 5 rooms
**Touches:** `art/packs/mansion/{pack,materials,kit/}`, 5 rooms.
**Done when:** the mansion kit cuts doors correctly and 5 rooms pass validation and look properly haunted.

### ☐ 31. Mansion art pack II — 5 more rooms
### ☐ 32. Mansion art pack III — 5+ more rooms, plus the poster
**Done when:** ≥ 15 mansion rooms exist, meeting [`art/ART_PACK_CHECKLIST.md`](art/ART_PACK_CHECKLIST.md).

### ☐ 33. Themed shared art
**Touches:** `art/shared/{characters,props}/`, mansion overrides.
**Details:** masked-human player, refined ghost, mansion door/chest/locker variants, item models.
**Done when:** nothing in a run still looks like greybox.

### ☐ 34. Audio system + first sound pass
**Touches:** `src/audio/`, `assets/audio/`.
**Details:** buses, distance-based spatial SFX (no occlusion), music/ambience crossfade, the registry in `config/audio.json` wired to real files.
**Done when:** footsteps, doors, chests, the enemy and UI all make appropriate positional sound.

### ☐ 35. Save system + full options menus
**Touches:** `src/save/`, `src/ui/screens/Options.tsx`, `src/ui/screens/Controls.tsx`.
**Details:** `localStorage` adapter behind an interface, options for graphics/audio/gameplay/voice, full key rebinding with conflict display, language selector, `npm run validate:locales`. Graphics options write individual `graphics.json` values — no quality presets.
**Done when:** every setting persists across reloads and reset-to-defaults works.

### ☐ 36. Scoreboard
**Touches:** `src/ui/screens/Scoreboard.tsx`, `src/world/runStats.ts`.
**Details:** track the categories in `game.json → scoring`, per-player rows, green ring on the best value per category.
**Done when:** a finished run shows accurate stats for all players.

### ☐ 37. Item roster
**Touches:** `src/entities/items/behaviours/`, `art/shared/props/items/`.
**Details:** medicine, brick, coin, flare charge, barricade, tar flask, cracked lens, tremor box — all already specified in `config/items.json`.
**Done when:** every item works, is throwable/usable per its config, and affects the enemy as documented.

### ☐ 38. Difficulty modes
**Touches:** `src/config/` overlay application, lobby UI.
**Details:** apply `config/difficulty.json` overlays at run start; select in the lobby.
**Done when:** all four modes measurably change enemy behaviour with no code changes beyond the selector.

---

## Phase 4 — Extras

*Ordered by value, not dependency. Pick freely.*

### ☐ 39. Spectating after escape or death
### ☐ 40. Traps — floor and ceiling, noise and hold
### ☐ 41. Treasure, currency and run rewards
### ☐ 42. Metaprogression — lobby shop, XP, levels
### ☐ 43. Player cosmetics
### ☐ 44. Multi-cell rooms — 1×2, 2×2, L footprints
### ☐ 45. Second art pack — prison theme, 15+ rooms
### ☐ 46. Lobby trophies and minigames
### ☐ 47. Lore, notes and collectables
### ☐ 48. Second enemy archetype
### ☐ 49. Host migration
### ☐ 50. Reconnect after disconnect (+ config-mismatch detection between peers)
### ☐ 51. Accessibility settings — UI scale, reduce flashing, colourblind modes
### ☐ 52. Graphics quality presets (as a merge layer over `graphics.json`)
### ☐ 53. Electron packaging + OS save directory
### ☐ 54. Steam integration — lobbies, friends, achievements
### ☐ 55. Vertical maps — stacked rooms and stairs *(largest architectural change; deliberately last)*

> Nothing in Phase 4 may be built speculatively while working an earlier step. See
> [`ARCHITECTURE.md`](ARCHITECTURE.md) → "Deliberately NOT built".

---

## Change log

| Date | Change |
| --- | --- |
| 2026-08-02 | Plan created. Step 1 complete. |
| 2026-08-02 | Scope trim to match the original spec: removed the player flashlight, stamina, sound/voice occlusion, backpedal and strafe penalties, graphics quality tiers, the general post-processing stack, accessibility settings, peer config-hash checking and reconnect grace. Added `world.json → containers` hold timings for chests and lockers. |
| 2026-08-02 | **Slice 1 playable**: menu with lobby code / join / start, PeerJS multiplayer, generated 6×6 map from the test art pack, first-person movement with collision, door interaction, exit-door escape. Steps 7, 11, 12 done; 2–6, 8–10, 13, 23–25 partially. Signalling server deferred to step 23 (PeerJS public server for now), so `ws`/`tsx`/`concurrently` deps and the `signal` scripts were removed. |
