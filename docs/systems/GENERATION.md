# Map Generation

Owner: `src/world/generation/`. Config: `config/world.json`. Art input:
room blueprint **metadata only** (see [`../art/ROOM_FORMAT.md`](../art/ROOM_FORMAT.md)).

## Contract

```
generate(mapId, seed, config) → RunLayout
```

Pure and deterministic. Same inputs → identical output on every peer, which is why
the network only ships `(mapId, seed, configHash)` instead of the map.

```ts
interface RunLayout {
  grid: { width: number; height: number; cellSize: number };
  rooms: PlacedRoom[];      // blueprintId, origin cell, rotation, per-cell door mask
  doors: PlacedDoor[];      // between two rooms; locked?; keyId?
  keys: KeyPlacement[];     // which container/anchor holds which key
  containers: Placed[];     // chests + lockers resolved to world transforms
  itemSpawns: Placed[];     // with a rolled item id from the loot table
  playerSpawns: Placed[];
  enemySpawns: Placed[];
  exit: PlacedExit;
  roomGraph: RoomGraph;     // adjacency + door references, used by AI and validation
}
```

Nothing in `RunLayout` is a `THREE` object. `render/` builds geometry lazily from it.

## Pipeline

**1 — Slot the grid.**
Carve `grid.width × grid.height` cells into room slots. With
`layout.multiCellRooms.enabled = false` every slot is 1×1. With it on, larger
footprints are packed first by `footprintWeights`, remainder filled 1×1.

**2 — Connect.**
Build a spanning tree over the slots so every room is reachable, then add extra
edges at `layout.extraDoorChance` to create loops (a pure tree plays as a
frustrating dead-end farm). Tune toward `layout.deadEndTargetRatio`.

Every tree/loop edge becomes a **door**. Non-edges become **solid wall**. Grid
boundary edges never become doors (`doors.boundaryDoorsAllowed = false`) except the
exit.

**3 — Assign blueprints.**
For each slot, its edges define a required door mask. Pick a blueprint whose
`footprint` matches and whose `doorWalls` is a **superset** of the required mask —
a room offering all four walls fits anywhere. Weighted by `blueprint.weight`,
capped by `maxDuplicatesPerRoom`. Rotation in 90° steps is allowed if it makes a
blueprint fit.

> This is the step that makes art swappable: the generator only asks "what footprint,
> which walls can open". It never looks at geometry.

**4 — Place spawn and exit.**
Player spawn: a room tagged `entrance` with `playerSpawn` anchors, preferring the
boundary. Exit: `exit.minGridDistanceFromSpawn` away, preferring a boundary wall so
it reads as *outside*.

**5 — Lock doors and place keys.**
Compute the shortest route spawn → exit. Choose `doors.lockedDoorCount` doors on
that route at graph depth ≥ `doors.lockedDoorMinDepth`, spaced apart. For each locked
door, place its key in a chest or item anchor within the region still reachable
*without* passing that door. Add `doors.keySpareCount` spares in the same region.

This ordering — lock, then place keys in the still-reachable region — is what makes
"never stuck" structural rather than a post-hoc check.

**6 — Fill contents.**
Per room, roll counts from `contents.*` and fill the blueprint's anchors. Item
spawns roll against `loot.floorTable`, chests against `loot.chestTable`. Key
placements from step 5 override rolled contents.

**7 — Place the enemy.**
An `enemySpawn` anchor in a room ≥ `enemy.json → spawn.minRoomDistanceFromPlayers`
rooms from the player spawn, which has a path to the players crossing **no locked
door** (`spawn.requiresUnlockedPathToPlayers`).

**8 — Validate.**
Per `validation.*`: exit reachable, enough keys, all rooms reachable, enemy has a
path. Any failure re-rolls with a new sub-seed, up to `validation.maxAttempts`, then
falls back to a guaranteed-solvable simple layout.

## Determinism rules

- One seeded RNG, split into named sub-streams (`layout`, `blueprints`, `loot`,
  `art`) so adding a loot roll cannot shift the maze layout.
- Never iterate a `Set` or object key order to make a decision; sort first.
- `configHash` is part of the seed identity — if two peers have different configs
  they must fail to match rather than silently desync.

## Changing generation behaviour

| Want | Change |
| --- | --- |
| Bigger/smaller map | `world.json → grid.width/height` |
| More loops, fewer dead ends | `layout.extraDoorChance` up |
| Harder key hunt | `doors.lockedDoorCount` up, `keySpareCount` down |
| Longer runs | `exit.minGridDistanceFromSpawn` up |
| More loot | `contents.itemSpawns.max` up |
| Non-square rooms | `layout.multiCellRooms.enabled = true` (needs pack support) |

None of these require code changes.
