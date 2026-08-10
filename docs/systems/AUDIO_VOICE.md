# Audio & Voice Chat

Owners: `src/audio/` (game sound) and `src/voice/` (proximity voice).
Config: `config/audio.json`, `config/net.json → voice`.

---

## Part 1 — Game audio

### Two sources, one pipeline

Every sound exists twice over: as a **Tone.js recipe** synthesised at boot, and as a
**file path** a composer can drop a real recording into. The file wins whenever it is
actually present under `assets/audio/`; otherwise the recipe plays. Both end up as an
`AudioBuffer` before anything is heard, so nothing downstream knows the difference.

```
config/audio.json → sounds.<soundId>
        │
        ├─ files[]  ── present under assets/audio/ ? ──► fetch + decode ──┐
        │                                                                 ├──► AudioBuffer
        └─ synth    ── recipe in src/audio/recipes.ts ──► Tone.Offline ───┘
```

That is why the game ships with a complete soundtrack and still lets audio be
replaced one file at a time. See [`assets/audio/README.md`](../../assets/audio/README.md)
for the composer-facing half.

**A `soundId` with no file and no recipe is legal.** It logs once and plays nothing.

### Sound registry

Logic never references a file path, a node or an oscillator. It calls:

```ts
audio.play('door.open', { at: { x: door.x, z: door.z } });
audio.sustain('heartbeat', 'player.heartbeat', { on: true, level, rate });
```

`'door.open'` resolves through `config/audio.json → sounds`: bus, synth recipe,
candidate files, volume, pitch range, loop flag, `spatial`, cooldown.

`play()` is fire-and-forget. `sustain(key, soundId, state)` is a named looping voice
the caller drives per frame — the heartbeat, the hunter's drone, a hold in progress —
and passing a different `soundId` for the same key swaps it.

**Silencing a sustain keeps its voice; only `release` frees one.** `sustain(key,
null, { on: false })` leaves the nodes built, because a hold that is started and
abandoned every few ticks would otherwise churn them. That is right for the fixed
keys and wrong for a key minted per thing — `effect:<id>`, one per alarm clock —
because every voice left behind is an HRTF panner wired to a bus for the rest of the
session. Those keys go through `releaseSustain(key)`, and `Game.end()` calls
`releaseSustains()` so a run's voices do not outlive it.

| Call | Nodes |
| --- | --- |
| `sustain(key, null, { on: false })` | kept, silent, ready to start again |
| `stopSustains()` | all kept, all silent — a pause |
| `releaseSustain(key)` | faded out, then freed |
| `releaseSustains()` | all faded out, then freed — a teardown |

### Where the numbers live

| Kind | Lives in | Why |
| --- | --- | --- |
| Bus, volume, pitch spread, cooldown, spatial flag, which event fires what | `config/audio.json` | Anyone might tune these |
| Oscillator frequencies, envelopes, filter Q — the sound's identity | `src/audio/recipes.ts` | This is content, like the literals in `art/`. It is the thing a file replaces |

### Buses

`master → { music, sfx, ambience, voice, ui }` (`config/audio.json → buses`), built
from plain `GainNode`s. Options-menu sliders (step 35) write bus volumes into the
save profile through `audio.setBusVolume()`. Music ducks by `music.duckOnVoiceDb`
while a teammate is audible (`music.setVoiceDucking()`, driven from `src/voice/`).

Voice chat attaches its peer streams to `audio.bus('voice')` on `audio.context`
rather than opening a second `AudioContext`, so one master slider governs everything.

### Spatialisation

Positional sounds use `PannerNode` with `config/audio.json → spatial`. **Distance
only** — there is no occlusion modelling. Walls and doors do not muffle sound for
players or for the enemy. This keeps the audio model, the noise bus and voice all
obeying one rule, and keeps them cheap.

The listener follows the camera every frame, which is why climbing into a locker
moves your ears with you. A sound with no position is flat; so are your own
footsteps (`cues.selfFlat.kinds`), because panning them around your own head as you
turn is the fastest way to make a first-person game feel wrong.

### What triggers what

| Source | Sounds |
| --- | --- |
| Noise bus events (`cues.noiseSounds`) | Footsteps, chest, locker entry, item drop, injury — **for every peer**, since a replicated noise event is the only signal you get that a teammate moved |
| Door state changes | `door.open` / `door.close`, wherever the change came from — a player, the network, or the hunter. Doors sound from state rather than from noise precisely so the hunter opening one two rooms away is heard by everyone |
| Interaction hold (`cues.holdLoops`) | `chest.open.loop`, `exit.hold.loop`, `player.revive.loop`, rising in pitch as the ring fills |
| Enemy alert rising (`cues.alertStings`) | `enemy.alerted`, `enemy.chase.sting`. Only on the way up — it losing interest is not a moment worth a cue |
| Proximity | `player.heartbeat`, level and tempo on the same curve as the screen pulse (`heartbeatCloseness()` in `render/feedback.ts`, shared so they cannot disagree) |
| Direct calls | Unlock, locked door, pick-up, locker exit, escape, wipe, attack |

### Music

A generative score, four layers cross-fading on one intensity value:

| Layer | When |
| --- | --- |
| `menu` | A sparse minor motif over the drone, front end only |
| `explore` | The drone. Always up during a run, thinning as the others arrive |
| `tension` | An unresolved cluster, rising with the hunter's interest |
| `chase` | A driving low ostinato, above `chaseLayerThreshold` |

`ambience` is a room bed on its own bus. Intensity is
`max(intensityByAlert[alert], proximity × proximityWeight)` — so nearness alone
raises the temperature but only a real chase brings the chase layer in.

Any layer can be replaced wholesale by dropping a file in for it
(`music.layers.<id>.files`); the synth graph is only built for layers without one.
This is the one part of `src/audio/` that keeps a live Tone.js graph — sound effects
are rendered to buffers at boot and never touch Tone again.

### Adding a sound

1. Add a `soundId` entry to `config/audio.json → sounds`.
2. Give it a `synth` recipe in `src/audio/recipes.ts`, a `files` path, or both.
3. Trigger it from logic where the event happens.
4. If the sound also matters to the enemy, emit a **noise event** —
   they are separate systems. Audio is what players hear; the noise bus is what the
   enemy perceives. See [`AI.md`](AI.md).

> Keeping audio and noise separate is intentional. A sound can be loud and
> gameplay-irrelevant (a thunderclap) or quiet and highly relevant (a chest latch).

### Browser autoplay

`AudioContext` starts suspended and is resumed on the first user gesture — any click
or keypress, delegated at the screen root along with the menu sounds
(`src/audio/uiSounds.ts`). `audio.init()` is safe to call long before that: offline
rendering needs no gesture.

`unlock()` waits for `init()` to finish before resuming. Rendering a recipe swaps
Tone's global context for an offline one, and resuming *that* by starting mid-render
leaves the render unable to complete — a player who hits Play in the first
half-second would get a game with no sound at all.

---

## Part 2 — Proximity voice

Owner: `src/voice/` — `capture.ts` (the mic), `peerAudio.ts` (one teammate),
`attenuation.ts` (the distance law), `vad.ts` (levels and gates), `modes.ts`
(the three modes) and `index.ts` (the facade the game talks to).

### Transport

Voice rides the same PeerJS peer as gameplay ([`NETWORKING.md`](NETWORKING.md)),
as a **media call per pair**. A media call needs only the other peer's id, not a
data connection, so voice is a **true mesh even though gameplay data is a star
through the host**. The lower peer id always dials and the higher always answers,
so exactly one call carries each pair in both directions — otherwise every word
would arrive twice. Outgoing bitrate is capped at `voice.bitrateKbps` so a voice
track cannot starve the data channels sharing the connection.

There is no voice server and no mixing hop; attenuation is computed **locally per
listener**, so every player hears a correct spatial mix without anyone being
authoritative over audio.

### One track, for the whole session

The outgoing track is a `MediaStreamAudioDestinationNode`, wired up at boot and
never replaced:

```
getUserMedia ─► source ─► [meter] ─► gate (GainNode) ─► destination ─► every peer
```

Muting, push-to-talk and voice activity are all just the gate's gain, so nothing
about them ever renegotiates a call. Peers therefore hold each other's tracks
from the moment they connect — voice is already live when a run starts, rather
than negotiating at the one moment nobody can afford to be inaudible.

Because the destination exists before the microphone does, a player who denies
permission still sends a valid silent track: their calls connect and they hear
everyone else normally.

### Attenuation

Per remote peer, per frame — **distance only**:

```
gain = voiceGain(distance, fullVolumeRange, hearingRange)   // attenuation.ts
```

The `PannerNode` does the *direction* (same HRTF model as the rest of the game's
audio) with its rolloff switched **off**; the distance law is entirely ours, from
`config/net.json → voice`. Stacking both would make `hearingRange` a lie.

Walls and doors deliberately do **not** muffle voice: players are meant to hear
each other generously right across the map, and in a room maze any occlusion term
would apply almost all the time and quietly destroy that.

Default `hearingRange` is **22 m**, far beyond what the enemy can hear voice at
(`enemy.json → hearing.voiceRoomLimit`, default same-or-adjacent room). Talking is
mostly safe. Sprinting is not.

### Modes

`net.json → voice.modes`: `off | voiceActivity | pushToTalk`, switched from the pause
menu with a **single segmented control** and bound to `input.json → actions.pushToTalk`.
Voice activity uses `voiceActivityThresholdDb` with `voiceActivityHangoverMs` so
words are not clipped. `toggleVoiceMute` (M) mutes your own microphone without
losing the mode you were in.

The microphone is only requested once a player is **in a run with somebody else in
it**. A solo run never asks for it: there is nobody to hear you, and the only thing
an open mic could do is hand the hunter a free noise event. The check is recomputed
per frame off `net.players`, so a peer joining mid-run turns voice on and the last
one leaving turns it off. When voice is not live the HUD pill is hidden entirely
rather than sitting there saying "off".

A permission prompt on the main menu, incidentally, is also a good way to get told
no — which is the other reason it waits.

### Three thresholds, one meter

The same RMS meter is read at three levels, and the gap between the first two is
what stops an open mic giving you away:

| Threshold | Effect |
| --- | --- |
| `voiceActivityThresholdDb` (−45) | Opens the mic in open-mic mode |
| `noiseThresholdDb` (−30) | Loud enough for the hunter to get a noise event |
| `speakingThresholdDb` (−58) | Lights the microphone icon on a received track |

Breathing is below all three. Talking to your team is above the first. Shouting is
above the second.

### Voice as a noise emitter

While `voice.emitsNoiseToEnemy` is true and the speaker is above
`noiseThresholdDb`, speaking emits a `voice` noise event (`player.json →
noise.voice`) every `noiseIntervalSeconds` — noise events live one tick, so a
continuous sound has to keep re-emitting.

This is how a **downed player calling out** both helps their team and risks
pulling the enemy back. The hunter ignores downed players
(`enemy.json → attack.ignoresDownedPlayers`) but still investigates their voice,
so shouting from the floor brings it into the room and keeps it searching there.
Escaped players emit nothing: they are no longer standing anywhere it could go.

### Channel separation

Spectators (escaped or dead) are on a separate voice channel
(`voice.spectatorChannelSeparate`): live players hear nothing from them, while
they hear everyone, flat — they have no body left to hear from. Downed players
are still live.

**Text chat obeys the same rule** (`Game.canHearChatFrom`), and it has to: the
separation exists so that somebody who is out cannot call a room clear for the
people still in it, and anyone who can type would otherwise defeat it in one line.
Outside a run everybody reads everybody, because in the cabin there is nothing to
give away.

**A spectator's ears go where their eyes go.** The camera sits at the player they
are watching, and the listener follows the camera like it always has — so a
spectator hears that player's room, their footsteps and the hunter at their
distance, without a single line in `src/audio/` knowing that spectating exists. The
heartbeat and the alert stings stay off, though: out of the run is out of danger,
and a pulse for a body you are not in is a lie.

### What you can see

| Surface | Shows |
| --- | --- |
| Voice pill, bottom left (`src/ui/hud/voiceIndicator.ts`) | Mode, whether the mic is open right now, and a five-segment input level. Plain DOM — the level moves every frame |
| Roster row | A microphone next to anyone talking, crossed out for anyone you have muted |
| Pause menu (`src/ui/screens/VoicePanel.tsx`) | The mode control, self-mute, and a mute per teammate. Mutes are local and the muted player is never told |

Music ducks by `audio.json → music.duckOnVoiceDb` while a teammate is **audible** —
not merely while someone is talking somewhere across the map.

### Failure handling

| Failure | Behaviour |
| --- | --- |
| Mic permission denied | No outgoing audio, `error.microphone` on the pill, everything else works |
| No mic present | Same |
| Peer audio track fails | That peer is silent; gameplay unaffected |
| Mode set to `off` | The `getUserMedia` track is stopped outright, so the browser's recording indicator goes out — not merely muted |

Voice is never required to play.
