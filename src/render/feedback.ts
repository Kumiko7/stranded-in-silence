/**
 * The horror feedback layer: how much trouble you are in, without a word of text.
 *
 *   alert level  - a coloured edge wash: calm is nothing, suspicious a breath of
 *                  gold, alerted amber, chasing a hard red.
 *   proximity    - a heartbeat pulse that ramps between `effects.heartbeatStartDistance`
 *                  and `heartbeatMaxDistance`, plus a slow lens push on the canvas.
 *   damage       - a red flash on being hit.
 *   health       - a standing vignette while injured, a heavy one while downed.
 *
 * This is a compositing layer over the canvas rather than a three.js post stack:
 * everything the design asks for is a full-screen blend, and a DOM layer costs no
 * render targets. `render/` still owns it, and it reads sim state exactly like
 * any other presentation code would. See docs/ARCHITECTURE.md "Deliberately NOT
 * built" - there is no general post-processing stack and this is not the start of
 * one.
 */
import type { PlayerConfig } from '@/config/types';

export type AlertLevel = 'calm' | 'suspicious' | 'alerted' | 'chasing';

export interface FeedbackState {
  alert: AlertLevel;
  /** Metres to the nearest enemy, or Infinity when there is none. */
  enemyDistance: number;
  injured: boolean;
  downed: boolean;
}

/**
 * 0 at the far edge of awareness, 1 when it is on top of you. The heartbeat -
 * both the visual pulse and the sound - rides on this, so they stay in step.
 */
export function heartbeatCloseness(config: PlayerConfig, enemyDistance: number): number {
  const { heartbeatStartDistance, heartbeatMaxDistance } = config.effects;
  const span = Math.max(0.01, heartbeatStartDistance - heartbeatMaxDistance);
  return clamp01((heartbeatStartDistance - enemyDistance) / span);
}

const ALERT_TINT: Record<AlertLevel, string> = {
  calm: 'transparent',
  suspicious: '#c9a22733',
  alerted: '#d06a2455',
  chasing: '#d2261f77',
};

export class FeedbackLayer {
  readonly #root: HTMLElement;
  readonly #alert: HTMLElement;
  readonly #vignette: HTMLElement;
  readonly #flash: HTMLElement;
  readonly #canvas: HTMLElement;
  readonly #config: PlayerConfig;

  #flashFor = 0;
  #pulse = 0;

  constructor(parent: HTMLElement, canvas: HTMLElement, config: PlayerConfig) {
    this.#config = config;
    this.#canvas = canvas;

    this.#root = document.createElement('div');
    this.#root.className = 'fx';

    this.#alert = document.createElement('div');
    this.#alert.className = 'fx__alert';

    this.#vignette = document.createElement('div');
    this.#vignette.className = 'fx__vignette';

    this.#flash = document.createElement('div');
    this.#flash.className = 'fx__flash';

    this.#root.append(this.#alert, this.#vignette, this.#flash);
    parent.append(this.#root);
  }

  /** Call when the local player takes a hit. */
  flash(): void {
    this.#flashFor = this.#config.effects.damageFlashSeconds;
  }

  reset(): void {
    this.#flashFor = 0;
    this.#pulse = 0;
    this.update(0, { alert: 'calm', enemyDistance: Infinity, injured: false, downed: false });
    this.#root.style.opacity = '0';
  }

  update(dt: number, state: FeedbackState): void {
    const effects = this.#config.effects;
    this.#root.style.opacity = '1';

    const closeness = heartbeatCloseness(this.#config, state.enemyDistance);

    // The beat speeds up as it closes: two per second at the edge, six on top.
    this.#pulse += dt * (2 + closeness * 4);
    const beat = closeness > 0 ? Math.max(0, Math.sin(this.#pulse * Math.PI)) ** 3 * closeness : 0;

    this.#alert.style.background = ALERT_TINT[state.alert];
    this.#alert.style.opacity = String(state.alert === 'calm' ? 0 : 0.55 + beat * 0.45);

    const vignette = Math.max(
      state.downed ? effects.vignetteDownedIntensity : state.injured ? effects.vignetteInjuredIntensity : 0,
      beat * effects.chaseDistortionIntensity,
    );
    this.#vignette.style.opacity = String(vignette);

    // The lens push is the "distortion" half of the heartbeat - subtle, and the
    // only thing in the game that touches the canvas transform.
    this.#canvas.style.transform = beat > 0.001 ? `scale(${1 + beat * 0.012})` : '';

    this.#flashFor = Math.max(0, this.#flashFor - dt);
    this.#flash.style.opacity = String(this.#flashFor / Math.max(0.01, effects.damageFlashSeconds));
  }

  dispose(): void {
    this.#canvas.style.transform = '';
    this.#root.remove();
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
