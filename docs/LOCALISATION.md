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

Every interact prompt has exactly **one** named slot, `{item}`, because the HUD
feeds them all through the same path — so `hud.interact.revive` is `"Revive {item}"`
filled with `hud.player.teammate`. Do not invent a second slot name for a prompt.

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
| `wardrobe.*` | The lobby customisation panel |
| `cosmetic.*` | Names of customisation options (`player.json → customisation`) |
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

Two places name a key from config rather than deriving one, so the key travels with
the thing it labels instead of being matched by convention: `audio.json →
buses.<id>.labelKey` (which also decides *whether* that bus gets a volume slider at
all) and `input.json → actions.<id>.labelKey`.

## Placeholders

`{name}` — substituted from the params object. Keep them descriptive, and never
concatenate translated fragments:

```ts
t('lobby.players', { current: 3, max: 4 })   // ✅ "Players 3/4"
t('lobby.players') + ' ' + n                 // ❌ breaks in other languages
```

### `{key}` is special

A `{key}` placeholder is **not** substituted with text. The UI splits the
translated string around it and renders a real key cap in the gap — a drawn cap
with `E` on it, or a mouse with the correct button lit (`src/ui/keys.ts`,
`src/ui/components/KeyCap.tsx`).

```json
"hud.interact.holdHint": "Hold {key}"
"hud.interact.holdHint": "{key} 長押し"
```

Both work, and that is the point: the placeholder can sit anywhere in the
sentence, so word order stays the translator's business. Japanese puts the key
first and nothing in the code has to know.

Two consequences worth knowing:

- **Never write a key name into a string.** "Press E to open" is wrong in every
  language including English, because E is whatever the player rebound it to.
- The words printed on the caps themselves — `Shift`, `Ctrl`, `Esc` — are in
  `config/input.json → keyLabels`, not here. They belong with the keyboard
  rather than with the prose, and a layout that calls a key something else is a
  config edit.

## Shipped languages

| Code | File | Notes |
| --- | --- | --- |
| `en` | `en.json` | The source of truth. Everything is checked against it |
| `ja` | `ja.json` | Plain-form verbs, not `-ます` — the register Japanese game UI uses for player actions |
| `zh` | `zh.json` | Simplified |
| `ru` | `ru.json` | Runs 20–30 % longer than English; the widest strings in the game are here |
| `es` | `es.json` | Neutral, `tú`, infinitive HUD verbs (which sidesteps `tú`/`usted` entirely) |
| `pt` | `pt.json` | Brazilian. `pt-PT` differs enough in UI vocabulary to deserve its own file if it is ever wanted |

The language is chosen in Options → Gameplay and stored in the save profile.
Switching applies **immediately** — no reload — and a profile that has never
picked one follows the browser, so a Japanese player gets Japanese on first run
and keeps getting it if a later build adds their language.

Each language names itself in its own script (`manifest.nativeName`). Somebody
looking for 日本語 is not looking for a row that says "Japanese".

**Fonts.** `config/ui.json → theme.font*` end in a chain of system faces covering
CJK and Cyrillic, because the display face has neither. Without them a browser
picks per-character fallbacks and a Japanese menu comes out in three weights.
Substituting a real webfont is a change to those three strings and nothing else.

## Adding a language

1. Copy `config/locales/en.json` to `config/locales/<code>.json`.
2. Translate the values. Leave keys and `{placeholders}` untouched.
3. Add an entry to `config/locales/manifest.json`:
   ```json
   "fr": { "nativeName": "Français", "file": "fr.json", "complete": false }
   ```
4. `npm run validate:locales`.
5. It appears in Options → Language automatically. Missing keys fall back to
   `manifest.fallbackLocale`, and `complete: false` drops the validator's
   missing-key errors to warnings while you work.

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

`npm run validate:locales` exists because a translation's failure modes are all
**silent at runtime** — nothing crashes, the screen is just quietly wrong:

| Reported | What it would look like in game |
| --- | --- |
| Key missing from a `complete: true` locale | Half a menu quietly reverts to English |
| Key not in `en.json` | A typo'd id that will never be shown to anyone |
| A dropped `{placeholder}` | "Starting in" with no number after it |
| An invented `{placeholder}` | A literal `{seconds}` on screen |
| An empty value | A blank button |
| A config id with no locale key | The raw id — `doorsOpened` — on the scoreboard |

The last row covers the four places a config id and a locale key have to agree:
`game.json → scoring.categories`, `items.json → items.<id>.nameKey/descKey`,
`input.json → actions.<id>.labelKey` and `audio.json → buses.<id>.labelKey`.

It also checks the manifest against the files on disk, in both directions — a
locale file nobody can select is a warning, a manifest entry pointing at a file
that does not exist is an error.

What it cannot check is whether the words are any good. That still needs a human
who speaks the language.
