# Localisation Guide

## The rule

> **No user-visible string is ever written in `src/` or `art/`.** Every one is a key
> in `config/locales/<lang>.json`, rendered through `t()`.

This includes menu labels, HUD prompts, item names, map names, error messages and
tooltips. Debug-only text and `console.*` output are exempt.

## Usage

```ts
import { t } from '@/i18n';

t('menu.play');                                  // "Play"
t('lobby.code', { code: 'K7XQ2M' });             // "Code: K7XQ2M"
t('hud.interact.pickUp', { item: t('item.key.name') });
```

In Preact screens:

```tsx
<button>{t('menu.options')}</button>
```

`t()` never throws. A missing key returns the key itself (e.g. `menu.missing`) and
logs a warning once — so a missing string is visible in-game but never a crash.

## Key naming

Flat, dot-namespaced, `lowerCamelCase` segments:

```
<area>.<thing>.<variant>
```

| Prefix | Used for |
| --- | --- |
| `common.*` | Reused words: back, confirm, cancel, on, off |
| `menu.*` | Main menu |
| `join.*` | Join-by-code flow |
| `lobby.*` | Lobby screen and lobby world |
| `map.*` | Map names and descriptions |
| `difficulty.*` | Difficulty mode names |
| `enemy.*` | Enemy names |
| `item.*` | Item names (`item.<id>.name`) and descriptions (`item.<id>.desc`) |
| `room.*` | Optional room names, `room.<packId>.<roomId>` |
| `hud.*` | In-world prompts and HUD labels |
| `run.*` | Run outcome messages |
| `scoreboard.*` | Scoreboard headings and category labels |
| `options.*` | Options menu |
| `input.*` | Action names shown in the rebinding screen |
| `pause.*` | Pause menu |
| `spectate.*` | Spectator UI |
| `error.*` | User-facing failures |

The key **must** match ids used in config. `config/items.json → items.key` pairs with
`item.key.name`; `config/game.json → scoring.categories[].id = doorsOpened` pairs
with `scoreboard.category.doorsOpened`. Adding an item or category without its key
is a validation warning at boot.

## Placeholders

`{name}` — substituted from the params object. Keep them descriptive, and never
concatenate translated fragments:

```ts
t('lobby.players', { current: 3, max: 4 })   // ✅ "Players 3/4"
t('lobby.players') + ' ' + n                 // ❌ breaks in other languages
```

Key bindings are substituted the same way, so prompts adapt to rebinds:

```json
"hud.interact.holdHint": "Hold {key}"
```

## Adding a language

1. Copy `config/locales/en.json` to `config/locales/<code>.json`.
2. Translate the values. Leave keys and `{placeholders}` untouched.
3. Add an entry to `config/locales/manifest.json`:
   ```json
   "fr": { "nativeName": "Français", "file": "fr.json", "complete": false }
   ```
4. It appears in Options → Language automatically. Missing keys fall back to
   `manifest.fallbackLocale`.

## Writing English source strings

The English file is the source of truth for tone as well as text.

- Terse and cold. The game is quiet; the UI should be too.
- Sentence case for prose, Title Case for buttons and headings.
- No exclamation marks outside genuine alarm.
- Item and map descriptions get one short evocative line — that is the game's only
  real prose surface, so make it count.
- Avoid idiom and wordplay in *functional* strings (buttons, errors); they translate
  badly. Save flavour for names and descriptions.

## Checks

`npm run validate:locales` (step 33) reports:

- keys in a translation that no longer exist in `en.json`
- keys in `en.json` missing from a translation marked `complete: true`
- placeholder mismatches between `en` and a translation
- config ids with no matching locale key
