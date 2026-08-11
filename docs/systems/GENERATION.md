# Map Generation

Owner: `src/world/generation/`. Config: `config/world.json`. Art input:
room blueprint **metadata only** (see [`../art/ROOM_FORMAT.md`](../art/ROOM_FORMAT.md)).

## Contract

```
generate(mapId, seed, world, blueprints, enemySpawn) → RunLayout
```

Pure and deterministic. Same inputs → identical output on every peer, which is why
the network only ships `(mapId, seed)` instead of the map.

```ts
interface RunLayout {
  grid: { width: number; height: number; cellSize: number };
  rooms: PlacedRoom[];      // blueprintId, origin cell, rotationY, cells, openings, region, patrol
  cells: PlacedCell[];      // one per grid cell: which room owns it, its doors and interior links
  doors: PlacedDoor[];      // between two rooms; locked
  containers: PlacedContainer[];  // chests + lockers, world transforms; chests carry contents
  items: PlacedItem[];      // world items with a rolled (or key-forced) item id
  playerSpawns: Placed[];
  exitCell: [number, number];
  // one per `enemy.json → spawn.regions`; `region` is how many locks it starts behind
  enemySpawns: { cell: [number, number]; position: [number, number]; region: number }[];
}
```

`rooms` and `cells` are two views of the same thing. A room is one *placement* —
what `render/` builds, once, at a position and a rotation. A cell is one square of
the grid — what the enemy's graph walks and what "which room am I in" rounds to.
For every 1×1 room they are the same entry; for a 2×2 ballroom, four cells point
at one room and are joined by `interior` links that have no door and cost nothing.

Keys need no id: one key opens one locked door, whichever it is
(`world.json → doors.keyReusable = false`). What makes a run solvable is *where*
the keys are, which is step 5 below.

Nothing in `RunLayout` is a `THREE` object. `render/` builds geometry lazily from it.

Each `PlacedRoom` also carries its blueprint's `patrolPoint` anchors resolved into
world space (falling back to the room centre). That is how `src/ai/` gets somewhere
to walk without ever touching art — see [`AI.md`](AI.md).

## Pipeline

**1 — Slot the grid.**
Carve `grid.width × grid.height` cells into room **slots**. A slot is the unit
everything downstream works on; most are one cell.

With `layout.multiCellRooms.enabled` on, multi-cell footprints are packed first —
they have to be, because once the maze exists there is nowhere to put them. Each
multi-cell blueprint is used **at most once per map**, `maxSlots` caps how many
are packed at all, and `footprintWeights` decides the order they are tried in, so
a 2×1 gets a look in long before an L does. Placement picks a random origin and
rotation and takes the first that fits on free cells.

A multi-cell slot fixes its blueprint and rotation *at this point*, which means
the maze has to be grown around the walls that blueprint is willing to open: its
`doorWalls`, rotated, are the only edges it will ever accept. A packing that
leaves any slot unreachable over those edges is thrown away and re-rolled
(`validation.maxAttempts`), falling back to an all-1×1 grid, which is always
connectable.

**2 — Spanning tree over slots.**
Build a spanning tree over the slots so every room is reachable. Loops come
*after* locking, in step 4, because a loop added before would be free to bypass a
lock.

Every tree/loop edge becomes a **door**. Non-edges become **solid wall**. Edges
*inside* a multi-cell slot are neither: they are open floor, and no door object
exists there. Grid boundary edges never become doors
(`doors.boundaryDoorsAllowed = false`) except the exit.

**3 — Place spawn and exit, then lock the route.** See §"Locks and keys" below.

**4 — Loops.**
Add extra edges at `layout.extraDoorChance` (a pure tree plays as a frustrating
dead-end farm), **skipping any edge that would join two different lock regions**.
Tune toward `layout.deadEndTargetRatio`.

**5 — Assign blueprints.**
Multi-cell slots already know theirs from step 1. For each 1×1 slot, its edges
define a required door mask: pick a 1×1 blueprint that, **at some 90° rotation**,
offers every side the slot needs. A room offering all four walls fits anywhere at
any angle; a one-door store room fits every dead end on the map, because it can be
turned to face it. Weighted by `blueprint.weight`, capped by
`maxDuplicatesPerRoom`, and the rotation is then drawn at random from the ones
that fit — so two copies of the same blueprint rarely face the same way.

> This is the step that makes art swappable: the generator only asks "what footprint,
> which walls can open". It never looks at geometry.

### Rotation

A room is placed as `(blueprint, origin cell, rotationY)` where `rotationY` is a
quarter turn. Rotation is a single rigid transform applied to **everything** the
blueprint declared, so a room never has to know it happened:

| Rotated | How |
| --- | --- |
| Footprint cells | `(gx, gy) → (gy, -gx)` per quarter turn |
| `doorWalls` sides | `north → west → south → east → north` |
| Anchors | `(x, z) → (z, -x)`, and `rotationY` adds |
| Colliders | same, in `world/worldBuilder.ts` |
| The room object | `object.rotation.y` |

`PlacedRoom.doors` is handed back in the blueprint's **own** frame, so `build()`
keys `ctx.doors` exactly as it wrote its `doorWalls` and cuts its openings in the
walls it thinks it is cutting. `worldBuilder` applies the rotation to the object
and its colliders; nothing in `art/` is aware of any of it.

Anchor facing rotates too, which is why a locker's `rotationY` has to be right in
the blueprint: get it a quarter turn out and the locker will face a wall in every
run, at every rotation. `npm run validate:art` checks the floor in front of every
chest and locker for exactly this.

**6 — Fill contents.**
Per room, roll counts from `contents.*` and fill the blueprint's anchors. Item
spawns roll against `loot.floorTable`, chests against `loot.chestTable`; `empty`
means the slot stays bare. If the map ends up with fewer than
`contents.chests.mapTotalMin` chests, unused chest anchors are topped up. Key
placements (below) override whatever a slot rolled.

**7 — Place the hunters.**
One per entry in `enemy.json → spawn.regions`, and the entry's value is which
**region** (step 3) it wakes up in — how many locked doors it starts behind.

*Region 0*, the players' own partition, is a room chosen from those ≥
`spawn.minRoomDistanceFromPlayers` rooms from the player spawn, measured by
breadth-first walk over the **final** door set with locked edges blocked — so the
path back to the players crosses no locked door
(`spawn.requiresUnlockedPathToPlayers`) by construction. If no room is far enough
it takes the furthest one it can reach and warns.

*Any deeper region* needs no distance rule, because the lock **is** the distance.
That hunter cannot be seen or heard from the start room, and it cannot come to the
players — it has no key either — until somebody opens that door, which is exactly
when it is meant to become their problem. It is a plain random room of that region.
An empty region (a map with fewer locks than the difficulty asked for) falls back
toward the players' side and warns. Every hunter stands on its room's first patrol
point, and no two share a room.

The `spawn` block is passed into `generate()` as a parameter rather than read from
a second config file, so generation still reads exactly one: `world.json`.

**8 — Validate.**
The slot packing re-rolls up to `validation.maxAttempts` times when it leaves a
slot unreachable, then falls back to an all-1×1 grid. Solvability is
**structural** rather than checked — see below.

`npm run validate:gen` generates every enabled map over hundreds of seeds and
asserts the invariants: determinism, every cell owned by exactly one room, every
room's cells equal to its footprint at its own rotation, every declared opening
landing on a door that actually exists, full connectivity, a greedy key hunt
always reaching the exit, an unlocked path to the players for the hunter that
shares their partition and a still-locked one for any hunter a difficulty put
behind a door, and the one-per-map multi-cell cap. It runs the whole sweep once
per **enabled difficulty**, because a difficulty is a generator input like any
other. It re-derives the rotation maths rather than importing
it, so a broken rotation in `generation.ts` makes the two disagree instead of
agreeing with itself.

## Locks and keys

This is the part that makes a run always completable, so it is worth stating
exactly.

**Spawn and exit.** Spawn is a random boundary cell. Exit is the boundary cell
**farthest from it over the spanning tree**, opening through an outer wall — the
one direction normal doors never go. Tree distance is the right measure here
because it is the route that exists before loops.

**Locks.** A tree has exactly one route between any two cells, so every door on
the spawn → exit route is a door you *must* pass. Take that route, drop the first
`doors.lockedDoorMinDepth - 1` doors, and pick `doors.lockedDoorCount` of the rest
at even spacing. Those become the locked doors. If the route is too short, you get
fewer locks and a console warning.

**Regions.** Removing the *k* locked edges from the tree splits it into *k + 1*
components. Region *i* is everything reachable once you have opened the first *i*
locks; a room hanging off the route inherits the region of the branch it hangs
from. Every room carries its `region` in `RunLayout`.

**Why loops come after.** A loop edge is only allowed between two rooms in the
**same region**. A loop within a region is free variety; a loop across one would
be a way around a lock, which would quietly undo everything above.

**Keys.** The key for lock *i* is placed in a slot (a chest's contents, or a floor
item spawn) in a room of region ≤ *i* — that is, somewhere you can already stand
holding only the previous keys. Chest slots are preferred: a key behind a slow,
loud chest is the trade the game is about. `doors.keySpareCount` extra keys go
anywhere before the last lock.

Because the key for lock *i* is always reachable before lock *i*, **you can never
be stuck**. That is a property of the ordering, not of a post-hoc check.

> Verified over 400 seeds: every locked door genuinely disconnects the exit when
> shut, every room is reachable, and a greedy "collect keys, open the nearest
> lock" walk always reaches the exit.

## Determinism rules

- One seeded RNG, split into named sub-streams (`layout`, `placement`,
  `blueprints`, `contents`, `loot`, `keys`, `enemySpawn`, per-room `art`) so adding
  a loot roll cannot shift the maze layout.
- Never iterate a `Set` or object key order to make a decision; sort first.
- Peers are assumed to share a build and a `config/`. Detecting a mismatch is a
  future addition, not something to build now.

## Changing generation behaviour

| Want | Change |
| --- | --- |
| Bigger/smaller map | `world.json → grid.width/height` |
| More loops, fewer dead ends | `layout.extraDoorChance` up |
| Harder key hunt | `doors.lockedDoorCount` up, `keySpareCount` down |
| Longer runs | `exit.minGridDistanceFromSpawn` up |
| More loot | `contents.itemSpawns.max` up, `loot.floorTable.empty` down |
| More chests to search | `contents.chests.mapTotalMin` up |
| Non-square rooms | `layout.multiCellRooms.enabled`, `maxSlots` (needs pack support) |

None of these require code changes.
