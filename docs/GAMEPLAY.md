# Gameplay Design Spec

The rules of the game, stated once. Where a rule has a number, the number lives in
`config/` and this document names the key rather than repeating the value — so this
file never goes stale.

---

## 1. The loop

Main menu → lobby (host or join by 6-digit code) → vote on a map → run starts →
find keys, avoid the hunter, reach the exit → scoreboard → back to lobby.

A run ends when every player is **escaped**, **downed**, **dead** or **disconnected**.
If nobody escaped, the team lost.

## 2. Players

- 1–4 players (`game.json → session.maxPlayers`), first person, no jumping.
- **Move** WASD, **look** mouse, **sprint** hold Shift, **crouch** hold Ctrl,
  **interact** E, **use left hand** LMB, **use right hand** RMB. All rebindable
  (`config/input.json`).
- Two hands = two item slots. Picking up a third item drops the one in that hand.
  Treasure does not use a slot (`items.json → items.treasureSmall.occupiesSlot`).
- Health is a three-step ladder: **healthy → injured → downed**.
  - Injured: slower (`player.json → movement.injuredSpeedMultiplier`), noisier, vignetted.
  - Downed: immobile on the floor. Cannot be killed further. Can still talk — which is
    the point: a downed player uses voice to be found.
  - A downed player may choose to give up and become **dead** → spectator.
  - Revive: another player holds E (`player.json → health.reviveHoldSeconds`). Revived
    players come back **injured**, not healthy.
- Nobody bleeds out. Being downed is not a timer, it is a problem for the team.

## 3. The hunter

One enemy minimum, always spawning at least
`enemy.json → archetypes.<id>.spawn.minRoomDistanceFromPlayers` rooms away, and always
with a path to the players that does not require opening a locked door.

- **Faster than a sprinting player.** You do not outrun it; you break line of sight,
  put doors between you, and make it commit to the wrong noise.
- **Slower through doors.** Doors are the only real tool you have — it takes
  `archetypes.<id>.doors.openSeconds` to get through one.
- **Patrols** semi-randomly, biased toward rooms it has not seen recently.
- **Hears** sprinting and chest-opening from far, footsteps from near, and proximity
  voice only from the same or an adjacent room. Players hear each other much further
  than the enemy can — talking is fairly safe, sprinting is not.
- **Sees** within a cone; crouching and darkness shorten its range.
- **Loses you** after `sight.timeToLoseSeconds` out of view, then **searches**: sweeps
  a few nearby rooms, sometimes opens lockers, then returns to patrol.
- **Attacks**: healthy → injured, injured → downed. After injuring someone it slows
  down for `movement.injuredPlayerSlowdownSeconds` — that is your window.
- **Ignores downed players** and keeps hunting the standing ones.

Alert level is always readable to the player: a distinct visual for *patrolling*, for
*alerted/searching*, and for *actively chasing you*, plus heartbeat and screen
distortion that ramp with proximity (`player.json → effects`).

## 4. The map

- A grid of rooms, `world.json → grid.width × grid.height` (currently 6×6), shuffled
  every run from the active map's room pool. Duplicate rooms are allowed and expected.
- Each room has 1–4 doors, one per wall at most. Doors between adjacent rooms always
  agree — both sides have one, or neither does. No door ever faces out of the map
  except the exit.
- Rooms contain 0–2 chests, 0–3 lockers, and 1–4 item spawn spots
  (`world.json → contents`).
- **Locked doors**: exactly `world.json → doors.lockedDoorCount` of them, always placed
  so they genuinely gate the route to the exit. The generator guarantees enough keys
  are reachable without passing a locked door, plus `doors.keySpareCount` spares. You
  can never be stuck.
- **Exit door**: obvious the moment you see it, placed far from the spawn. Hold E for
  `world.json → exit.holdSeconds` to leave.
- Chests are slow and **loud** to open. That is the trade.
- Lockers hide you from sight, not from a searching enemy.

## 5. Voice chat

Proximity-based and generous — `net.json → voice.hearingRange` (22 m) versus the
enemy's much shorter voice hearing. Three modes, switchable from the pause menu with
one control: **off / open mic / push-to-talk**.

Escaped and dead players spectate and can hear each other and whoever they are
watching; live players cannot hear them. Downed players are still live players.

## 6. Win and lose

- **Win**: every remaining player has escaped. Partial escapes still count as a win
  for those who made it, and the scoreboard shows who did.
- **Lose**: everyone is downed or dead.
- Treasure carried out is kept; treasure on a downed or dead player is not.

## 7. Design principles

1. **The map is the antagonist, the enemy is the pressure.** Getting lost should be
   scary before the enemy is.
2. **Noise is the currency.** Every advantage costs volume. Sprinting, chests and
   talking are all trades.
3. **Never unwinnable, often unsurvivable.** The generator guarantees a solvable map;
   it guarantees nothing about you.
4. **Information over damage.** Items mostly manipulate what the enemy knows
   (distraction, blinding, sensing) rather than fight it.
5. **Dark, never blind.** Atmosphere covers for the graphics; unreadable geometry
   does not.
6. **Downed is a story, not a timer.** No bleed-out; the tension is whether your
   friends come back for you.

## 8. Extras — designed for, not yet built

These are accounted for in config and architecture so they slot in without rework:

- Traps (floor and ceiling): noise-makers and hold-you-in-place
- Multi-cell rooms (1×2, 2×2, L) — `world.json → layout.multiCellRooms`
- Lobby trophies and minigames
- Collectables, lore notes, treasure
- Difficulty modes — `config/difficulty.json`, already fully data-driven
- Metaprogression: currency, XP, cosmetics — `game.json → meta`
- Full item roster: medicine, brick, coin, flare, barricade, tar, x-ray lens, sensor
- Post-escape spectating — `game.json → spectate`
- Vertical maps (rooms stacked) — `world.json → grid.levels`, deliberately deferred
