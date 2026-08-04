# Networking

Owner: `src/net/` (client) and `src/server/` (signalling). Shared types in
`src/shared/`. Config: `config/net.json`.

> **Current state (slice 3).** Multiplayer runs on **PeerJS** using its public
> signalling server (`src/net/index.ts`), in a star topology where the host relays.
> The host is authoritative over the **run seed** and the **enemy** — everything
> else is broadcast and trusted: player transforms (`move`, which now also carries
> `hiding` and `health`), door toggles (`door`), door unlocks (`unlock`), chest
> openings (`chest`) and item pickup/drop (`take` / `drop`). World items are named
> deterministically from the seed (`item:x,y:i`, `chest:x,y:i:loot`), so a `take`
> needs only an id; dropped items are namespaced by peer (`drop:<peer>:<n>`).
> Nothing stops two peers taking the same item at once — that is step 26. The
> authoritative simulation, prediction and our own signalling server are plan steps
> 23–27. The rest of this document describes that target design.
>
> **Voice is the exception to the star.** A PeerJS media call needs only the other
> peer's id, not a data connection, so `src/net/` places one call per pair
> (`setVoiceStream`, `onVoiceStream`) and voice is a **true mesh** while gameplay
> data still relays through the host. The lower peer id dials, the higher answers,
> so each pair has exactly one bidirectional call. Nothing about voice is relayed,
> mixed or arbitrated here — see [`AUDIO_VOICE.md`](AUDIO_VOICE.md).
>
> **The lobby is host-authoritative already** (step 29), and is the shape the rest of
> the game is heading toward: the host owns the tally, the difficulty and the
> countdown, and publishes the whole thing on every change rather than sending diffs.
> A snapshot small enough to send entire removes any question of two peers disagreeing
> about the score.
>
> | Message | Direction | Purpose |
> | --- | --- | --- |
> | `welcome {slot, peers, lobby, run}` | host → joiner | Identity, spawn slot, the lobby as it stands, and the run in progress if there is one. A joiner lands in the cabin unless the host is already down a hole. |
> | `lobby {state}` | host → all | `{ picks, difficultyId, countdown }`. Sent on every change, and once a second while the clock runs — only the whole second crosses the wire. |
> | `pick {id, mapId}` | any → host | A map chosen, or `null` to withdraw. Only the host tallies. |
> | `setDifficulty {difficultyId}` | any → host | Anyone may pull the lever. |
> | `runStart {run}` | host → all | `{ mapId, seed, difficultyId }`. The countdown finished, or a solo player pressed `E`. |
> | `lobbyMove {id, x, z, yaw}` | any → all | Cabin transforms at 10 Hz. Nothing in a foyer needs the run's rate. |
> | `scene {id, scene}` | any → all | `lobby` or `run`. Re-announced whenever a peer joins. |
> | `cosmetic {id, colourId}` | any → all | The wardrobe choice, re-announced the same way. |
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
CLIENT (each tick, 30 Hz)              HOST (each tick, 30 Hz)
──────────────────────────             ───────────────────────
sample input → InputFrame              apply every client's InputFrame
apply locally (prediction)             run authoritative sim
send InputFrame ─────────────────────► (movement, interactions, AI, run state)
                                       build Snapshot
receive Snapshot ◄──────────────────── send @ snapshotRateHz (15 Hz)
reconcile own position
interpolate remote entities
  (delayed by interpolationDelayMs)
```

- **Prediction**: the client applies its own input immediately and keeps an
  unacknowledged input buffer. On snapshot, it rewinds to the authoritative state
  and replays the buffer.
- **Reconciliation**: correct smoothly if the error exceeds
  `simulation.reconcilePositionThreshold`; hard-snap past
  `reconcileSnapThreshold`.
- **Remote entities** (other players, the enemy) render
  `simulation.interpolationDelayMs` in the past, extrapolating at most
  `maxExtrapolationMs` before freezing.
- **Interactions are host-decided.** The client shows optimistic feedback (the hold
  ring fills) but the host emits the authoritative result on the `events` channel.

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
| `InputFrame` | state | client → host | tick rate |
| `Snapshot` | state | host → all | `snapshotRateHz` |
| `RunStart {mapId, seed, difficulty}` | events | host → all | once |
| `Interaction` result | events | host → all | on event |
| `PlayerState` change (injured/downed/revived/escaped) | events | host → all | on event |
| `NoiseEvent` (for local audio only) | events | host → all | on event |
| `RunEnd` + stats | events | host → all | once |
| `LobbyState` | events | host → all | on change |

All shapes live in `src/shared/messages.ts` so client and host cannot drift.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Client disconnects | Their player is marked `disconnected` and the run continues. No rejoin — reconnection is a deliberate future addition |
| Host disconnects | Run ends, everyone returns to the main menu (`hostMigration.enabled = false` in v1) |
| Signalling server down | Existing runs are unaffected — it is only needed to join |
| No ICE path (symmetric NAT) | Join fails with a clear message. `ice.turnServers` is the fix; empty by default |

## Adding a networked feature

1. Add the message shape to `src/shared/messages.ts`.
2. Pick a channel: does a dropped copy matter? → `events`. Is it a continuous value? → `state`.
3. Host: produce it in the authoritative sim.
4. Client: apply it, and add optimistic prediction only if the latency is felt.
5. If it changes what the world looks like at generation time, it belongs in the
   seed, not in a message.
