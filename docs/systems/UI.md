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
| `Wardrobe` | Customisation and the hat shop. Options claim the **left** half of the screen; the right half is left clear for the player's real model, which the camera parks in front of while the panel is open. There is no preview render — it is the actual `player.masked` standing in the cabin. That is also why **you try a hat on before you buy it**: touching an unowned hat puts it on the mannequin two metres in front of you and leaves a price under the list, while an owned one is equipped on the spot. Closing takes the unbought one back off |
| `Options` | Tabs: Gameplay / Graphics / Audio. **Layered over whatever screen opened it** rather than replacing it, so backing out always lands where you started — reachable from the main menu, the pause menu and the lobby's escape menu. Every control writes through immediately; there is no Apply button, because a setting you cannot hear or see change while you drag it is one you have to guess at. Escape closes it |
| `Controls` | Rebinding, as a tab of Options. Click an action, press a key or a mouse button. Three rules: **conflicts are shown, not silently resolved** (both keys keep working and you are told); **only the primary key moves** (WASD keeps its arrow-key alternates); and **some actions do not move at all** — Escape is how you reach the menu that would undo a bad rebind, so `input.json` marks it unrebindable and it is drawn locked rather than hidden |
| `Pause` | Resume / Options / Voice / Abandon run. **Voice mode is one control, per the design brief** — a segmented `off / open mic / push to talk` (`src/ui/screens/VoicePanel.tsx`), with self-mute and a per-teammate mute under it. Mutes are local; nothing is sent and the muted player is never told |
| `Loading` | Between the cabin and the map, and deliberately quiet — voice carries on over it and the last thing anyone needs mid-sentence is a wall of chrome. It stays up **after this browser has finished building the world**, because the run starts for everybody at once ([`NETWORKING.md`](NETWORKING.md) → "Starting together"): one pip per player fills as each reports in, so a few seconds of waiting reads as the team assembling rather than as the game hanging. Solo, and for the last one in, it is on screen for a frame |
| `Scoreboard` | One **card per player**: their body on top, then the categories from `game.json → scoring.categories`. A player who dropped out keeps their card, marked `disconnected` — a run they were part of is still a run they were part of. Best value in each gets the green ring, and only when there is more than one player — a solo player winning every category is not a result. The figure is a **picture of the real `player.masked`**, hat and all, rendered off screen by `src/render/portraits.ts` and handed over as a data URL — so rule 5 still holds and a hat shows up on the scoreboard without anybody drawing it twice. The SVG silhouette in `Scoreboard.tsx` is the fallback for a browser that will not grant a second GL context |
| `Spectate` | Minimal chrome, because none of what is on screen belongs to the person watching it: whose eyes you are behind, the two caps that change that and "1 of 2", the run purse, and the roster of who is left. **No crosshair, no prompts, no hand slots.** Escaping or giving up lands here rather than on the scoreboard; the scoreboard comes when there is nobody left to watch |
| Spectate escape menu | Keep watching / voice / options / leave. The one thing it adds to the pause menu is a line saying **what leaving would bank right now** — that number is the whole reason to stay, so it has to be on the screen where you decide |

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
| Teammate list | The **roster**, bottom left: every player as a heart (healthy / injured / downed, downed gets a flatline) with their name. Noise rings bloom off the heart whenever that player makes a sound — wider with the loudness, and **red** once the hunter is close enough to have heard it. A `loudness: 0` emitter draws nothing, because it genuinely is nothing. A **microphone** appears next to anyone talking and stays crossed out for anyone you have muted (`hud.teammateList.showVoiceIndicator`). Somebody who drops out keeps their line, greyed — a team of four becoming a team of three is something you should be able to *see* happen, not work out from a body that stopped moving |
| Voice indicator | The pill under the roster: mode, whether the mic is open right now, and a five-segment input level. The one element written as **plain DOM** (`src/ui/hud/voiceIndicator.ts`) — the level moves every frame, so it must not go through the vdom |
| Objective hint | Transient line, e.g. "This door needs a key" |
| Downed panel | "Someone might come", and under it the give-up cap with its own hold ring. Both are true at once, so the second is a quieter line rather than a replacement |
| Chat | Above the roster. A log whose lines are **dropped from state on a timer** rather than faded by CSS, so a HUD with nothing to say has no chat element in the DOM at all; the whole backlog is up while the box is open. The box is the one HUD element that re-enables pointer events, and opening it releases pointer lock on purpose — typing with the mouse captured and the movement keys live is how you walk into a wall mid-sentence. It is **not** a pause |

The lobby draws a reduced set — crosshair, interact prompt, chat and the expedition
panel. No roster: there is nobody to lose in the cabin. Chat is there because it
follows the **session** rather than the run, exactly as voice does: the cabin is where
a plan gets agreed.

**A screen that takes typed characters must take the keyboard with it.** `Input`
has one flag for this (`setTextCapture`) and every action reads as unpressed while it
is set, so there is no per-action opt-out to forget. Held keys are dropped in both
directions, because the key that opened the box must not still be down when it closes.

The **hand slots and the use prompt are the run's**, and they appear the moment you
take a dart off the stand by the fence (plan step 46). That is deliberate: the
minigame is played with exactly the controls the game is played with, so it doubles as
somewhere to learn them. Empty hands draw nothing at all — most visits to the cabin
never touch a dart, and a permanent pair of "Empty" boxes is furniture. The cabin has
no item roster, so `Lobby` hands the HUD **locale keys** rather than item ids for
`items.json` to name.

## Rules

1. **No string literals.** Every visible word is `t('key')`. See [`../LOCALISATION.md`](../LOCALISATION.md).
2. **No hardcoded key names.** Prompts read the live binding so rebinds are reflected:
   `t('hud.interact.holdHint', { key: input.labelFor('interact') })`.
3. **No colour literals.** Use the CSS variables.
4. **No layout constants.** Positions and toggles come from `config/ui.json → hud`.
5. **Screens never touch `THREE`.** They emit events; `render/` reacts. When a screen needs to *show* something 3D — the scoreboard's bodies — `render/` renders it off screen and the screen gets an image URL.
6. **The HUD reads sim state, it does not own it.**

## The component set

`src/ui/components/Controls.tsx` holds the reusable screen controls: `Slider`,
`Switch`, `Choice`, `Tabs` and `FieldGroup`. Three rules hold for all of them — no
colour or size literal (only the CSS variables), no user-visible string (the caller
passes text it has already run through `t()`), and a visible focus state with
keyboard parity.

Three decisions worth knowing:

- **The slider is a real `<input type="range">` under a full custom skin.** Nothing of
  the browser's own appearance survives, and dragging, arrow keys, Home/End and the
  page keys all come free and correct rather than being re-implemented badly.
- **A boolean gets a sliding switch, not a two-option segmented control.** The
  segmented idiom is right for "pick one of three" (voice modes) and wrong for on/off:
  it highlights whichever option is *selected*, so a setting that is OFF lights the
  word OFF up in the accent colour and reads, at a glance, as on.
- **"Pick one of several" is a wrapping row of chips, not a dropdown.** A native
  `<select>` renders as the operating system's control, which in a horror game reads
  as a web page instantly; and a hand-built dropdown has to float its list, which is
  clipped the moment it opens inside the options panel's scrolling body. Chips have
  neither problem, and every option is readable without a click.

An overlay screen must be `position: fixed` (`.overlay` is). Options renders as a
*sibling* of the screen behind it, and a static full-height block would simply stack
below the viewport — the same bug the wardrobe panel hit.

## Key bindings on screen

A binding reaches the UI as a **raw code** — `KeyE`, `Mouse0`. `input/` knows nothing
about how it looks; turning a code into something a player reads is a display
decision, and a localisable one, so it lives in `src/ui/keys.ts`.

| Binding | Drawn as |
| --- | --- |
| A key | A key cap: bordered, with a lip along the bottom, the label from `input.json → keyLabels` |
| A mouse button | A small mouse with the pressed button lit in the accent colour |

**Mouse buttons are drawn, never named.** "LMB" is jargon, it means nothing in five
of the six languages the game ships in, and a mouse with its right button lit is
unambiguous in all of them. The glyph geometry is shared (`keys.ts → MOUSE_SHAPE`)
because the HUD's voice pill is plain DOM and draws its own — a mouse whose right
button was on the left in one of them would be its own kind of bug.

Prompts use `<KeyLine textKey="hud.interact.holdHint" code={…} />`, which splits the
translated string on `{key}` and puts a real cap in the gap. See
[`../LOCALISATION.md`](../LOCALISATION.md) → "`{key}` is special".

## Theming

`config/ui.json → theme` is written into CSS custom properties at boot
(`src/ui/theme.ts`). The stylesheet declares the same variables with the same values,
so the game looks right before that runs and would still look right if it never did —
what it adds is that editing `ui.json` actually restyles the game.

Colour names map by convention: `bgPanel` becomes `--c-bg-panel`.

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
