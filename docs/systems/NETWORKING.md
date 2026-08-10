# Networking

Owner: `src/net/` (client) and `src/server/` (signalling). Shared types in
`src/shared/`. Config: `config/net.json`.

> **Current state.** Multiplayer runs on **PeerJS** using its public signalling
> server (`src/net/index.ts`), in a star topology where the host relays. Our own
> signalling server is still plan step 23.
>
> **The host is authoritative over everything two peers can disagree about**: the
> run seed, the enemy, door state, and every contested claim on a single thing in
> the world. What it deliberately does *not* own is **movement** — see
> "What the host does not own" below.
>
> **Voice is the exception to the star.** A PeerJS media call needs only the other
> peer's id, not a data connection, so `src/net/` places one call per pair
> (`setVoiceStream`, `onVoiceStream`) and voice is a **true mesh** while gameplay
> data still relays through the host. The lower peer id dials, the higher answers,
> so each pair has exactly one bidirectional call. Nothing about voice is relayed,
> mixed or arbitrated here — see [`AUDIO_VOICE.md`](AUDIO_VOICE.md).
>
> **The lobby is host-authoritative too** (step 29): the host owns the tally, the
> difficulty and the countdown, and publishes the whole thing on every change rather
> than sending diffs. A snapshot small enough to send entire removes any question of
> two peers disagreeing about the score.
>
> | Message | Direction | Purpose |
> | --- | --- | --- |
> | `welcome {slot, peers, lobby, run}` | host → joiner | Identity, spawn slot, the lobby as it stands, and the run in progress if there is one. A joiner lands in the cabin unless the host is already down a hole. |
> | `lobby {state}` | host → all | `{ picks, difficultyId, countdown }`. Sent on every change, and once a second while the clock runs — only the whole second crosses the wire. |
> | `pick {id, mapId}` | any → host | A map chosen, or `null` to withdraw. Only the host tallies. |
> | `setDifficulty {difficultyId}` | any → host | Anyone may pull the lever. |
> | `runStart {run}` | host → all | `{ mapId, seed, difficultyId }`. The countdown finished, or a solo player pressed `E`. |
> | `lobbyMove {id, x, z, yaw}` | any → all | Cabin transforms at 10 Hz. Nothing in a foyer needs the run's rate. |
> | `dart {id, owner, position, velocity, wind}` | any → all | A dart, as its release state — every peer re-runs the flight, exactly as they do for a `throw`. `wind` is the thrower's wind clock, and it is here because the draught is a function of time and no two browsers have been in the cabin for the same number of seconds. |
> | `dartScore {id, score}` | any → all | A running total, sent whole. Self-reported: nobody arbitrates a scoreboard, and a message lost on the way costs nothing because the next one carries the truth. |
> | `scene {id, scene}` | any → all | `lobby` or `run`. Re-announced whenever a peer joins. |
> | `cosmetic {id, colourId}` | any → all | The wardrobe choice, re-announced the same way. |
> | `chat {id, text}` | any → all | One line of text. Broadcast to the whole session; **who may read it is the receiver's business** — a live player drops a line from a spectator, by the same rule that keeps them off the voice channel (`Game.canHearChatFrom`). Filtering on arrival rather than at the source is what keeps that rule in one place. |
>
> **`scene` is what keeps voice alive across a load.** Each side hands `voice/` only
> the peers standing in the *same* world, and `voice/` treats a peer with no position
> as flat and fully audible — so a teammate still generating a map stays in the
> conversation instead of being cut off at the door. See [`AUDIO_VOICE.md`](AUDIO_VOICE.md).
>
> **The enemy is already host-only**, which is the shape step 27 wants:
>
> | Message | Direction | Purpose |
> | --- | --- | --- |
> | `noise {id, kind, x, z}` | any peer → all | Every peer emits its own footsteps, doors, chests and drops; the host feeds them all into one `NoiseBus`. `kind` indexes `player.json → noise`, so only four numbers cross the wire. |
> | `enemy {x, z, yaw, alert}` | host → all | At `snapshotRateHz`. Clients never simulate the enemy, they interpolate this. |
> | `hit {id}` | host → all | Addressed: only the named player applies it. The victim owns their own health ladder. |
> | `health {id, state}` | owner → all | The result, so every peer can draw a downed teammate and count the wipe condition. |
> | `revive {id}` | reviver → all | Applied by the named player, who then echoes `health`. |
> | `escaped {id}` / `wiped` | any → all / host → all | Run outcome. |

## Claims: how one thing gets one owner

Four things in a run can only belong to one player, and all four go through the
same three messages:

| Message | Direction | Purpose |
| --- | --- | --- |
| `claim {kind, id, by, value}` | any → **host** | "I want this." Never relayed to other clients. |
| `granted {kind, id, by, value}` | host → all | `by` won it. **Every** peer applies the result. |
| `denied {kind, id, by}` | host → the loser | Addressed like `hit`: only they have anything to undo. |

`kind` is `take` (a world item, coins included), `chest`, `unlock` or `barricade`.

**The host keeps no ledger of claims.** Every answer comes from world state it
already holds — is that item still on the floor, is that door still locked, still
unwedged — so *granting* a claim is exactly what makes the next claim on the same
thing fail (`Game.arbitrate`). There is no second copy of the truth to drift.

**Only a pick-up is optimistic.** It has to be: a press whose hand fills a round
trip later feels broken. The item goes into the hand at once and comes back out on
a `denied` — and it is *not* put back on the floor, because the only reason a take
is ever denied is that somebody else already has it. Everything else follows a
hold, where the ring finishing is the feedback and the result landing 50 ms behind
it is invisible, so the key, the planks and the chest are spent on the **grant**
and nothing has to be rolled back at all.

**Doors are the same idea without the denial.** A client sends `doorRequest` and
opens the door locally at once; the host applies it and publishes `door` with the
state it actually reached. If the door turned out to be locked or wedged on the
host's side, that message is the correction. Clients apply `door` as given and never
broadcast one.

**Coins need no message.** A pile's value is rolled from `(run seed, item id)`, so
every peer that sees the grant reaches the same number and adds it to the same
purse. `coins` survives only for treasure banked at the exit.

## What the host does not own

**Movement.** Each peer simulates its own player and broadcasts the result; the
host does not re-simulate it from input frames, and clients do not replay an input
buffer against a snapshot. This is a decision, not a gap:

- The reasons to own movement centrally are anti-cheat and resolving disagreements
  about where somebody is. Anti-cheat is explicitly not built (see
  [`../ARCHITECTURE.md`](../ARCHITECTURE.md) → "Deliberately NOT built") — this is
  co-op with friends — and nothing in the game *contests* a position: two players
  can stand in the same doorway.
- Everything that can genuinely be argued over — who has the item, whether the door
  is open, where the hunter is, whether the run is lost — is arbitrated above.
- The cost is real: a full input-frame sim would have to own hiding, revives, tar
  slows and locker teleports as well, and it would put a round trip between the
  player and their own footsteps.

What clients *do* get is the presentation half: remote players and (on a client)
the hunter are drawn through a snapshot buffer that plays back
`simulation.interpolationDelayMs` in the past and extrapolates at most
`maxExtrapolationMs` before holding still (`src/net/interpolation.ts`). That is
where the smoothness of remote motion comes from.

If host-authoritative movement is ever wanted, `stepPlayer()` is still a pure
`(state, input, dt) → state` function, which is the seam it would need.

## Starting together: the load gate

Everybody builds the same map from the same seed, but not at the same speed — a
slower machine can be many seconds behind. So `runStart` no longer means "play":

```
host             runStart ──────────────►  every peer builds its world
every peer       ready ─────────────────►  host counts them
host             loading {ready, total} ►  the loading card fills one pip per player
host             runGo ─────────────────►  everybody plays
```

Until `runGo`, a built world **presents but does not run**: the camera is already
in the room you will start in and the conversation carries on over the top of it,
but the hunter does not move and nothing can be touched (`Game.update(dt, controls,
live)`). Dropping one player into a run already underway, alone, with the hunter
awake, is the thing a shared start exists to prevent.

The host gives up after `connection.loadTimeoutSeconds` and starts without whoever
is missing — one peer that crashed loading must not strand the rest at a spinner.
A peer that joins *after* the gate opened is not waited for: their `ready` is
answered with `runGo` addressed to them alone.

## Model

**Host-authoritative WebRTC peer-to-peer.** One player (the lobby creator) runs the
authoritative simulation. Everyone connects directly to everyone else, so voice is
a true mesh, but *gameplay authority* is a star with the host at the centre.

```
             signalling server (ws)          gameplay + voice (WebRTC)
             ── codes + SDP/ICE only ──         ── peer to peer ──

   client A ─┐                                 A ═══ B
   client B ─┼──► ws://…:8787                  ║ ╳ ║      (mesh, voice)
   client C ─┘                                 C ═══ D

                                               A = host: authoritative sim
                                               B,C,D: predict self, interpolate rest
```

The signalling server holds **no game state** and never sees gameplay traffic. Its
whole job is: allocate a 6-digit code, keep a code → host mapping, relay SDP/ICE
until peers are connected.

## Lobby codes

- `game.json → session.lobbyCodeLength` characters from
  `session.lobbyCodeAlphabet` (ambiguous glyphs `I O 0 1` excluded).
- Host asks the signalling server for a code; the server guarantees uniqueness and
  expires it when the host disconnects.
- Joiner sends the code, receives the host's peer descriptor, and the WebRTC
  handshake proceeds.
- Steam lobbies (`net.json → steam`) will plug in here as an alternate code source
  in the packaged build. Nothing above this layer changes.

## Channels

Per `config/net.json → channels`, two data channels per peer:

| Channel | Config | Carries |
| --- | --- | --- |
| `state` | unordered, `maxRetransmits: 0` | Snapshots and input frames. Stale data is worthless — never retransmit it. |
| `events` | ordered, reliable | Door opened, item picked up, player downed, run started/ended, chat. Must arrive exactly once, in order. |

Plus one audio track per peer for voice ([`AUDIO_VOICE.md`](AUDIO_VOICE.md)). That
track is created once and never renegotiated — every voice mode is a gain on it.

## Simulation split

```
CLIENT (each tick)                     HOST (each tick)
──────────────────                     ────────────────
move own player, send transform  ────► collect every peer's transform
                                       run the hunter against all of them
receive enemy snapshot           ◄──── send @ snapshotRateHz (15 Hz)
draw remotes + hunter from the
  snapshot buffer, delayed by
  interpolationDelayMs

want an item / chest / lock /
  door / barricade               ────► arbitrate against world state
show it at once where a press
  demands it                     ◄──── granted to all, denied to the loser
```

- **Interactions are host-decided.** The client shows optimistic feedback where the
  input is a press; the host publishes the authoritative result.
- **Remote entities** (other players, and the enemy on a client) render
  `simulation.interpolationDelayMs` in the past, extrapolating at most
  `maxExtrapolationMs` before holding still.
- **Movement is not host-owned.** See "What the host does not own" above —
  `reconcilePositionThreshold` and `reconcileSnapThreshold` in `net.json` belong to
  that design and are currently unread.

## The map is not replicated

`(mapId, seed)` goes over the wire; every peer runs the identical generator
([`GENERATION.md`](GENERATION.md)). This is the reason for the determinism rules in
[`../art/ART_GUIDE.md`](../art/ART_GUIDE.md) §7.

> Peers are assumed to be running the same build and the same `config/`. Detecting a
> mismatch (hashing the config and rejecting the join) is a deliberate future
> addition — do not build it yet.

## What crosses the wire

| Message | Channel | Direction | Rate |
| --- | --- | --- | --- |
| `move {x, z, yaw, pitch, height, hiding, health, left, right}` | state | any → all | `snapshotRateHz` |
| `chat {id, text}` | events | any → all | on send |
| `enemy {x, z, yaw, alert}` | state | host → all | `snapshotRateHz` |
| `ping {id}` | state | any → all | `connection.heartbeatSeconds` |
| `runStart {mapId, seed, difficultyId}` | events | host → all | once |
| `ready` / `loading` / `runGo` | events | ↑ host / host → all | per load |
| `claim` / `granted` / `denied` | events | ↑ host / host → all / host → one | on interaction |
| `doorRequest {id, open}` → `door {id, open}` | events | ↑ host / host → all | on interaction |
| `PlayerState` change (injured/downed/revived/escaped) | events | owner → all | on event |
| `NoiseEvent` | events | any → all | on event |
| `throw {id, itemId, owner, position, velocity}` | events | any → all | on throw |
| `barricade {doorId, seconds}` | events | host → all (grant) / any → all (torn off) | on place / on break |
| `heal {playerId, toState}` | events | any → the patient | on event |
| `coins {amount}` | events | any → all | at the exit only — a pile is derived, not sent |
| `wiped` + `stats` | events | host → all / any → all | once / lazily |
| `LobbyState` | events | host → all | on change |

**`move` carries the hands** for one reason: when a peer drops out, the host has to
put whatever they were carrying back on the floor. A key that leaves the map inside
a closed tab is a run nobody can finish.

**`move` carries `pitch` for exactly one consumer.** No body is ever drawn with it —
a remote is oriented by `yaw` alone. It is there so a **spectator** can sit behind
another player's eyes rather than at their shoulder height looking at the horizon
(plan step 39), which is the difference between a point of view and a camera mount.

**A player who leaves the run stops sending `move` at all**, after one final
transform sent out of turn. That last one matters: it is what tells every peer the
body is empty-handed before it stops moving, so a later disconnect cannot spawn a
second copy of whatever it was last seen holding. An escaped peer's body is then not
drawn, not hunted and not something a thrown item can hit, on every peer alike — the
last point is what keeps four independent simulations of one arc agreeing.

All shapes live in `src/shared/messages.ts` so client and host cannot drift.

**A throw is six floats, not a stream.** Only the release state crosses the wire;
every peer re-runs the same ballistics from it (`src/entities/projectile.ts`) and
builds the same tar slick, the same ringing clock, the same flare. Nothing about the
flight, the landing or what it leaves behind is replicated. The bodies a throw can
hit include the local player on every peer, so all four test the identical set and
skip only whoever threw it — otherwise the same flask would clear a teammate on one
machine and stop dead on theirs. The one thing that stays host-only is the **noise**
a landing makes: four peers emitting it would be four times the volume.

Effects that a peer must not be allowed to disagree about are messages, not
simulation: a barricade going up or coming down (`barricade`), and coins
(`coins`, a single running total everybody adds to).

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Client disconnects | Their body leaves, whatever they were carrying **falls where they stood** (host-spawned, so it lands in exactly one place), their `RunState` entry is marked `disconnected`, and the wipe condition is re-evaluated — losing the last player on their feet ends the run like any other wipe. Their roster line and their scoreboard column stay, greyed. No rejoin — reconnection is a deliberate future addition |
| Host disconnects | Run ends, everyone returns to the main menu with `lobby.hostLeft` (`hostMigration.enabled = false` in v1) |
| A peer stops responding without closing | `ping` goes out every `connection.heartbeatSeconds`; a peer nothing has been heard from for `connection.timeoutSeconds` is dropped as above. A closed tab, a crash or a dead network never sends a goodbye, and WebRTC can take the best part of a minute to admit it — the cost of being wrong is one reconnect, the cost of waiting is a body standing in a corridor for the rest of the run |
| A peer never finishes loading | The host opens the gate anyway after `connection.loadTimeoutSeconds` |
| Signalling server down | Existing runs are unaffected — it is only needed to join |
| No ICE path (symmetric NAT) | Join fails with a clear message. `ice.turnServers` is the fix; empty by default |

**Leaving a run back to the cabin is a disconnect too**, as far as the run is
concerned: peers announce their `scene`, and a peer who is no longer in `run` is
dropped from it by exactly the path above. Otherwise their body would stand in a
corridor for as long as everyone else kept playing.

## Adding a networked feature

1. **Can two players want it at once?** If so it is a `claim`, not a message: add a
   `ClaimKind`, a branch in `Game.arbitrate` (answered from world state, never from
   a ledger) and a branch in `Game.applyGrant`. Nothing else is needed.
2. Otherwise add the message shape to the `NetMessage` union in `src/net/index.ts`
   (`src/shared/messages.ts` when the signalling server lands) and a hook on
   `NetEvents`.
3. If it is a request only the host acts on, add it to `NOT_RELAYED` — a request
   that reaches another client without the host deciding is not authority.
4. Pick a channel: does a dropped copy matter? → `events`. Is it a continuous
   value? → `state`.
5. Client: apply it, and add optimistic feedback only where the input is a press.
   After a hold, the answer arrives inside the animation.
6. If it can be *derived* from the seed and something already replicated — a coin
   pile's value, a thrown item's arc — derive it. A message that cannot be lost is
   better than one that is resent.
7. If it changes what the world looks like at generation time, it belongs in the
   seed, not in a message.
