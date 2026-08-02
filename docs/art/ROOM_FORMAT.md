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

**Never read these numbers from a constant you type yourself.** Import them:

```ts
import { grid } from '@config';
```

If `cellSize` changes in config, every correctly authored room still fits.

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

### 2.2 Footprint shapes

`1x1` is the default and should be **at least 80 %** of any pack. Other shapes are
supported once `config/world.json → layout.multiCellRooms.enabled` is true:

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

  // The kit builds shell geometry that already respects ctx.doors.
  const shell = ctx.kit.shell(ctx);   // floor, ceiling, 4 walls with door holes cut
  group.add(shell.object);
  colliders.push(...shell.colliders);

  // ... your decoration goes here ...

  return { object: group, colliders };
}
```

### 4.1 `RoomBuildContext`

| Field | Type | Notes |
| --- | --- | --- |
| `doors` | `Record<CellSideKey, DoorState>` | **Which of your `doorWalls` actually became doors this run.** `DoorState` is `'none' \| 'open' \| 'locked'`. You must cut an opening wherever it is not `'none'` and leave the wall solid where it is. |
| `kit` | `PackKit` | Your pack's shared builders (walls, floors, trim, materials). |
| `materials` | `MaterialLibrary` | Cached, shared materials. **Always** get materials from here — never `new THREE.MeshStandardMaterial` per room instance or you will blow the draw-call budget on duplicate rooms. |
| `rng` | `() => number` | Seeded RNG. Use this for any randomness so runs replay identically across peers. **Never use `Math.random()` in art.** |
| `quality` | `QualityTier` | `'low' \| 'medium' \| 'high' \| 'ultra'`. Skip small greeble and decorative lights on `low`. |
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
- Chests, lockers, doors and items add their own colliders. Do not add them for anchors.

---

## 6. Lighting

- The room owns its **decorative** light sources only: candles, a fireplace, a lamp,
  a window shaft. Global ambient/fog/exposure come from `config/graphics.json`.
- Respect `ctx.lightBudget` (default **2** real lights per room). Use emissive
  materials, baked-look vertex tinting and light-cone meshes for everything else —
  they are free.
- **Dark but never blind.** A player standing in the middle of the room with the
  flashlight off must still be able to read the layout. If your room is pitch black
  without the flashlight, add a weak practical light or raise emissive.
- Never set `renderer`, `scene.fog`, tone mapping or exposure from a room.

---

## 7. Performance budget (per room, `high` tier)

| Metric | Budget |
| --- | --- |
| Draw calls | ≤ 40 |
| Triangles | ≤ 40 000 |
| Real lights | ≤ 2 |
| Shadow-casting lights | ≤ 1 |
| Unique materials created | 0 (use `ctx.materials`) |

Up to 36 rooms exist at once; only `renderDistanceRooms` are rendered, but all are
resident in memory. Reuse geometry aggressively — build a geometry once at module
scope and instance it.

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
- [ ] ≤ 2 lights, room readable with flashlight off
- [ ] Registered in the pack's `pack.ts` room list

Run `npm run validate:art` (step 8) to check most of this automatically.

---

## 9. Related docs

- [`ART_GUIDE.md`](ART_GUIDE.md) — art principles, theme rules, material conventions
- [`SHARED_ART.md`](SHARED_ART.md) — doors, chests, lockers, items, player, enemy
- [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md) — building a whole new map pack
- [`../systems/GENERATION.md`](../systems/GENERATION.md) — how blueprints become a maze
