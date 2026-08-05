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

## Where it is right now — Slice 3: the hunter

Slice 1 gave a walkable, multiplayer, procedurally generated map. Slice 2 made a
run something you have to *solve*. Slice 3 makes it something you can lose:

- **The noise bus** — footsteps, doors, slams, chests, lockers and drops all emit
  into one bus, distance-only, one tick long. Every peer emits, the host listens.
- **The ghost** — patrols by staleness, investigates noise, sweeps rooms, opens
  lockers, chases on sight and attacks. Waits `doors.openSeconds` at every closed
  door and cannot pass a locked one at all: doors are the whole tactical layer.
- **Injury** — healthy → injured → downed, injured is slower and much louder,
  downed is immobile, hold `E` on a teammate to revive them to injured.
- **The warning layer** — the ghost burns a different colour per alert level and
  carries that light with it; the screen answers with an edge wash, a heartbeat
  that ramps with proximity, a damage flash and health vignettes.
- **Wipe** — everyone down ends the run.
- Enemy transform, alert level, noise, hits, health and revives replicated.

- **Sound** (step 34) — the whole game is audible: every effect synthesised in
  Tone.js, positional, and a generative score that tightens as the hunter closes.
- **Voice** (step 28) — proximity chat over a true peer mesh, generous to players
  (22 m) and stingy to the hunter (an adjacent room, and only if you are properly
  loud). Off / open mic / push-to-talk on one control, per-teammate mutes, and a
  microphone on the roster line of whoever is talking. Solo runs never open a mic.

- **The lobby** (step 29) — a log cabin between runs: a wall of map posters you press
  `E` on to pick, a difficulty lever, a wardrobe, a fire and a window onto a mountain
  range. Solo starts at once; in company a countdown opens on the first pick and
  shortens once everyone has chosen. Voice follows the *session*, so it survives the
  load into a map.

- **The run report** (step 36) — a card per player, their body on top and what they
  did with the run underneath: doors opened, items used, people patched up, gold
  collected and how much noise they made getting it. Green ring on the best in each.
- **Options** (step 35) — the basics, persisted: sensitivity, invert Y, field of view,
  brightness, shadows and five volume sliders, over a save profile with a real schema.

Still missing: key rebinding and a language selector.

Because these are slices rather than a sequence of finished steps, several steps
below are `◐` — the part the slice needed is done, the rest is not. Each one lists
what is still missing.

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

### ☑ 4. Renderer + lighting rig
**Goal:** the horror look, fully config-driven.
**Touches:** `src/render/{Renderer,cameraRig,lighting,postfx,materialCache}.ts`.
**Details:** WebGLRenderer + tone mapping + fog + ambient from `config/graphics.json`; the `minAmbientFloor` guarantee; a minimal effect layer carrying **only** the gameplay feedback the design calls for (enemy alert state, heartbeat proximity, damage flash, injured/downed vignette). No flashlight, no quality tiers, no general post stack — see [`ARCHITECTURE.md`](ARCHITECTURE.md) "Deliberately NOT built".
**Done when:** the scene is dark but navigable on room lighting alone, with no player-held light.
**Still missing:** nothing for now. Renderer, ambient/fog from config, nearest-N light activation, distance culling and the gameplay-feedback layer (`renderer.feedback`, step 21) are done. Light values in config are real three.js units — the renderer applies no hidden scaling.

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

### ☑ 8. Test art pack + art validation
**Goal:** a functional pack so world systems can be built and tested before real art exists.
**Touches:** `art/packs/test/`, `art/shared/`, `scripts/validateArt.mjs`, `npm run validate:art`.
**Details:** kit shell that cuts door openings; plain rooms with full anchor sets; validator checking the [`ROOM_FORMAT.md §8`](art/ROOM_FORMAT.md#8-authoring-checklist) checklist.
**Done when:** the pack exists with 8 blueprints (empty, pillars, crates, table, shelves, and one dead-end closet per side), shared door/exit-door/player art, a shell that cuts openings correctly on all four sides, and `npm run validate:art` passes.
**Note:** the validator builds every room of every pack headless in Node (through Vite's SSR loader, so aliases and TypeScript resolve as in the game), once per legal door combination and per seed. Beyond the authoring checklist it flood-fills each room at the player's radius to prove **no combination of doors can strand anyone**, checks doors are respected, checks anchors are reachable and not stacked, and re-checks determinism. Budgets are warnings; the light budget is an error. The `test` pack is exempt from the pack-completeness counts — it is scaffolding, not a map.

### ◐ 9. Map generation
**Goal:** the maze.
**Touches:** `src/world/generation.ts`, `scripts/validateGeneration.mjs`, `npm run validate:gen`.
**Details:** the full pipeline in [`systems/GENERATION.md`](systems/GENERATION.md) — slot packing (1×1 plus multi-cell footprints, one of each per map), spanning tree + loops over slots, blueprint assignment by door mask **at any 90° rotation**, spawn/exit placement, locked doors + key placement in the still-reachable region, content rolls, validation and re-roll.
**Done when:** the same seed always produces the same map; 500 generated maps all pass validation; a debug top-down view renders the layout.
**Still missing:** the debug top-down map view. Everything else is in: `npm run validate:gen` generates every enabled map over hundreds of seeds and asserts determinism, cell ownership, footprint-vs-rotation, openings landing on real doors, full connectivity, greedy-key-hunt solvability, an unlocked enemy path, and the multi-cell caps. Solvability is structural (see [`systems/GENERATION.md`](systems/GENERATION.md) → "Locks and keys"); the script proves it rather than assuming it.
**Note:** the validator re-derives the rotation maths instead of importing it, so breaking rotation in `generation.ts` makes the two disagree. Four deliberate mutations (identity `rotateSide`, identity `rotateCell`, unrotated anchors, ignored `maxSlots`) were each caught.

### ◐ 10. Room streaming + world assembly
**Goal:** turn a `RunLayout` into a walkable 3D world.
**Touches:** `src/world/{worldBuilder,roomStreaming}.ts`, `src/render/streaming.ts`.
**Details:** build art per room on demand within `renderDistanceRooms`, dispose beyond it, place shared art at anchors, register colliders.
**Done when:** you can fly a debug camera through a generated map with rooms loading and unloading cleanly.
**Still missing:** actual streaming — all 36 rooms are built up front and only *hidden* beyond `renderDistanceRooms`. Fine at this size; revisit if room cost grows.

### ☑ 11. Player controller
**Goal:** first-person movement that feels right.
**Touches:** `src/entities/player/{controller,movement,camera}.ts`.
**Details:** WASD + mouse look, walk/sprint/crouch with `player.json` speeds and accelerations, crouch height lerp, collision + sliding, footstep timing. Speed is uniform in every direction — no backpedal or strafe penalty. No stamina; sprinting costs noise only. Written as a pure `(state, input, dt) → state` step so prediction reuses it verbatim in step 25.
**Done when:** you can walk a generated map and the movement feels good with only config changes.

### ☑ 12. Interaction system
**Goal:** `E` does things.
**Touches:** `src/entities/interaction/{raycast,interactable,holdProgress}.ts`, `src/ui/hud/interactPrompt.ts`.
**Details:** forward sphere-cast, `Interactable` interface (`canInteract`, `verbKey`, `mode: press|hold`, `holdSeconds`, `onComplete`), hold progress with the look-away grace from `player.json → interaction`, prompt HUD.
**Done when:** looking at a test object shows a localised prompt and holding E fills a ring and fires.
**Note:** the interaction ray is cast during the sim step, so the camera matrix is updated explicitly before casting — otherwise it would use the previous frame's transform.

### ◐ 13. Doors
**Goal:** the game's core tactical object.
**Touches:** `src/world/doors.ts`, `art/shared/props/door.ts`.
**Details:** open/close on press, swing animation via the `hinge` part, locked state + `lockIndicator`, noise emission on open/slam, collider toggling, exit door with glow and hold-to-escape.
**Done when:** doors open, close, block movement when closed, and refuse to open when locked.
**Still missing:** noise emission (step 16). Open/close with swing animation, collider toggling at half-swing, locked state with the `lockIndicator` part, the exit door with glow and hold-to-escape, and network-synced door state are done.

### ◐ 14. Chests, lockers and items
**Goal:** loot and hiding.
**Touches:** `src/world/containers.ts`, `src/entities/items.ts`, `art/shared/props/{chest,locker,items/key}.ts`.
**Details:** hold-to-open chest for `world.json → containers.chestOpenHoldSeconds` (loud, drives the `lid` part), locker enter/exit timings from the same block with the camera moving to `insideAnchor`, two-slot inventory with drop-on-replace, pickup/drop, item attachment to `handLeft`/`handRight`.
**Done when:** you can open a chest, take a key, carry two items, and hide in a locker.
**Still missing:** held items are not yet attached to the `handLeft`/`handRight` sockets — carrying shows in the HUD only, and nothing renders in first person or on a remote player. Chests, lockers, pickup/drop and the two-slot inventory are done.

### ◐ 15. Keys, locked doors and the exit
**Goal:** the run is completable.
**Touches:** `src/world/generation.ts`, `src/game/Game.ts`.
**Details:** key item unlocks a door and is consumed, exit door hold completes the run, win/lose evaluation per [`GAMEPLAY.md §6`](GAMEPLAY.md).
**Done when:** you can play a full solo run from spawn to escape.
**Still missing:** nothing. A full solo run from spawn through two locked doors to the exit is playable, `src/world/runState.ts` resolves escape and wipe, and the run report landed with step 36.

### ◐ 16. Noise bus
**Goal:** the spine described in [`ARCHITECTURE.md §8`](ARCHITECTURE.md).
**Touches:** `src/ai/noiseBus.ts`, emitters in `src/game/Game.ts`.
**Details:** `{ x, z, radius, loudness, kind, sourceId }` events from footsteps, doors, slams, chests, lockers and item drops, all replicated so the host hears every peer. Events live one tick.
**Still missing:** thrown items (step 37) and the debug visualiser. Emitters (voice included, step 28), the bus, config lookup and replication are done.

### ☑ 17. Enemy: navigation and patrol
**Goal:** something walks the map.
**Touches:** `src/ai/{roomGraph,enemy}.ts`, `art/shared/characters/ghost.ts`, `src/world/generation.ts`.
**Details:** room-graph A\* with door-time costs and locked doors as `Infinity`; routes expand to `door → room centre → … → finish`; patrol rooms weighted by staleness; doors cost real standing-still time.
**Done when:** the ghost roams a full map without getting stuck, preferring rooms it has not recently visited. *Verified: 20 s of patrol crossed four rooms through two closed doors with no stuck ticks.*

### ☑ 18. Enemy: perception
**Goal:** it notices you.
**Touches:** `src/ai/perception.ts`, `src/world/collision.ts` (`segmentClear`).
**Details:** sight cone + sampled LOS + acquire/lose timers + crouch and darkness modifiers; hearing off the noise bus with position jitter. Darkness is "no room lamp within 0.6 cells" — the only lighting fact the sim has.
**Done when:** both senses respect their config values. *Verified: acquires on sight in under 2 s; a `chestOpen` 12 m away flips it to `investigate`.* The debug overlay for the cone is still missing.

### ☑ 19. Enemy: chase, search, attack
**Goal:** the full state machine.
**Touches:** `src/ai/enemy.ts`.
**Details:** the FSM in [`systems/AI.md`](systems/AI.md), including locker searching, the post-attack slowdown window, and ignoring downed players. States live in one file rather than `states/` — five small functions did not warrant five modules.
**Done when:** it hunts you, loses you, searches convincingly, and returns to patrol. *Verified end to end: patrol → investigate → search → patrol, and sight → chase → attack.*

### ◐ 20. Health, downing and revive
**Goal:** stakes.
**Touches:** `src/entities/health.ts`, `src/world/runState.ts`.
**Details:** healthy → injured → downed ladder, injured speed and noise penalties, downed immobility and camera drop, hold-E revive to injured, invulnerability windows, lose condition.
**Still missing:** give-up → dead → spectate (step 39). The ladder, penalties, revive, invulnerability and the wipe condition are done.

### ☑ 21. Horror feedback layer
**Goal:** the player always knows how much trouble they are in.
**Touches:** `src/render/feedback.ts`, `art/shared/characters/ghost.ts`.
**Details:** the ghost's own alert colour (eyes, halo and the light it carries) plus a screen layer: alert edge wash, heartbeat ramping between `effects.heartbeatStartDistance` and `heartbeatMaxDistance` with a lens push, damage flash, injured and downed vignettes.
**Note:** built as a DOM compositing layer, not a three.js post stack — see [`ARCHITECTURE.md §10`](ARCHITECTURE.md). Every effect the design asks for is a full-screen blend.
**Still missing:** nothing. The audio half landed with step 34 — the heartbeat, alert stings and score intensity all read `heartbeatCloseness()` from `render/feedback.ts`, so what you hear and what you see cannot drift apart.

### ◐ 22. HUD
**Goal:** the in-game interface.
**Touches:** `src/ui/hud/*`.
**Details:** every element in [`systems/UI.md`](systems/UI.md) — crosshair, hand slots, health vignette, teammate list, voice indicator, objective hints. Plain DOM, config-toggleable.
**Done when:** all elements update correctly and each can be disabled from `config/ui.json`.
**Still missing:** the remaining per-element `config/ui.json → hud` toggles, and the move of the rest of the HUD out of Preact into per-frame plain DOM. Crosshair, interact prompt with hold ring, hand slots, the objective hint and the player roster (hearts, noise rings and speaking microphones) render from `src/ui/App.tsx`; the health vignette is the feedback layer's (step 21); the voice pill is the first element written the way this step wants them all — plain DOM in `src/ui/hud/voiceIndicator.ts`, because its level meter moves every frame.

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

### ◐ 26. Networked world interactions
**Goal:** doors, chests, items and the exit work for everyone.
**Touches:** `src/net/replication/`, entity modules from steps 13–15.
**Details:** host-decided interaction results on the `events` channel, optimistic local feedback, item ownership and hand slots, exit progress.
**Done when:** two players cannot dupe an item, and door state is consistent for all four.
**Still missing:** all of the authority. Unlocks, chest openings and item pickup/drop are broadcast and trusted, exactly like doors — two players can still take the same item. Deterministic item ids (`item:x,y:i`, `chest:x,y:i:loot`, `drop:<peer>:<n>`) are in place, so adding host arbitration is a change of who decides, not of what is sent.

### ◐ 27. Networked enemy and run state
**Goal:** the hunter is shared.
**Touches:** `src/net/index.ts`, `src/world/runState.ts`.
**Details:** AI on host only, enemy transform + alert level replicated at `snapshotRateHz`, networked noise/injure/down/revive/escape, win and lose resolution.
**Still missing:** verification with real peers — the enemy, noise, hit, health, revive and wipe messages are implemented and typed but have only been exercised solo (offline counts as host). Disconnect handling beyond removing the peer from `RunState` is not built.

### ☑ 28. Proximity voice chat
**Goal:** the reason the game works.
**Touches:** `src/voice/{index,capture,peerAudio,attenuation,modes,vad}.ts`, `src/net/index.ts`, `src/ui/hud/voiceIndicator.ts`, `src/ui/screens/VoicePanel.tsx`, `config/net.json → voice`.
**Details:** mic capture, per-peer tracks and gain nodes, **distance-only** attenuation (walls and doors never muffle voice), off / open-mic / push-to-talk switched by one control, voice as a noise emitter, spectator channel separation.
**Done when:** four players hear each other positionally, all three modes work, and the enemy reacts to speech only at close range.
**Note:** voice is a **true mesh** over PeerJS media calls even though gameplay data is a star through the host — a call needs an id, not a data connection. The lower peer id dials and the higher answers, so each pair has exactly one bidirectional call. The outgoing track is a `MediaStreamAudioDestinationNode` created at boot and never renegotiated: every mode, mute and push-to-talk is a gain on it, so a denied microphone still sends a valid silent track and that player hears everyone normally.
**Note:** three thresholds off one meter — `voiceActivityThresholdDb` opens the mic, `noiseThresholdDb` (much higher) is what the *hunter* needs before it gets a noise event, `speakingThresholdDb` lights the HUD icon. That gap is what stops an open mic giving you away. The `PannerNode` does direction only (rolloff off); the distance law is `attenuation.ts` reading `net.json → voice`, so `hearingRange` means what it says.
**Note:** voice is off entirely in a **solo run** — the microphone is never requested and the HUD pill is hidden. `live` is recomputed from `net.players` each frame, so a peer joining mid-run turns it on.
**Verified:** a solo run asks for no microphone and shows no pill; attenuation is 1 inside 4 m and exactly 0 at 22 m; the mode cycle wraps and each mode gates correctly; the activity gate holds for its full hangover; a speaking player emits a `voice` noise every `noiseIntervalSeconds` (roster ring included) **and still does so while downed**; a denied microphone leaves the run fully playable. Four-peer audio itself has not been exercised — it needs real browsers with real microphones.

### ◐ 29. Lobby scene and flow
**Goal:** the pre-run experience.
**Touches:** `art/shared/lobby/`, `src/game/Lobby.ts`, `src/world/lobbyScene.ts`, `src/ui/screens/{LobbyPanel,Wardrobe}.tsx`, `src/save/index.ts`, `src/net/index.ts`, `config/{game,graphics,difficulty,player}.json`.
**Details:** a log cabin — poster wall, fireplace, panoramic window onto a snowfield and four ranges of mountains, difficulty lever, wardrobe, and a covered wall where the minigame goes. Press E on a poster to pick a map; solo starts at once, in company the first pick opens the `autoStartSeconds` countdown and it drops to `allReadyStartSeconds` once everyone has picked. Host-authoritative: it owns the tally, the difficulty and the clock, and publishes the whole lobby on every change. Finishing a run returns to the cabin.
**Still missing:** verification with real peers — the lobby has only been exercised solo and through a headless browser. The join-by-code UI is still the main menu's code box rather than a `Join` screen, and ready states are not built (picking a map *is* the ready signal, which made a separate one redundant).
**Note:** **voice now follows the session rather than the run.** The microphone opens on entering the cabin and stays open through the load into a map, so a conversation is never cut off at exactly the moment a team is agreeing on a plan. Peers announce which world they are standing in (`scene`), and each side hands `voice/` only the peers in the *same* world — `voice/` already treats a peer with no position as flat and fully audible, so nothing in `src/voice/` changed at all.
**Note:** `src/save/` exists now, deliberately tiny: escaped maps (for the tick on a poster) and the wardrobe colour. The real profile, schema and options are step 35.
**Note:** the lobby is reviewable like a room — `/tools/roomshot.html?map=lobby` — and `npm run validate:art` builds the cabin headless and proves every poster, the wardrobe and the lever are **reachable on foot** from all four arrival spots.
**Verified:** boots, enters the cabin, builds 20 poster frames at 226 draws / 42.6k tris on 6 lights, tears down to an empty scene and rebuilds identically, with no console errors.

**Milestone: the game is fully multiplayer.**

---

## Phase 3 — Content and polish

### ☑ 30. Mansion art pack I — kit, materials and 5 rooms
**Touches:** `art/packs/mansion/{pack,materials,textures,kit/}`, `art/lib/{merge,textures}.ts`.
**Done when:** the mansion kit cuts doors correctly and rooms pass validation and look properly haunted.
**Details:** procedural `DataTexture` surfaces (parquet, marble chequer, damask wallpaper, brick, ashlar, tile, walnut, portraits, stained glass); a shell with per-room floor/wall/ceiling/wainscot styles, trim, cornice and cut-in windows; `kit/props.ts` with ~30 reusable pieces. Geometry goes through `MeshBatcher`, which is what keeps a three-hundred-box room at ~20 draw calls.

### ☑ 31. Mansion art pack II — 5 more rooms
### ☑ 32. Mansion art pack III — 5+ more rooms, plus the poster
**Done when:** ≥ 15 mansion rooms exist, meeting [`art/ART_PACK_CHECKLIST.md`](art/ART_PACK_CHECKLIST.md).
**Details:** 23 blueprints — 19 of them 1x1 (foyer, library, dining, kitchen, conservatory, nursery, study, music room, bathroom, bedroom, chapel, boiler, wine cellar, trophy, billiards, clock room, laundry, séance parlour, and a one-door linen store per side) plus a 2x1 gallery, 2x2 ballroom, 1x3 stair hall and L-shaped attic. All pass `npm run validate:art`.
**Still missing:** nothing. `poster.mansion` landed with step 29, along with its contract in [`art/SHARED_ART.md`](art/SHARED_ART.md).
**Note:** rooms are reviewed on screenshots taken through the game's own renderer -
`tools/roomshot`, documented in [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md). The first
pass over the mansion fixed four things `npm run validate:art` cannot see: the
kitchen's pot rack standing on end, the chandelier shadowing the room it lights, the
laundry's sheets going black when backlit, and the `ribs` ceiling reading as blocks
floating under the plaster.
**Note:** the four multi-cell set pieces are live — `layout.multiCellRooms` is on with `maxSlots: 2`, and over 400 seeds the gallery lands in ~83 % of maps, the stair hall ~49 %, the ballroom ~46 % and the attic ~23 %. Rotation is in too, so the linen store is one blueprint rather than four.

### ☐ 33. Themed shared art
**Touches:** `art/shared/{characters,props}/`, mansion overrides.
**Details:** masked-human player, refined ghost, mansion door/chest/locker variants, item models.
**Done when:** nothing in a run still looks like greybox.

### ☑ 34. Audio system + first sound pass
**Touches:** `src/audio/`, `config/audio.json`, `assets/audio/README.md`, trigger points in `src/game/Game.ts`.
**Details:** buses, distance-based spatial SFX (no occlusion), a generative four-layer score that cross-fades on the hunter's alert level, and the registry in `config/audio.json`.
**Done when:** footsteps, doors, chests, the enemy and UI all make appropriate positional sound.
**Note:** all 27 sounds are **synthesised with Tone.js** (`src/audio/recipes.ts`) and rendered to `AudioBuffer`s once at boot, so the game has a complete soundtrack with no assets and no licences. Each one also declares a file path: **drop a file into `assets/audio/` and it replaces the synthesised version**, no code or config change — see [`assets/audio/README.md`](../assets/audio/README.md). Music is generative too (`explore` / `tension` / `chase` / `menu` layers plus an ambience bed), and any layer can be replaced by a file the same way. Two things worth knowing: `unlock()` must wait for `init()` because `Tone.Offline` swaps the global context mid-render, and doors sound from their replicated **state** rather than from the noise bus so that a door the hunter opens is heard by every peer.
**Still missing:** nothing. The volume sliders landed with step 35 through `audio.setBusVolume()`, which is why every bus in `audio.json` was worth having. Voice ducking landed with step 28: `music.setVoiceDucking()` pulls the score down by `music.duckOnVoiceDb` while a teammate is *audible*, leaving ambience alone.

### ◐ 35. Save system + options menu
**Touches:** `src/save/{index,options}.ts`, `src/ui/screens/Options.tsx`, `src/ui/components/Controls.tsx`, `src/main.tsx`, `src/render/Renderer.ts`, `src/input/index.ts`, `config/{player,graphics,audio}.json`.
**Details:** `localStorage` adapter behind an interface, options for graphics/audio/gameplay, full key rebinding with conflict display, language selector, `npm run validate:locales`. Graphics options write individual `graphics.json` values — no quality presets.
**Done when:** every setting persists across reloads and reset-to-defaults works.
**Still missing:** key rebinding (`Controls.tsx`), the language selector and `npm run validate:locales`. The menu was deliberately scoped to *the basics every game has* for now — mouse sensitivity, invert Y, field of view, brightness, shadows and the five bus volumes.
**Note:** the save profile has a real schema at last. Every stored value is validated on the way in and a bad one costs that field alone, which is what stands in for format versioning (still not built, by decision). Every **default is read from `config/`** rather than written in `src/save/`, so "reset to defaults" means exactly "whatever the config files say".
**Note:** `save/` holds the numbers and never applies them — `applyOptions()` in `src/main.tsx` hands them to the renderer, input and audio, at boot and on every change through the same code path, so "apply" and "restore on load" cannot drift apart. Options is therefore **not** a config merge layer: these settings belong to live subsystems, and a volume that had to be re-merged and re-read would not move while you dragged the slider.
**Note:** which volume sliders exist is `audio.json → buses.<id>.labelKey`, and every slider's range is config (`camera.fovRange`, `graphics.brightnessRange`, `mouse.sensitivityRange`). Adding a bus adds its slider.
**Verified:** FOV, brightness and shadows change the live renderer as the control moves; the profile survives a reload; reset-to-defaults returns every value to `config/`; Escape closes the panel.

### ☑ 36. Scoreboard
**Touches:** `src/ui/screens/Scoreboard.tsx`, `src/world/runStats.ts`, `src/game/Game.ts`, `src/net/index.ts`, `config/game.json`.
**Details:** track the categories in `game.json → scoring`, per-player cards, green ring on the best value per category.
**Done when:** a finished run shows accurate stats for all players.
**Note:** the categories are **doors opened, items used, patched up, gold collected and noise made**. `noiseMade` is the one where *less* is better, and it accumulates **loudness** rather than counting sounds — a run measured in footstep events would call a sprinter and a crouching player equally loud. "Patched up" is revives *and* bandages, on yourself or on somebody else: both are a teammate kept on their feet.
**Note:** **every peer counts its own stats** and broadcasts the whole block on a lazy interval. There is no authority and there does not need to be — a player's own client is the only thing that sees every one of their footsteps, and a scoreboard is not worth an arbitration protocol. A block is sent whole rather than as deltas, so a lost message costs nothing.
**Note:** the figure on each card is an **SVG standing in for `player.masked`** — same silhouette, same wardrobe colour — because screens never touch `THREE` ([`systems/UI.md`](systems/UI.md), rule 5). The green ring only appears when there is more than one player: a solo player winning every category is not a result.
**Verified:** a real run through to a wipe produces the screen with real counters; 1, 2 and 4-player boards lay out correctly at 375 px, 742 px and 1600 px wide.

### ☑ 37. Item roster
**Touches:** `config/items.json`, `src/entities/projectile.ts`, `src/world/{wallGrid,effects}.ts`, `src/game/Game.ts`, `art/shared/props/items/`, `art/shared/vfx/`.
**Details:** seven single-use items — medicine, flare charge, alarm clock, tar flask, barricade, loose coins, the diamond — plus the aim-arc throwing system and the shared run purse.
**Done when:** every item works, is throwable/usable per its config, and affects the enemy as documented.
**Note:** throwing is *hold the hand button to aim, release to throw*; the preview line is the same integration the item flies, so what you see is where it lands. Throws ignore room furniture and containers entirely — they stop on walls, closed doors, players, the hunter and the floor (`src/world/wallGrid.ts`), because 2D collision cannot tell a wall from a table leg and a flask dying on furniture it flew over reads as a bug every time. Only the release state crosses the wire; every peer re-runs the arc.
**Note:** coins are a **team purse**. A pile is spent on contact and never takes a slot, so there is nothing to divide; the diamond is the one exception - it takes a hand and only pays out when its carrier is through the exit door. Whoever escapes banks the purse as it stands when they leave. The wardrobe shows the banked total; the shop that spends it is step 42.
**Note:** the brick, cracked lens and tremor box from the old roster were dropped. Blinding, sensing and the noise-decoy were folded into the flare charge and the alarm clock; the roster is seven items rather than nine on purpose.

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
*Partly landed with step 37: coin piles, the diamond, the shared run purse and banking it on escape all work. What is left is the rest of the treasure roster, `world.json → contents.treasure` (still `enabled: false`) and the `treasure` room anchor.*
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
| 2026-08-03 | **Slice 3 playable**: the hunter. Noise bus, room-graph A\*, sight and hearing, the full patrol/investigate/search/chase/attack FSM, the health ladder with revive, the wipe condition and the horror feedback layer. Steps 17, 18, 19 done; 4 finished; 16, 20, 21, 27 advanced. Two decisions worth knowing: the feedback layer is a **DOM compositing layer**, not an `EffectComposer` post stack (every effect the design asks for is a full-screen blend — see [`ARCHITECTURE.md §10`](ARCHITECTURE.md)), and the FSM lives in one `enemy.ts` rather than a `states/` folder. `generate()` now takes the enemy's `spawn` block as a parameter so generation still reads one config file, and `PlacedRoom` carries world-space patrol points. |
| 2026-08-03 | **Step 34 done — the game has sound.** All 27 effects are synthesised in Tone.js and rendered to buffers at boot; the score is generative and four-layered. Every sound also declares a file path, so `assets/audio/` is a drop-in override with no code change — that is the seam a sound composer works against. `config/audio.json` gained `cues` (which event fires what) and a rebuilt `music` block; `chaseTrackSuffix` was replaced by the explicit `music.layers` map. `heartbeatCloseness()` moved out of `render/feedback.ts` so the heartbeat you hear and the one you see ride the same curve. Step 21's audio half is now done. |
| 2026-08-04 | **Step 28 done — proximity voice.** `src/voice/` (capture, per-peer audio, attenuation, modes, VAD) over PeerJS media calls, which makes voice a true mesh while gameplay data stays a star. `config/net.json → voice` gained `gainSmoothingSeconds`, `noiseThresholdDb`, `noiseIntervalSeconds`, `speakingThresholdDb` and `speakingHoldMs`; the enemy-facing threshold sits well above the open-mic gate, which is what makes an open mic safe. Voice emits `player.json → noise.voice` on an interval, downed players included — being heard is the point. Music now ducks (`music.setVoiceDucking()`), the roster grew a speaking microphone, the pause menu grew a one-control mode switch plus mutes, and the HUD grew a plain-DOM voice pill. `.claude/launch.json` / `vite.config.ts` learned `PORT`, so two dev servers can run side by side. |
| 2026-08-04 | **Step 29 — the lobby.** A log cabin (`art/shared/lobby/`, its own material library because it belongs to no pack) with a twenty-slot poster wall, a fireplace, a panoramic window onto four ranges of snow-capped mountains, a difficulty lever, a wardrobe and a covered minigame wall. `src/game/Lobby.ts` orchestrates it — deliberately its own file rather than a mode of `Game`, which has no enemy, noise bus, health or items to share with a foyer. Three decisions worth knowing: **voice moved out of `Game` and onto the session**, so it now spans the load into a map (peers announce a `scene`, and each side hands `voice/` only same-world peers — `src/voice/` itself did not change); the host **publishes the whole lobby on every change** rather than sending diffs, which is the shape steps 25–27 want; and `src/save/` exists at last, holding only escaped maps and the wardrobe colour until step 35 gives it a real schema. `player.masked` gained legs and `api.setColour()` — the wardrobe stands it two metres from the camera, where a floating capsule reads as a bug. `npm run validate:art` and `/tools/roomshot.html?map=lobby` both cover the cabin now. |
| 2026-08-04 | **Room review tool.** `tools/roomshot` renders every room of a pack through the real `Renderer` + `buildWorld` and writes a contact sheet per room to `shots/` (git-ignored) via a dev-only Vite middleware — see [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md). Nothing about the look is re-implemented, so a sheet is what the game shows. Its first pass over the mansion fixed four bugs the headless validator cannot see, listed under step 32. |
| 2026-08-05 | **Steps 35 and 36 — options and the run report.** The save profile has a real schema (`src/save/{index,options}.ts`) whose every default is read from `config/`, so reset-to-defaults means "whatever the config files say"; every stored value is validated on the way in, which is what stands in for format versioning. Options is deliberately the basics — sensitivity, invert Y, FOV, brightness, shadows, five volumes — and is **not** a config merge layer: `applyOptions()` in `main.tsx` hands the values to the renderer, input and audio at boot and on every change, through one code path. `config/game.json → scoring.categories` was rewritten to the five counters logic actually keeps (`src/world/runStats.ts`); **`noiseMade` accumulates loudness and is the one where less is better**. Every peer counts its own stats and broadcasts the block whole (`t: 'stats'`) — no arbitration, because a scoreboard is not worth one. Three UI decisions came with it: the reusable `Slider`/`Switch`/`Tabs` set (`src/ui/components/Controls.tsx`), a **viewport-relative base font size** on `.layer` so the whole interface scales with the display, and `.overlay` becoming `position: fixed` so a screen layered over another does not stack below the viewport. `screen: 'escaped' \| 'wiped'` collapsed into one `'scoreboard'`, which works out its own outcome. |
| 2026-08-02 | **Slice 2 playable**: locked doors, keys, chests, lockers and the two-hand inventory. Generation now locks doors on the spanning-tree route *before* adding loops and forbids loops across a lock, which makes "always X locked doors, always enough keys" structural rather than checked — see [`systems/GENERATION.md`](systems/GENERATION.md) → "Locks and keys". Steps 9, 13, 14, 15, 22, 26 advanced. `loot.chestTable` / `floorTable` were trimmed to `key` + `empty` until the item roster lands in step 37. |
