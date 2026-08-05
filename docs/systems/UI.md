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

That base size is `.layer { font-size }` in `ui.css`, and it is **viewport-relative**:
`clamp(14px, 0.78vmin + 10px, 20px)`. Every screen and every HUD element sizes itself
in `rem` off it, so the whole interface grows with the display rather than shrinking
into a corner of a large one, and the clamp stops it doing anything silly at either
extreme. `vmin` rather than `vw` because a wide, short window is short on the axis
that actually runs out. Panels additionally cap themselves (`width: min(48rem, 94vw)`)
so a line of text never crosses a 32-inch monitor.

## Screens

| Screen | Notes |
| --- | --- |
| `MainMenu` | Play / Options / Credits / Quit. **Play opens a lobby**; the code box next to it joins someone else's |
| `Join` | 6-digit code entry, auto-uppercase, per-character boxes, paste support |
| `LobbyPanel` | The expedition readout, top right of the 3D lobby: what has been picked and by how many, the difficulty the lever is on, and the countdown. Picking happens **on the poster wall in the 3D lobby**, not here |
| Lobby escape menu | Resume / code + copy / voice panel / leave to main menu. Reached by dropping pointer lock, exactly like the pause menu |
| `Wardrobe` | Customisation. Options claim the **left** half of the screen; the right half is left clear for the player's real model, which the camera parks in front of while the panel is open. There is no preview render — it is the actual `player.masked` standing in the cabin |
| `Options` | Tabs: Gameplay / Graphics / Audio. **Layered over whatever screen opened it** rather than replacing it, so backing out always lands where you started — reachable from the main menu, the pause menu and the lobby's escape menu. Every control writes through immediately; there is no Apply button, because a setting you cannot hear or see change while you drag it is one you have to guess at. Escape closes it |
| `Controls` | Rebinding. Click an action, press a key. Conflicts are shown, not silently overwritten. **Not built** — see [`../PLAN.md`](../PLAN.md) step 35 |
| `Pause` | Resume / Options / Voice / Abandon run. **Voice mode is one control, per the design brief** — a segmented `off / open mic / push to talk` (`src/ui/screens/VoicePanel.tsx`), with self-mute and a per-teammate mute under it. Mutes are local; nothing is sent and the muted player is never told |
| `Scoreboard` | One **card per player**: their body on top, then the categories from `game.json → scoring.categories`. Best value in each gets the green ring, and only when there is more than one player — a solo player winning every category is not a result. The figure is an SVG standing in for `player.masked`, in that player's wardrobe colour |
| `Spectate` | Minimal chrome: whose view, next/prev |

## HUD elements

Each is independently toggleable in `config/ui.json → hud`, so a "clean HUD" mode is
a config change.

| Element | Notes |
| --- | --- |
| Crosshair | Small dot; size/opacity from config |
| Interact prompt | Verb + key from `input.json`, hold ring for hold-interactions. Text via `t('hud.interact.*')` |
| Use prompt | A second line under it: what the **hand buttons** would do with what you are carrying — throw it, bandage someone, wedge a door — with its own hold ring. Deliberately dimmer than the interact prompt: E is what the world is offering, this is only what you brought. Text via `t('hud.use.*')` |
| Hand slots | Two slots, left/right, item icon + name |
| Run purse | Top right, and **absent until you have picked something up** — a permanent zero is one more number to learn to ignore (`hud.coins.showWhenEmpty`). Coins are a team total; the wardrobe in the lobby shows the banked one, because that is where it will be spent |
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

## The component set

`src/ui/components/Controls.tsx` holds the reusable screen controls: `Slider`,
`Switch`, `Tabs` and `FieldGroup`. Three rules hold for all of them — no colour or
size literal (only the CSS variables), no user-visible string (the caller passes text
it has already run through `t()`), and a visible focus state with keyboard parity.

Two decisions worth knowing:

- **The slider is a real `<input type="range">` under a full custom skin.** Nothing of
  the browser's own appearance survives, and dragging, arrow keys, Home/End and the
  page keys all come free and correct rather than being re-implemented badly.
- **A boolean gets a sliding switch, not a two-option segmented control.** The
  segmented idiom is right for "pick one of three" (voice modes) and wrong for on/off:
  it highlights whichever option is *selected*, so a setting that is OFF lights the
  word OFF up in the accent colour and reads, at a glance, as on.

An overlay screen must be `position: fixed` (`.overlay` is). Options renders as a
*sibling* of the screen behind it, and a static full-height block would simply stack
below the viewport — the same bug the wardrobe panel hit.

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
