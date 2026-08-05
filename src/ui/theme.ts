/**
 * `config/ui.json -> theme` into CSS custom properties, once at boot.
 *
 * The stylesheet declares the same variables with the same values, so the game
 * looks right before this runs and would still look right if it never did. What
 * this adds is that editing `ui.json` actually restyles the game - which is the
 * promise `docs/systems/UI.md` makes about the theme, and was until now the one
 * part of `ui.json` nothing read.
 *
 * The font stacks are the reason it landed when it did: the game ships in six
 * languages and the display face has no CJK or Cyrillic glyphs, so the fallback
 * chain in config has to reach the page.
 *
 * Names map by convention - `bgPanel` becomes `--c-bg-panel` - so adding a
 * colour is a config edit and a CSS rule, with nothing in between.
 */
import type { UiConfig } from '@/config/types';

/** `accentHover` -> `accent-hover`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function applyTheme(theme: UiConfig['theme']): void {
  const root = document.documentElement.style;

  for (const [name, value] of Object.entries(theme.colours)) {
    root.setProperty(`--c-${kebab(name)}`, value);
  }

  if (theme.fontDisplay) root.setProperty('--font-display', theme.fontDisplay);
  if (theme.fontBody) root.setProperty('--font-body', theme.fontBody);
  if (theme.fontMono) root.setProperty('--font-mono', theme.fontMono);
  if (theme.radius) root.setProperty('--radius', theme.radius);
  if (theme.transitionMs) root.setProperty('--transition', `${theme.transitionMs}ms`);
}
