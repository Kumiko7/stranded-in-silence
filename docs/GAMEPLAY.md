# Gameplay Design Spec

The rules of the game, stated once. Where a rule has a number, the number lives in
`config/` and this document names the key rather than repeating the value — so this
file never goes stale.

---

## 1. The loop

Main menu → lobby (host or join by 6-digit code) → pick a map → run starts →
find keys, avoid the hunter, reach the exit → scoreboard → back to lobby.

A run ends when every player is **escaped**, **downed**, **dead** or **disconnected**.
If nobody escaped, the team lost.

## 1.1 The lobby

A log cabin in the snow, and deliberately the opposite of a run: bright, warm and
safe. Everything in it is done by walking up to it and pressing `E`.

- **The poster wall** — one framed poster per map, blank for the maps that do not
  exist yet (`game.json → lobby.posterSlots`). Pressing `E` on one picks it; pressing
  `E` on your own pick withdraws it.
  - **Solo, the run starts immediately.** There is nobody to wait for.
  - **In company, the first pick opens a countdown** of
    `lobby.autoStartSeconds`, which drops to `lobby.allReadyStartSeconds` the moment
    every player has picked. A decisive group is fast; a dithering one is bounded.
  - Most-picked map wins; a tie is broken at random
    (`lobby.mapVoteMode`). The host decides and tells everyone — peers never
    re-derive it.
  - A poster carries a **tick** once you have escaped that map **yourself**. A team
    that got out without you does not mark your card.
- **The lever** in the middle of the room sets the difficulty — `Normal` or `Hard`.
  Anyone may pull it.
- **The wardrobe** customises your player. One option for now
  (`player.json → customisation`).
- Finishing a run returns everyone to the cabin to pick the next one. The escape menu
  there leaves the session for the main menu.

**Voice runs in the lobby exactly as it does in a run**, and is not interrupted by
the load between them — see [`ARCHITECTURE.md §5`](ARCHITECTURE.md).

## 2. Players

- 1–4 players (`game.json → session.maxPlayers`), first person, no jumping.
- **Move** WASD, **look** mouse, **sprint** hold Shift, **crouch** hold Ctrl,
  **interact** E, **use left hand** LMB, **use right hand** RMB. All rebindable
  (`config/input.json`).
- Two hands = two item slots. Picking up a third item drops the one in that hand,
  and the hand it takes **alternates** — so if it swapped the wrong one, pressing E
  again on what you just dropped puts it in the other hand and corrects the mistake.
- Health is a three-step ladder: **healthy → injured → downed**.
  - Injured: slower (`player.json → movement.injuredSpeedMultiplier`) and vignetted.
    **Not** noisier — an injured player's footsteps are exactly a healthy player's,
    so crouching is still worth doing when you are hurt.
  - Downed: immobile on the floor. Cannot be killed further. Can still talk — which is
    the point: a downed player uses voice to be found.
  - A downed player may choose to give up and become **dead** → spectator, by holding
    `giveUp` for `player.json → health.giveUpHoldSeconds`. Everything in their hands
    falls where they lay, for the same reason a dropped peer's does: a key that leaves
    the map inside somebody who has stopped playing is a run nobody can finish.
  - Revive: another player holds E (`player.json → health.reviveHoldSeconds`). Revived
    players come back **injured**, not healthy.
- Nobody bleeds out. Being downed is not a timer, it is a problem for the team — and
  giving up is the only clock on the floor, with the player's own hand on it.

## 3. The hunter

One enemy minimum, always spawning at least
`enemy.json → archetypes.<id>.spawn.minRoomDistanceFromPlayers` rooms away, and always
with a path to the players that does not require opening a locked door.

On **Hard** there are two. The second starts in the partition past the first locked
door: it is not seen, not heard and cannot reach anybody until the team spends its
first key, and after that it is a second hunter loose in the map. They do not
co-ordinate — the only thing one knows about the other is roughly where it is, and
the only use it makes of that is patrolling somewhere else. Everything below applies
to each of them.

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
- **Locked doors**: exactly `world.json → doors.lockedDoorCount` of them, each one a
  door you genuinely *must* pass to reach the exit — there is never a way around.
  A key is generic: it opens one locked door, any locked door, and is spent. The
  generator places the key for each lock somewhere you can already reach with the
  keys before it, plus `doors.keySpareCount` spares. You can never be stuck. Press
  E on a locked door with a key in hand and it is used automatically; using the key
  itself (LMB/RMB) on the door does the same thing.
- **Exit door**: obvious the moment you see it, placed far from the spawn. Hold E for
  `world.json → exit.holdSeconds` to leave.
- Chests are slow and **loud** to open. That is the trade.
- Lockers hide you from sight, not from a searching enemy — and not at all if it
  watched you climb in, in which case that locker is the first thing it opens.

## 4.1 Items

Seven items, **all single use**, all specified in `config/items.json`. Nothing in the
roster fights the hunter; every one of them buys you time or information.

| Item | Hand button does | What it costs the hunter |
| --- | --- | --- |
| **Bandages** | Hold on yourself, or on an injured teammate you are looking at | Nothing. It undoes a hit, which is the only thing in the game that does |
| **Flare charge** | Hold to aim, release to throw | Stuns everything in `radius` on landing — the hunter *and* any player, thrower included. Loud enough to bring it running if it was standing just outside |
| **Alarm clock** | Hold to aim, release to throw | Rings where it lands for `durationSeconds`, re-emitting the loudest noise in the game. The decoy you get to place |
| **Tar flask** | Hold to aim, release to throw | A slick that anything wading through crosses at `slowMultiplier` speed. It does not care that the hunter is faster than you |
| **Barricade** | Hold on a **closed** door | Adds `openSeconds` to that door for *everyone*. Doors already cost the hunter time; this is how you make one cost it much more |
| **Loose coins** | Nothing — spent on contact | Nothing. Money, straight into the run purse |
| **The diamond** | Nothing — it takes a hand and waits | Nothing. Rare, chest-only, and worth a fortune if you carry it out |

**Throwing** is one gesture, learned once: hold the hand button and an arc appears;
release and the item flies exactly along it. Pressing the other hand button — or
Escape — before releasing throws the aim away and keeps the item. The line is not an
approximation, it is the same integration the item will fly.

Throws deliberately ignore room furniture and containers. They stop on **walls,
closed doors, players, the hunter and the floor**, and nothing else: collision here
is a flat 2D test that cannot tell a wall from a table leg, and a flask dying on a
sideboard it visibly sailed over is worse than a flask that clears it.

**Coins are a team purse**, not loot to divide. A pile is spent the instant anyone
touches it and never takes a slot, so nobody has to decide whether money is worth a
hand or argue about who got there first. The purse is only real once you are out:
whoever escapes banks it as it stands **when they walk away from the run**, and a
team that is wiped banks nothing. The diamond is the one thing that has to be
*carried* out, and it pays into the purse at the exit door.

Getting through the door is what earns the right to the purse; it is not when you
count it. An escaped player drops into the spectator's chair and the purse keeps
filling behind them as the rest of the team cashes in, so **leaving early takes what
was in it then, and staying to the end takes all of it**. Everybody who got out takes
a full copy — there is nothing to split, because there is only ever one purse.

## 5. Voice chat

Proximity-based and generous — `net.json → voice.hearingRange` (22 m) versus the
enemy's much shorter voice hearing. Three modes, switchable from the pause menu with
one control: **off / open mic / push-to-talk**. You can also mute any teammate; the
mute is yours alone and they are never told.

A **solo run has no voice at all** — the microphone is never even asked for. There
is nobody to hear you, so all it could do is cost you.

Only real speech reaches the hunter: it takes `voice.noiseThresholdDb` to emit a
noise event at all, well above the level that opens an open mic. Breathing into your
microphone costs you nothing; shouting does.

Escaped and dead players spectate and can hear each other and whoever they are
watching; live players cannot hear them. Downed players are still live players — and
a downed player calling out is the intended way to be found, at the price of giving
the hunter somewhere to keep searching.

**Text chat** is the same conversation by other means: Enter opens a box, Enter sends
it, Escape throws it away. It spans the whole session — the cabin as well as a run —
and it obeys the same channel rule as voice, so a player still down there never reads
a line from one who is out. Typing gives the mouse back and does **not** pause: the
run carries on around you, which is the cost of stopping to type.

## 5b. Spectating

Escaping or giving up takes you out of the run, not out of the game. You sit behind
the eyes of somebody still in the map — their position, their look, their sound —
and `spectateNext` / `spectatePrev` cycle through everyone left. Downed players count
as somebody to watch; escaped, dead and disconnected ones do not. When there is
nobody left to watch, the run is over for you and the scoreboard goes up.

Waiting is not free time — it is the decision. The escape menu says what leaving
would bank right now, and every teammate who gets out behind you raises it.

## 6. Win and lose

- **Win**: every remaining player has escaped. Partial escapes still count as a win
  for those who made it, and the scoreboard shows who did.
- **Lose**: everyone is downed or dead.
- The run purse is banked by each player who escapes, as it stands when they leave.
  A diamond on a body on the cellar floor is worth exactly nothing.

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
- Collectables and lore notes
- Metaprogression: XP and a shop to spend the purse on — `game.json → meta`
- Vertical maps (rooms stacked) — `world.json → grid.levels`, deliberately deferred
