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

### 2.1.1 Wall-local placement

Every pack ends up with a `wallPose(side, along, inset)`-shaped helper, and every
pack gets the same thing wrong once: **`along` runs along the prop's own local
+X, which is turned by the wall's facing.** On a south wall `+along` is `+x`, but
on a north wall it is `-x`, on an east wall `-z` and on a west wall `+z`. A shelf
placed with `along: 1.4` on the east wall lands at `z = -1.4`, so an item anchor
typed as `[3.2, 1.3, 1.4]` floats a metre and a half from the shelf holding it.
Nothing catches this - the validator only asks whether the anchor is reachable,
and a floating item is perfectly reachable. Check the pairing by eye on a contact
sheet ([`ROOM_REVIEW.md`](ROOM_REVIEW.md)).

### 2.1.2 Facing: the three conventions that do not match

Three different things in this codebase have three different idea of "forwards",
and mixing them up is the single most common way to ship a room that validates
and looks broken.

| Thing | Faces | To point it into the room |
| --- | --- | --- |
| Shared art and pack props (`chest`, `locker`, a wall lamp) | `-Z` | `rotationY = FACE[side]` — north `PI`, east `PI/2`, south `0`, west `-PI/2` |
| A `PlaneGeometry` / `CircleGeometry` (its front face is `+Z`) | `+Z` | the prop's `rotationY` **plus `Math.PI`** |
| A `TorusGeometry` (lies in its own XY plane) | axis along `+Z` | flat on the floor needs `tiltMatrix(..., [PI/2, 0, 0])`; a band round a wall-mounted dome needs the prop's plain `rotationY` |

A single-sided plane facing the wrong way is **invisible from the room and black
from behind**, and nothing in `validate:art` can see it. A torus posed with
`poseMatrix` alone stands on edge like a wheel.

The **player's camera** is a fourth convention and the one that bites hardest,
because a `playerSpawn` facing a wall is the first thing four people will see.
`Game` aims it along `(-sin y, ·, -cos y)`, so:

| Look toward | `rotationY` |
| --- | --- |
| `-Z` (north) | `0` |
| `+X` (east) | `-PI/2` |
| `+Z` (south) | `PI` |
| `-X` (west) | `PI/2` |

Note that this is the **opposite sign** to the prop convention for east and
west. Check every spawn on the contact sheet — the review tool renders
`player spawn 1` exactly the way the run does.

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
2. Anchors must not block a doorway. Keep `1.2 m` clear in front of every entry in
   `doorWalls`. **A doorway is centred on its own cell**, so in a multi-cell room the
   openings march along the wall one per cell — a `1x3` corridor has them at
   `z = 0, 8, 16` down each side. Backing a chest against a wall at a cell's midpoint
   puts it squarely in the door; offset it along the wall instead. `npm run
   validate:art` builds the real chest and locker art at every anchor you declare and
   walks a player through each opening, so it fails on this rather than a playtest.
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
| `lightBudget` | `number` | Max real (shadow-casting or not) lights you may add: **2 for a 1x1, one more per extra cell, capped at 4**. Exceeding it is a validation error. Read it; never assume 2. |

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
- **A gap narrower than `0.64 m` is a wall.** The player is a circle of radius
  `0.32 m` and the flood fill walks that circle, so a gangway between two crates,
  or between a set piece and the plate, has to be **at least 0.7 m** to be worth
  anything. Anything the other side of a 0.5 m gap is not "hard to reach", it is
  unreachable, and every anchor behind it fails.
- **The floor is a solid slab and you cannot cut a hole in it.** The kit lays one
  per cell, roughly `y = -0.12 .. 0`, so a pool, a pit or a sump recessed below
  `y = 0` is simply hidden behind the floor. Build it *at* deck level with a
  raised rim instead — collision is a 2D floor test, so a hole you can fall into
  is not a thing this engine has anyway.
- **On a multi-cell room the door lanes repeat per cell.** A doorway is centred
  on its own cell, so a `2x1` has fore openings at `x = 0` **and** `x = 8`, not
  one in the middle of the run. The safe wall on a `2x1` is the part *between*
  the two cells' centres.

---

## 6. Lighting

- The room owns its **decorative** light sources only: candles, a fireplace, a lamp,
  a window shaft. Global ambient/fog/exposure come from `config/graphics.json`.
- Respect `ctx.lightBudget` — **2** real lights for a 1x1 room, one more for each
  extra cell up to a maximum of **4**, so a 2x1 corridor gets 3 and a 2x2 hall or
  a 1x3 gets 4. A set piece lit from two points has black ends a player cannot
  find the doors in; a 1x1 lit from two points does not. Use emissive
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
| Triangles | ≤ 10 000 **per cell** |
| Real lights | ≤ `ctx.lightBudget` (2 for 1x1, +1 per extra cell, max 4) |
| Shadow-casting lights | ≤ 1 |
| Unique materials created | 0 (use `ctx.materials`) |

These numbers are **guidance**. `npm run validate:art` reports draw calls,
triangles and collider counts as warnings, not errors: going over for a set piece
is a conversation with whoever is profiling, not a reason to make a room worse.

**The triangle number is a ratchet, not a ceiling.** It is always set just above
the largest 1x1 that actually ships, so it says nothing about rooms already
reviewed and speaks up for the next one to grow — which means it comes DOWN
every time a pass reduces the worst room:

| | Set to | Because the worst 1x1 was |
| --- | --- | --- |
| originally | 40 000 | 8 400 (the manor). Headroom nobody would use, so it never fired — Kerberos Deep spent the whole allowance a room at a time without tripping it, ending at 469k standing against the manor's 155k |
| after abyss | 25 000 | `abyss.archive`, 23 878. Caught the crypt's bone chapel at 96 000 on its first build, all of it in one detail |
| after the crypt | 21 000 | `crypt.ossuary`, 20 730 |
| now | 10 000 per cell | `mansion.library`, 9 964. Every pack was cut for it |

**The last step down is the only one that was asked for rather than earned**, and
it is worth knowing why, because it is the first time this number drove the art
instead of following it. Six packs standing together came to 1.6 M triangles and
the frame could not carry them, so the budget was halved and the art brought to
meet it. Nothing was found that gave it back in one place: a map is about forty
thousand boxes and fifteen thousand small round things, and after the first pass
every single line item in `tools/leakcheck.html?props=1` was between one and four
per cent of its pack. It came instead from three passes over everything at once,
in this order of yield:

1. **A size ramp under every round primitive.** `sides(radius, asked)` in
   `art/lib/build.ts` decides how many sides a round thing that big has earned
   and every pack's `ball`/`cyl`/`ring`/`spike`/`disc` goes through it. It is a
   `Math.min`, so it can only take detail off something too small to show it.
   Worth about 15 %, and it is the reduction this file had already recommended
   four times — it just had to stop being per-call-site to land.
2. **Open-ended tubes wherever a chain hides its own caps.** A branch, a vine, a
   rib, a worm tube: every cap but the two at the ends of the run is inside the
   next link, and a closed cylinder pays for two discs nobody can see. `strut()`
   takes an `open` flag for this.
3. **About a third off the pitch of every course that runs round a wall**, with
   the pieces grown to match so the course still reads as beaded rather than
   gapped. A course in a `kit/shell.ts` is multiplied by the whole map before a
   single prop is placed in a room.

Only after those three was anything removed room by room, and then it was
whichever prop `?props=1` charged a quarter of the room to — a wall of specimen
jars, a stand of tube worms, a comb of brood cells. Per-map totals are in
[`../systems/RENDERING.md`](../systems/RENDERING.md) → "What each map costs".

**Triangles are counted per cell and the other budgets are not**, which is new
with this step. A flat number worked while it sat two and a half times over a
typical 1x1: the only rooms that reached it were 1x1s that had packed too much
in, which is exactly what it was for. At 10 000 it sits ON a typical 1x1, so a
flat number would flag every multi-cell room in the game however lean it was and
drown the signal. Per cell is also what the frame actually cares about — what is
drawn in one cell of a sight line — and it is what this file already told you to
work out by hand.

**Draw calls are the budget that matters most and the one hardest to spend
well.** A frame on the heaviest map is 400-500 of them and the game is CPU-bound
on submitting them — `tools/perf.html` reports frame time and submission time as
the same number. A room at 35 draws is not the problem; twelve of them in one
sight line is. That is why this number has not been ratcheted the way triangles
have: what moves it is the culler, not the rooms.

Draw calls and colliders are still flat numbers rather than per cell, and that is
deliberate: the rooms that get near them are 1x1s that packed too much in, not
the set pieces. Two consequences worth knowing before you argue with a warning:

- **A multi-cell room will trip the flat numbers, and that can be right.** The
  crypt's 1x3 is 34 colliders, and about twenty of those are the shell's own
  walls. Read a multi-cell warning per cell before changing anything — which is
  what the triangle budget now does for you, and the collider one still does not.
- **Every budget is the worst case of that budget**, not one build's reading of
  all of them. `validateArt.mjs` builds each room on every door combination and
  three seeds and takes the maximum of each number separately, because they peak
  on different combinations — a room's triangles peak with every door shut and
  its colliders with them open. It used to report whichever build had the most
  draw calls, which quietly understated the rest.
- **Draw calls are counted per material *per shadow flag*.** `MeshBatcher` builds
  one mesh per material, and a second one if some of that material's geometry
  casts shadows and some does not — so a material shared between a shadowed tomb
  chest and an unshadowed skirting board costs two draws rather than one. With
  thirty materials in a room that is the difference between 54 draw calls and 34.
  Pick a default per pack (the crypt's `Room.box()` defaults to
  `castShadow: false` and the handful of big silhouettes opt in) rather than
  leaving it to whatever each call site happened to pass.

The light budget *is* enforced. It is not, however, a shader cost: `graphics.json
→ maxActiveLights` is a fixed budget, so the renderer always enables exactly that
many lamps (nearest first) and every material compiles for the same light count
whatever the rooms declare. What a lamp actually spends is a **slot** — declare
more and you are competing with the neighbours for the same six, which is why the
budget scales with floor area rather than with ambition.

Up to 36 rooms exist at once but all are resident in memory, and only the ones the
eye can actually reach are drawn — within `renderDistanceRooms`, and through
doorways that are neither shut nor off screen
([`../systems/RENDERING.md`](../systems/RENDERING.md)). Reuse geometry
aggressively — build a geometry once at module scope and instance it.

Two things the culler assumes:

- **A wall is solid, and a window shows what YOU put behind it.** The room on the
  other side is not drawn, so a window needs its own backdrop — a night pane, a
  painted ocean, a light column. Every window in the game already had one, which
  is why making this the rule cost 0.000 % of the pixels in three packs of five
  (`../systems/RENDERING.md` → "A wall is a wall"). Clear glass onto nothing will
  look out onto fog, and that is the one way to get a window wrong now.
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
- [ ] ≤ `ctx.lightBudget` lights, and the room is navigable on its own light (there is no flashlight)
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
