# Map Generation

Owner: `src/world/generation/`. Config: `config/world.json`. Art input:
room blueprint **metadata only** (see [`../art/ROOM_FORMAT.md`](../art/ROOM_FORMAT.md)).

## Contract

```
generate(mapId, seed, config) → RunLayout
```

Pure and deterministic. Same inputs → identical output on every peer, which is why
the network only ships `(mapId, seed)` instead of the map.

```ts
interface RunLayout {
  grid: { width: number; height: number; cellSize: number };
  rooms: PlacedRoom[];      // blueprintId, origin cell, door mask, lock region
  doors: PlacedDoor[];      // between two rooms; locked
  containers: PlacedContainer[];  // chests + lockers, world transforms; chests carry contents
  items: PlacedItem[];      // world items with a rolled (or key-forced) item id
  playerSpawns: Placed[];
  exitCell: [number, number];
}
```

Keys need no id: one key opens one locked door, whichever it is
(`world.json → doors.keyReusable = false`). What makes a run solvable is *where*
the keys are, which is step 5 below.

Nothing in `RunLayout` is a `THREE` object. `render/` builds geometry lazily from it.

## Pipeline

**1 — Slot the grid.**
Carve `grid.width × grid.height` cells into room slots. With
`layout.multiCellRooms.enabled = false` every slot is 1×1. With it on, larger
footprints are packed first by `footprintWeights`, remainder filled 1×1.

**2 — Spanning tree.**
Build a spanning tree over the slots so every room is reachable. Loops come
*after* locking, in step 4, because a loop added before would be free to bypass a
lock.

Every tree/loop edge becomes a **door**. Non-edges become **solid wall**. Grid
boundary edges never become doors (`doors.boundaryDoorsAllowed = false`) except the
exit.

**3 — Place spawn and exit, then lock the route.** See §"Locks and keys" below.

**4 — Loops.**
Add extra edges at `layout.extraDoorChance` (a pure tree plays as a frustrating
dead-end farm), **skipping any edge that would join two different lock regions**.
Tune toward `layout.deadEndTargetRatio`.

**5 — Assign blueprints.**
For each slot, its edges define a required door mask. Pick a blueprint whose
`footprint` matches and whose `doorWalls` is a **superset** of the required mask —
a room offering all four walls fits anywhere. Weighted by `blueprint.weight`,
capped by `maxDuplicatesPerRoom`. Rotation in 90° steps is allowed if it makes a
blueprint fit.

> This is the step that makes art swappable: the generator only asks "what footprint,
> which walls can open". It never looks at geometry.

**6 — Fill contents.**
Per room, roll counts from `contents.*` and fill the blueprint's anchors. Item
spawns roll against `loot.floorTable`, chests against `loot.chestTable`; `empty`
means the slot stays bare. If the map ends up with fewer than
`contents.chests.mapTotalMin` chests, unused chest anchors are topped up. Key
placements (below) override whatever a slot rolled.

**7 — Place the enemy.** *(not built yet — plan step 17)*
An `enemySpawn` anchor in a room ≥ `enemy.json → spawn.minRoomDistanceFromPlayers`
rooms from the player spawn, which has a path to the players crossing **no locked
door** (`spawn.requiresUnlockedPathToPlayers`).

**8 — Validate.** *(not built yet)*
Per `validation.*`. Solvability is currently **structural** rather than checked:
see below. The re-roll pass is for the checks structure cannot give — enemy paths,
and multi-cell packing once that lands.

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
  `blueprints`, `contents`, `loot`, `keys`, per-room `art`) so adding a loot roll
  cannot shift the maze layout.
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
| Non-square rooms | `layout.multiCellRooms.enabled = true` (needs pack support) |

None of these require code changes.
