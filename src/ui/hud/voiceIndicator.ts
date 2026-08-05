/**
 * The voice pill, bottom left above the roster: what mode you are in, whether
 * the mic is open right now, and how loud you are.
 *
 * Plain DOM rather than Preact (docs/systems/UI.md): the level meter moves every
 * frame and a component tree would be pure waste. Only nodes that actually
 * changed are written, so a silent frame costs one comparison.
 */
import type { UiConfig } from '@/config/types';
import type { VoiceStatus } from '@/voice/index';
import { t } from '@/i18n/index';
import { modeLabelKey } from '@/voice/modes';
import { renderKeyLine } from '../keys';

/** How many segments the level meter has. Presentation, not a gameplay value. */
const SEGMENTS = 5;

export interface VoiceIndicator {
  update(status: VoiceStatus, visible: boolean, pushToTalkKey: string): void;
  unmount(): void;
}

export function mountVoiceIndicator(parent: HTMLElement, config: UiConfig['hud']['voiceIndicator']): VoiceIndicator {
  const root = document.createElement('div');
  root.className = 'voice';
  root.hidden = true;
  root.append(icon(), body());
  if (config.showLevelMeter) root.append(meter());
  parent.append(root);

  const label = root.querySelector<HTMLElement>('.voice__mode')!;
  const hint = root.querySelector<HTMLElement>('.voice__hint')!;
  const segments = [...root.querySelectorAll<HTMLElement>('.voice__meter span')];

  let lastState = '';
  let lastLabel = '';
  let lastHint = '';
  let lastLit = -1;

  return {
    update(status, visible, pushToTalkKey): void {
      const show = config.enabled && visible;
      if (root.hidden === show) root.hidden = !show;
      if (!show) return;

      const state = stateOf(status);
      if (state !== lastState) {
        lastState = state;
        root.dataset['state'] = state;
      }

      const text = labelFor(status);
      if (text !== lastLabel) {
        lastLabel = text;
        label.textContent = text;
      }

      // Only push-to-talk needs a key on screen; the others have nothing to
      // press. The cap is rebuilt rather than written as text - it is a real
      // element, and this changes a few times a session, not a few times a
      // second like the meter below.
      const showHint = status.mode === 'pushToTalk' && !status.selfMuted;
      const hintSignature = showHint ? pushToTalkKey : '';
      if (hintSignature !== lastHint) {
        lastHint = hintSignature;
        if (showHint) renderKeyLine(hint, t('hud.voice.holdHint'), pushToTalkKey);
        else hint.replaceChildren();
      }

      const lit = Math.round(status.level * SEGMENTS);
      if (lit !== lastLit) {
        lastLit = lit;
        segments.forEach((segment, index) => {
          segment.classList.toggle('voice__segment--lit', index < lit);
        });
      }
    },

    unmount(): void {
      root.remove();
    },
  };
}

/** Drives every colour and the slash through the microphone, from one attribute. */
function stateOf(status: VoiceStatus): string {
  if (status.errorKey) return 'error';
  if (status.mode === 'off') return 'off';
  if (status.selfMuted) return 'muted';
  return status.transmitting ? 'live' : 'idle';
}

function labelFor(status: VoiceStatus): string {
  // The pill gets the short form; the pause menu has room for the full sentence.
  if (status.errorKey) return t('hud.voice.unavailable');
  if (status.selfMuted && status.mode !== 'off') return t('hud.voice.muted');
  return t(modeLabelKey(status.mode));
}

function icon(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'voice__icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path class="voice__mic" d="M12 3.2a2.7 2.7 0 0 1 2.7 2.7v5.2a2.7 2.7 0 0 1-5.4 0V5.9A2.7 2.7 0 0 1 12 3.2z"/>' +
    '<path class="voice__arc" d="M6.6 10.9a5.4 5.4 0 0 0 10.8 0M12 16.6v3.2M9.2 19.8h5.6"/>' +
    '<path class="voice__slash" d="M4.6 4.2 19.4 19.8"/>';
  return svg;
}

function body(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'voice__body';

  const mode = document.createElement('span');
  mode.className = 'voice__mode';

  const hint = document.createElement('span');
  hint.className = 'voice__hint';

  wrap.append(mode, hint);
  return wrap;
}

function meter(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'voice__meter';
  for (let i = 0; i < SEGMENTS; i++) wrap.append(document.createElement('span'));
  return wrap;
}
