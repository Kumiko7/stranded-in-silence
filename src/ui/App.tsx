/**
 * Screen manager. Menus are Preact; per-frame HUD bits (the interact prompt,
 * exit ring) get their values pushed in as state rather than polling the sim.
 *
 * No user-visible string here is a literal - every one is a t() key.
 */
import { useEffect, useState } from 'preact/hooks';
import type { AudioConfig, GameConfig, HealthState, MenusConfig, VoiceMode } from '@/config/types';
import type { BleedOutView, RosterEntry, ScoreRow, SpectateView, UseView } from '@/game/Game';
import type { TutorialView } from '@/game/Tutorial';
import type { ActionInfo } from '@/input/index';
import type { LobbyView } from '@/game/Lobby';
import type { Options as OptionValues, OptionRanges } from '@/save/index';
import { t } from '@/i18n/index';
import { playerLabel } from './playerLabel';
import { KeyCap, KeyLine } from './components/KeyCap';
import { LobbyPanel } from './screens/LobbyPanel';
import { MainMenu } from './screens/MainMenu';
import { Options } from './screens/Options';
import { Scoreboard } from './screens/Scoreboard';
import { VoicePanel } from './screens/VoicePanel';
import { Wardrobe, type ColourOption, type HatOption } from './screens/Wardrobe';

export type Screen =
  | 'menu'
  | 'lobby'
  | 'lobbyPaused'
  | 'wardrobe'
  | 'loading'
  | 'run'
  | 'paused'
  /**
   * Out of the run, watching somebody who is not. Escaping or giving up lands
   * here rather than on the scoreboard: the purse is still filling and the
   * people still down there are still worth watching.
   */
  | 'spectate'
  | 'spectatePaused'
  /** The run is over for this player, win or lose. The scoreboard says which. */
  | 'scoreboard';

export interface UiState {
  screen: Screen;
  code: string;
  netStatus: 'connecting' | 'ready' | 'error';
  error: string | null;
  players: number;
  maxPlayers: number;
  /** The expedition panel's contents. Null until the cabin is up. */
  lobby: LobbyView | null;
  /** How many peers have finished loading, and how many there are. */
  loadingReady: number;
  loadingTotal: number;
  colours: readonly ColourOption[];
  colourId: string;
  /** The hat shop, with what this profile already owns folded in. */
  hats: readonly HatOption[];
  /** The hat this player actually wears out of the cabin. */
  hatId: string;
  /** What the mannequin is showing: the same, unless one is being tried on. */
  previewHatId: string;
  promptVerbKey: string | null;
  /** Locale key of the item a pick-up prompt names, if any. */
  promptItemKey: string | null;
  promptHold: boolean;
  holdProgress: number;
  interactKey: string;
  /** Locale key of the item in each hand, or null for an empty hand. */
  hands: { left: string | null; right: string | null };
  useLeftKey: string;
  useRightKey: string;
  /** What the hand buttons are offering right now, or null. */
  use: UseView | null;
  /** Coins picked up this run. Only banked by a player who gets out. */
  coins: number;
  /** Coins banked across every run. What the wardrobe shows. */
  bankedCoins: number;
  /** `ui.json -> hud.coins`. */
  showCoins: boolean;
  showEmptyCoins: boolean;
  /** Transient objective line, e.g. "This door needs a key." */
  hint: string | null;
  /** The one tutorial tip on screen, or null. Never more than one. */
  tutorial: TutorialView | null;
  health: HealthState;
  /** What this player calls themselves, exactly as typed. Empty is legal. */
  playerName: string;
  /** `net.json -> identity.nameMaxLength`: the cap on the field above. */
  nameMaxLength: number;
  /** 0..1 while a downed player is holding the give-up key. */
  giveUpProgress: number;
  giveUpKey: string;
  /** The clock on the floor, or null when this player is not on it. */
  bleedOut: BleedOutView | null;
  /** Whose eyes this player is borrowing, or null when they are not spectating. */
  spectate: SpectateView | null;
  spectateNextKey: string;
  spectatePrevKey: string;
  /** Everyone in the run: health, and the last noise each of them made. */
  roster: RosterEntry[];
  showRoster: boolean;
  voice: VoiceUiState;
  /** Text chat. `open` is the input box; the lines fade out on their own. */
  chat: ChatLine[];
  chatOpen: boolean;
  chatKey: string;
  showChat: boolean;
  chatMaxLength: number;
  /** One card per player once the run is over. Empty until then. */
  scoreboard: ScoreRow[];
  /** `game.json -> scoring.categories`: which rows a card shows, in order. */
  categories: GameConfig['scoring']['categories'];
  /**
   * The options menu lays over whatever screen is up rather than replacing it,
   * so backing out of it always lands where you opened it from.
   */
  optionsOpen: boolean;
  options: OptionValues;
  optionRanges: OptionRanges;
  /** `audio.json -> buses`. A bus with a `labelKey` gets a volume slider. */
  buses: AudioConfig['buses'];
  /** `ui.json -> menus`: the main menu's backdrop and what it is dressed with. */
  menus: MenusConfig;
  /** Whether closing the game is something this build can do. False in a browser. */
  canQuit: boolean;
  /** Every action and its live bindings, for the Controls tab. */
  actions: ActionInfo[];
  /**
   * Bumped whenever the language changes. Nothing reads it - it exists so the
   * whole tree re-renders, because every `t()` in the game returns something
   * new and none of them are props.
   */
  localeToken: number;
}

/**
 * One line in the chat log. The sender is stored as what they were CALLED when
 * they said it - their name, or their roster number if they have not chosen one
 * - rather than as a peer id to look up later: a line is a record of something
 * that was said, and it should not change its attribution afterwards. `id` is a
 * local sequence number so a line can be found again when its time on screen
 * runs out.
 *
 * `fresh` is what that timer clears, and it is a flag rather than a deletion on
 * purpose: a line that has faded is still something that was said. Opening the
 * box brings the whole backlog back rather than a blank panel.
 */
export interface ChatLine {
  id: number;
  from: string;
  self: boolean;
  text: string;
  /** Recent enough to show over the game. Faded lines return with the box. */
  fresh: boolean;
}

/**
 * The vdom half of voice: booleans that change a few times a second. The input
 * level moves every frame and is deliberately not here - it lives in the plain
 * DOM pill (`src/ui/hud/voiceIndicator.ts`).
 */
export interface VoiceUiState {
  mode: VoiceMode;
  modes: VoiceMode[];
  /** Peer ids currently talking, this player included. */
  speaking: string[];
  /** Peer ids this player has muted. */
  muted: string[];
  /** How loud this player sends, 0..1. */
  selfVolume: number;
  /** Peer id -> how loud this listener has them, 0..1. Absent means full. */
  volumes: Record<string, number>;
  selfMuted: boolean;
  /** Locale key of a capture failure, or null. */
  errorKey: string | null;
  pushToTalkKey: string;
  /** Whether teammate rows show a microphone at all (`ui.json -> hud`). */
  showInRoster: boolean;
}

export interface UiCallbacks {
  onStart(): void;
  /** Closes the game. Only ever reached when `state.canQuit` says it can. */
  onQuit(): void;
  onJoin(code: string): void;
  onResume(): void;
  /** Abandon the run and go back to the cabin. */
  onLeave(): void;
  /** Leave the session entirely, from the lobby's escape menu. */
  onLeaveLobby(): void;
  onCloseWardrobe(): void;
  onColour(id: string): void;
  /** Equips an owned hat; an unowned one only goes on the mannequin. */
  onHat(id: string): void;
  /** Spends the coins, then wears it. Refused silently if the purse is short. */
  onBuyHat(id: string): void;
  /** Sends a line, or closes the box unchanged when the text is empty. */
  onChatSend(text: string): void;
  onChatClose(): void;
  onVoiceMode(mode: VoiceMode): void;
  onVoiceSelfMute(): void;
  onVoiceMutePeer(id: string): void;
  onVoiceSelfVolume(volume: number): void;
  onVoicePeerVolume(id: string, volume: number): void;
  onOpenOptions(): void;
  onCloseOptions(): void;
  /** Applied and persisted immediately - there is no Apply button. */
  onOptionsChange(patch: Partial<OptionValues>): void;
  /** The name everyone else sees. Written through on every keystroke. */
  onPlayerName(name: string): void;
  onOptionsReset(): void;
  onLocale(code: string): void;
  /** Applies a rebind. Returns the ids of any actions now sharing the key. */
  onRebind(action: string, code: string): string[];
  onResetBinds(): void;
}

/** Lets the game loop push state in without React-style re-render churn. */
export type UiPush = (patch: Partial<UiState>) => void;

export function App({
  initial,
  callbacks,
  bind,
}: {
  initial: UiState;
  callbacks: UiCallbacks;
  bind: (push: UiPush) => void;
}) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    bind((patch) => setState((current) => ({ ...current, ...patch })));
  }, [bind]);

  return (
    <>
      <CurrentScreen state={state} callbacks={callbacks} />
      {/* Layered over whatever is behind it, so backing out of options always
          lands where it was opened from - menu, pause or the cabin. */}
      {state.optionsOpen && (
        <Options
          options={state.options}
          ranges={state.optionRanges}
          buses={state.buses}
          actions={state.actions}
          playerName={state.playerName}
          nameMaxLength={state.nameMaxLength}
          onChange={callbacks.onOptionsChange}
          onPlayerName={callbacks.onPlayerName}
          onLocale={callbacks.onLocale}
          onRebind={callbacks.onRebind}
          onResetBinds={callbacks.onResetBinds}
          onReset={callbacks.onOptionsReset}
          onClose={callbacks.onCloseOptions}
        />
      )}
    </>
  );
}

function CurrentScreen({ state, callbacks }: { state: UiState; callbacks: UiCallbacks }) {
  if (state.screen === 'menu') {
    return (
      <MainMenu
        code={state.code}
        status={state.netStatus}
        error={state.error}
        menus={state.menus}
        onQuit={state.canQuit ? callbacks.onQuit : null}
        onStart={callbacks.onStart}
        onJoin={callbacks.onJoin}
        onOptions={callbacks.onOpenOptions}
      />
    );
  }

  if (state.screen === 'lobby' || state.screen === 'wardrobe') {
    return (
      <>
        <LobbyHud state={state} callbacks={callbacks} />
        {state.screen === 'wardrobe' && (
          <Wardrobe
            colours={state.colours}
            selected={state.colourId}
            hats={state.hats}
            hatId={state.hatId}
            previewHatId={state.previewHatId}
            coins={state.bankedCoins}
            onSelect={callbacks.onColour}
            onHat={callbacks.onHat}
            onBuyHat={callbacks.onBuyHat}
            onClose={callbacks.onCloseWardrobe}
          />
        )}
      </>
    );
  }

  if (state.screen === 'lobbyPaused') {
    return (
      <div class="overlay">
        <div class="overlay__panel overlay__panel--wide">
          <h2 class="overlay__title">{t('lobby.title')}</h2>

          <CodeRow code={state.code} ready={state.netStatus === 'ready'} />

          <button class="btn btn--primary" onClick={callbacks.onResume}>
            {t('pause.resume')}
          </button>

          <VoicePanel
            voice={state.voice}
            roster={state.roster}
            onMode={callbacks.onVoiceMode}
            onSelfMute={callbacks.onVoiceSelfMute}
            onMutePeer={callbacks.onVoiceMutePeer}
            onSelfVolume={callbacks.onVoiceSelfVolume}
            onPeerVolume={callbacks.onVoicePeerVolume}
          />

          <button class="btn" onClick={callbacks.onOpenOptions}>
            {t('pause.options')}
          </button>

          <button class="btn" data-sfx="back" onClick={callbacks.onLeaveLobby}>
            {t('pause.leaveLobby')}
          </button>
        </div>
      </div>
    );
  }

  if (state.screen === 'loading') return <Loading state={state} />;

  if (state.screen === 'paused') {
    return (
      <div class="overlay">
        <div class="overlay__panel overlay__panel--wide">
          <h2 class="overlay__title">{t('pause.title')}</h2>
          <button class="btn btn--primary" onClick={callbacks.onResume}>
            {t('pause.resume')}
          </button>

          <VoicePanel
            voice={state.voice}
            roster={state.roster}
            onMode={callbacks.onVoiceMode}
            onSelfMute={callbacks.onVoiceSelfMute}
            onMutePeer={callbacks.onVoiceMutePeer}
            onSelfVolume={callbacks.onVoiceSelfVolume}
            onPeerVolume={callbacks.onVoicePeerVolume}
          />

          <button class="btn" onClick={callbacks.onOpenOptions}>
            {t('pause.options')}
          </button>

          <button class="btn" data-sfx="back" onClick={callbacks.onLeave}>
            {t('pause.leaveRun')}
          </button>
        </div>
      </div>
    );
  }

  if (state.screen === 'spectatePaused') {
    return (
      <div class="overlay">
        <div class="overlay__panel overlay__panel--wide">
          <h2 class="overlay__title">{t('spectate.paused')}</h2>

          {/* The whole reason to sit here rather than walk away. It goes up as
              teammates cash in behind you, and it is what the leave button
              hands over. */}
          <p class="overlay__note">{t('spectate.banked', { coins: state.coins })}</p>

          <button class="btn btn--primary" onClick={callbacks.onResume}>
            {t('spectate.keepWatching')}
          </button>

          <VoicePanel
            voice={state.voice}
            roster={state.roster}
            onMode={callbacks.onVoiceMode}
            onSelfMute={callbacks.onVoiceSelfMute}
            onMutePeer={callbacks.onVoiceMutePeer}
            onSelfVolume={callbacks.onVoiceSelfVolume}
            onPeerVolume={callbacks.onVoicePeerVolume}
          />

          <button class="btn" onClick={callbacks.onOpenOptions}>
            {t('pause.options')}
          </button>

          <button class="btn" data-sfx="back" onClick={callbacks.onLeave}>
            {t('spectate.leave')}
          </button>
        </div>
      </div>
    );
  }

  if (state.screen === 'scoreboard') {
    return <Scoreboard rows={state.scoreboard} categories={state.categories} onContinue={callbacks.onLeave} />;
  }

  if (state.screen === 'spectate') return <SpectateHud state={state} callbacks={callbacks} />;

  return <Hud state={state} callbacks={callbacks} />;
}

/**
 * The spectator's chrome, and deliberately almost nothing: whose eyes you are
 * behind, the two keys that change that, the purse you are waiting on and the
 * roster of who is left. No crosshair and no prompts - none of it is yours.
 */
function SpectateHud({ state, callbacks }: { state: UiState; callbacks: UiCallbacks }) {
  return (
    <div class="hud">
      <div class="spectate">
        <div class="spectate__who">
          {state.spectate
            ? t('spectate.title', { player: playerLabel(state.spectate.name, state.spectate.index) })
            : t('spectate.noTargets')}
        </div>
        {state.spectate && state.spectate.count > 1 && (
          <div class="spectate__cycle">
            <KeyCap code={state.spectatePrevKey} size="small" />
            <KeyCap code={state.spectateNextKey} size="small" />
            <span class="spectate__cycle-label">
              {t('spectate.cycle', { position: state.spectate.position, count: state.spectate.count })}
            </span>
          </div>
        )}
      </div>

      {state.showCoins && (
        <div class="hud__coins">
          <span class="hud__coins-value">{state.coins}</span>
          <span class="hud__coins-label">{t('hud.coins')}</span>
        </div>
      )}

      {state.showRoster && <Roster entries={state.roster} voice={state.voice} />}

      <Chat state={state} callbacks={callbacks} />
    </div>
  );
}

/**
 * The card between the cabin and the map. It stays up after this browser has
 * finished building the world, because the run does not start until everybody
 * has: a bar with one pip per player says who is still coming, so a wait of a
 * few seconds reads as the team assembling rather than as the game hanging.
 *
 * Solo, and for the last person in, it is on screen for one frame.
 */
function Loading({ state }: { state: UiState }) {
  const total = Math.max(1, state.loadingTotal);
  const pips = Array.from({ length: total }, (_, index) => index < state.loadingReady);

  return (
    <div class="overlay overlay--quiet">
      <div class="overlay__panel loading">
        <h2 class="overlay__title">{t('lobby.loading')}</h2>

        {total > 1 && (
          <>
            <div class="loading__pips">
              {pips.map((ready, index) => (
                <span key={index} class={ready ? 'loading__pip loading__pip--in' : 'loading__pip'} />
              ))}
            </div>
            <p class="loading__note">
              {t('loading.waiting', { ready: state.loadingReady, total })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The lobby's own HUD: a crosshair, the interact prompt, and the expedition
 * panel. No roster - there is nobody to lose in here.
 *
 * The hand slots ARE the run's, and appear the moment you take a dart off the
 * stand. That is the point of them: the minigame is played with exactly the
 * controls the game is played with, so it doubles as somewhere to learn them.
 * Empty hands show nothing at all, because most visits to the cabin never touch
 * a dart and a permanent pair of "Empty" boxes would just be furniture.
 */
function LobbyHud({ state, callbacks }: { state: UiState; callbacks: UiCallbacks }) {
  const carrying = state.hands.left !== null || state.hands.right !== null;

  return (
    <div class="hud">
      <div class="hud__crosshair" />

      <div class="hud__prompts">
        {state.promptVerbKey && (
          <div class="hud__prompt">
            <span class="hud__prompt-verb">
              {t(state.promptVerbKey, state.promptItemKey ? { item: t(state.promptItemKey) } : undefined)}
            </span>
            <span class="hud__prompt-key">
              <KeyLine textKey="hud.interact.pressHint" code={state.interactKey} />
            </span>
          </div>
        )}

        {state.use && <UsePrompt use={state.use} />}
      </div>

      {carrying && (
        <div class="hud__hands">
          <HandSlot nameKey={state.hands.left} code={state.useLeftKey} />
          <HandSlot nameKey={state.hands.right} code={state.useRightKey} />
        </div>
      )}

      <Chat state={state} callbacks={callbacks} />

      <TutorialTip view={state.tutorial} />

      {state.lobby && <LobbyPanel view={state.lobby} maxPlayers={state.maxPlayers} />}
    </div>
  );
}

/**
 * The tutorial line, bottom right - the one corner neither the roster, the chat
 * nor the purse claims. There is only ever one on screen: `Tutorial` queues the
 * rest rather than stacking them.
 *
 * Keyed on the tip id so a new line animates in rather than the old one's text
 * changing under the player.
 */
function TutorialTip({ view }: { view: TutorialView | null }) {
  if (!view) return null;

  return (
    <div class="tutorial" key={view.id}>
      <span class="tutorial__text">
        {view.codes.length > 0 ? <KeyLine textKey={view.textKey} code={view.codes} size="small" /> : t(view.textKey)}
      </span>
    </div>
  );
}

/** The lobby code, with a copy button. Shown in the lobby's escape menu. */
function CodeRow({ code, ready }: { code: string; ready: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div class="menu__row">
      <span class="menu__label">{t('menu.yourCode')}</span>
      <code class="menu__code">{ready ? code : '------'}</code>
      <button
        class="btn btn--small"
        disabled={!ready}
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? t('common.copied') : t('lobby.copyCode')}
      </button>
    </div>
  );
}

function Hud({ state, callbacks }: { state: UiState; callbacks: UiCallbacks }) {
  return (
    <div class="hud">
      <div class="hud__crosshair" />

      {state.players > 1 && <div class="hud__players">{t('lobby.players', { current: state.players, max: 4 })}</div>}

      {/* One column under the crosshair rather than three blocks at fixed
          percentages of the screen. They grow and shrink independently - a hold
          ring appears, an item name wraps - and stacking them is the only way
          they never land on top of each other. */}
      <div class="hud__prompts">
        {state.promptVerbKey && (
          <div class="hud__prompt">
            <span class="hud__prompt-verb">
              {t(state.promptVerbKey, state.promptItemKey ? { item: t(state.promptItemKey) } : undefined)}
            </span>
            <span class="hud__prompt-key">
              <KeyLine
                textKey={state.promptHold ? 'hud.interact.holdHint' : 'hud.interact.pressHint'}
                code={state.interactKey}
              />
            </span>
            {state.promptHold && state.holdProgress > 0 && (
              <div class="hud__progress">
                <div class="hud__progress-fill" style={{ width: `${state.holdProgress * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {state.use && <UsePrompt use={state.use} />}

        {state.hint && <div class="hud__hint">{t(state.hint)}</div>}
      </div>

      {/* Two clocks on the floor, and the difference between them is the whole
          of being downed: the one counting down is how long the team has, and
          the one under it is the player's own hand. The give-up hint sits under
          the "someone might come" line rather than replacing it: both are true
          until the moment neither is. */}
      {state.health === 'downed' && (
        <div class="hud__downed">
          <span class="hud__downed-line">{t('run.downedHint')}</span>
          {state.bleedOut && (
            <span class={state.bleedOut.paused ? 'hud__bleed hud__bleed--held' : 'hud__bleed'}>
              {state.bleedOut.paused
                ? t('run.beingRevived')
                : t('run.bleedOut', { seconds: state.bleedOut.seconds })}
            </span>
          )}
          <span class="hud__downed-give-up">
            <KeyLine textKey="run.giveUpHint" code={state.giveUpKey} />
          </span>
          {state.giveUpProgress > 0 && (
            <div class="hud__progress">
              <div class="hud__progress-fill" style={{ width: `${state.giveUpProgress * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {state.showCoins && (state.coins > 0 || state.showEmptyCoins) && (
        <div class="hud__coins">
          <span class="hud__coins-value">{state.coins}</span>
          <span class="hud__coins-label">{t('hud.coins')}</span>
        </div>
      )}

      {state.showRoster && <Roster entries={state.roster} voice={state.voice} />}

      <Chat state={state} callbacks={callbacks} />

      <TutorialTip view={state.tutorial} />

      <div class="hud__hands">
        <HandSlot nameKey={state.hands.left} code={state.useLeftKey} />
        <HandSlot nameKey={state.hands.right} code={state.useRightKey} />
      </div>
    </div>
  );
}

/**
 * Text chat: a log that fades and a box that only exists while it is open.
 *
 * The lines are dropped from state on a timer rather than animated out, so a
 * quiet HUD costs nothing at all - most of a run has no chat element in the DOM.
 * Opening it releases pointer lock deliberately (`main.tsx`): typing with the
 * mouse captured and the movement keys live is how you walk into a wall
 * mid-sentence.
 */
function Chat({ state, callbacks }: { state: UiState; callbacks: UiCallbacks }) {
  // Open, you get the whole backlog; closed, only what is still recent. Nothing
  // is thrown away in between, so pressing Enter is always a way of asking
  // "what did I miss" rather than starting from an empty panel.
  const lines = state.chatOpen ? state.chat : state.chat.filter((line) => line.fresh);
  if (!state.showChat || (!state.chatOpen && lines.length === 0)) return null;

  return (
    <div class={state.chatOpen ? 'chat chat--open' : 'chat'}>
      <div class="chat__log">
        {lines.map((line) => (
          <div
            key={line.id}
            class={[
              'chat__line',
              line.self ? 'chat__line--self' : '',
              // Dimmed rather than hidden: history, not conversation.
              line.fresh ? '' : 'chat__line--old',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span class="chat__from">{line.from}</span>
            <span class="chat__text">{line.text}</span>
          </div>
        ))}
      </div>

      {state.chatOpen && <ChatInput maxLength={state.chatMaxLength} callbacks={callbacks} />}
    </div>
  );
}

/**
 * Its own component so that mounting it is what focuses it, and unmounting is
 * what throws the half-typed line away. A draft that survived being cancelled
 * would reappear the next time somebody pressed Enter.
 */
function ChatInput({ maxLength, callbacks }: { maxLength: number; callbacks: UiCallbacks }) {
  const [text, setText] = useState('');

  return (
    <input
      class="chat__input"
      type="text"
      maxLength={maxLength}
      autocomplete="off"
      placeholder={t('hud.chat.placeholder')}
      value={text}
      ref={(node) => node?.focus()}
      onInput={(event) => setText((event.currentTarget as HTMLInputElement).value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        // Stopped here so Escape does not also reach the options handler, and
        // so neither key is read as the action it is bound to.
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') callbacks.onChatClose();
        else callbacks.onChatSend(text);
      }}
    />
  );
}

/**
 * What the hand buttons would do, under the E prompt. It is a second line
 * rather than a replacement because the two are genuinely independent: you can
 * be looking at a chest while holding a flask you are about to throw past it.
 */
function UsePrompt({ use }: { use: UseView }) {
  return (
    <div class="hud__use">
      <span class="hud__use-verb">
        {t(use.verbKey, use.itemNameKey ? { item: t(use.itemNameKey) } : undefined)}
      </span>
      {/* An empty `hintKey` means the cap says everything on its own: a
          throwable in hand needs the button, not a sentence about it. */}
      <span class="hud__use-key">
        {use.hintKey ? <KeyLine textKey={use.hintKey} code={use.keyCode} /> : <KeyCap code={use.keyCode} />}
      </span>
      {use.hold && use.progress > 0 && (
        <div class="hud__progress">
          <div class="hud__progress-fill" style={{ width: `${use.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * The team, bottom left. One line each: a heart that says how they are, their
 * name, and rings that bloom off the heart whenever they make a noise - larger
 * with the loudness, and red once the hunter is close enough to hear it.
 *
 * A microphone appears the moment someone speaks, and stays crossed out for
 * anyone this player has muted - so who you can and cannot hear is never a
 * guess.
 */
function Roster({ entries, voice }: { entries: RosterEntry[]; voice: VoiceUiState }) {
  return (
    <div class={voice.showInRoster ? 'roster roster--voice' : 'roster'}>
      {entries.map((entry) => {
        const muted = voice.muted.includes(entry.id);
        const speaking = voice.showInRoster && !entry.disconnected && voice.speaking.includes(entry.id);
        const row = [
          'roster__row',
          entry.self ? 'roster__row--self' : '',
          // Greyed rather than removed: a team that becomes smaller should look
          // like it, and the line is where their name was a moment ago.
          entry.disconnected ? 'roster__row--gone' : '',
          // Out, but out the right way. Dimmed like the rest and marked in the
          // good colour, because a spectator's whole question is who is left.
          entry.escaped ? 'roster__row--out' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={entry.id} class={row}>
            <div class={`roster__heart roster__heart--${entry.health}`}>
              {entry.pulse && (
                <div
                  key={entry.pulse.token}
                  class={entry.pulse.heard ? 'roster__noise roster__noise--heard' : 'roster__noise'}
                  style={{ '--loudness': entry.pulse.loudness }}
                >
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <svg class="roster__heart-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-8-5.1-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 15.9 12 21 12 21z" />
              </svg>
              {entry.health === 'downed' && <span class="roster__flatline" />}
            </div>

            <span class="roster__name">{playerLabel(entry.name, entry.index)}</span>

            {voice.showInRoster && !entry.disconnected && (
              <MicIcon
                className={`roster__mic${speaking ? ' roster__mic--live' : ''}${muted ? ' roster__mic--muted' : ''}`}
                muted={muted}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The one microphone glyph in the game. Used by the roster and the pause list. */
export function MicIcon({ className, muted }: { className: string; muted: boolean }) {
  return (
    <svg class={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        class="mic__body"
        d="M12 3.2a2.7 2.7 0 0 1 2.7 2.7v5.2a2.7 2.7 0 0 1-5.4 0V5.9A2.7 2.7 0 0 1 12 3.2z"
      />
      <path class="mic__arc" d="M6.6 10.9a5.4 5.4 0 0 0 10.8 0M12 16.6v3.2M9.2 19.8h5.6" />
      {muted && <path class="mic__slash" d="M4.6 4.2 19.4 19.8" />}
    </svg>
  );
}

function HandSlot({ nameKey, code }: { nameKey: string | null; code: string }) {
  return (
    <div class={nameKey ? 'hud__slot hud__slot--filled' : 'hud__slot'}>
      <span class="hud__slot-name">{nameKey ? t(nameKey) : t('hud.slot.empty')}</span>
      <span class="hud__slot-key">
        <KeyCap code={code} size="small" />
      </span>
    </div>
  );
}
