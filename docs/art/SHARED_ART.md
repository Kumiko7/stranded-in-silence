# Shared Art Contract

Everything gameplay touches lives in `art/shared/` and is shared by **every** map.
A map pack may override any entry with a themed variant, but the contract below is
fixed — logic drives these objects by manipulating **named parts**, so a mansion door
and a prison door animate through the same code.

## 1. The registry

Every shared piece is registered by `artId`:

```ts
// art/shared/index.ts
export const sharedArt: ArtRegistry = {
  'door.standard':   buildDoor,
  'door.exit':       buildExitDoor,
  'chest.standard':  buildChest,
  'locker.standard': buildLocker,
  'player.masked':   buildPlayer,
  'enemy.ghost':     buildGhost,
  'item.key':        buildKey,
  // ...
};
```

A pack overrides by exporting `overrides` from its `pack.ts`:

```ts
export const pack: ArtPack = {
  id: 'mansion',
  rooms: [...],
  overrides: { 'door.standard': buildMansionDoor },  // must satisfy the same contract
};
```

Resolution order: **pack override → shared default**. If a pack override is missing a
required part, art validation fails loudly at load rather than breaking silently at runtime.

## 2. Builder signature

```ts
type ArtBuilder = (ctx: ArtBuildContext) => BuiltArt;

interface BuiltArt {
  object: THREE.Object3D;              // origin at floor centre, facing -Z
  colliders: Collider[];
  parts: Record<string, THREE.Object3D>;   // the named parts below
  api?: ArtApi;                        // optional richer hooks (setAlert, setCrouched)
  lights?: THREE.Light[];
  dispose?(): void;
}
```

`api` is always optional and logic must work without it — it falls back to the
named parts. Idle motion (a ghost's bob, a flicker) belongs to the art and should
be driven from a mesh's `onBeforeRender`, not asked for by logic: the simulation
only ever hands art a position, a yaw and a state.

`ArtBuildContext` gives you `materials` and `rng` — same meanings as in
[`ROOM_FORMAT.md §4.1`](ROOM_FORMAT.md).

**Universal rules**

- Origin at the floor centre of the object's footprint.
- Default facing is `-Z` (north). Logic rotates the whole object; never bake rotation in.
- Every required part must exist in `parts`, even if it is an empty `Object3D`.
- Sizes below are contracts, not suggestions. Logic and room anchors depend on them.

## 3. Required parts by `artId`

### `door.standard` — footprint `1.2 m` wide × `2.2 m` tall opening

| Part | Purpose |
| --- | --- |
| `hinge` | Pivot at the hinge edge. Logic rotates **this** to swing the door. The leaf must be a child of it. |
| `handle` | Interaction focus point; the interact prompt anchors here. |
| `lockIndicator` | Shown when the door is locked, hidden otherwise. Logic toggles `.visible`. |
| `frame` | Static frame. Not moved. |

The closed door must fully fill the opening. The open position is `hinge.rotation.y = ±90°`,
applied by logic — build it closed.

### `door.exit` — same opening, must be *unmistakable*

Adds to the above:

| Part | Purpose |
| --- | --- |
| `glow` | Emissive/light element logic pulses while `visibleGlow` is on. |
| `progressAnchor` | Where the hold-to-escape ring renders in world space. |

Read from across a room as "this is the way out" even in the dark.

### `chest.standard` — `1.0 × 0.7 m` footprint, ≤ `1.1 m` tall

| Part | Purpose |
| --- | --- |
| `lid` | Pivots open. Logic drives rotation over the hold duration. |
| `contentsAnchor` | Where a revealed item is displayed (also used by the x-ray lens). |
| `interactAnchor` | Prompt position. |

Build the body **hollow**. Logic drops the revealed item at `contentsAnchor` as a
real world object, and the player has to be able to see and click it — a solid
block swallows it.

### `locker.standard` — `0.9 × 0.7 m` footprint, `2.0 m` tall

| Part | Purpose |
| --- | --- |
| `doorLeft` | Swings open. |
| `doorRight` | Optional; empty `Object3D` if single-door. |
| `insideAnchor` | Camera position when a player is hidden inside. |
| `slats` | The vent the hidden player looks through. Logic may fade it. |

### `player.masked` — `0.64 m` across, `1.8 m` tall

| Part | Purpose |
| --- | --- |
| `root` | Whole body; yaw applied here. |
| `head` | Pitched with the player's look. |
| `handLeft` / `handRight` | Item attachment sockets. Held items parent here. |
| `nameAnchor` | Where the nameplate/voice indicator floats (~`2.1 m` up). |
| `hatAnchor` | Where a cosmetic `hat.*` parents. On the **crown**, and a child of `head`, so a hat pitches with the look instead of hovering level while its owner stares at the floor. |

Also expose `setCrouched(t: number)` on the builder result's optional `api` if the art
supports a crouch pose; logic falls back to scaling `root` if absent.

`api.setColour(hex)` tints the body to that player's wardrobe choice
(`player.json → customisation.colours`). The builder **must clone** `playerBody`
before using it — a shared material would repaint every player in the run at once —
and return a `dispose()` that frees the clone.

**One colour, a whole body.** The default builder clones `playerBody` three times
and mixes the wardrobe colour toward black for boots, gloves, pack and webbing and
toward black again for the visor, while `playerMask` stays the pale the pack asked
for and does the trim. That is why adding a wardrobe colour costs the packs nothing:
a pack states two colours and gets a whole suit out of them.

Nothing in `src/` builds this by hand — `src/render/playerBody.ts` is the only
caller, and it is what dresses a body from a `Cosmetic` (`src/shared/cosmetics.ts`).

The body must **stand on the floor with legs**, not float: the lobby wardrobe parks
it full height two metres from the camera, where a bare capsule reads as a bug.

### `enemy.ghost` — capsule `0.84 m` diameter, `1.95 m` tall

| Part | Purpose |
| --- | --- |
| `root` | Whole body; yaw applied here. |
| `alertVisual` | Shown/tinted per alert level. Logic calls `api.setAlert(level)` if provided, else toggles `.visible`. |
| `eyeAnchor` | Origin for the sight cone in debug view. |

Mostly floating — minimal animation is expected and preferred.

The builder returns a `dispose()`, and `Game` calls it: the ghost clones its shroud
and alert materials so one hunter can be tinted without touching the pack cache, so
the run that built them is the run that has to free them.

The alert colour is a **primary gameplay signal**, not decoration: it is how a
player reads `calm / suspicious / alerted / chasing` across a dark room, so make it
carry from any angle and at distance. The default builds it from glowing eyes, a
halo and a coloured light the ghost carries, which is why it reads through fog.

### `item.*` — must fit `0.35 × 0.35 × 0.4 m` (`config/items.json → sizeClass`)

One builder per id in `config/items.json → items`: `item.key`, `item.medicine`,
`item.flashbang`, `item.alarmClock`, `item.tarFlask`, `item.barricade`,
`item.coinPile`, `item.diamond`.

| Part | Purpose |
| --- | --- |
| `gripAnchor` | Where the hand socket attaches when held. |
| `restAnchor` | Contact point when resting on a surface. |

**Items have no collider at all** — return `colliders: []`. They sit on tables,
shelves and chest floors, and collision is a 2D floor-plane test, so a collider
under a shelf ledge would block a doorway you can see straight through. You pick
an item up by looking at it, not by walking into it.

An item is met three times over — lying in a dark room, sitting in an opened chest,
and tumbling through the air after somebody threw it — so **the silhouette has to
carry from every angle**. Two shapes at two heights beat one clean form: the
bandages are a tin *and* a roll, the diamond is a stone *and* a claw. Anything that
reads as a plain box from three sides out of four is not finished.

`item.alarmClock` exposes `api.setActive(on)` — logic turns the ringing on when the
clock lands and off when it winds down. What ringing *looks* like is the art's
business, and belongs in `onBeforeRender` like any other idle motion.

### `hat.*` — cosmetics, parented to the player's `hatAnchor`

One builder per id in `config/player.json → customisation.hats`. **No required
parts, no collider** — a hat is scenery riding a head, and that is the whole
contract.

- Origin at the **crown**, facing `-Z`, with the head's centre `0.19 m` below it.
  Anything that wraps the head hangs below `y = 0`; anything stacked on top rises
  above it. Nothing may reach more than about `0.42 m` out, or a hat clips a
  doorway its owner walks through.
- Hats bring their **own materials** (`art/shared/characters/hatMaterials.ts`),
  like `vfx.throwArc` and for a related reason: a player *bought* that top hat, so
  it has to be that top hat in every map. Logic resolves a hat **without** passing
  the pack's overrides, so a pack cannot theme one.
- No `THREE.Light`. A hat that glows does it with an emissive or unlit material —
  the light budget is fixed per room (`systems/RENDERING.md`) and a cosmetic may
  not spend a slot from it.
- Idle motion (a spinning propeller, a guttering candle, falling rain) belongs to
  the art, from `onBeforeRender`, like every other idle motion in the project.

`hat.none` is a **registered, empty** builder rather than a null the rest of the
game has to remember to check for. Bare-headed is a choice in the wardrobe like any
other, and this is what makes it cost nothing to handle.

Adding a hat is a builder, a line in `hatArt`, an entry in
`player.json → customisation.hats` with a `cost`, and a `cosmetic.hat.*` locale key
in every language. Nothing else in the game changes.

### `door.barricade` — hung on a door's own transform

Origin at the floor centre of the doorway, facing `-Z`, exactly like `door.standard`,
so it lines up with any themed door without knowing anything about it. Sized from
`ctx.dims.doorWidth` / `doorHeight`. No parts and no collider: logic only ever adds
the whole piece and deletes it — the door behind it is what actually blocks.

### `vfx.*` — what a thrown item leaves behind

Built at **unit radius**; logic scales the object to the radius in `items.json` and
drives the shape below. That way "a bigger tar flask" is a config edit.

| `artId` | Driven by | Notes |
| --- | --- | --- |
| `vfx.throwArc` | `api.setArc(points)` | The aim line, as world-space `[x, y, z, …]` already computed by the simulation. The art does **no** ballistics of its own — the line on screen is the flight. Brings its own materials (see below). |
| `vfx.tarPool` | `api.setProgress(t)` | The slick spreading, 0 → 1. Flat on the floor: collision is a floor-plane test, so anything that slows you down has to *be* the floor. |
| `vfx.flashBurst` | `api.setProgress(t)` | The flare burning out, 0 → 1. The core is a **fireball, not the blast radius** — at a nine-metre radius it still only grows to about a metre. What the radius *is*, is the ground ring's job. Clones its material to fade its own copy. |

`vfx.throwArc` and the `hat.*` roster are the two shared pieces that bring their
**own** materials rather than asking the pack for them, for the same reason the
lobby does (§3.2). The arc is a heads-up overlay drawn for one player, not a thing
standing in the world, and a pack theming it could only make an aim line harder to
read. A hat is something a player paid coins for, and a pack theming it would make
the shop a liar — on top of which a themeable roster would mean adding two dozen
material names to every pack every time a hat shipped, which is exactly the tax that
stops new hats being cheap.

## 3.2 The lobby

The cabin (`art/shared/lobby/`) is not a map and has no art pack, so it brings its own
material library (`createLobbyMaterials()`) which still satisfies §3.1 in full. It is
built by `buildLobby(ctx, posterSlots)` and returns **anchors** — arrival spots, one
per poster slot, the wardrobe, the mannequin, the wardrobe camera, the lever and the
minigame wall. `src/world/lobbyScene.ts` places the pieces below at them, exactly as
`worldBuilder.ts` places doors and chests in a room.

### `poster.*` — `0.72 m` wide × `1.02 m` tall, origin at the BOTTOM CENTRE

| Part | Purpose |
| --- | --- |
| `tick` | Shown once this player has escaped that map **themselves**. Logic toggles `.visible`. |
| `mark` | The pick highlight. Logic toggles `.visible` and tints it via `api.setMark(hex)`. |
| `interactAnchor` | Prompt position. |

A poster carries **no text**. Art has no access to `t()` and a map's name is a locale
key, so the name reaches the player through the interact prompt and the expedition
panel. `maps.json → maps.<id>.posterArtId` names the builder; an id that is not
registered falls back to `poster.blank`, which is also what hangs in the slots no map
has claimed. Adding the nineteenth map's poster is a texture plus one registry line.

`mark`'s material must be **cloned** before tinting, for the same reason the ghost
clones its alert material.

### `lobby.wardrobe` — `1.4 × 0.66 m` footprint, `2.3 m` tall

| Part | Purpose |
| --- | --- |
| `doorLeft` / `doorRight` | The two leaves. Hung open; nothing animates them. |
| `interactAnchor` | Prompt position. |

### `lobby.lever` — `0.7 × 0.5 m` footprint, `1.15 m` tall

| Part | Purpose |
| --- | --- |
| `handle` | Pivots along the lever's travel. Logic calls `api.setLever(t)`, `t` in `0..1`. |
| `interactAnchor` | Prompt position. |

### `lobby.minigame` — scenery

No parts, no interaction, no collider: the wall a minigame goes on (plan step 46).
Build it as something visibly *covered* rather than as blank wall — "this is coming"
is the whole message.

## 3.1 Materials shared art asks for

Shared art gets its materials from the **pack's** library, so every pack must
provide these names (see `art/packs/test/materials.ts` for a minimal set).

**Shared art is not batched**, which changes what a material may be. A room's
geometry goes through `MeshBatcher`, which re-projects UVs in world units so a
tiling texture keeps its density on anything; a door, a chest and a locker are
built as their own meshes and carry a box's own UVs - **one repeat over the whole
leaf**. A pack that hands `door` a 2.6 m tiling stone map gets a single smeared
patch stretched across the door, which reads as a blank slab. Either give these
names a flat tint, or author a texture *as* a door: composed in 0..1 UV space,
with a border, a centre line and detail where a door has detail. `viscera`'s
`bonePlate` is a worked example.

| Name | Used by |
| --- | --- |
| `door`, `doorFrame`, `lockIndicator` | `door.standard` |
| `exitDoor`, `exitFrame`, `exitGlow` | `door.exit` |
| `chest`, `chestTrim` | `chest.standard` |
| `locker`, `lockerVent` | `locker.standard` |
| `itemMetal` | `item.key` |
| `itemSteel`, `itemWood`, `itemCloth`, `itemAccent`, `itemBrass`, `itemEnamel`, `itemGold`, `itemTar`, `itemGlass`, `itemGem` | the item roster — `item.medicine`, `item.flashbang`, `item.alarmClock`, `item.tarFlask`, `item.barricade`, `item.coinPile`, `item.diamond`, `door.barricade` |
| `vfx.tar`, `vfx.tarRim` | `vfx.tarPool` — the rim is matte and a shade lighter, so a black disc on a dark floor reads as spilt rather than as a hole in the boards |
| `vfx.flash` | `vfx.flashBurst` — **cloned** by the builder so one flare fading does not dim every other one |
| `playerBody`, `playerMask` | `player.masked` — both are **cloned** by the builder so `setColour` tints one player, not all of them. `playerBody` carries three shades and `playerMask` the trim |
| `ghostShroud`, `ghostAlert` | `enemy.ghost` — both are **cloned** by the builder so it can tint per alert level without touching the shared cache |
| `timberDark`, `poster.blank`, `poster.<map>`, `poster.tick`, `poster.mark` | `poster.*` (lobby only) |
| `timber`, `timberPale`, `timberDark`, `iron`, `brass`, `copper`, `mirror`, `canvas`, `cushion`, `cushionGreen` | `lobby.wardrobe`, `lobby.lever`, `lobby.minigame` (lobby only) |

Adding a shared piece that needs a new material means adding it to this table and
to every pack.

## 4. VFX and indicators

`art/shared/vfx/` holds the aim arc, the thrown-item effects (§3 above) and, later,
the enemy alert indicators and escape glow. They are driven entirely by logic
through `setArc`, `setProgress`, `setActive` and friends, and are documented
alongside their builders. They are shared across all packs by default; packs may
override for theme.

The full-screen part of the horror feedback — the alert wash, the heartbeat pulse,
the damage flash and a flare's white-out — is **not** here. It is a DOM compositing
layer (`src/render/feedback.ts`); see ARCHITECTURE.md §10.

## 5. When you add a new shared piece

1. Add the builder under `art/shared/<category>/`.
2. Register it in `art/shared/index.ts`.
3. **Document its required parts in this file.** A part not documented here is a part
   logic is not allowed to depend on.
4. If it is placed by the generator, add an anchor kind in [`ROOM_FORMAT.md §3`](ROOM_FORMAT.md).
5. If it is configurable, add it to the relevant file in `config/` — never hardcode.
