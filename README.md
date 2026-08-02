# Stranded in Silence

A 4-player co-op horror extraction game that runs in the browser. Three.js, first
person, procedurally shuffled maps, proximity voice chat, and one hunter that is
faster than you are.

> **Working title.** Everything here is pre-alpha.

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL. For multiplayer you also need the signalling server:

```bash
npm run dev:all
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run signal` | Signalling server for lobby codes and WebRTC handshakes |
| `npm run dev:all` | Both of the above |
| `npm run build` | Typecheck then production build to `dist/` |
| `npm run typecheck` | Types only |

## Where things are

| Folder | Contents |
| --- | --- |
| `src/` | All game logic. One folder per responsibility. |
| `art/` | All 3D content, authored in three.js. Never imports `src/`. |
| `config/` | Every tunable value and every user-visible string. No code. |
| `assets/` | Raw media only — audio, textures, UI images. |
| `docs/` | How all of the above fits together. |

## Documentation

**Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).** It is the map of the
project and links to everything else.

| I want to… | Read |
| --- | --- |
| Understand the whole project | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Know what to build next | [`docs/PLAN.md`](docs/PLAN.md) |
| Know the design rules | [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) |
| Tune a number | [`docs/CONFIG.md`](docs/CONFIG.md) |
| Change or translate text | [`docs/LOCALISATION.md`](docs/LOCALISATION.md) |
| Build a room | [`docs/art/ROOM_FORMAT.md`](docs/art/ROOM_FORMAT.md) |
| Build a whole new map | [`docs/art/ART_PACK_CHECKLIST.md`](docs/art/ART_PACK_CHECKLIST.md) |
| Build a door, chest, item or character | [`docs/art/SHARED_ART.md`](docs/art/SHARED_ART.md) |
| Work on map generation | [`docs/systems/GENERATION.md`](docs/systems/GENERATION.md) |
| Work on the enemy | [`docs/systems/AI.md`](docs/systems/AI.md) |
| Work on multiplayer | [`docs/systems/NETWORKING.md`](docs/systems/NETWORKING.md) |
| Work on sound or voice | [`docs/systems/AUDIO_VOICE.md`](docs/systems/AUDIO_VOICE.md) |
| Work on menus or HUD | [`docs/systems/UI.md`](docs/systems/UI.md) |
| Write code or commit | [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) |

## The four rules

1. `art/` never imports `src/`. Swapping art changes how the game *looks*, never how it *plays*.
2. No gameplay constants in code. They live in `config/`.
3. No user-visible strings in code. They live in `config/locales/`.
4. The simulation never touches `THREE` or the DOM.

## Status

Phase 0, step 1 of [`docs/PLAN.md`](docs/PLAN.md) — scaffold. The build boots to a
placeholder scene; systems land step by step from there.
