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
> | `welcome {slot, slots, peers, lobby, run}` | host → joiner | Identity, spawn slot, **every peer's slot**, the lobby as it stands, and the run in progress if there is one. A joiner lands in the cabin unless the host is already down a hole. |
> | `join {id, slot}` | host → all | Somebody arrived, and the number they arrived as. |
> | `lobby {state}` | host → all | `{ picks, difficultyId, countdown }`. Sent on every change, and once a second while the clock runs — only the whole second crosses the wire. |
> | `pick {id, mapId}` | any → host | A map chosen, or `null` to withdraw. Only the host tallies. |
> | `setDifficulty {difficultyId}` | any → host | Anyone may pull the lever. |
> | `runStart {run}` | host → all | `{ mapId, seed, difficultyId }`. The countdown finished, or a solo player pressed `E`. |
> | `lobbyMove {id, x, z, yaw}` | any → all | Cabin transforms at 10 Hz. Nothing in a foyer needs the run's rate. |
> | `dart {id, owner, position, velocity, wind}` | any → all | A dart, as its release state — every peer re-runs the flight, exactly as they do for a `throw`. `wind` is the thrower's wind clock, and it is here because the draught is a function of time and no two browsers have been in the cabin for the same number of seconds. |
> | `dartScore {id, score}` | any → all | A running total, sent whole. Self-reported: nobody arbitrates a scoreboard, and a message lost on the way costs nothing because the next one carries the truth. |
> | `scene {id, scene}` | any → all | `lobby` or `run`. Re-announced whenever a peer joins. |
> | `cosmetic {id, colourId}` | any → all | The wardrobe choice, re-announced the same way. |
> | `name {id, name}` | any → all | What a peer calls itself, re-announced exactly as a cosmetic is. **Cleaned on arrival, not trusted** (`@shared/playerName`): it is the only free text in the protocol besides chat, and the one string another browser gets to put on your screen. An empty name is a peer who never chose one, and every list falls back to their roster number. |
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
> | `enemy {index, x, z, yaw, alert, by, ax, az}` | host → all | One per hunter, at `snapshotRateHz`. Clients never simulate a hunter, they interpolate this. **How many there are never crosses the wire**: it falls out of `(mapId, seed, difficultyId)`, which every peer already has, so a snapshot only has to name an index. `by` is whose doing the alert is and `ax`/`az` is what it is worked up about, both so that each browser can decide whether any of it is *theirs* — see [`AUDIO_VOICE.md`](AUDIO_VOICE.md) → "Whose alert is it". |
> | `hit {id}` | host → all | Addressed: only the named player applies it. The victim owns their own health ladder. |
> | `health {id, state}` | owner → all | The result, so every peer can draw a downed teammate and count the wipe condition. |
> | `revive {id}` | reviver → all | Applied by the named player, who then echoes `health`. |
> | `reviving {id, by, active}` | reviver → the patient | Hands going onto a body and coming off again. Addressed like `hit`: the only thing it does is stop that player's bleed-out clock, and nobody else has one. Sent on the **edges** of the hold, never per tick — and never trusted on its own: the patient also checks the reviver is still in `health.reviveRange` (`Game.#beingRevived`), so a reviver who is killed, drops or walks away releases the clock without having to send anything. A message that can be lost is not what a clock hangs on. |
> | `escaped {id}` / `wiped` | any → all / host → all | Run outcome. `wiped` is sent whenever the host finds **nobody left who could still change the run** — not only when everybody is on the floor. A team with one player out through the door and the rest downed has no revive left in the map, so it ends there rather than after the last bleed-out clock. Peers that already escaped skip the sting; the message is the end of a run, not a verdict on it. |

## Slots: one number for one player

A slot is where you spawn **and** the number the interface calls you by until you
have typed a name — `Player 2` is slot 1 plus one. The host deals them, lowest
free first, and publishes the whole map (`welcome.slots`, then `join`); nobody
works one out for themselves.

That is not bookkeeping, it is the whole point. A peer numbering itself 1 and
everyone else from 2 gives four players four different rosters, and **"Player 2
has the key" then names a different person on every screen** — which is exactly
the sentence proximity voice exists to make useful.

A slot is freed when its owner leaves, but **only between runs**. Inside a run
the player who dropped keeps their number for as long as it lasts: their roster
line and their scoreboard column are still there, greyed, and a newcomer
inheriting the number would put two players on it.

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

## Timing: the part that decides whether any of this feels good

Everything above is about *what* crosses the wire. This section is about *when*,
and it is where a game that works on a LAN and falls apart on hotel wifi is
either fixed or not.

### Samples are placed on the sender's timeline, not stamped on arrival

The mistake this is built to avoid is easy to make and very hard to see
afterwards: stamping a received transform with the moment it arrived.

Two snapshots sent 67 ms apart can arrive 4 ms apart on a choppy link and then
130 ms apart. A buffer that interpolates between *arrival* times replays exactly
that — the body crosses one gap in 4 ms, stands still for 130, and crosses the
next in 4. **The jitter of the connection becomes the motion of the body**, and
no amount of smoothing downstream can take it back out.

So every continuous message carries `st`, the sender's own monotonic clock, and
`q`, a per-sender packet counter. The receiver keeps one `PeerClock`
(`src/net/timing.ts`) per *player* and estimates the offset between the two
machines' clocks as `min(arrival − st)` over a window: the fastest packet is the
one that queued the least, so it is the closest reading of the offset available,
and everything above that floor is that packet's queueing delay. That spread is
the **jitter**, and the jitter is exactly what the playback buffer has to cover.

The window matters. Two machines' clocks drift, so a floor that has stood
unbeaten for `clockWindowSeconds` is treated as drift rather than as a fast
packet and replaced with the best of the window just gone.

A relayed message keeps the **original** sender's `st` and `q`, never the host's.
A client measures the trip from the peer who actually moved, relay included.

### The buffer sizes itself

`interpolationDelayMs` used to be one number for every connection and every
player. It is now a floor:

```
delay  →  clamp( baseDelayMs + jitterMultiplier × measuredJitter,
                 minDelayMs, maxDelayMs )
```

approached with two very different time constants — `growSeconds` (short: a body
has already stuttered) and `shrinkSeconds` (long: a delay that steps is itself a
source of jitter). Every peer gets their own, so a teammate on fibre is drawn
~50 ms behind and one on a train is drawn as far behind as their link needs, and
neither costs the other anything.

Measured, on a body genuinely walking a straight line at 3 m/s, drawn at 144 Hz:

| Link | Arrival-stamped, fixed buffer | Sender-stamped, adaptive buffer |
| --- | --- | --- |
| Clean | — | 3.000 m/s, σ 0.001, buffer 58 ms |
| 120 ms jitter, 8 % loss | mean 9.74 m/s, **σ 28.5**, peak **495 m/s** | 2.995 m/s, **σ 0.041**, peak 3.15, buffer 217 ms |
| 250 ms jitter, 15 % loss | mean 14.4 m/s, **σ 47.8**, peak **951 m/s** | 2.998 m/s, **σ 0.054**, peak 3.04, buffer 369 ms |
| …with arrivals genuinely out of order | — | 2.994 m/s, σ 0.069, peak 3.62, buffer 381 ms |

The peaks in the middle column are the bug: a body covering hundreds of metres
in one frame is what "teleporting around" actually is.

The last row matters because the `state` channel is unordered by design, so a
pair that swapped places in flight is routine rather than exceptional. Samples
are inserted in order rather than dropped — the list is almost always already
sorted, so it costs one comparison.

### Two channels, one peer connection

Snapshots used to share a single ordered reliable channel with everything else,
and that is the second half of the same problem. **One lost snapshot holds up
every message behind it** until it has been re-sent, so a body freezes for a
round trip and then jumps through the whole backlog at once. By the time those
samples arrive they are all in the past together, and no buffer can unpick that.

There is now a second data channel per peer, declared **out of band on a fixed
id** (`channels.state.id`) so both ends can create it with no second offer/answer
round — one ICE negotiation per pair, two channels over it. Going to the peer
connection directly rather than opening a second PeerJS connection is what buys
`maxRetransmits: 0`: PeerJS's own `reliable: false` is unordered but still
retransmitted, and a snapshot that has to be re-sent has already been replaced.

| Channel | Carries | Why |
| --- | --- | --- |
| `state` — unordered, `maxRetransmits: 0` | `move`, `enemy`, `lobbyMove`, `ping`, `pong` | A late copy says nothing the next one does not say better |
| `events` — ordered, reliable | everything else | A door that opened stays open; a dropped copy is a divergent world |

Two details fall out of this:

- A state channel whose `bufferedAmount` is backing up is dropped from rather
  than queued into. Queueing is how a link that recovers replays thirty stale
  positions at once — which looks exactly like teleporting.
- **One transform has to arrive**: the final one a player sends on leaving a run,
  which is what says their hands are empty. It carries `final: true` and takes
  the reliable road, and it keeps taking it when the host relays it on.

One thing genuinely got cheaper-but-lossier: the "I watched you climb into that
locker" sight chance is spotted from the `move` stream, so on a bad link it can
be missed. The hiding *state* is in every later packet, so only the one-tick
opportunity is lost, never the fact.

### Round trip, jitter and loss are measured, not guessed

`ping` carries a nonce; `pong` quotes it back, addressed. That gives a real RTT
per link, smoothed over `connection.rttSamples`. Loss comes from the gaps in `q`
over a rolling window. All three are what `Net.linkQuality()` reports and what
the connection indicator draws — see [`UI.md`](UI.md).

## The simulation does not care what your graphics card is doing

`src/core/Loop.ts`. The tick is fixed at `simulation.tickRateHz` (60) and the
render step runs at whatever the display manages. Three things make that a
guarantee rather than an intention.

**Hitches are caught up, within a budget.** A frame that took 200 ms owes three
steps and pays them. Past `maxCatchUpSeconds` — of simulated time *or* of real
time spent, whichever runs out first — the rest is written off, because a
machine that cannot afford the backlog only falls further behind paying it. The
old loop capped substeps and then silently dropped the whole accumulator, so an
ordinary GC pause on the host quietly slowed the world down for everybody.

**Frames are not the only thing that can drive it.** `requestAnimationFrame`
stops entirely in a window that is not in front, and the host simulates the run
for three other people. When no frame has arrived for `stallPumpMs` the steps are
taken from a timer instead. *Verified: with `document.hidden` true and **zero**
rAF callbacks in three seconds, round-trip measurement kept advancing — the tick
was still running.* Chromium exempts a page with a live peer connection from its
worst timer throttling, which is exactly this case.

For the same reason nothing that must happen is gated on a frame. Starting a run
waits one frame for the loading card to paint, but never *waits on* one
(`afterPaint` in `src/main.tsx`) — a host who alt-tabbed at the loading screen
would otherwise never start.

**Presentation happens at the display's rate.** `Game.present(dt, alpha)` and
`Lobby.present(alpha)` are called from the render step and own everything drawn:
the local camera interpolated between the two ticks either side of this frame,
and every remote body and hunter sampled fresh from its own buffer. Doing it in
the tick — which is what used to happen — meant a 144 Hz display showed 60
distinct positions and a 30 fps one drew everything a frame late. Rotation is
carried along with position rather than left on the newest tick's value: one
tick of aiming latency is 16 ms and imperceptible, while a view that turns 60
times a second in front of a 144 Hz display is a stutter anyone can see.

Culling and the light budget stay at the end of the tick, as documented in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) §7 — the margins in `graphics.json`
are what covers the few centimetres between the tick's camera and the frame's.

**The cabin is not exempt.** It used to chase the latest packet with an
exponential lerp, which is the rubbery motion the run's buffer exists to
replace — and a foyer is where you spend the most time watching other people
stand still. It uses the same `TransformBuffer` now.

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
the hunter are drawn through a snapshot buffer that plays back in the past by an
amount this link has earned and extrapolates at most `maxExtrapolationMs` before
holding still (`src/net/interpolation.ts`). See "Timing" above — that is where
the smoothness of remote motion comes from.

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

Per `config/net.json → channels`, two data channels per peer, both over the one
peer connection PeerJS negotiated. Full reasoning under "Timing" above.

| Channel | Config | Carries |
| --- | --- | --- |
| `state` | unordered, `maxRetransmits: 0`, negotiated on `id` | `move`, `enemy`, `lobbyMove`, `ping`, `pong`. Stale data is worthless — never retransmit it, and drop rather than queue when it backs up. |
| `events` | ordered, reliable | Door opened, item picked up, player downed, run started/ended, chat. Must arrive exactly once, in order. |

If the `state` channel cannot be opened for any reason, every message on it
falls back to the reliable connection — which is exactly where they all used to
go, so the worst case is the old behaviour rather than a broken one.

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
- **Remote entities** (other players, and the enemy on a client) render in the
  past by an amount their own link has earned, extrapolating at most
  `maxExtrapolationMs` before holding still.
- **Movement is not host-owned.** See "What the host does not own" above.

## The map is not replicated

`(mapId, seed, difficultyId)` goes over the wire; every peer applies the same map
and difficulty overlays to its config and then runs the identical generator
([`GENERATION.md`](GENERATION.md)). This is the reason for the determinism rules in
[`../art/ART_GUIDE.md`](../art/ART_GUIDE.md) §7.

It is also why the hunter **count** is never sent. The difficulty decides it
(`enemy.json → spawn.regions`), the difficulty id is already in `runStart`, so a
client builds the same list the host did and an `enemy` snapshot is an index into
a list both ends already agree on.

> Peers are assumed to be running the same build and the same `config/`. Detecting a
> mismatch (hashing the config and rejecting the join) is a deliberate future
> addition — do not build it yet.

## What crosses the wire

| Message | Channel | Direction | Rate |
| --- | --- | --- | --- |
| `move {x, z, yaw, pitch, height, hiding, health, left, right, final?}` | state | any → all | `snapshotRateHz` |
| `pong {id, to, n}` | state | → whoever pinged | per `ping` |
| `chat {id, text}` | events | any → all | on send |
| `enemy {index, x, z, yaw, alert, by, ax, az}` | state | host → all | `snapshotRateHz`, per hunter |
| `ping {id, n}` | state | any → all | `connection.heartbeatSeconds` |
| `runStart {mapId, seed, difficultyId}` | events | host → all | once |
| `ready` / `loading` / `runGo` | events | ↑ host / host → all | per load |
| `claim` / `granted` / `denied` | events | ↑ host / host → all / host → one | on interaction |
| `doorRequest {id, open}` → `door {id, open}` | events | ↑ host / host → all | on interaction |
| `PlayerState` change (injured/downed/revived/escaped) | events | owner → all | on event |
| `NoiseEvent` | events | any → all | on event |
| `throw {id, itemId, owner, position, velocity}` | events | any → all | on throw |
| `barricade {doorId, seconds}` | events | host → all (grant) / any → all (torn off) | on place / on break |
| `heal {playerId, toState}` | events | any → the patient | on event |
| `reviving {id, by, active}` | events | reviver → the patient | on the edges of a hold |
| `name {id, name}` | events | any → all | on change, and on anyone joining |
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

**Every message on the `state` channel also carries `q` and `st`** — a per-sender
packet counter and the sender's own monotonic clock — written on by `Net` on the
way out and read by `Net` on the way in. Nothing above `net/` sees either: the
handlers are handed `at`, the time on *this* machine's clock that the sample
belongs at. See "Timing" above for why that is not the same as when it arrived.

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
| A peer's link goes quiet | **Three stages, not two.** `ping` goes out every `connection.heartbeatSeconds`. Past `unstableSeconds` (2.5 s) the link is *reported* as unstable — the connection indicator lights, and nothing else happens. Only past `timeoutSeconds` (12 s) is the peer dropped. That gap is the whole point: a ten-second wifi hiccup used to take a player's body out of the map and drop their key on the floor, and the run carried on without them |
| A peer's connection actually **closes** | Dropped at once rather than waited out. A connection that has said it is going is not the same thing as one that has gone quiet, and treating them alike means either a slow answer to a closed tab or a hasty one to a bad link. This is why the timeout above can afford to be generous |
| A peer never finishes loading | The host opens the gate anyway after `connection.loadTimeoutSeconds` |
| Signalling server down | Existing runs are unaffected — it is only needed to join. But the socket never comes back on its own and a lobby whose code has quietly stopped being joinable looks exactly like one that works, so it is re-opened underneath the run on `signalling.reconnectBackoffSeconds` |
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
