# Enemy AI

Owner: `src/ai/`. Config: `config/enemy.json` (per archetype). Art contract:
[`../art/SHARED_ART.md`](../art/SHARED_ART.md) → `enemy.*`.

Runs **on the host only**. Clients receive the enemy's transform and alert level in
snapshots and interpolate. See [`NETWORKING.md`](NETWORKING.md).

## State machine

```
        ┌──────────── noise heard / player seen ────────────┐
        │                                                   ▼
   ┌─ PATROL ──► INVESTIGATE ──► SEARCH ──► (timeout) ──► PATROL
   │                 │              ▲
   │                 │              │ lost target
   │                 ▼              │
   └──────────────► CHASE ──────────┘
                     │
                     ▼
                  ATTACK ──► (cooldown / slowdown) ──► CHASE or SEARCH
```

| State | Speed key | Behaviour |
| --- | --- | --- |
| `PATROL` | `movement.patrolSpeed` | Picks a target room weighted by `patrol.preferUnvisitedWeight` and recency (`patrol.recentVisitDecaySeconds`), walks its `patrolPoint` anchors, idles `patrol.idleAtWaypointSeconds` |
| `INVESTIGATE` | `movement.searchSpeed` | Moves to a specific heard position (jittered by `hearing.positionJitterMetres`) |
| `SEARCH` | `movement.searchSpeed` | Sweeps `search.roomsToSearch` nearby rooms for `search.durationSeconds`, opening lockers at `search.lockerSearchChance` |
| `CHASE` | `movement.chaseSpeed` | Pursues the nearest perceived player; holds the target for `sight.timeToLoseSeconds` after losing sight |
| `ATTACK` | — | Within `attack.range`, after `attack.windupSeconds`: healthy→injured, injured→downed. Then `movement.injuredPlayerSlowdownSeconds` at `injuredPlayerSlowdownMultiplier` |

Alert levels (`alert.levels`) map onto these and are what the player actually sees:
`calm` = PATROL, `suspicious` = INVESTIGATE, `alerted` = SEARCH, `chasing` = CHASE/ATTACK.
The level is pushed to art via `enemy.ghost` → `api.setAlert(level)` and to the local
player's post-processing.

## Perception

### Sight — `config/enemy.json → archetypes.<id>.sight`

Target is seen when **all** hold:

1. distance ≤ `range`, scaled by `crouchedTargetRangeMultiplier` if the target is
   crouching and `darknessRangeMultiplier` if the target is in an unlit area
2. within `fovDegrees` of facing
3. line of sight is clear (`requiresLineOfSight`) — raycast against the static
   collision set plus closed doors
4. conditions have held for `timeToAcquireSeconds`

Lost after `timeToLoseSeconds` of failing them. A player inside a locker is never
seen.

### Hearing — the noise bus

Every noisy action emits `{ position, radius, loudness, sourcePlayerId, kind }`.
Emitter values live in `config/player.json → noise` and `config/items.json`.

The enemy hears an event when:

```
loudness × hearing.hearingMultiplier ≥ hearing.threshold
AND distance ≤ radius × hearing.rangeMultiplier
```

with `throughClosedDoorMultiplier` applied per closed door on the shortest room path.
Voice is special-cased: it is only audible to the enemy within
`hearing.voiceRoomLimit` rooms (default 1 = same or adjacent). Players hear each
other at `net.json → voice.hearingRange`, which is deliberately much further.

Heard events go to `INVESTIGATE` with a position jittered by
`hearing.positionJitterMetres` — the enemy gets a direction, not a fix.

## Pathfinding

Two levels, matching how the world is built:

1. **Room graph A\*** over `RunLayout.roomGraph`. Edge cost includes a penalty for
   closed doors and infinity for locked ones (unless `doors.canOpenLockedDoors`).
2. **Within a room**, steer between the room's `patrolPoint` anchors and doorway
   centres, with circle-vs-collider avoidance.

This is cheap, gives fully controllable behaviour ("search a nearby room" is one
graph query), and needs no navmesh baking. Doors cost
`doors.openSeconds` (or `openSecondsWhenChasing`) of standing still — the single
most important balance lever in the game.

## Spawning

See [`GENERATION.md`](GENERATION.md) step 7. Guarantees:
≥ `spawn.minRoomDistanceFromPlayers` rooms away, and a locked-door-free path to the
players.

## Adding a second enemy archetype

1. Add an entry under `config/enemy.json → archetypes`.
2. Add its art builder + register the `artId` in `art/shared/index.ts`
   (see [`../art/SHARED_ART.md`](../art/SHARED_ART.md)).
3. Add a name key to `config/locales/en.json`.
4. List it in the map's `enemies` array in `config/maps.json`.

No code changes if the behaviour fits the FSM above. New *behaviour* (e.g. an enemy
that teleports) means a new state in `src/ai/states/` plus a config flag to enable it.

## Tuning cheatsheet

| Feels… | Change |
| --- | --- |
| Too easy to escape | `movement.chaseSpeed` up, `doors.openSecondsWhenChasing` down |
| Too oppressive | `sight.range` down, `hearing.rangeMultiplier` down |
| Finds you too fast after a noise | `hearing.positionJitterMetres` up |
| Gives up too quickly | `sight.timeToLoseSeconds` up, `search.durationSeconds` up |
| Camps your area | `patrol.preferUnvisitedWeight` up |
| Lockers feel useless | `search.lockerSearchChance` down |
