# UI & HUD

Owner: `src/ui/`. Config: `config/ui.json` (theme + layout), `config/locales/`
(all text), `config/input.json` (bindings shown in prompts).

## Two layers, two technologies — on purpose

| Layer | DOM node | Tech | Updates |
| --- | --- | --- | --- |
| **Screens** — main menu, join, lobby, options, pause, scoreboard, spectator chrome | `#screen-root` | **Preact + TSX** | On user interaction |
| **HUD** — crosshair, interact prompt, hand slots, teammate list, voice indicator | `#hud-root` | **Plain DOM**, direct node mutation | Every frame |

The HUD deliberately bypasses the vdom. It changes 60 times a second and a
component tree would be pure waste. Screens are real UI — forms, tabs, key
rebinding, lists — and get a component model.

`#hud-root` is `pointer-events: none` with children re-enabling it, so the HUD never
eats a click meant for the game.

## Look and feel

Menus are HTML/CSS but must read as a **video game**, not a web page:

- Full-bleed, no scrollbars, no browser-default controls. Every input is custom.
- Diegetic backdrop — the lobby 3D scene renders behind the main menu
  (`ui.json → menus.mainMenuBackground`).
- Keyboard and mouse are equal citizens: arrows/WASD navigate, Enter confirms,
  Escape backs out. There is always a visible focus state.
- Sound on every interaction (`ui.hover`, `ui.click`, `ui.back` in `config/audio.json`).
- Transitions are fast (`ui.json → theme.transitionMs`, 140 ms). Menus should feel
  snappy, not animated.

## Theming

`config/ui.json → theme.colours` is written into CSS custom properties at boot
(`src/ui/theme.ts`). **Component CSS references the variables, never literals** — so
restyling the whole game is a config edit.

```css
.button { color: var(--c-text); border: 1px solid var(--c-border); }
.button:hover { color: var(--c-accent-hover); }
```

Layer font sizes derive from a single base size, so introducing a global UI scale
later is a one-variable change. Do not build a scale setting now.

## Screens

| Screen | Notes |
| --- | --- |
| `MainMenu` | Play / Options / Credits / Quit. **Play opens a lobby**; the code box next to it joins someone else's |
| `Join` | 6-digit code entry, auto-uppercase, per-character boxes, paste support |
| `LobbyPanel` | The expedition readout, top right of the 3D lobby: what has been picked and by how many, the difficulty the lever is on, and the countdown. Picking happens **on the poster wall in the 3D lobby**, not here |
| Lobby escape menu | Resume / code + copy / voice panel / leave to main menu. Reached by dropping pointer lock, exactly like the pause menu |
| `Wardrobe` | Customisation. Options claim the **left** half of the screen; the right half is left clear for the player's real model, which the camera parks in front of while the panel is open. There is no preview render — it is the actual `player.masked` standing in the cabin |
| `Options` | Tabs: Gameplay / Graphics / Audio / Controls / Voice. Writes to the save profile |
| `Controls` | Rebinding. Click an action, press a key. Conflicts are shown, not silently overwritten |
| `Pause` | Resume / Options / Voice / Abandon run. **Voice mode is one control, per the design brief** — a segmented `off / open mic / push to talk` (`src/ui/screens/VoicePanel.tsx`), with self-mute and a per-teammate mute under it. Mutes are local; nothing is sent and the muted player is never told |
| `Scoreboard` | Per-player rows × categories from `game.json → scoring.categories`. Best value in each category gets the green ring |
| `Spectate` | Minimal chrome: whose view, next/prev |

## HUD elements

Each is independently toggleable in `config/ui.json → hud`, so a "clean HUD" mode is
a config change.

| Element | Notes |
| --- | --- |
| Crosshair | Small dot; size/opacity from config |
| Interact prompt | Verb + key from `input.json`, hold ring for hold-interactions. Text via `t('hud.interact.*')` |
| Hand slots | Two slots, left/right, item icon + name |
| Health state | Vignette-driven by default (`mode: 'vignette-only'`) — no health bar. Your own state also reads off your line in the roster |
| Teammate list | The **roster**, bottom left: every player as a heart (healthy / injured / downed, downed gets a flatline) with their name. Noise rings bloom off the heart whenever that player makes a sound — wider with the loudness, and **red** once the hunter is close enough to have heard it. A `loudness: 0` emitter draws nothing, because it genuinely is nothing. A **microphone** appears next to anyone talking and stays crossed out for anyone you have muted (`hud.teammateList.showVoiceIndicator`) |
| Voice indicator | The pill under the roster: mode, whether the mic is open right now, and a five-segment input level. The one element written as **plain DOM** (`src/ui/hud/voiceIndicator.ts`) — the level moves every frame, so it must not go through the vdom |
| Objective hint | Transient line, e.g. "This door needs a key" |

The lobby draws a reduced set — crosshair, interact prompt and the expedition panel.
No roster and no hand slots: there is nothing to carry in the cabin and nobody to lose.

## Rules

1. **No string literals.** Every visible word is `t('key')`. See [`../LOCALISATION.md`](../LOCALISATION.md).
2. **No hardcoded key names.** Prompts read the live binding so rebinds are reflected:
   `t('hud.interact.holdHint', { key: input.labelFor('interact') })`.
3. **No colour literals.** Use the CSS variables.
4. **No layout constants.** Positions and toggles come from `config/ui.json → hud`.
5. **Screens never touch `THREE`.** They emit events; `render/` reacts.
6. **The HUD reads sim state, it does not own it.**

## Adding a screen

1. Component in `src/ui/screens/<Name>.tsx`.
2. Register it with the screen manager (`src/ui/ScreenManager.ts`).
3. Add locale keys under a new prefix.
4. Add any tunables to `config/ui.json`.
5. Wire Escape/back behaviour — every screen must be exitable by keyboard.

## Adding a HUD element

1. Module in `src/ui/hud/<name>.ts` exporting `mount()` / `update(state)` / `unmount()`.
2. Add a toggle + position to `config/ui.json → hud`.
3. Mutate only the nodes that changed in `update()` — no `innerHTML` rebuilds per frame.
