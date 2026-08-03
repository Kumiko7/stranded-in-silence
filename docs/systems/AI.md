# Enemy AI

Owner: `src/ai/`. Config: `config/enemy.json` (per archetype). Art contract:
[`../art/SHARED_ART.md`](../art/SHARED_ART.md) → `enemy.*`.

Runs **on the host only**. Clients receive the enemy's transform and alert level in
snapshots and interpolate. See [`NETWORKING.md`](NETWORKING.md).

## The files

| File | Owns |
| --- | --- |
| `noiseBus.ts` | `NoiseEvent`, the one-tick bus, and the lookup into `player.json → noise` |
| `roomGraph.ts` | The run's rooms as a graph, A\* over it, `roomsWithin`, `roomDistance` |
| `perception.ts` | `look()` (sight cone + LOS) and `listen()` (the bus + jitter) |
| `enemy.ts` | `EnemyState`, the FSM, routing and steering |

`enemy.ts` is plain data in, plain data out — no `THREE`, no DOM — like
`stepPlayer()`, so it survives the move to an authoritative simulation unchanged.
It reaches the world only through the `EnemyContext` callbacks it is handed
(`openDoor`, `attack`, `searchLocker`), which is what keeps replication in
`src/game/Game.ts` rather than in the AI.

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
   crouching and `darknessRangeMultiplier` if the target is standing in an unlit area
   (rooms light themselves; players carry no light — "unlit" is simply *no room lamp
   within 0.6 cells*, which is all the lighting information the sim has or needs)
2. within `fovDegrees` of facing
3. line of sight is clear (`requiresLineOfSight`) — `CollisionWorld.segmentClear()`
   samples the segment against the static collision set plus closed doors. A door
   drops its collider at half swing, so an opening door reveals you
4. conditions have held for `timeToAcquireSeconds`

Lost after `timeToLoseSeconds` of failing them. A player inside a locker is never
seen — but see `SEARCH` below, because that is not the same as being safe.

### Hearing — the noise bus

Every noisy action emits `{ position, radius, loudness, sourcePlayerId, kind }`.
Emitter values live in `config/player.json → noise` and `config/items.json`.

Emitters (all in `src/game/Game.ts`, which is the only place that knows *when*):
footsteps at `noise.footstepInterval*` while moving, `doorOpen` on opening a door
and `doorSlam` on closing one, `chestOpen`, `lockerEnter` and `itemDrop`. Voice
joins with plan step 28.

Injury costs **speed, not stealth**: an injured player emits the same walk /
sprint / crouch noise as a healthy one, so crouching while hurt is still worth
doing. (`noise.injured` is therefore unused for now; it is kept for an emitter
that wants it.) An emitter with `loudness: 0` is genuinely silent — it is not
heard and it draws no ring on the roster HUD.

Every peer emits its own noise and broadcasts it; the host feeds every peer's
events into one bus (see [`NETWORKING.md`](NETWORKING.md)). Events live for exactly
one tick — the enemy reacts or they are gone, so nothing ages or expires.

The enemy hears an event when:

```
loudness × hearing.hearingMultiplier ≥ hearing.threshold
AND distance ≤ radius × hearing.rangeMultiplier
```

**Distance only** — walls and closed doors do not muffle noise. Doors slow the enemy
down; they do not hide you. Voice is special-cased: it is only audible to the enemy within
`hearing.voiceRoomLimit` rooms (default 1 = same or adjacent). Players hear each
other at `net.json → voice.hearingRange`, which is deliberately much further.

Heard events go to `INVESTIGATE` with a position jittered by
`hearing.positionJitterMetres` — the enemy gets a direction, not a fix.

## Pathfinding

Two levels, matching how the world is built:

1. **Room graph A\*** over `RunLayout.roomGraph`. Edge cost includes a penalty for
   closed doors and infinity for locked ones (unless `doors.canOpenLockedDoors`).
2. **Within a room**, steer between the room's `patrolPoint` anchors and doorway
   centres, with circle-vs-collider avoidance. When the straight line to the goal
   is blocked — a table between it and you mid-chase — it builds a tiny visibility
   graph over that room's `patrolPoint` anchors and takes the cheapest one- or
   two-hop detour, rather than pushing into the furniture. Those anchors are
   already authored as "somewhere in this room you can stand", so no extra data is
   asked of art. Recomputed at most every 0.3 s while a chase stays blocked.

A route is expanded into waypoints as `door → room centre → door → … → finish`.
The room centres matter: without them the enemy cuts straight from one doorway
toward the next and scrapes along the walls between them. Brushing a wall is
normal — it slides. Only after being pinned with no progress for 0.7 s does it
abandon a waypoint and re-plan, which is what stops a doorway corner from
cancelling every route.

This is cheap, gives fully controllable behaviour ("search a nearby room" is one
graph query), and needs no navmesh baking. Doors cost
`doors.openSeconds` (or `openSecondsWhenChasing`) of standing still — the single
most important balance lever in the game. A locked door is `Infinity` in the graph
unless `doors.canOpenLockedDoors`, so keys gate the enemy exactly as they gate you.

## Attacking

`ATTACK` fires `EnemyContext.attack(targetId)`. The AI does not own health: the
named player applies their own ladder (`src/entities/health.ts`) and broadcasts the
result. Healthy → injured, injured → downed, and a downed player is then ignored
while `attack.ignoresDownedPlayers` holds. `health.invulnerableSecondsAfterHit`
stops one catch chaining straight into the next, and
`movement.injuredPlayerSlowdownSeconds` is the window the design promises you after
being hit.

Catching someone in a locker is the same call: `SEARCH` rolls
`search.lockerSearchChance` per locker in the room, walks to it, waits
`search.lockerSearchSeconds` **after arriving**, throws it open, and attacks
whoever is inside. Lockers hide you from sight, not from a search.

**A witnessed entry skips the roll entirely.** If the enemy has line of sight at
the moment someone climbs in, it drops into `SEARCH` targeting that exact locker
and opens it first — no chance, no sweep. The sight test uses where the player was
*standing*, not the locker: the locker has a collider, so testing its centre would
always be blocked by the very object being looked at.

## Spawning

See [`GENERATION.md`](GENERATION.md). Guarantees, verified over 200 seeds:
≥ `spawn.minRoomDistanceFromPlayers` rooms away measured over the real door graph,
and a locked-door-free path to the players.

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
