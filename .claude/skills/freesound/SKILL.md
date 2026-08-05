---
name: freesound
description: Search freesound.org and download sound files (SFX, ambience, foley, field recordings, samples). Use when looking for, auditioning, or fetching audio assets by description — e.g. "find a door unlock sound", "get some rain ambience", "download that footstep sample". Handles licence filtering, previews and full-quality originals.
---

# Freesound

Search and download from [freesound.org](https://freesound.org) via its v2 API.
Personal, non-commercial use.

All commands go through one script:

```bash
node .claude/skills/freesound/scripts/freesound.mjs <command> [options]
```

Credentials come from the `FREESOUND_API_KEY` and `FREESOUND_CLIENT_ID` environment
variables. On Windows these are user-scoped, so they may be absent from a shell that
was started before they were set — the script falls back to reading them from `HKCU`,
so it works either way. Never print the key.

## Searching

```bash
node .claude/skills/freesound/scripts/freesound.mjs search rain on tent --license cc0 --max-duration 20
```

| Option | Meaning |
| --- | --- |
| `--license cc0\|by\|by-nc\|sampling+` | Licence filter. Prefer `cc0` — no attribution obligation. |
| `--type wav\|ogg\|mp3\|flac\|aiff` | Original file format. |
| `--min-duration N` / `--max-duration N` | Seconds. |
| `--sort` | `score` (default), `rating_desc`, `downloads_desc`, `created_desc`, `duration_asc`, `duration_desc`. |
| `--page N`, `--page-size N` | Paging; default page size 15. |
| `--filter '<raw>'` | Raw Freesound filter, ANDed with the rest, e.g. `'channels:1 samplerate:48000'`. |
| `--fields`, `--json` | Field selection / raw JSON output. |

`info <id>` prints the full metadata and description for one sound.

Searching is cheap — when the first query is vague, run two or three wordings and
compare, rather than settling for the first list.

## Downloading

Two routes, deliberately:

**Preview** — lossy mp3/ogg render, needs no extra auth. Right for auditioning a
candidate, and often good enough for a game SFX.

```bash
node .claude/skills/freesound/scripts/freesound.mjs preview 458405 --out assets/audio/sfx/
node .claude/skills/freesound/scripts/freesound.mjs preview 458405 --out door.ogg --quality hq --format ogg
```

**Original** — the uploader's source file (wav/flac/…), full quality. Requires OAuth2;
the API key alone is not enough.

```bash
node .claude/skills/freesound/scripts/freesound.mjs download 458405 --out assets/audio/sfx/
```

`--out` takes either a file path or a directory (the sound's own name is used inside a
directory). Parent directories are created.

### One-time OAuth setup for originals

1. `... auth url` prints an authorization URL. **Give it to the user to open** — they
   approve access in their browser and are shown a code. Do not try to complete this
   in a browser tool on their behalf.
2. `... auth token <code>` exchanges that code and stores the tokens in
   `~/.claude/freesound-oauth.json` (outside the repo).
3. Done — tokens auto-refresh. `... auth status` reports the current state.

The Freesound app's redirect URI must be blank (Freesound then displays the code) or
point somewhere the user can read the `code` query parameter from.

## Licensing

Every download prints an `attribution:` line. CC0 sounds need nothing; **CC BY** and
**CC BY-NC** legally require that credit be kept. When adding a non-CC0 sound to a
project, record that line somewhere durable — a `CREDITS` file next to the audio — and
tell the user you did. CC BY-NC is non-commercial only.
