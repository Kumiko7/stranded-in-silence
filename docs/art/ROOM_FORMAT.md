# Room Blueprint Format

**Read this file alone to author a new room.** You do not need to read any file in `src/`.

A room is a TypeScript module under `art/packs/<packId>/rooms/`. It exports one
`RoomBlueprint`. The game's map generator plans an entire map from blueprint
**metadata only** — it never instantiates 3D objects to do so. That separation is
what makes art swappable: two rooms with the same footprint and the same anchor
counts are gameplay-identical no matter how differently they look.

---

## 1. Coordinate system

| Rule | Value |
| --- | --- |
| Up axis | `+Y` |
| Room-local origin | floor centre of footprint cell `(0,0)` |
| Cell size | `config/world.json → grid.cellSize` (currently **8.0 m**) |
| Ceiling height | `config/world.json → grid.ceilingHeight` (currently **3.4 m**) |
| Wall thickness | `config/world.json → grid.wallThickness` (currently **0.3 m**) |
| Cell `(gx, gy)` centre, room-local | `(gx * cellSize, 0, gy * cellSize)` |
| Wall sides | `north = -Z`, `east = +X`, `south = +Z`, `west = -X` |

A 1×1 room is therefore centred on the origin and spans `-4..+4` on X and Z.
Multi-cell rooms extend toward `+X` and `+Z`.

**Never type these numbers yourself, and never import config.** They arrive in the
build context:

```ts
function build(ctx: RoomBuildContext) {
  const { cellSize, ceilingHeight, doorWidth } = ctx.dims;
}
```

Art imports nothing but `three` and the contract types — that is what keeps the
one-way dependency in [`ART_GUIDE.md §1`](ART_GUIDE.md) honest. If `cellSize`
changes in config, every correctly authored room still fits.

---

## 2. The blueprint

```ts
import type { RoomBlueprint } from '@art/lib/contract';

export const library: RoomBlueprint = {
  id: 'mansion.library',
  nameKey: 'room.mansion.library',      // optional, for lore/debug UI
  footprint: [[0, 0]],                  // list of cells this room occupies
  doorWalls: [
    { cell: [0, 0], side: 'north' },
    { cell: [0, 0], side: 'east'  },
    { cell: [0, 0], side: 'south' },
    { cell: [0, 0], side: 'west'  },
  ],
  anchors: {
    chest:      [{ position: [-2.4, 0, -2.9], rotationY: 0 }],
    locker:     [{ position: [ 3.1, 0, -1.2], rotationY: -Math.PI / 2 }],
    itemSpawn:  [
      { position: [ 0.0, 0.92, -1.4] },   // on the reading table
      { position: [-3.2, 1.10,  2.2] },   // shelf ledge
      { position: [ 2.6, 0.00,  3.1] },   // floor, by the armchair
    ],
    playerSpawn: [{ position: [0, 0, 2.5], rotationY: Math.PI }],
    patrolPoint: [{ position: [-2, 0, 0] }, { position: [2, 0, 2] }],
  },
  weight: 10,
  tags: ['quiet', 'bookish'],
  build,
};
```

### 2.1 Field reference

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | ✅ | Globally unique, `<packId>.<roomName>`. Used in saves and net messages — **never rename a shipped id.** |
| `footprint` | ✅ | Cells occupied, relative to `(0,0)`. Must be orthogonally connected and include `[0,0]`. Most rooms are `[[0,0]]`. |
| `doorWalls` | ✅ | Every wall edge that is *allowed* to become a door. The generator picks a subset. Edges you omit are guaranteed solid. Must be an outer edge of the footprint. |
| `anchors` | ✅ | Placement points for gameplay content. See §3. |
| `weight` | | Selection weight when the generator picks rooms. Default `10`. Higher = more common. |
| `tags` | | Free-form. Used by map configs to bias or exclude rooms (e.g. `tags: ['entrance']`). |
| `maxPerMap` | | Cap on duplicates. Default from `config/world.json → layout.maxDuplicatesPerRoom`. |
| `build` | ✅ | The function that makes the geometry. See §4. |

### 2.2 Rotation

Rooms are placed at any 90° rotation that makes their `doorWalls` cover the slot,
so **you never need a mirrored twin**: one `2x1` covers `1x2`, and one north-facing
dead end serves dead ends facing all four ways. Rotation transforms the footprint,
the door walls, every anchor (position *and* `rotationY`) and every collider
together, so you author in one frame and never think about it again.

Two things follow:

- A room offering all four walls will be placed at a random one of the four
  rotations, so **do not rely on a particular wall facing a particular way**
  relative to anything outside the room.
- Restricting `doorWalls` restricts *how many* walls may open, not *which* — a
  three-wall room fits every slot needing three or fewer, at whichever angle
  works.

### 2.3 Footprint shapes

`1x1` is the default and should be **at least 80 %** of any pack. Other shapes are
packed into the grid before the maze is grown, at most one of each per map, while
`config/world.json → layout.multiCellRooms.enabled` is true:

```
1x1  [[0,0]]
1x2  [[0,0],[0,1]]
2x1  [[0,0],[1,0]]
1x3  [[0,0],[0,1],[0,2]]
2x2  [[0,0],[1,0],[0,1],[1,1]]
L    [[0,0],[1,0],[0,1]]
```

---

## 3. Anchors

An anchor is `{ position: [x, y, z], rotationY?: number }` in room-local space.
`position.y` is the surface the thing rests on, `rotationY` is its facing in radians.

| Anchor kind | Count guidance | What spawns there |
| --- | --- | --- |
| `chest` | 0–2 | A chest. Needs `1.0 × 1.0 m` clear floor and `1.6 m` of clear space in front (facing = `rotationY`). Loud to open. |
| `locker` | 0–3 | A locker a player can hide inside. Needs `0.9 × 0.9 m` floor, backed against a wall, `1.2 m` clear in front. |
| `itemSpawn` | 1–4 | A world item. Reserve a **`0.35 × 0.35 × 0.4 m`** box (`config/items.json → sizeClass`). This is why all items are roughly the same size. |
| `playerSpawn` | 0–4 | Where players start if this room is picked as the start room. Give 4 if you tag the room `entrance`. |
| `enemySpawn` | 0–1 | Where the enemy may appear. Prefer a corner or an alcove out of direct sight of the doors. |
| `patrolPoint` | 2–4 | Waypoints the enemy wanders between. Spread them across the room. Nearly every room should have these. |
| `trap` | 0–1 | Floor/ceiling trap volume. Flat, unobstructed floor. |
| `treasure` | 0–2 | Optional decorative valuables. |

**Rules**

0. **Facing is load-bearing for `chest` and `locker`.** Shared art faces `-Z`, and
   `rotationY` turns it (see [`SHARED_ART.md`](SHARED_ART.md) §2), so a container
   backed against the **west** wall faces `-PI/2`, **east** `+PI/2`, **south** `0`
   and **north** `PI`. A quarter turn out and the container opens into the
   plaster, which looks perfectly fine in the room and is unusable in the run. The
   floor in front of it must be clear and walkable — `1.6 m` for a chest, `1.2 m`
   for a locker — and `npm run validate:art` checks both the clearance and, by
   implication, the facing.
1. Anchors must be reachable — no anchor inside a collider, none behind furniture.
2. Anchors must not block a doorway. Keep `1.2 m` clear in front of every entry in `doorWalls`.
3. `itemSpawn` anchors want to read as *intentional* spots: a table edge, a shelf, a
   desk, a plinth. Not a random patch of floor (though one floor spot is fine).
4. If the generator asks for more of a kind than you declared, it simply places fewer.
   Declaring the max is always better than declaring too few.

---

## 4. `build(ctx)`

```ts
import * as THREE from 'three';
import type { RoomBuildContext, BuiltRoom } from '@art/lib/contract';

function build(ctx: RoomBuildContext): BuiltRoom {
  const group = new THREE.Group();
  const colliders = [];

  // The kit builds shell geometry that already respects ctx.doors. It needs the
  // footprint: a 2x1 room has walls on six outer edges, not four.
  const shell = ctx.kit.shell(ctx, blueprint.footprint);
  group.add(shell.object);
  colliders.push(...shell.colliders);

  // ... your decoration goes here ...

  return { object: group, colliders };
}
```

A pack's kit may expose more than `shell()`. The mansion pack's rooms call
`addShell(batch, ctx, footprint, styleOptions)` from its own `kit/shell.ts`
directly, so they can choose a floor, a wallpaper and a ceiling treatment and
share one geometry batch with their furniture; `PackKit.shell()` remains the
contract anything holding only a `PackKit` can rely on. Keeping the door-cutting
logic in **one** function per pack is the part that matters - how rooms reach it
is the pack's business.

### 4.1 `RoomBuildContext`

| Field | Type | Notes |
| --- | --- | --- |
| `doors` | `Record<CellSideKey, DoorState>` | **Which of your `doorWalls` actually became doors this run.** `DoorState` is `'none' \| 'open' \| 'locked'`. You must cut an opening wherever it is not `'none'` and leave the wall solid where it is. |
| `kit` | `PackKit` | Your pack's shared builders (walls, floors, trim, materials). |
| `materials` | `MaterialLibrary` | Cached, shared materials. **Always** get materials from here — never `new THREE.MeshStandardMaterial` per room instance or you will blow the draw-call budget on duplicate rooms. |
| `rng` | `() => number` | Seeded RNG. Use this for any randomness so runs replay identically across peers. **Never use `Math.random()` in art.** |
| `dims` | `RoomDims` | `cellSize`, `ceilingHeight`, `wallThickness`, `doorWidth`, `doorHeight`. The only place art learns world dimensions. |
| `roomIndex` | `number` | This room's index in the map; handy as a variation seed. |
| `lightBudget` | `number` | Max real (shadow-casting or not) lights you may add. Exceeding it is a validation error. |

### 4.2 `BuiltRoom`

| Field | Required | Notes |
| --- | --- | --- |
| `object` | ✅ | A single `THREE.Object3D` positioned in room-local space. The world places it. |
| `colliders` | ✅ | Everything the player cannot walk through. See §5. |
| `lights` | | Any `THREE.Light` you added, listed so the renderer can budget/cull them. Still parent them into `object`. |
| `dispose` | | Called when the room unloads. Only needed if you allocated geometry/textures outside `ctx.materials`. |

---

## 5. Collision

Collision is **2D and simple**: circle-vs-shape on the floor plane. There is no
jumping and no vertical movement. Either you can walk into a thing or you cannot.

```ts
{ kind: 'box',      center: [x, z], halfExtents: [hx, hz], rotationY: 0 }
{ kind: 'circle',   center: [x, z], radius: r }
```

Rules:

- **Only add colliders for things that matter.** A rug, a painting, a cobweb, a ceiling
  beam and a chandelier get **no collider**. A bookshelf, a table, a pillar and a
  sofa do.
- Keep collider counts under ~25 per room. Merge adjacent furniture into one box.
- Collision is *generous* toward the player. Round colliders slightly inward
  (~5 cm) rather than outward so players do not snag on decoration.
- Do **not** add colliders for walls you built with `ctx.kit.shell()` — it returns
  those already.
- Chests, lockers and doors bring their own colliders. Items deliberately have none.
  Either way, do not add colliders for anchors.
- **The generator places containers after your room is built**, so nothing in
  `build()` can see them. Leave room for them yourself: keep other anchors clear
  of a `chest` or `locker` anchor, remembering a chest is `1.0 x 0.7 m` and a
  locker `0.9 x 0.7 m` (see [`SHARED_ART.md`](SHARED_ART.md)). `npm run validate:art`
  checks the spacing.

---

## 6. Lighting

- The room owns its **decorative** light sources only: candles, a fireplace, a lamp,
  a window shaft. Global ambient/fog/exposure come from `config/graphics.json`.
- Respect `ctx.lightBudget` (default **2** real lights per room). Use emissive
  materials, baked-look vertex tinting and light-cone meshes for everything else —
  they are free.
- **Dark but never blind — and there is no flashlight.** Players carry no light
  source, so **every room must light itself well enough to navigate.** A player
  standing anywhere in the room must be able to read the layout and find the doors.
  If your room is pitch black, it is broken: add a weak practical light, moonlight
  from a window, or raise emissive on key surfaces.
- Never set `renderer`, `scene.fog`, tone mapping or exposure from a room.
- **Shadows are the room's own decision.** The renderer enables the shadow map but
  sets `castShadow` on nothing, so a room that wants shadows sets it on at most one
  of its own lights - the budget below. Rooms are static, so set
  `light.shadow.autoUpdate = false` and `shadow.needsUpdate = true` once: the map
  is baked at load (`Renderer.warmUp()`) and costs nothing afterwards.
- **A lit room stays lit when it is culled.** three.js does not light anything
  from a light whose parent is hidden, so culling never hides a room outright:
  it hides the parts that hold no light and leaves the path down to each lamp
  standing (`hidableParts()` in `src/world/worldBuilder.ts`). A fire behind a
  shut door still spills round it, exactly as before there was any culling. Put
  a light wherever it belongs and animate it however you like — `flicker()` and
  `sway()` both work — but do declare it in `BuiltRoom.lights`, because a light
  logic has not been told about is a light that goes out.
- **A window may only go on a wall you left out of `doorWalls`.** The generator
  decides doors at run time, so the only walls guaranteed solid for a whole run are
  the ones you never offered. A window on an offered wall is a window in a doorway
  the day the generator picks that edge.

---

## 7. Performance budget (per room)

| Metric | Budget |
| --- | --- |
| Draw calls | ≤ 40 |
| Triangles | ≤ 40 000 |
| Real lights | ≤ 2 |
| Shadow-casting lights | ≤ 1 |
| Unique materials created | 0 (use `ctx.materials`) |

These numbers are **guidance**. `npm run validate:art` reports draw calls,
triangles and collider counts as warnings, not errors: going over for a set piece
is a conversation with whoever is profiling, not a reason to make a room worse.
The light budget *is* enforced — a room that quietly adds a third light degrades
every other room on screen, because three.js compiles every visible light into the
shader.

Up to 36 rooms exist at once but all are resident in memory, and only the ones the
eye can actually reach are drawn — within `renderDistanceRooms`, and through
doorways that are neither shut nor off screen
([`../systems/RENDERING.md`](../systems/RENDERING.md)). Reuse geometry
aggressively — build a geometry once at module scope and instance it.

Two things the culler assumes, both of which are already rules above:

- **A window only goes on a wall left out of `doorWalls`.** That is what tells
  logic which walls are guaranteed solid — you can see the next room through
  glass, so a wall that might have a window in it is treated as an opening.
- Geometry that **leans out of its room** (a light shaft falling through the wall
  behind its window) is handled: a room is culled by the cells its geometry
  reaches, not the cells it occupies. It costs that room an extra cell, so keep
  the overhang to what the look needs.

**Batch rather than fight the budget.** One mesh per box spends 40 draw calls on
the skirting alone. `art/lib/merge.ts` (`MeshBatcher`) collects posed geometry,
groups it by material and merges each group into a single mesh, which is how a
mansion room built from three hundred boxes costs about twenty draws. Merged
geometry is allocated per room instance, so a room that batches **must** return the
batcher's `dispose` as `BuiltRoom.dispose`.

---

## 8. Authoring checklist

- [ ] `id` is `<packId>.<name>` and unique
- [ ] `footprint` includes `[0,0]` and is connected
- [ ] `doorWalls` only lists outer edges; `1.2 m` clear in front of each
- [ ] `build()` respects `ctx.doors` — solid where `'none'`, open otherwise
- [ ] Anchors: ≥2 `patrolPoint`, 1–4 `itemSpawn`, chests/lockers as appropriate
- [ ] No anchor is inside a collider or blocking a door
- [ ] All randomness uses `ctx.rng`
- [ ] All materials come from `ctx.materials`
- [ ] Colliders present for blocking furniture, absent for decoration
- [ ] ≤ 2 lights, and the room is navigable on its own light (there is no flashlight)
- [ ] Registered in the pack's `pack.ts` room list
- [ ] Nothing in `build()` touches the DOM (see [`ART_GUIDE.md`](ART_GUIDE.md))
- [ ] Merged geometry is freed in `dispose()`

`npm run validate:art` checks all of the above automatically, plus several things
you cannot check by eye. It builds every room **headless, in Node**, once per legal
combination of doors and once per seed, and then:

- voxelises the room against its own colliders at the player's radius and floods
  from every doorway. **Every doorway must reach every other doorway, and every
  anchor must be reachable.** This is the "you cannot get stuck in a room" test,
  and it is the reason nothing in `art/` may touch the DOM or a GL context;
- checks that a side the generator closed is really walled, and a side it opened is
  really walkable;
- checks anchors are not buried in furniture, not in a doorway, and not on top of
  each other;
- rebuilds with the same seed and compares the geometry, catching anything reading
  outside `ctx.rng`;
- reports draw calls, triangles, lights and colliders per room.

Run it after every room. It is far faster than launching the game, and it catches
the class of bug a playtest otherwise finds at 2 a.m.

What it cannot tell you is whether the room **looks** right — it never opens a GL
context, by design. For that, screenshot it through the real renderer:
[`ROOM_REVIEW.md`](ROOM_REVIEW.md).

---

## 9. Related docs

- [`ART_GUIDE.md`](ART_GUIDE.md) — art principles, theme rules, material conventions
- [`SHARED_ART.md`](SHARED_ART.md) — doors, chests, lockers, items, player, enemy
- [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md) — building a whole new map pack
- [`../systems/GENERATION.md`](../systems/GENERATION.md) — how blueprints become a maze
