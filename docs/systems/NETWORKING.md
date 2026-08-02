# Networking

Owner: `src/net/` (client) and `src/server/` (signalling). Shared types in
`src/shared/`. Config: `config/net.json`.

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

Plus one audio track per peer for voice ([`AUDIO_VOICE.md`](AUDIO_VOICE.md)).

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
