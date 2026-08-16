/**
 * The connection warning, top right.
 *
 * It exists for one reason: when a teammate starts sliding about or a door
 * takes a beat too long to open, the player needs to know whether that is the
 * game or their network. Without it, a bad connection reads as a bad game.
 *
 * So it is deliberately quiet. Nothing is drawn while the link is fine - a
 * permanent signal-bars widget would be noise in a game whose whole business is
 * looking at the dark - and what appears says which of the two things is wrong:
 *
 *   `poor`      packets are arriving, but slowly or not all of them
 *   `unstable`  nothing has arrived for a while; the link may be coming back
 *
 * Plain DOM rather than Preact (docs/systems/UI.md), and only nodes that
 * actually changed are written, so a healthy frame costs one comparison.
 */
import type { UiConfig } from '@/config/types';
import { t } from '@/i18n/index';
import type { LinkQuality } from '@/net/timing';

export interface ConnectionIndicator {
  update(quality: LinkQuality | null, visible: boolean): void;
  unmount(): void;
}

type Level = 'good' | 'poor' | 'unstable';

export function mountConnectionIndicator(
  parent: HTMLElement,
  config: UiConfig['hud']['connection'],
): ConnectionIndicator {
  const root = document.createElement('div');
  root.className = 'link';
  root.hidden = true;
  root.append(bars(), label(), detail());
  parent.append(root);

  const text = root.querySelector<HTMLElement>('.link__label')!;
  const ping = root.querySelector<HTMLElement>('.link__detail')!;

  let lastLevel: Level | '' = '';
  let lastPing = '';

  return {
    update(quality, visible): void {
      const level = quality && config.enabled && visible ? levelOf(quality, config) : 'good';
      const show = level !== 'good';
      if (root.hidden === show) root.hidden = !show;
      if (!show) {
        lastLevel = '';
        return;
      }

      if (level !== lastLevel) {
        lastLevel = level;
        root.dataset['level'] = level;
        text.textContent = t(level === 'unstable' ? 'hud.connection.unstable' : 'hud.connection.poor');
      }

      // Round trip is the number a player can act on - it is what tells them
      // whether to blame the game or go and shout at the router. Loss rides
      // along with it because one without the other is half the story.
      const detailText =
        config.showPing && quality
          ? t('hud.connection.detail', {
              ms: String(quality.rttMs ?? '--'),
              loss: String(Math.round(quality.loss * 100)),
            })
          : '';
      if (detailText !== lastPing) {
        lastPing = detailText;
        ping.textContent = detailText;
      }
    },

    unmount(): void {
      root.remove();
    },
  };
}

/**
 * Silence outranks slowness: a link nothing has arrived on for seconds is a
 * worse thing to be told about than one that is merely slow, even if the last
 * round trip it managed was a good one.
 */
function levelOf(quality: LinkQuality, config: UiConfig['hud']['connection']): Level {
  if (quality.health !== 'good') return 'unstable';
  if ((quality.rttMs ?? 0) >= config.warnRttMs) return 'poor';
  if (quality.loss >= config.warnLoss) return 'poor';
  return 'good';
}

/** Three bars, lit by the `level` attribute in CSS rather than from here. */
function bars(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'link__bars');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<rect class="link__bar link__bar--1" x="3" y="14" width="4.4" height="7" rx="1"/>' +
    '<rect class="link__bar link__bar--2" x="9.8" y="9" width="4.4" height="12" rx="1"/>' +
    '<rect class="link__bar link__bar--3" x="16.6" y="4" width="4.4" height="17" rx="1"/>';
  return svg;
}

function label(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'link__label';
  return span;
}

function detail(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'link__detail';
  return span;
}
