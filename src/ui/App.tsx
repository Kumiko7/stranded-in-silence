/**
 * Screen manager. Menus are Preact; per-frame HUD bits (the interact prompt,
 * exit ring) get their values pushed in as state rather than polling the sim.
 *
 * No user-visible string here is a literal - every one is a t() key.
 */
import { useEffect, useState } from 'preact/hooks';
import type { AudioConfig, GameConfig, HealthState, VoiceMode } from '@/config/types';
import type { RosterEntry, ScoreRow, UseView } from '@/game/Game';
import type { LobbyView } from '@/game/Lobby';
import type { Options as OptionValues, OptionRanges } from '@/save/index';
import { t } from '@/i18n/index';
import { LobbyPanel } from './screens/LobbyPanel';
import { MainMenu } from './screens/MainMenu';
import { Options } from './screens/Options';
import { Scoreboard } from './screens/Scoreboard';
import { VoicePanel } from './screens/VoicePanel';
import { Wardrobe, type ColourOption } from './screens/Wardrobe';

export type Screen =
  | 'menu'
  | 'lobby'
  | 'lobbyPaused'
  | 'wardrobe'
  | 'loading'
  | 'run'
  | 'paused'
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
  colours: readonly ColourOption[];
  colourId: string;
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
  health: HealthState;
  /** Everyone in the run: health, and the last noise each of them made. */
  roster: RosterEntry[];
  showRoster: boolean;
  voice: VoiceUiState;
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
  selfMuted: boolean;
  /** Locale key of a capture failure, or null. */
  errorKey: string | null;
  pushToTalkKey: string;
  /** Whether teammate rows show a microphone at all (`ui.json -> hud`). */
  showInRoster: boolean;
}

export interface UiCallbacks {
  onStart(): void;
  onJoin(code: string): void;
  onResume(): void;
  /** Abandon the run and go back to the cabin. */
  onLeave(): void;
  /** Leave the session entirely, from the lobby's escape menu. */
  onLeaveLobby(): void;
  onCloseWardrobe(): void;
  onColour(id: string): void;
  onVoiceMode(mode: VoiceMode): void;
  onVoiceSelfMute(): void;
  onVoiceMutePeer(id: string): void;
  onOpenOptions(): void;
  onCloseOptions(): void;
  /** Applied and persisted immediately - there is no Apply button. */
  onOptionsChange(patch: Partial<OptionValues>): void;
  onOptionsReset(): void;
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
          onChange={callbacks.onOptionsChange}
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
        onStart={callbacks.onStart}
        onJoin={callbacks.onJoin}
        onOptions={callbacks.onOpenOptions}
      />
    );
  }

  if (state.screen === 'lobby' || state.screen === 'wardrobe') {
    return (
      <>
        <LobbyHud state={state} />
        {state.screen === 'wardrobe' && (
          <Wardrobe
            colours={state.colours}
            selected={state.colourId}
            coins={state.bankedCoins}
            onSelect={callbacks.onColour}
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

  if (state.screen === 'loading') {
    return (
      <div class="overlay overlay--quiet">
        <div class="overlay__panel">
          <h2 class="overlay__title">{t('lobby.loading')}</h2>
        </div>
      </div>
    );
  }

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

  if (state.screen === 'scoreboard') {
    return <Scoreboard rows={state.scoreboard} categories={state.categories} onContinue={callbacks.onLeave} />;
  }

  return <Hud state={state} />;
}

/**
 * The lobby's own HUD: a crosshair, the interact prompt, and the expedition
 * panel. No roster and no hand slots - there is nothing to carry and nobody to
 * lose in here.
 */
function LobbyHud({ state }: { state: UiState }) {
  return (
    <div class="hud">
      <div class="hud__crosshair" />

      {state.promptVerbKey && (
        <div class="hud__prompt">
          <span class="hud__prompt-verb">
            {t(state.promptVerbKey, state.promptItemKey ? { item: t(state.promptItemKey) } : undefined)}
          </span>
          <span class="hud__prompt-key">{t('hud.interact.pressHint', { key: state.interactKey })}</span>
        </div>
      )}

      {state.lobby && <LobbyPanel view={state.lobby} maxPlayers={state.maxPlayers} />}
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

function Hud({ state }: { state: UiState }) {
  return (
    <div class="hud">
      <div class="hud__crosshair" />

      {state.players > 1 && <div class="hud__players">{t('lobby.players', { current: state.players, max: 4 })}</div>}

      {state.promptVerbKey && (
        <div class="hud__prompt">
          <span class="hud__prompt-verb">
            {t(state.promptVerbKey, state.promptItemKey ? { item: t(state.promptItemKey) } : undefined)}
          </span>
          <span class="hud__prompt-key">
            {state.promptHold
              ? t('hud.interact.holdHint', { key: state.interactKey })
              : t('hud.interact.pressHint', { key: state.interactKey })}
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

      {state.health === 'downed' && <div class="hud__downed">{t('run.downedHint')}</div>}

      {state.showCoins && (state.coins > 0 || state.showEmptyCoins) && (
        <div class="hud__coins">
          <span class="hud__coins-value">{state.coins}</span>
          <span class="hud__coins-label">{t('hud.coins')}</span>
        </div>
      )}

      {state.showRoster && <Roster entries={state.roster} voice={state.voice} />}

      <div class="hud__hands">
        <HandSlot nameKey={state.hands.left} useKey={state.useLeftKey} />
        <HandSlot nameKey={state.hands.right} useKey={state.useRightKey} />
      </div>
    </div>
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
      <span class="hud__use-key">
        {use.hintKey ? t(use.hintKey, { key: use.keyLabel }) : use.keyLabel}
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
        const speaking = voice.showInRoster && voice.speaking.includes(entry.id);

        return (
          <div key={entry.id} class={entry.self ? 'roster__row roster__row--self' : 'roster__row'}>
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

            <span class="roster__name">{t('hud.player.name', { n: entry.index })}</span>

            {voice.showInRoster && (
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

function HandSlot({ nameKey, useKey }: { nameKey: string | null; useKey: string }) {
  return (
    <div class={nameKey ? 'hud__slot hud__slot--filled' : 'hud__slot'}>
      <span class="hud__slot-name">{nameKey ? t(nameKey) : t('hud.slot.empty')}</span>
      <span class="hud__slot-key">{useKey}</span>
    </div>
  );
}
