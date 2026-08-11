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
  brightness, shadows, five volume sliders, full key rebinding and six languages,
  over a save profile with a real schema.

- **Host authority** (steps 24–27) — the four things two players can want at once
  (an item, a chest, a lock, a door to wedge) go through one claim protocol the host
  answers from world state, so nothing can be taken twice; doors are requested and
  corrected; remote bodies are drawn from a snapshot buffer instead of chased; the
  team leaves the loading screen together; and a peer who drops leaves their key on
  the floor rather than taking it home.

- **Spectating** (step 39) — escaping or giving up takes you out of the run, not out of
  the game: you sit behind a teammate's eyes, cycle through whoever is left, and bank
  the purse when you finally walk away rather than when you walked through the door.
  With text chat, which spans the session and obeys the same channel rule as voice.

Still missing: nothing in Slice 3, and step 38 is done — the lever offers `Normal`
and `Hard`, and `Hard` puts a second hunter behind the first locked door. Phase 4 is
what remains — and step 46 is now `◐`: the cabin has its dart minigame, but no
trophies.

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
**Still missing:** `validate.ts`. The difficulty overlay landed with step 38 (`configForRun`). The save-profile layer and the locale switching UI landed with step 35 — the profile is deliberately *not* a config merge layer, because these settings belong to live subsystems (see step 35 and [`CONFIG.md`](CONFIG.md)).

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
**Still missing:** nothing for now. Renderer, ambient/fog from config, the light budget, culling and the gameplay-feedback layer (`renderer.feedback`, step 21) are done. Light values in config are real three.js units — the renderer applies no hidden scaling.
**Note:** the "nearest N lights" rule became a *fixed budget* rather than a cap, and `renderer.warmUp()` compiles the shaders and bakes the shadow maps behind the loading card. three.js compiles a program per material per light count, so a light set that changes size recompiles the map a room at a time — that was the source of the stutters. See [`systems/RENDERING.md`](systems/RENDERING.md).

### ◐ 5. Input system
**Goal:** raw devices → action ids, rebindable.
**Touches:** `src/input/{index,bindings,pointerLock,actionState}.ts`.
**Details:** load defaults from `config/input.json`, overlay save-profile rebinds, `isDown/justPressed/holdProgress` per action, pointer lock lifecycle, `labelFor(action)` for HUD prompts, mouse buttons as bindable keys.
**Done when:** every action in `input.json` reports correctly, and rebinding one at runtime takes effect immediately.
**Still missing:** nothing. Runtime rebinding and its persistence landed with step 35. `labelFor()` became `bindingFor()` and now returns the raw code — what a binding *looks* like is the UI's business (`src/ui/keys.ts`), not this module's.

### ◐ 6. UI shell + main menu
**Goal:** the game has a front end.
**Touches:** `src/ui/{ScreenManager.ts,theme.ts,components/}`, `src/ui/screens/{MainMenu,Options,Credits}.tsx`.
**Details:** Preact mount into `#screen-root`, theme from `config/ui.json` → CSS vars, reusable Button/Slider/Select/Tabs/Modal components with keyboard nav and focus states, main menu over the 3D backdrop. Options tabs can be stubs beyond Graphics/Audio.
**Done when:** menus navigate by keyboard and mouse, look like a game, and all text comes from `en.json`.
**Still missing:** the Credits screen, and full keyboard navigation. Options, the reusable component set (`Slider` / `Switch` / `Choice` / `Tabs` / `FieldGroup` / `KeyCap`) and `src/ui/theme.ts` all landed with step 35.

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
**Still missing:** actual streaming — all 33 rooms are built up front (110 ms) and only *hidden*. Fine at this size; revisit if room cost grows.
**Note:** hiding is no longer done on distance alone. A room is drawn only if the eye can reach it — flooding the cell graph through openings that are neither shut nor off screen — which is what stopped a run getting slower the more of the map had been opened up. See [`systems/RENDERING.md`](systems/RENDERING.md).

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
**Note:** the "sphere-cast" this step asked for is **items only**, and it is a *fallback* rather than the primary test (`Game.#softItemTag`). A door or a chest is most of a wall and an exact ray finds it every time; a key is four centimetres of geometry on floorboards, and having to put the crosshair on the model turned picking it up into a game of its own — at 1.5 m the exact ray gave a **0.74°** window of yaw. It now also answers to a cylinder of the model's own bounding radius plus `interaction.rayRadius` (the value that had never been read): at 1 m that is **±11.5° of yaw and 18.8° of pitch**, with no holes in it. Running it only when the exact ray offered nothing is what stops it taking a press away from the door behind the key. Each model's extent is measured once and cached weakly, because `Box3.setFromObject` walks every vertex and this runs every tick — twelve items inside arm's reach cost 0.086 ms a tick.
**Note:** the wall test for that cylinder measures to the item's **near side** (`along - radius`), not to its centre, and getting that wrong made the whole thing fail exactly where it mattered most. Aim through a gap in a model — between the prongs of a key — and the ray carries on to the floor the key is lying on, a few centimetres short of its middle; measured to the centre, that floor was an occluder, so the one place you would naturally point at a key was a dead spot roughly 2° wide sitting in the middle of the window. **A sweep that records only the first and last hit cannot see a hole in the middle of its own range** — the second sweep records every sample and asserts the run is contiguous, which is the only version of this test worth having.

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

### ☑ 20. Health, downing and revive
**Goal:** stakes.
**Touches:** `src/entities/health.ts`, `src/world/runState.ts`.
**Details:** healthy → injured → downed ladder, injured speed and noise penalties, downed immobility and camera drop, hold-E revive to injured, invulnerability windows, lose condition.
**Still missing:** nothing. Give-up → dead → spectate landed with step 39.

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
**Touches:** `src/net/index.ts`, `config/net.json → connection`.
**Details:** connection lifecycle, error surfaces, heartbeats and disconnect detection.
**Done when:** 4 tabs connect, exchange heartbeats, and disconnects are detected and reported.
**Still missing:** the **full mesh** (this is a star with the host relaying), the separate unreliable `state` channel, and binary encoding — messages are JSON on one reliable channel. All three are deliberate: 4 players relaying through one host is a few hundred bytes a tick, and the star is what makes "the host decides" a single place in the code rather than a consensus problem. Revisit if player count or message size grows.
**Note:** liveness landed here — `ping` every `connection.heartbeatSeconds`, and a peer nothing has been heard from for `connection.timeoutSeconds` is dropped. A closed tab never sends a goodbye and WebRTC can take a minute to notice, which is the whole reason this exists rather than trusting the `close` event.

### ◐ 25. Host-authoritative simulation + prediction
**Goal:** everyone sees the same world.
**Touches:** `src/net/interpolation.ts`, `src/game/Game.ts`.
**Details:** snapshots down, interpolation delay, `(mapId, seed)` run start, the load gate.
**Done when:** four players walk around one generated map with smooth remote motion under simulated 100 ms latency.
**Still missing:** input frames, prediction and position reconciliation — **by decision, not by omission**. See [`systems/NETWORKING.md`](systems/NETWORKING.md) → "What the host does not own": the host arbitrates everything that can be *contested*, and a position cannot be (two players may stand in the same doorway). Anti-cheat is explicitly not built. `stepPlayer()` remains a pure `(state, input, dt)` function, which is the only seam a change of mind would need.
**Note:** what did land is the presentation half — remote players and, on a client, the hunter are drawn from a snapshot buffer that plays back `simulation.interpolationDelayMs` in the past and extrapolates at most `maxExtrapolationMs` before holding still. Chasing the latest packet with a lerp is what made remote motion rubbery; this is what fixes it, and it finally reads two config values that had never been read.

### ☑ 26. Networked world interactions
**Goal:** doors, chests, items and the exit work for everyone.
**Touches:** `src/net/index.ts`, `src/game/Game.ts`.
**Details:** host-decided interaction results, optimistic local feedback, item ownership and hand slots.
**Done when:** two players cannot dupe an item, and door state is consistent for all four.
**Note:** four things can only have one owner — an item (`take`), a chest, a lock (`unlock`) and a door to wedge (`barricade`) — and all four go through one three-message protocol: `claim` up, `granted` to everyone, `denied` to the loser alone. **The host keeps no ledger:** every answer is read off world state it already has, so granting a claim is exactly what makes the next claim on the same thing fail.
**Note:** **only a pick-up is optimistic**, because it is the only one that is a press — a hand that filled a round trip later would feel broken. It is also never rolled *back into the world*: a take is denied only because somebody else already has it. Everything else follows a hold, so the key, the planks and the chest are spent on the grant and there is nothing to undo.
**Note:** doors are the same idea without a denial — `doorRequest` up, `door` down carrying the state the host actually reached, so a door that turned out to be locked corrects itself within a round trip.
**Note:** **coins stopped being a message.** A pile's value is rolled from `(seed, item id)`, so every peer that sees the grant reaches the same number; `coins` survives only for treasure banked at the exit. A message that cannot be lost beats one that has to be resent.
**Verified:** two tabs, one map. The client took a coin pile and both purses moved to the same total; the host then claimed the same pile and was denied, purses unchanged. Reversed the order and got the reverse result. A `doorRequest` on an ordinary door came back `open: true`; the same request on a locked one came back `open: false` — the host correcting the client.

### ☑ 27. Networked enemy and run state
**Goal:** the hunter is shared.
**Touches:** `src/net/index.ts`, `src/world/runState.ts`, `src/game/Game.ts`.
**Details:** AI on host only, enemy transform + alert level replicated at `snapshotRateHz`, networked noise/injure/down/revive/escape, win and lose resolution, disconnect handling.
**Note:** a peer who drops **leaves their things behind**. `move` carries both hands for exactly this reason: the host puts whatever they were carrying on the floor where they stood, because a key that leaves the map inside a closed tab is a run nobody can finish. Their `RunState` entry is marked `disconnected` rather than deleted, so they still count against the wipe condition and still get a roster line and a scoreboard column — greyed, but there.
**Note:** **leaving a run back to the cabin is a disconnect too.** Peers announce their `scene`, and a peer who is no longer in `run` is dropped from it by the same path — otherwise their body stood in a corridor for as long as everybody else kept playing.
**Verified:** two tabs. A client silenced mid-run was dropped by the host's timeout, its line greyed and the player count fell; the client, hung up on, landed back on the main menu with the localised "the host left". A peer holding a key and a bandage had both spawned at their last position on every peer when they went.

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
**Details:** a log cabin — poster wall, fireplace, panoramic window onto a snowfield and four ranges of mountains, difficulty lever, wardrobe, a mirror, and a fence onto the dart annex (step 46). Press E on a poster to pick a map; solo starts at once, in company the first pick opens the `autoStartSeconds` countdown and it drops to `allReadyStartSeconds` once everyone has picked. Host-authoritative: it owns the tally, the difficulty and the clock, and publishes the whole lobby on every change. Finishing a run returns to the cabin.
**Still missing:** verification with real peers — the lobby has only been exercised solo and through a headless browser. The join-by-code UI is still the main menu's code box rather than a `Join` screen, and ready states are not built (picking a map *is* the ready signal, which made a separate one redundant).
**Note:** **voice now follows the session rather than the run.** The microphone opens on entering the cabin and stays open through the load into a map, so a conversation is never cut off at exactly the moment a team is agreeing on a plan. Peers announce which world they are standing in (`scene`), and each side hands `voice/` only the peers in the *same* world — `voice/` already treats a peer with no position as flat and fully audible, so nothing in `src/voice/` changed at all.
**Note:** `src/save/` exists now, deliberately tiny: escaped maps (for the tick on a poster) and the wardrobe colour. The real profile, schema and options are step 35.
**Note:** the lobby is reviewable like a room — `/tools/roomshot.html?map=lobby` — and `npm run validate:art` builds the cabin headless and proves every poster, the wardrobe, the lever and the dart stand are **reachable on foot** from all four arrival spots, and that the dart annex is *not*.
**Note:** the **`?` poster** hangs in the frame after the last real map (`game.json → lobby.randomPoster`). Solo it rolls a map on the spot; in company a random vote is dropped from the tally entirely and the dice only come out when there is nothing else to count — somebody who picked the manor wants the manor, and somebody who picked `?` has said they do not mind, so `?` must never overrule them.
**Note:** the player's own model no longer stands on the floorboards by the wardrobe, where it read as a fourth player standing very still. It stands **inside a mirror** — a lit chamber behind a tinted pane with two raked highlights on it, at about the depth a reflection would sit at. Fake by decision: a real mirror is a second render pass, and the only thing in the cabin worth reflecting is that one model.
**Verified:** boots, enters the cabin, builds 20 poster frames at 240 draws / 78k tris on 8 lights, tears down to an empty scene and rebuilds identically, with no console errors.

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

### ☑ 33. Shared art, finished — and cosmetic hats
**Touches:** `art/shared/characters/{player,ghost,hats,hatMaterials,textures}.ts`, `art/shared/props/{door,chest,locker}.ts`, `art/shared/index.ts`, `config/player.json`, `config/locales/*.json`, `src/render/{playerBody,portraits}.ts`, `src/shared/cosmetics.ts`, `src/{save,net,game,ui}/`.
**Done:** the player is a proper suit — lathed torso with a waist, legs and boots, gloves, webbing, a pack with a hose, and a dark glossy visor that says which way it is looking; the ghost is a hooded, tattered, sleeved figure rather than a capsule; and doors, chests and lockers have panelling, real hardware and hollow, lined insides. Plus **sixteen cosmetic hats** you buy with banked coins in the lobby wardrobe, and a scoreboard that shows the actual 3D bodies wearing them.
**Note:** no mansion overrides, by decision — shared art is one look in every map, which is what makes a hat somebody paid for mean the same thing everywhere.
**Note:** the **leaf of a door stays one box.** Shared art is not batched, so a box carries one UV repeat over its whole face and a pack that authored its door texture *as* a door (`viscera`'s `bonePlate`) depends on exactly that. Every bit of panelling sits ON the leaf rather than cutting it up.
**Note:** the scoreboard renders the real `player.masked` off screen to a data URL (`src/render/portraits.ts`) instead of drawing an SVG imitation of it. The SVG was fine while the body was a capsule and four boxes; it stopped being fine the moment the wardrobe started selling hats, because every hat would have needed a second, flat, hand-drawn version that drifted from the first one by hat three.
**Note:** what the art review caught, and what the fixes were, is in [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md) → "And the ones the shared-art pass caught".

### ☑ 34. Audio system + first sound pass
**Touches:** `src/audio/`, `config/audio.json`, `assets/audio/README.md`, trigger points in `src/game/Game.ts`.
**Details:** buses, distance-based spatial SFX (no occlusion), a generative four-layer score that cross-fades on the hunter's alert level, and the registry in `config/audio.json`.
**Done when:** footsteps, doors, chests, the enemy and UI all make appropriate positional sound.
**Note:** all 27 sounds are **synthesised with Tone.js** (`src/audio/recipes.ts`) and rendered to `AudioBuffer`s once at boot, so the game has a complete soundtrack with no assets and no licences. Each one also declares a file path: **drop a file into `assets/audio/` and it replaces the synthesised version**, no code or config change — see [`assets/audio/README.md`](../assets/audio/README.md). Music is generative too (`explore` / `tension` / `chase` / `menu` layers plus an ambience bed), and any layer can be replaced by a file the same way. Two things worth knowing: `unlock()` must wait for `init()` because `Tone.Offline` swaps the global context mid-render, and doors sound from their replicated **state** rather than from the noise bus so that a door the hunter opens is heard by every peer.
**Still missing:** nothing. The volume sliders landed with step 35 through `audio.setBusVolume()`, which is why every bus in `audio.json` was worth having. Voice ducking landed with step 28: `music.setVoiceDucking()` pulls the score down by `music.duckOnVoiceDb` while a teammate is *audible*, leaving ambience alone.

### ☑ 35. Save system + options menu
**Touches:** `src/save/{index,options}.ts`, `src/ui/{keys.ts,theme.ts}`, `src/ui/components/{Controls,KeyCap}.tsx`, `src/ui/screens/{Options,Controls}.tsx`, `src/main.tsx`, `src/render/Renderer.ts`, `src/input/index.ts`, `config/locales/*`, `scripts/validateLocales.mjs`, `config/{player,graphics,audio,ui,input}.json`.
**Details:** `localStorage` adapter behind an interface, options for graphics/audio/gameplay, full key rebinding with conflict display, language selector, `npm run validate:locales`. Graphics options write individual `graphics.json` values — no quality presets.
**Done when:** every setting persists across reloads and reset-to-defaults works.
**Still missing:** nothing. The menu is deliberately *the basics every game has* — mouse sensitivity, invert Y, field of view, brightness, shadows, the five bus volumes, the language and the key binds.
**Note:** **rebinding moves the primary key only**, so WASD keeps its arrow-key alternates, and **conflicts are shown rather than resolved** — both keys keep working and the row says so. Two actions on one key is occasionally deliberate, and quietly unbinding somebody's other key is worse than telling them. `pauseMenu` is `rebindable: false` and drawn locked: Escape is how you reach the menu that would undo a bad rebind. Only *overrides* are stored, never the full binding set, so a later build that adds an action or changes a default is picked up rather than frozen out by an old profile.
**Note:** **six languages** — English, 日本語, 简体中文, Русский, Español, Português (Brasil). The language lives in the save profile, switching applies without a reload, and a profile that has never picked one follows the browser. `config/ui.json → theme.font*` gained CJK and Cyrillic fallback chains, which is also what finally made `src/ui/theme.ts` exist: `ui.json → theme` had never been read by anything until it had to be.
**Note:** `npm run validate:locales` exists because every way a translation goes wrong is **silent at runtime** — a missing key quietly reverts half a menu to English, a dropped `{placeholder}` prints "Starting in" with no number. It also checks the four places a config id and a locale key have to agree.
**Note:** the save profile has a real schema at last. Every stored value is validated on the way in and a bad one costs that field alone, which is what stands in for format versioning (still not built, by decision). Every **default is read from `config/`** rather than written in `src/save/`, so "reset to defaults" means exactly "whatever the config files say".
**Note:** `save/` holds the numbers and never applies them — `applyOptions()` in `src/main.tsx` hands them to the renderer, input and audio, at boot and on every change through the same code path, so "apply" and "restore on load" cannot drift apart. Options is therefore **not** a config merge layer: these settings belong to live subsystems, and a volume that had to be re-merged and re-read would not move while you dragged the slider.
**Note:** which volume sliders exist is `audio.json → buses.<id>.labelKey`, and every slider's range is config (`camera.fovRange`, `graphics.brightnessRange`, `mouse.sensitivityRange`). Adding a bus adds its slider.
**Note:** a binding reaches the UI as a **raw code** and is *drawn*, not named — a key cap, or a small mouse with the pressed button lit. "LMB" is jargon that means nothing in five of the six languages, and `{key}` is substituted by splitting the translated string rather than filling it, so Japanese can put the cap first. See [`systems/UI.md`](systems/UI.md) → "Key bindings on screen".
**Verified:** FOV, brightness and shadows change the live renderer as the control moves; the profile survives a reload; reset-to-defaults returns every value to `config/`; Escape closes the panel. Rebinding captures keys and mouse buttons, persists, updates the HUD's caps immediately, refuses locked actions and reports a clash without unbinding anything. All six languages render, switch live, and lay out without overflow at 375 px and 742 px — Russian, the longest, included.

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

### ☑ 38. Difficulty modes
**Touches:** `src/config/index.ts` (`configForRun`), `src/world/generation.ts`, `src/ai/enemy.ts`, `src/game/Game.ts`, `src/net/index.ts`, `config/{difficulty,enemy}.json`, locales.
**Details:** `configForRun(mapId, difficultyId)` applies the map overlay then the difficulty overlay over `enemy`, `world` and `player`; the lever selects it and `runStart` already carried the id.
**Done when:** every enabled mode measurably changes enemy behaviour with no code changes beyond the selector.
**Note:** shipped as **two** modes, `Normal` and `Hard`, not four. `easy` and `nightmare` were scrapped rather than left disabled — a mode nobody can pick is a mode nobody is balancing.
**Note:** `Hard` is also what made the hunter **countable**. `enemy.json → spawn.regions` is one entry per hunter and the value is how many locked doors it starts behind, so `[0, 1]` puts a second one in the partition past the first lock: unseen and unreachable until the team spends its first key, and unable to follow them until they open that door. The AI is unchanged apart from patrol room choice, which now weights down whatever wing another hunter has (`patrol.avoidOtherHuntersRooms`, `.otherHunterAreaWeight`) so they cover the map instead of shadowing each other. See [`systems/AI.md`](systems/AI.md) → "More than one hunter".
**Note:** the hunter count never crosses the wire — it falls out of `(mapId, seed, difficultyId)`, so an `enemy` snapshot only had to gain an index.

---

## Phase 4 — Extras

*Ordered by value, not dependency. Pick freely.*

### ☑ 39. Spectating after escape or death — and text chat
**Touches:** `src/game/Game.ts`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/ui.css`, `src/input/index.ts`, `src/net/{index,interpolation}.ts`, `src/entities/health.ts`, `src/world/runState.ts`, `config/{input,player,ui}.json`, `config/locales/*`.
**Done:** getting out of a run no longer ends it for you. Escaping — or giving up on the floor — puts you behind the eyes of somebody still in the map, and `A`/`D` (or the arrows) cycle through everyone left. Downed teammates count as somebody to watch; escaped, dead and disconnected ones do not, and when the list empties the run is over for you and the scoreboard goes up. Plus **text chat**: Enter opens a box, Enter sends, Escape throws it away.
**Note:** **the purse is banked when you walk away from the run, not when you walk through the door.** Getting out is what earns the right to it; how long you sit and watch is what decides how much of it there is. Every teammate who cashes in behind you raises the number, everybody who got out takes a full copy of it, and the escape menu prints what leaving right now would bank — that number is the whole reason to stay, so it belongs on the screen where the decision is made. A player who never got out banks nothing, however long they watched.
**Note:** **`move` gained a `pitch`, for exactly one consumer.** No body is drawn with it — a remote is oriented by `yaw` alone. Without it a spectator sits at a teammate's shoulder height looking at the horizon, which is a camera mount rather than a point of view.
**Note:** the camera, the ears, the light budget and the culling **all** move to the watched player. Culling was the one that had to be found rather than reasoned out: leave it on your own body and the spectator gets rooms culled around a corpse in the cellar while looking at a landing two floors up.
**Note:** **giving up drops what you were holding**, for the same reason a dropped peer's hands are emptied — a key inside somebody who has stopped playing is a run nobody can finish. One final `move` goes out of turn as they leave, so every peer's copy of that body agrees it is empty-handed before it stops moving; otherwise a later disconnect would spawn a second copy of it.
**Note:** **chat obeys the voice rule** (`Game.canHearChatFrom`): a player still down there never reads a line from one who is out. The channel separation in `voice/` exists so somebody out of the run cannot call a room clear for the people still in it, and anyone who can type would defeat it in one line otherwise. In the cabin everybody reads everybody. Lines are broadcast whole and filtered **on arrival**, so that rule lives in one place.
**Note:** typing takes the keyboard through one flag (`Input.setTextCapture`) rather than a per-action opt-out, and **releases pointer lock without pausing**. Typing with the mouse captured and the movement keys live is how you walk into a wall mid-sentence; the run carrying on around you is the honest cost of stopping to type.
**Note:** the escape menu's voice block gained a **volume slider and a mute for your own microphone and for each teammate**, and is **hidden entirely in a solo run** — no microphone is opened there, so a set of dead controls explaining that is worse than nothing. Both volumes are session state like the mutes: a per-peer volume cannot persist, because a peer id is a lobby code that means somebody else next week. Your own is a gain *after* the meter, so turning yourself down never stops your own gate opening; a teammate's *multiplies* the distance law rather than replacing it.
**Note:** **Escape is one ordered stack** (`src/main.tsx`), closing the innermost open thing and nothing else. Handling it in a screen as well is how a panel closes straight into the escape menu — `Lobby` no longer reads `pauseMenu` for the wardrobe. Escape inside a running run is never delivered as a key at all: the browser spends it exiting pointer lock, so the first press opens the menu and the second one closes it.
**Note:** a faded chat line is **kept, not deleted**. Its `fresh` flag goes false and it drops off the HUD, but pressing Enter brings the whole backlog back — a chat box that opens empty makes you ask what you missed and gives you no way to find out.
**Verified:** a downed player holding the give-up key fills its ring over 3 s, dies, drops their hands and lands in spectate; the camera sits at the watched player's exact position, yaw *and* pitch, and on the floor at `downedEyeHeight` when watching a downed one; `D`/`ArrowRight` and `A`/`ArrowLeft` cycle and wrap; a teammate escaping moves the spectator on and hides their body while a dead one stays lying where they fell; the last one leaving the map puts the scoreboard up, **including when the last player out escapes into a map holding nothing but dead teammates** — that case pushed a spectator view identical to the initial one and was swallowed, leaving them standing at the exit door with no way on. A run escaped with 340 in the purse, watched while another 260 came in, banked 600 on leaving — and a player who gave up banked nothing. Chat crosses the wire between two tabs and resolves to the right roster number; the box suppresses movement while it has the keyboard, a faded line comes back when the box reopens, and Escape closes options, then chat, then the wardrobe, then the escape menu, one layer per press.
**Still missing:** verification with real peers. Two tabs in one browser drop each other on the heartbeat as soon as one is backgrounded, so the multi-player half was exercised by driving `Game` through the same API `net/` calls rather than over a live connection.
### ☐ 40. Traps — floor and ceiling, noise and hold
### ☐ 41. Treasure, currency and run rewards
*Partly landed with step 37: coin piles, the diamond, the shared run purse and banking it on escape all work. What is left is the rest of the treasure roster, `world.json → contents.treasure` (still `enabled: false`) and the `treasure` room anchor.*
### ☐ 42. Metaprogression — lobby shop, XP, levels
### ◐ 43. Player cosmetics
*Hats landed with step 33: sixteen of them, bought with banked coins in the lobby wardrobe and worn in the run, the cabin and on the scoreboard. What is left is everything that is not a hat.*
### ☐ 44. Multi-cell rooms — 1×2, 2×2, L footprints
### ☑ 45. Second art pack — **The Leviathan**, 24 rooms
**Touches:** `art/packs/viscera/`, `art/shared/lobby/{textures,materials,poster}.ts`, `art/shared/index.ts`, `config/maps.json`, `config/locales/*.json`, `src/world/worldBuilder.ts`, `scripts/validateArt.mjs`.
**Done:** the inside of something enormous and still alive, rather than the prison this step originally named. Twenty 1×1 chambers and four multi-cell set pieces (2×2 rib nave, 2×1 gut coil, 1×3 windpipe, L-shaped jaw), split evenly between a **wet** zone — gullet, stomach, heart, lungs, bile cisterns, ganglion, the eye, brood cradle, thicket, vein cascade, rot bloom, gizzard, sinew loom — and a **calcified** one — marrow vault, dentition, armoury, cartilage lattice, spine column, moult, comb. Sixteen procedural surfaces, an anatomy kit (`kit/props.ts`) and a shell whose every doorway is an orifice: a sphincter in meat, an arch of vertebrae in bone, mandibles in chitin.
**Note:** the light budget now **scales with footprint** — 2 for a 1×1, one more per extra cell, capped at 4. A 2×2 hall or a 1×3 corridor lit from two points has black ends a player cannot find the doors in, and it costs nothing at the shader level because `maxActiveLights` is a fixed budget. `src/world/worldBuilder.ts` and `scripts/validateArt.mjs` share the rule.
**Note:** almost everything a player navigates by in this pack is **emissive** rather than a real lamp — bile pools, nerve cord, spore blooms, the eyes, the glowing rims in the gut. That is what buys a 16 m hall on four lights. The failure classes this pass turned up are written down in [`art/ROOM_REVIEW.md`](art/ROOM_REVIEW.md) → "And the ones the viscera pass caught".
### ◐ 46. Lobby trophies and minigames
**Touches:** `art/shared/lobby/{cabin,darts,textures,materials}.ts`, `src/entities/dart.ts`, `src/game/Lobby.ts`, `src/world/lobbyScene.ts`, `src/net/index.ts`, `src/ui/App.tsx`, `config/darts.json`.
**Done:** **darts.** The cabin's east wall is a chest-high fence across a full-height opening, with a lit annex beyond it holding a regulation board and a seven-segment scoreboard. A stand on the near side hands out infinite darts, which puts the run's own hand slots and hand buttons on screen in the cabin — the minigame is played with exactly the controls the game is played with, so it doubles as somewhere to learn them.
**Note:** **there is no aim arc.** A throwable is aimed down a drawn curve because that is the only honest way to show a ballistic arc indoors; a dart is thrown at one disc across an open room, and drawing a line to it would answer the only question being asked. Holding the hand button brings a dart up in front of you and that is all the feedback there is.
**Note:** the physics are `src/entities/dart.ts`, **not** the run's projectile code with different constants — a flask is tested against the maze's walls and doors and has to come to rest on a floor, a dart is tested against one plane. `config/darts.json` is separate from `items.json` for the same reason.
**Note:** the **wind** is the whole difficulty. A hidden lateral acceleration, drifting continuously on two sines whose periods do not divide each other, worth about 3 cm at the board — five times the radius of the inner bull and a seventh of the radius of the board. It can cost you the 50; it cannot make you miss.
**Note:** `throw.releaseHeightOffset` is **0**, unlike a throwable's. Every centimetre of it is a centimetre the crosshair lies by *on top of* the drop, and there is no arc here to show the difference: at -0.12 every dart landed 17 cm low, 5 cm of honest ballistics and 12 cm of nothing.
**Note:** scores are **self-reported**, like the run's `stats` block and for the same reason - nobody arbitrates a scoreboard. Rows are ordered by peer id, which is the one ordering every peer agrees on: a shared object in the world must not read differently depending on who is looking at it. They are wiped by `Lobby.start()`, which is every way back into the cabin.
**Still missing:** trophies, and any other minigame.
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
| 2026-08-05 | **Step 35 finished — rebinding and six languages.** Key rebinding with conflict display (`src/ui/screens/Controls.tsx`), a language selector, and `npm run validate:locales`. The game now ships in English, Japanese, Simplified Chinese, Russian, Spanish and Brazilian Portuguese; the language lives in the save profile and switching applies without a reload, which moved `save.load()` **ahead of** `initI18n()` in the boot sequence. Bindings now reach the UI as **raw codes** (`Input.labelFor` → `bindingFor`) and are drawn rather than named: a key cap, or a small mouse with the pressed button lit — "LMB" is jargon that means nothing in five of the six languages. `{key}` is substituted by *splitting* the translated string rather than filling it, so Japanese can put the cap first; the words on the caps live in `input.json → keyLabels`. Two things fell out of it: `src/ui/theme.ts` finally exists, because `ui.json → theme` had never been read by anything and the CJK/Cyrillic font fallbacks had to reach the page; and the HUD's three prompt blocks became one stacked column, because at fixed screen percentages they landed on top of each other the moment a translation was longer. The `Select` dropdown built for the language picker was replaced by a wrapping `Choice` chip group — a floating list is clipped by the options panel's own scroll container. |
| 2026-08-05 | **Steps 26 and 27 done, 24 and 25 advanced — the host actually decides.** Four contested things (`take` / `chest` / `unlock` / `barricade`) share one `claim` → `granted` / `denied` protocol, answered from world state rather than from a ledger of claims, so granting one is what makes the next fail. Doors became `doorRequest` up and an authoritative `door` down. **Only a pick-up is optimistic** — every other claim follows a hold, so the result lands inside the animation and nothing needs rolling back. `coins` stopped being sent for piles: the value is rolled from `(seed, item id)` and every peer that sees the grant reaches the same number. Remote players and the hunter are now drawn from a snapshot buffer (`src/net/interpolation.ts`) that plays back `interpolationDelayMs` in the past and extrapolates at most `maxExtrapolationMs` — two config values that had never been read. A **load gate** holds the whole team at the loading card until everybody's map is built (`ready` / `loading` / `runGo`, with `connection.loadTimeoutSeconds` as the escape hatch); a world that is built but not released presents without running, so the hunter cannot get a head start on whoever loaded last and the conversation over the top of it is never cut. Disconnects are detected by heartbeat rather than by trusting `close`, a dropped peer's hands are emptied onto the floor by the host (which is why `move` carries them), and leaving a run for the cabin is treated as one. Host-owned *movement* was deliberately not built — the reasons are in [`systems/NETWORKING.md`](systems/NETWORKING.md) → "What the host does not own". |
| 2026-08-06 | **Frame rate pass, second look.** Three things the first pass got wrong or left. (1) Hoisting room lamps out of their rooms was a mistake: `sway()` on a chandelier rewrites the lamp's `position` every frame from a value captured in room-local space, so a hoisted lamp was dragged back near the world origin and the music room, foyer and dining room went **black**. Culling now hides the biggest subtrees of a room that hold no light and leaves the path down to each lamp standing (`hidableParts()`), so lamps stay where the art put them and keep being animated by it. (2) A lamp taking or losing one of the light budget's slots **faded** rather than switched — you could watch rooms come on as you walked up to them. The handover is sequential (out to black, swap, in from black) so the light *count* still never moves, and the fade rides the lamp's colour because art already owns its intensity. Biggest single-frame brightness jump over a 39 m walk went from a full switch to 0.026. (3) `culling.screenMargin` was 0.1 "in case the camera moves between ticks" — it does not, because culling runs in the tick that sets it, and the margin compounds through every doorway in a sight line. At 0.02 an opened-up map costs 106 average draw calls instead of 146. What remains is not a leak: four minutes in one spot grows nothing, and the HUD builds its DOM once. An open door is an open sight line, and the map costs 40 draw calls shut and 106 wide open. |
| 2026-08-06 | **Frame rate pass — the mansion runs smooth.** Three problems, all measured in the running game rather than guessed at. (1) The interaction ray tested every mesh in the map, 20.7 ms a tick, because room geometry is nine tenths of the triangles and the camera stands inside its bounding spheres; it is now two passes — tagged art first, room geometry only when there is something for it to occlude — at 0.14 ms, and provably the same answer over 2016 poses. (2) three.js compiles a program per material **per light count**, and the nearest-N light rule changed that count every few steps: seven different light mixes on one walk across the map, 135 programs and still climbing, with freezes up to 1194 ms. `maxActiveLights` and `shadows.maxCastingLights` are now a fixed **budget** rather than a cap, room lamps are hoisted out of the rooms that built them (three.js does not light from a hidden parent), and `renderer.warmUp()` compiles everything and bakes every shadow map behind the loading card for 60 ms. 14 programs, constant. (3) Culling was distance-only, so a fully explored map drew 803 calls and 80k triangles; `src/world/visibility.ts` now floods the cell graph through openings that are neither shut nor off screen, and objects are culled by the cells their geometry *reaches* rather than the cells their room occupies, because art leans out of its room. 45 calls average. Windows count as openings — the mansion's glass is see-through, so a wall the blueprint did not reserve for a door is assumed to have a hole in it. New doc: [`systems/RENDERING.md`](systems/RENDERING.md). |
| 2026-08-09 | **Lobby pass — and step 46's first minigame.** The long table went out of the middle of the hall; the fireplace lost its full-height slab of stone for a tapered hood over a 2 m opening with a real fire in it; the treeline outside stopped being three cones on a stick and became seven-whorl firs with snow on their shoulders. Three new things: a **`?` poster** that picks for you but never outranks somebody who picked for themselves; a **mirror** on the east gable that the player's own model now stands *inside*, because standing it on the floorboards made it read as a fourth player standing very still; and **darts** — a see-over fence across that wall, a lit annex behind it with a regulation board and a seven-segment scoreboard, and a stand handing out infinite darts. Darts put the run's own hand slots and hand buttons on screen in the cabin, deliberately: the minigame is played with exactly the controls the game is played with. New files: `config/darts.json` (separate from `items.json` on purpose), `src/entities/dart.ts`, `art/shared/lobby/darts.ts`. Two decisions worth knowing: **there is no aim arc**, because a line drawn to a disc four metres away answers the only question being asked; and `throw.releaseHeightOffset` is **0** here where a throwable's is negative, because with no arc every centimetre of offset is a centimetre the crosshair lies by. The **wind** is hidden, drifts continuously, and is worth about 3 cm at the board — enough to cost the bull, never enough to miss. `graphics.json → lobby.maxActiveLights` went to 8 so the two new lamps cannot push the sun out of the budget. |
| 2026-08-10 | **Step 39 — spectating, and text chat.** Getting out of a run stopped ending it: escaping, or holding the give-up key while downed, drops you behind a teammate's eyes with `A`/`D` to cycle, and the scoreboard waits until there is nobody left in the map to watch. The change with teeth is **when the purse is counted** — getting through the door earns the right to it, walking away from the run is when you bank it, so every teammate who cashes in behind you raises what you take home and leaving early costs you their haul. `move` gained a `pitch` for the one consumer that needs it, and the camera, the ears, the light budget and the culling all move to the watched player together (culling was the one that had to be found: left on your own body it culls rooms around a corpse in the cellar while you look at a landing two floors up). Giving up drops your hands where you lay, with one final `move` sent out of turn so no peer can later respawn what you were carrying. Text chat rides the session rather than the run, obeys the voice channel rule (`Game.canHearChatFrom` — otherwise anyone who can type defeats the separation in one line), and takes the keyboard through a single `Input.setTextCapture` flag while deliberately **not** pausing. New config: `player.json → health.giveUpHoldSeconds`, `ui.json → hud.chat`, and `input.json` moved `spectateNext`/`spectatePrev` onto the movement keys and `giveUp` onto Space. |
| 2026-08-10 | **Step 39, second pass.** One real bug and four refinements. The bug: `#spectateSignature` started at `''`, which is also what "pushed, and there is nobody to watch" hashes to — so the last player out of a map whose only teammates were already dead never got the transition and was left standing at the exit door with no way on. It starts at `null` now, which is a state a real push cannot produce. The rest: the escape menu's voice block gained a volume slider and a mute for your own microphone and for each teammate, and is hidden entirely in a solo run (both volumes are session state, like the mutes — a peer id is a lobby code that means somebody else next week); a faded chat line is kept rather than deleted, so Enter brings the backlog back instead of an empty box; and **Escape became one ordered stack** in `main.tsx`, closing the innermost open thing and nothing else, which took the duplicate wardrobe handling out of `Lobby`. |
| 2026-08-11 | **Frame rate pass, third look — Kerberos Deep.** The report was "abyss is slow, and worse after several runs". The second half turned out to be the smaller half. New instrument: `tools/leakcheck.html` drives real lobby→run→lobby cycles through the same teardown `Game.end()` runs, and counts allocations off three.js's monotonic ids rather than `renderer.info` — which cannot see a leak in geometry that is only ever *cloned* into a merge. It found four things, none of them growing fast enough to feel: five sites handing the batcher a **cache entry** with `consume: true` (which frees a buffer the cache still holds, and `clearGeometryCache()` then frees again — not a leak but a freed buffer left in a cache, waiting for the next room to ask for that size), `dartBoard.dispose()` freeing the shared box cache's `pipGeometry` by hand, the exit door's glow wash and two sign faces that nothing owned, and the viscera heart's four lobes — that pack's `Room` had no `own()` seam at all, so it gained the one abyss's already had. Created-minus-disposed is now 0 geometries and 0 materials per cycle on all three maps. **The actual problem was the pack**: 469k triangles standing against the manor's 155k, 22–40k drawn per frame against 5–7k, and every room still legal because the triangle budget was 40 000 and the manor's worst room is 8 400. `?props=1` charges each triangle to the art function that added it, which put `tubeWorms` at 15% of the whole map — three quarters of it in growth bands, because `ring()` is a 6 × 7 torus, 84 triangles for an 8 mm band on a tube with six sides. A six-sided collar is 24, and the map lost 40k triangles nobody can resolve through the fog. The budget is now **25 000**, set just above the largest room that ships so it flags the next one to grow rather than the ones already reviewed. |
| 2026-08-02 | **Slice 2 playable**: locked doors, keys, chests, lockers and the two-hand inventory. Generation now locks doors on the spanning-tree route *before* adding loops and forbids loops across a lock, which makes "always X locked doors, always enough keys" structural rather than checked — see [`systems/GENERATION.md`](systems/GENERATION.md) → "Locks and keys". Steps 9, 13, 14, 15, 22, 26 advanced. `loot.chestTable` / `floorTable` were trimmed to `key` + `empty` until the item roster lands in step 37. |
