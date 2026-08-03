/**
 * Menu clicks, delegated.
 *
 * Screens are Preact components that should not know audio exists, so this
 * listens once at the screen root instead of threading a callback through every
 * button. A button that should sound like a retreat rather than a commitment
 * carries `data-sfx="back"`.
 *
 * It also carries the browser autoplay unlock: the first press anywhere is the
 * user gesture an `AudioContext` needs before it will make a sound at all.
 */
import type { Audio } from './index';

const BACK = 'back';

export function attachUiSounds(audio: Audio, root: HTMLElement): () => void {
  const unlock = (): void => {
    void audio.unlock();
  };

  const hover = (event: Event): void => {
    if (button(event)) audio.play('ui.hover');
  };

  const click = (event: Event): void => {
    unlock();
    const target = button(event);
    if (target) audio.play(target.dataset['sfx'] === BACK ? 'ui.back' : 'ui.click');
  };

  root.addEventListener('pointerover', hover);
  root.addEventListener('click', click);
  // Starting a run is a keypress as often as it is a click.
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);

  return (): void => {
    root.removeEventListener('pointerover', hover);
    root.removeEventListener('click', click);
    removeEventListener('keydown', unlock);
    removeEventListener('pointerdown', unlock);
  };
}

/** The button an event landed on, if it landed on an enabled one at all. */
function button(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const found = target.closest('button');
  return found instanceof HTMLButtonElement && !found.disabled ? found : null;
}
