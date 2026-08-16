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
- The main menu plays a **slideshow of the game** behind itself
  (`ui.json → menus.mainMenuBackground`, and the section below).
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

**Nothing in the main menu is sized in `vw`/`vh`.** `#screen-root` carries a `zoom`
(`updateUiScale()` in `main.tsx`), and zoom *multiplies* rendered viewport units —
`94vw` comes out wider than the window on a large display. `rem` is the one unit
that scales exactly once, through the base size above. The usable width works out
at roughly **64 rem on any 16:9 display**, which is the budget every menu measure
is picked against.

## The main menu

`src/ui/screens/MainMenu.tsx`. Three decisions carry it.

**The backdrop is a slideshow of the game**, cross-faded, each still creeping
slowly while it is up. The set lives in `assets/ui/menu/` and is named in
`ui.json → menus.background`, so changing what the game shows off is dropping
files in a folder — [`assets/ui/menu/README.md`](../../assets/ui/menu/README.md).
The order is shuffled at boot. Only **two** layers ever exist: the incoming one
animates its opacity and its drift, and the outgoing one sits underneath at full
opacity, frozen at the transform every drift ends on. Fading both is what puts a
dip of black through the middle of a cross-fade; freezing at the shared rest
transform is what stops the outgoing still popping when it is handed over. The
drift therefore has to complete in exactly one `holdSeconds`.

Over the stills: a flat scrim at `dim`, then a fixed grade (a wash into the left
where the lockup sits, a floor under the footer, a vignette) and film grain at
`grain`. `dim` and `grain` are config because they are the contrast knob; the
grade is not, because it is what makes six different rooms read as one menu.

**The title is typeset, not drawn.** A baked wordmark would be English in all six
languages, so the logo is a CSS treatment over `t('game.title')` — a gradient fill
clipped to the glyphs, the same string again blurred underneath in the accent
colour for the glow, an ornament rule and the tagline. `drop-shadow` rather than
`text-shadow`: a text shadow paints behind the box, and clipped text would leak it.

**The nav is a keyboard-first list.** Play, Join and Options as one left-aligned
stack; focus lands on Play as soon as the lobby is up, arrows and W/S walk the
list and wrap, and the selection marker is on `:focus` rather than
`:focus-visible` because a game menu always shows where you are. Join opens a code
field **in place** rather than on its own screen — it is one field, and Escape
inside it closes the field and nothing else (it stops propagating, so it never
reaches the escape stack in `main.tsx`). The body is anchored from the top rather
than centred, so that drawer opening does not slide the lockup up the screen.

## Screens

| Screen | Notes |
| --- | --- |
| `MainMenu` | Play / Join / Options over the slideshow, plus **Quit in the desktop build only** — a browser tab cannot close itself, and a Quit button that does nothing is worse than no Quit button (`state.canQuit`). **Play opens a lobby**; Join opens a code field in place and enters someone else's. The footer carries the connection state, your own code with a copy button, and the build |
| `Join` | 6-digit code entry, auto-uppercase, per-character boxes, paste support |
| `LobbyPanel` | The expedition readout, top right of the 3D lobby: what has been picked and by how many, the difficulty the lever is on, and the countdown. Picking happens **on the poster wall in the 3D lobby**, not here |
| Lobby escape menu | Resume / code + copy / voice panel / leave to main menu. Reached by dropping pointer lock, exactly like the pause menu. The code is the **lobby's**, which on a client is the host's rather than their own (`Net.lobbyCode`) — it is there to be read out to a fourth player, and a client's own code opens a lobby nobody is standing in |
| `Wardrobe` | Customisation and the hat shop. Options claim the **left** half of the screen; the right half is left clear for the player's real model, which the camera parks in front of while the panel is open. There is no preview render — it is the actual `player.masked` standing in the cabin. That is also why **you try a hat on before you buy it**: touching an unowned hat puts it on the mannequin two metres in front of you and leaves a price under the list, while an owned one is equipped on the spot. Closing takes the unbought one back off |
| `Options` | Tabs: Gameplay / Graphics / Audio. **The Name field is first on the Gameplay tab**, because it is the only setting on that screen other people can see. Empty is a legal answer — every list falls back to "Player 2" — and what is typed is stored tidied (`@shared/playerName`) but shown as typed: a field that trims under the cursor is a field that fights you. **Fullscreen is the one control here that is not a value handed to a subsystem** — it is a window state, so `applyOptions()` does not touch it and it is applied on change and at boot separately. It has a rebindable key of its own (`toggleFullscreen`, F11), read in every screen because fullscreen is not the run's. **Layered over whatever screen opened it** rather than replacing it, so backing out always lands where you started — reachable from the main menu, the pause menu and the lobby's escape menu. Every control writes through immediately; there is no Apply button, because a setting you cannot hear or see change while you drag it is one you have to guess at. Escape closes it |
| `Controls` | Rebinding, as a tab of Options. Click an action, press a key or a mouse button. Three rules: **conflicts are shown, not silently resolved** (both keys keep working and you are told); **only the primary key moves** (WASD keeps its arrow-key alternates); and **some actions do not move at all** — Escape is how you reach the menu that would undo a bad rebind, so `input.json` marks it unrebindable and it is drawn locked rather than hidden |
| `Pause` | Resume / Options / Voice / Abandon run. **Voice mode is one control, per the design brief** — a segmented `off / open mic / push to talk` (`src/ui/screens/VoicePanel.tsx`), with a volume slider and a mute for **your own microphone** and for **each teammate** under it. Mutes are local; nothing is sent and the muted player is never told, and a mute is not volume zero — it survives dragging the slider back up. The whole block is **absent in a solo run**: no microphone is even opened, so a set of dead controls explaining that is worse than nothing |
| `Loading` | Between the cabin and the map, and deliberately quiet — voice carries on over it and the last thing anyone needs mid-sentence is a wall of chrome. It stays up **after this browser has finished building the world**, because the run starts for everybody at once ([`NETWORKING.md`](NETWORKING.md) → "Starting together"): one pip per player fills as each reports in, so a few seconds of waiting reads as the team assembling rather than as the game hanging. Solo, and for the last one in, it is on screen for a frame |
| `Scoreboard` | One **card per player**: their body on top, then the categories from `game.json → scoring.categories`. A player who dropped out keeps their card, marked `disconnected` — a run they were part of is still a run they were part of. Best value in each gets the green ring, and only when there is more than one player — a solo player winning every category is not a result. The figure is a **picture of the real `player.masked`**, hat and all, rendered off screen by `src/render/portraits.ts` and handed over as a data URL — so rule 5 still holds and a hat shows up on the scoreboard without anybody drawing it twice. The SVG silhouette in `Scoreboard.tsx` is the fallback for a browser that will not grant a second GL context |
| `Spectate` | Minimal chrome, because none of what is on screen belongs to the person watching it: whose eyes you are behind (by name, if they have one), the two caps that change that and "1 of 2", the run purse, and the roster of who is left. **No crosshair, no prompts, no hand slots.** Escaping or giving up lands here rather than on the scoreboard; the scoreboard comes when there is nobody left to watch, or when the run itself ends because nobody left in the map can still change it |
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
| Connection warning | Top right, and **absent entirely while the link is fine** — a permanent signal-bars widget would be noise in a game whose business is looking at the dark. It exists for one reason: when teammates start sliding about or a door takes a beat too long, the player needs to know whether that is the game or their network, and without it a bad connection reads as a bad game. Two states, from `Net.linkQuality()`: `poor` (packets arriving, but slowly or not all of them — past `hud.connection.warnRttMs` or `.warnLoss`) and `unstable` (nothing has arrived for a while; the link may still come back). Round trip and loss ride alongside, because that is the number a player can actually act on. Plain DOM (`src/ui/hud/connectionIndicator.ts`), shown in every screen a session can be live in — the pause menu included, since a link going bad while you are staring at the options is exactly when you would otherwise have no idea why everyone stopped moving |
| Objective hint | Transient line, e.g. "This door needs a key" |
| Downed panel | "Someone might come", then the **bleed-out clock**, then the give-up cap with its own hold ring. All three are true at once, so they stack rather than replace each other. The clock is whole seconds and is pushed only when the number a player would read changes — a countdown is one vdom update a second, not sixty — and while somebody is reviving you it stops and says so instead, in the good colour: the difference between "nobody is coming" and "somebody is here" is the only thing on that screen worth reading |
| Nameplates | The name over a teammate's head, when you can **see** them: line of sight is tested before one is drawn, and it fades out between `hud.nameplates.fadeDistance` and `.maxDistance`. A label on somebody already in front of you, never a tracker through a wall. Plain DOM (`src/ui/hud/nameplates.ts`) and updated in the render step, because it follows the camera every frame; the world half of it — who is visible, in range and in the map — is `Game.nameplates()`, which is the only thing that knows where anybody is |
| Tutorial tip | Bottom right — the one corner the roster, the chat and the purse all leave alone. One line at a time, quiet, and never in the way. See "The tutorial" below |
| Chat | Above the roster. Lines go quiet on a timer but are **not thrown away** — `fresh` goes false and they stay in the backlog, so a HUD with nothing recent has no chat element in the DOM at all while opening the box still answers "what did I miss" rather than showing a blank panel. `hud.chat.maxMessages` is what bounds it. The box is the one HUD element that re-enables pointer events, and opening it releases pointer lock on purpose — typing with the mouse captured and the movement keys live is how you walk into a wall mid-sentence. It is **not** a pause |

The lobby draws a reduced set — crosshair, interact prompt, chat, nameplates and
the expedition panel. No roster *on screen*: there is nobody to lose in the cabin.
It still **pushes** one (`Lobby.onRosterChange`), because that list is what the
pause menu's per-teammate mutes are built from, and somebody you can hear is
somebody you may want to turn down before the run rather than during it. Chat is there because it
follows the **session** rather than the run, exactly as voice does: the cabin is where
a plan gets agreed.

**A screen that takes typed characters must take the keyboard with it.** `Input`
has one flag for this (`setTextCapture`) and every action reads as unpressed while it
is set, so there is no per-action opt-out to forget. Held keys are dropped in both
directions, because the key that opened the box must not still be down when it closes.

## The tutorial

`src/game/Tutorial.ts`, drawn by the corner element above, configured in
`ui.json → hud.tutorial`, one locale key per tip (`tutorial.<id>`).

Deliberately **eight tips and no more**: how to move, that crouching is quiet and
sprinting is not, how a run starts, what to look for once it has, and the two
moments the hunter changes the situation. Anything a player can work out by
trying it — what an item does, how a locker works, what a key opens — is not in
here and should not be added. It is a nudge on the way in, not a manual.

Two kinds, and they never compete:

| Kind | Behaviour | Which |
| --- | --- | --- |
| `task` | Offered **in order** and stays up until the player does the thing | The cabin's four |
| `flash` | Appears when its trigger fires and leaves after `flashSeconds` | The run's four |

Four things are worth knowing.

**Only ever one is on screen, and nothing waits in line.** A flash tip whose
trigger fires while another tip is up is *dropped whole* — not shown, and not
marked as taught — so it comes back the next time the same thing happens with
the corner free. Both alternatives are worse: cutting the current tip short
teaches the player to distrust the corner, and queueing puts "it has seen you"
on screen eight seconds after it stopped being true. A tip about something
happening **now** is either timely or it is nothing.

The one thing that never gets dropped is the **last** tip: retiring is held back
while a tip is still on screen, or the final thing the tutorial ever says would
be marked taught without being read.

**A task is ticked off whenever it happens**, not only while its own tip is up.
Somebody who has already sprinted does not need to be told which key sprints, and
telling them anyway is how a tutorial gets switched off.

**It switches itself off.** When the last tip has been through, `options.tutorial`
goes false through the same path as any other setting, and the switch in Options →
Gameplay is what the player is left with. Turning it back on **once there is
nothing left to teach** wipes the progress and starts again; toggling it off and
on part way through keeps your place. That distinction is deliberate: the restart
is decided from the progress, not from the switch having changed, because the
flag and the option are two copies of one fact and an edge test does nothing
whenever they disagree.

**A tip does not own when it fires.** The id is the seam, and both worlds report
through one `onTutorial(id)` hook without knowing the tutorial exists. `main.tsx`
reads **moving, crouching and sprinting** straight off the input, because there
is nothing `Lobby` could add to "the player is holding the key the tip is about".
**Picking a map is the cabin's**, and that is not a style choice: `justPressed`
*consumes* the press, so a tutorial that asked it whether E was down would take E
away from the poster the player was aiming at. Everything read from `main.tsx` is
a peek. `heard` is any hunter leaving `calm` and
`seen` is one chasing; on the **host** that is exact, and on a client only an
alert level crosses the wire, so "chasing somebody" stands in for "chasing you".
Both are identical in the solo and hosted runs somebody learning the game is in.

## Escape is one ordered stack

Escape closes **the innermost thing that is open, and nothing else** — options, then
the chat box, then the wardrobe, then the escape menu itself. It lives in exactly one
place (`src/main.tsx`); handling it in a screen as well is how a panel ends up closing
straight into the escape menu, which makes one key mean two things at once and leaves
no way to back out of anything without also opening something.

The subtlety is that **Escape inside a running run is never delivered as a key at
all**: the browser spends it exiting pointer lock, and `onPointerLockChange` is what
turns that into the escape menu. So the first press opens the menu and the second one
— which does reach the handler, because there is no lock left to exit — closes it and
puts you back in the game.

Which is exactly where Chromium's **pointer-lock cooldown** bites: for about a
second after the *user* released the lock, every request for it back is refused.
Escape-Escape lands inside that window, the refusal fires `pointerlockerror`, and
the handler above puts the escape menu straight back up — so Escape stops being
able to resume at all. `Input.requestPointerLock()` therefore **waits the
cooldown out** rather than asking and failing. The keypress's transient
activation outlives the wait, so the deferred request is still allowed. Anything that releases pointer lock on purpose (the
wardrobe, the chat box) is not a pause, and the lock-change handler checks for it.

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
