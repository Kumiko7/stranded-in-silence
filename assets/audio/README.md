# Audio assets

**Drop a file in here and it replaces the synthesised sound. Nothing else to do.**

Every sound in the game already exists — it is synthesised with Tone.js at boot
(`src/audio/recipes.ts`). Each one also declares a file path in
[`config/audio.json`](../../config/audio.json). If that file is present, it wins;
if not, the synthesised version plays. So you can replace the whole soundtrack one
file at a time, and the game is never silent while you work.

## Where files go

```
assets/audio/
├─ sfx/         one-shots and loops
├─ music/       the four score layers
└─ ambience/    the room bed
```

## What to name them

The path is whatever `config/audio.json` says. Open it and look for the entry you
want — the `files` array is the list of candidates, first present one wins:

```json
"door.open": { "bus": "sfx", "synth": "door.open", "files": ["sfx/door_open.ogg"], "volume": 0.7 }
```

So `door.open` is looking for `assets/audio/sfx/door_open.ogg`. Add more paths to
that array if you want alternates checked in order.

`.ogg`, `.mp3`, `.wav`, `.webm`, `.m4a` and `.flac` are all picked up.

## Things worth knowing

- **Loops must loop seamlessly.** `player.heartbeat`, `enemy.idle.loop`,
  `chest.open.loop`, `exit.hold.loop`, `player.revive.loop` and every `music/`
  layer are looped end to end with no crossfade.
- **Record dry and mono.** Positional sounds go through an HRTF panner; anything
  already stereo or reverbed fights it. Reverb belongs in the room, not the file.
- **Volume is set in config, not in the file.** Master it at a sensible level and
  tune `volume` in `config/audio.json`.
- **The music is four layers that cross-fade**, not four tracks that alternate:
  `explore` and `ambience` are always up during a run, `tension` comes in as the
  hunter takes an interest, `chase` above half intensity. Write them to stack.
- **Missing is fine.** A sound with no file and no working recipe logs once and
  plays nothing. It will never crash a run.

Full detail in [`docs/systems/AUDIO_VOICE.md`](../../docs/systems/AUDIO_VOICE.md).
