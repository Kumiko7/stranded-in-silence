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
import { KeyLine } from '../components/KeyCap';
import { Slider } from '../components/Controls';
import type { RosterEntry } from '@/game/Game';
import { t } from '@/i18n/index';
import { playerLabel } from '../playerLabel';
import { modeLabelKey } from '@/voice/modes';
import { MicIcon, type VoiceUiState } from '../App';

interface Props {
  voice: VoiceUiState;
  roster: RosterEntry[];
  onMode(mode: VoiceMode): void;
  onSelfMute(): void;
  onMutePeer(id: string): void;
  onSelfVolume(volume: number): void;
  onPeerVolume(id: string, volume: number): void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export function VoicePanel({
  voice,
  roster,
  onMode,
  onSelfMute,
  onMutePeer,
  onSelfVolume,
  onPeerVolume,
}: Props) {
  const teammates = roster.filter((entry) => !entry.self);

  // Nothing here means anything on your own: no microphone is even opened in a
  // solo run, there is nobody to be heard by and nobody to turn down. A block of
  // dead controls explaining that is worse than no block at all.
  if (teammates.length === 0) return null;

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
        {voice.errorKey
          ? t(voice.errorKey)
          : voice.mode === 'pushToTalk'
            ? <KeyLine textKey="pause.voicePushHint" code={voice.pushToTalkKey} />
            : voice.mode === 'off'
              ? t('pause.voiceOffHint')
              : t('pause.voiceOpenHint')}
      </p>

      {/* Your own microphone: how loud you go out, and the switch that stops you
          going out at all. Muting is not volume zero - it survives you dragging
          the slider back up, and the pill says which one is holding you quiet. */}
      <div class="voice-panel__self">
        <Slider
          label={t('pause.voiceSelfVolume')}
          value={voice.selfVolume}
          min={0}
          max={1}
          step={0.05}
          display={percent(voice.selfVolume)}
          onChange={onSelfVolume}
        />
        <button
          class={voice.selfMuted ? 'btn btn--small btn--active' : 'btn btn--small'}
          disabled={voice.mode === 'off'}
          onClick={onSelfMute}
        >
          {t(voice.selfMuted ? 'pause.voiceUnmuteSelf' : 'pause.voiceMuteSelf')}
        </button>
      </div>

      <ul class="voice-panel__list">
        {teammates.map((entry) => {
          const muted = voice.muted.includes(entry.id);
          const speaking = voice.speaking.includes(entry.id);
          const volume = voice.volumes[entry.id] ?? 1;

          return (
            <li key={entry.id} class="voice-panel__peer">
              <div class="voice-panel__row">
                <MicIcon
                  className={`voice-panel__mic${speaking ? ' voice-panel__mic--live' : ''}${
                    muted ? ' voice-panel__mic--muted' : ''
                  }`}
                  muted={muted}
                />
                <span class="voice-panel__name">{playerLabel(entry.name, entry.index)}</span>
                <button class="btn btn--small" onClick={() => onMutePeer(entry.id)}>
                  {t(muted ? 'pause.voiceUnmute' : 'pause.voiceMute')}
                </button>
              </div>
              {/* Multiplies the distance law rather than replacing it, so
                  somebody turned down is still quieter across a room. */}
              <Slider
                label={t('pause.voiceVolume')}
                value={volume}
                min={0}
                max={1}
                step={0.05}
                display={percent(volume)}
                onChange={(value) => onPeerVolume(entry.id, value)}
              />
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
