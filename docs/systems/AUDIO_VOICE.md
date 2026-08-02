# Audio & Voice Chat

Owners: `src/audio/` (game sound) and `src/voice/` (proximity voice).
Config: `config/audio.json`, `config/net.json → voice`.

---

## Part 1 — Game audio

### Sound registry

Logic never references a file path. It calls:

```ts
audio.play('door.open', { position: doorWorldPos });
audio.loop('player.heartbeat', { intensity });
```

`'door.open'` resolves through `config/audio.json → sounds`, which maps a `soundId`
to a bus, one or more files under `assets/audio/`, volume, pitch range and loop flag.

**A `soundId` with an empty `files` array is legal.** It logs once and plays nothing.
That is deliberate: gameplay ships before audio does, and adding a sound later is a
config edit plus dropping a file in `assets/`.

### Buses

`master → { music, sfx, ambience, voice, ui }` (`config/audio.json → buses`).
Options-menu sliders write bus volumes into the save profile. Music ducks by
`music.duckOnVoiceDb` while someone nearby is speaking.

### Spatialisation

Positional sounds use `PannerNode` with `config/audio.json → spatial`. A closed door
or wall between listener and source applies `occlusionLowpassHz` and
`occlusionVolumeMultiplier` — cheap, and it sells the geometry more than reverb would.

### Adding a sound

1. Add a `soundId` entry to `config/audio.json → sounds`.
2. Trigger it from logic where the event happens.
3. Drop the file into `assets/audio/sfx/` (or `music/`, `ambience/`) when it exists.
4. If the sound also matters to the enemy, emit a **noise event** —
   they are separate systems. Audio is what players hear; the noise bus is what the
   enemy perceives. See [`AI.md`](AI.md).

> Keeping audio and noise separate is intentional. A sound can be loud and
> gameplay-irrelevant (a thunderclap) or quiet and highly relevant (a chest latch).

### Browser autoplay

`AudioContext` starts suspended and is resumed on the first user gesture (the main
menu Play button). `audio.init()` is safe to call before that.

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

Per remote peer, per frame:

```
gain = falloff(distance, fullVolumeRange, hearingRange)
     × (throughWallMultiplier      if no line of sight)
     × (throughClosedDoorMultiplier per closed door on the path)
```

Values from `config/net.json → voice`. Default `hearingRange` is **22 m** — generous,
and deliberately far beyond what the enemy can hear voice at
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
