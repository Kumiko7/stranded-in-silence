/**
 * Screen manager. Menus are Preact; per-frame HUD bits (the interact prompt,
 * exit ring) get their values pushed in as state rather than polling the sim.
 *
 * No user-visible string here is a literal - every one is a t() key.
 */
import { useEffect, useState } from 'preact/hooks';
import type { HealthState } from '@/config/types';
import type { RosterEntry } from '@/game/Game';
import { t } from '@/i18n/index';
import { MainMenu } from './screens/MainMenu';

export type Screen = 'menu' | 'run' | 'paused' | 'escaped' | 'wiped';

export interface UiState {
  screen: Screen;
  code: string;
  netStatus: 'connecting' | 'ready' | 'error';
  error: string | null;
  players: number;
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
  /** Transient objective line, e.g. "This door needs a key." */
  hint: string | null;
  health: HealthState;
  /** Everyone in the run: health, and the last noise each of them made. */
  roster: RosterEntry[];
  showRoster: boolean;
}

export interface UiCallbacks {
  onStart(): void;
  onJoin(code: string): void;
  onResume(): void;
  onLeave(): void;
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

  if (state.screen === 'menu') {
    return (
      <MainMenu
        code={state.code}
        status={state.netStatus}
        error={state.error}
        onStart={callbacks.onStart}
        onJoin={callbacks.onJoin}
      />
    );
  }

  if (state.screen === 'paused') {
    return (
      <div class="overlay">
        <div class="overlay__panel">
          <h2 class="overlay__title">{t('pause.title')}</h2>
          <button class="btn btn--primary" onClick={callbacks.onResume}>
            {t('pause.resume')}
          </button>
          <button class="btn" onClick={callbacks.onLeave}>
            {t('pause.leaveRun')}
          </button>
        </div>
      </div>
    );
  }

  if (state.screen === 'escaped' || state.screen === 'wiped') {
    return (
      <div class="overlay">
        <div class="overlay__panel">
          <h2 class="overlay__title">{t(state.screen === 'escaped' ? 'run.escaped' : 'run.wiped')}</h2>
          <button class="btn btn--primary" onClick={callbacks.onLeave}>
            {t('scoreboard.continue')}
          </button>
        </div>
      </div>
    );
  }

  return <Hud state={state} />;
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

      {state.hint && <div class="hud__hint">{t(state.hint)}</div>}

      {state.health === 'downed' && <div class="hud__downed">{t('run.downedHint')}</div>}

      {state.showRoster && <Roster entries={state.roster} />}

      <div class="hud__hands">
        <HandSlot nameKey={state.hands.left} useKey={state.useLeftKey} />
        <HandSlot nameKey={state.hands.right} useKey={state.useRightKey} />
      </div>
    </div>
  );
}

/**
 * The team, bottom left. One line each: a heart that says how they are, their
 * name, and rings that bloom off the heart whenever they make a noise - larger
 * with the loudness, and red once the hunter is close enough to hear it.
 */
function Roster({ entries }: { entries: RosterEntry[] }) {
  return (
    <div class="roster">
      {entries.map((entry) => (
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
        </div>
      ))}
    </div>
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
