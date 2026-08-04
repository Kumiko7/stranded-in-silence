/**
 * The pause menu's voice block.
 *
 * The design brief asks for ONE control that switches off / open mic / push to
 * talk (docs/systems/UI.md -> Pause), so that is a single segmented control
 * rather than three scattered settings - one glance, one click, arrow keys to
 * move along it.
 *
 * Under it: who else is here, who is talking, and a mute for each of them. Mutes
 * are entirely local - nothing is sent, and the person you muted is never told.
 */
import type { VoiceMode } from '@/config/types';
import type { RosterEntry } from '@/game/Game';
import { t } from '@/i18n/index';
import { modeLabelKey } from '@/voice/modes';
import { MicIcon, type VoiceUiState } from '../App';

interface Props {
  voice: VoiceUiState;
  roster: RosterEntry[];
  onMode(mode: VoiceMode): void;
  onSelfMute(): void;
  onMutePeer(id: string): void;
}

export function VoicePanel({ voice, roster, onMode, onSelfMute, onMutePeer }: Props) {
  const teammates = roster.filter((entry) => !entry.self);

  return (
    <section class="voice-panel">
      <h3 class="voice-panel__title">{t('pause.voice')}</h3>

      <div class="seg" role="group" onKeyDown={(event) => moveFocus(event)}>
        {voice.modes.map((mode) => (
          <button
            key={mode}
            class={mode === voice.mode ? 'seg__option seg__option--active' : 'seg__option'}
            aria-pressed={mode === voice.mode}
            onClick={() => onMode(mode)}
          >
            {t(modeLabelKey(mode))}
          </button>
        ))}
      </div>

      <p class="voice-panel__note">
        {/* Alone in the run, the microphone is not even open - say so, rather
            than describing a mode that is doing nothing. */}
        {teammates.length === 0
          ? t('pause.voiceAlone')
          : voice.errorKey
            ? t(voice.errorKey)
            : voice.mode === 'pushToTalk'
              ? t('pause.voicePushHint', { key: voice.pushToTalkKey })
              : voice.mode === 'off'
                ? t('pause.voiceOffHint')
                : t('pause.voiceOpenHint')}
      </p>

      <button
        class={voice.selfMuted ? 'btn btn--small btn--active' : 'btn btn--small'}
        disabled={voice.mode === 'off' || teammates.length === 0}
        onClick={onSelfMute}
      >
        {t(voice.selfMuted ? 'pause.voiceUnmuteSelf' : 'pause.voiceMuteSelf')}
      </button>

      <ul class="voice-panel__list">
        {teammates.map((entry) => {
          const muted = voice.muted.includes(entry.id);
          const speaking = voice.speaking.includes(entry.id);

          return (
            <li key={entry.id} class="voice-panel__row">
              <MicIcon
                className={`voice-panel__mic${speaking ? ' voice-panel__mic--live' : ''}${
                  muted ? ' voice-panel__mic--muted' : ''
                }`}
                muted={muted}
              />
              <span class="voice-panel__name">{t('hud.player.name', { n: entry.index })}</span>
              <button class="btn btn--small" onClick={() => onMutePeer(entry.id)}>
                {t(muted ? 'pause.voiceUnmute' : 'pause.voiceMute')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Left/right along the segmented control, so it is usable without a mouse. */
function moveFocus(event: KeyboardEvent): void {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;

  const group = event.currentTarget as HTMLElement;
  const options = [...group.querySelectorAll('button')];
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;

  event.preventDefault();
  options[(index + step + options.length) % options.length]?.focus();
}
