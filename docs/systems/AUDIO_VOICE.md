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

### Where the numbers live

| Kind | Lives in | Why |
| --- | --- | --- |
| Bus, volume, pitch spread, cooldown, spatial flag, which event fires what | `config/audio.json` | Anyone might tune these |
| Oscillator frequencies, envelopes, filter Q — the sound's identity | `src/audio/recipes.ts` | This is content, like the literals in `art/`. It is the thing a file replaces |

### Buses

`master → { music, sfx, ambience, voice, ui }` (`config/audio.json → buses`), built
from plain `GainNode`s. Options-menu sliders (step 35) write bus volumes into the
save profile through `audio.setBusVolume()`. Music ducks by `music.duckOnVoiceDb`
while someone nearby is speaking — not wired until voice lands.

Voice chat will attach its peer streams to `audio.bus('voice')` on `audio.context`
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

### Transport

Voice rides the same `RTCPeerConnection` mesh as gameplay
([`NETWORKING.md`](NETWORKING.md)) — one outbound audio track per peer, at
`net.json → voice.bitrateKbps`. Mic capture uses `echoCancellation`,
`noiseSuppression` and `autoGainControl` from the same config block.

There is no voice server and no mixing hop; attenuation is computed **locally per
listener**, so every player hears a correct spatial mix without anyone being
authoritative over audio.

### Attenuation

Per remote peer, per frame — **distance only**:

```
gain = falloff(distance, fullVolumeRange, hearingRange)
```

Values from `config/net.json → voice`. Walls and doors deliberately do **not** muffle
voice: players are meant to hear each other generously right across the map, and in a
room maze any occlusion term would apply almost all the time and quietly destroy that.

Default `hearingRange` is **22 m**, far beyond what the enemy can hear voice at
(`enemy.json → hearing.voiceRoomLimit`, default same-or-adjacent room). Talking is
mostly safe. Sprinting is not.

### Modes

`net.json → voice.modes`: `off | voiceActivity | pushToTalk`, switched from the pause
menu with a single control and bound to `input.json → actions.pushToTalk`.
Voice activity uses `voiceActivityThresholdDb` with `voiceActivityHangoverMs` so
words are not clipped.

### Voice as a noise emitter

When `voice.emitsNoiseToEnemy` is true, speaking emits a noise event
(`player.json → noise.voice`) on the host. This is how a **downed player calling out**
both helps their team and risks pulling the enemy back — one of the game's better
tension knobs.

### Channel separation

Spectators (escaped or dead) are on a separate voice channel
(`voice.spectatorChannelSeparate`): they hear each other and whoever they are
spectating; live players hear nothing from them. Downed players are still live.

### Failure handling

| Failure | Behaviour |
| --- | --- |
| Mic permission denied | Voice disabled, `error.microphone` shown, game fully playable |
| No mic present | Same |
| Peer audio track fails | That peer is silent; gameplay unaffected |
| Mode set to `off` | Track stopped entirely, not just muted |

Voice is never required to play.
