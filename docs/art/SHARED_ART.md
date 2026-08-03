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

### `player.masked` — capsule `0.64 m` diameter, `1.8 m` tall

| Part | Purpose |
| --- | --- |
| `root` | Whole body; yaw applied here. |
| `head` | Pitched with the player's look. |
| `handLeft` / `handRight` | Item attachment sockets. Held items parent here. |
| `nameAnchor` | Where the nameplate/voice indicator floats (~`2.1 m` up). |

Also expose `setCrouched(t: number)` on the builder result's optional `api` if the art
supports a crouch pose; logic falls back to scaling `root` if absent.

### `enemy.ghost` — capsule `0.84 m` diameter, `1.95 m` tall

| Part | Purpose |
| --- | --- |
| `root` | Whole body; yaw applied here. |
| `alertVisual` | Shown/tinted per alert level. Logic calls `api.setAlert(level)` if provided, else toggles `.visible`. |
| `eyeAnchor` | Origin for the sight cone in debug view. |

Mostly floating — minimal animation is expected and preferred.

The alert colour is a **primary gameplay signal**, not decoration: it is how a
player reads `calm / suspicious / alerted / chasing` across a dark room, so make it
carry from any angle and at distance. The default builds it from glowing eyes, a
halo and a coloured light the ghost carries, which is why it reads through fog.

### `item.*` — must fit `0.35 × 0.35 × 0.4 m` (`config/items.json → sizeClass`)

| Part | Purpose |
| --- | --- |
| `gripAnchor` | Where the hand socket attaches when held. |
| `restAnchor` | Contact point when resting on a surface. |

**Items have no collider at all** — return `colliders: []`. They sit on tables,
shelves and chest floors, and collision is a 2D floor-plane test, so a collider
under a shelf ledge would block a doorway you can see straight through. You pick
an item up by looking at it, not by walking into it.

## 3.1 Materials shared art asks for

Shared art gets its materials from the **pack's** library, so every pack must
provide these names (see `art/packs/test/materials.ts` for a minimal set):

| Name | Used by |
| --- | --- |
| `door`, `doorFrame`, `lockIndicator` | `door.standard` |
| `exitDoor`, `exitFrame`, `exitGlow` | `door.exit` |
| `chest`, `chestTrim` | `chest.standard` |
| `locker`, `lockerVent` | `locker.standard` |
| `itemMetal` | `item.key` |
| `playerBody`, `playerMask` | `player.masked` |
| `ghostShroud`, `ghostAlert` | `enemy.ghost` — both are **cloned** by the builder so it can tint per alert level without touching the shared cache |

Adding a shared piece that needs a new material means adding it to this table and
to every pack.

## 4. VFX and indicators

`art/shared/vfx/` holds the enemy alert indicators, heartbeat distortion, damage
flash and escape glow. They are driven entirely by logic through `setAlert`,
`setIntensity` etc. and are documented alongside their builders. They are shared
across all packs by default; packs may override for theme.

## 5. When you add a new shared piece

1. Add the builder under `art/shared/<category>/`.
2. Register it in `art/shared/index.ts`.
3. **Document its required parts in this file.** A part not documented here is a part
   logic is not allowed to depend on.
4. If it is placed by the generator, add an anchor kind in [`ROOM_FORMAT.md §3`](ROOM_FORMAT.md).
5. If it is configurable, add it to the relevant file in `config/` — never hardcode.
