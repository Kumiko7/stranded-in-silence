/**
 * Turning a raw `KeyboardEvent.code` into something a player reads.
 *
 * This is a UI concern, not an input one: `input/` knows that the interact
 * action is bound to `KeyE` and nothing more. What that looks like on screen -
 * a key cap with an E on it, or a mouse with its left button lit - is decided
 * here, and the words on the caps come from `config/input.json -> keyLabels`
 * rather than from this file, because they are strings a player sees.
 *
 * Initialised once at boot, like `t()`, so nothing has to thread a config
 * object through every prompt in the game.
 *
 * Mouse buttons are drawn rather than named. "LMB" is jargon, it means nothing
 * in five of the six languages the game ships in, and a small mouse with the
 * right button lit is unambiguous in all of them.
 */

/** What to draw for a binding. */
export type KeyGlyph =
  | { kind: 'key'; label: string; wide: boolean }
  | { kind: 'mouse'; button: MouseButton }
  /** No binding at all, or a code we would rather show honestly than guess at. */
  | { kind: 'none' };

export type MouseButton = 'left' | 'middle' | 'right' | 'side';

/** `Mouse<n>` follows `MouseEvent.button`, which is the order the DOM uses. */
const MOUSE_BUTTONS: Record<string, MouseButton> = {
  Mouse0: 'left',
  Mouse1: 'middle',
  Mouse2: 'right',
  Mouse3: 'side',
  Mouse4: 'side',
};

let labels: Record<string, string> = {};
let wide = new Set<string>();

export function initKeys(config: { keyLabels: Record<string, string>; wideKeys: string[] }): void {
  labels = config.keyLabels;
  wide = new Set(config.wideKeys);
}

export function glyphFor(code: string): KeyGlyph {
  if (!code) return { kind: 'none' };

  const button = MOUSE_BUTTONS[code];
  if (button) return { kind: 'mouse', button };

  const label = labels[code] ?? stripPrefix(code);
  return { kind: 'key', label, wide: wide.has(code) || label.length > 2 };
}

/**
 * `KeyE` -> `E`, `Digit4` -> `4`. Letters and digits are the overwhelming
 * majority of bindings and listing all 36 in config would be noise.
 */
function stripPrefix(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code.slice(6);
  return code;
}

/**
 * Splits a localised template around its `{key}` placeholder, so the caller can
 * put a rendered key cap in the gap. A template with no placeholder comes back
 * whole, with nothing after it - that is what makes it safe against a
 * translation that dropped the placeholder.
 */
export function splitOnKey(template: string): [string, string] {
  const at = template.indexOf('{key}');
  if (at < 0) return [template, ''];
  return [template.slice(0, at), template.slice(at + '{key}'.length)];
}

/**
 * The mouse, as geometry rather than as a component. Both the Preact key cap
 * and the plain-DOM voice pill draw it, and a mouse whose right button is on
 * the left in one of them would be its own kind of bug.
 */
export const MOUSE_SHAPE = {
  viewBox: '0 0 20 28',
  body: 'M1.4 1.4h17.2v25.2H1.4z',
  left: 'M10 1.5H9.4A8 8 0 0 0 1.5 9.5V12H10z',
  right: 'M10 1.5h.6a8 8 0 0 1 7.9 8V12H10z',
} as const;

/* --- plain DOM ------------------------------------------------------------ */
/*
 * The HUD's voice pill is plain DOM (docs/systems/UI.md), so it needs the same
 * caps without going near the vdom. Only called when the line actually changes,
 * which for a voice mode is a few times a session.
 */

/** Builds the cap for a binding, or null when there is nothing to draw. */
export function keyCapElement(code: string): HTMLElement | SVGElement | null {
  const glyph = glyphFor(code);
  if (glyph.kind === 'none') return null;

  if (glyph.kind === 'key') {
    const cap = document.createElement('span');
    cap.className = glyph.wide ? 'key key--wide key--small' : 'key key--small';
    cap.textContent = glyph.label;
    return cap;
  }

  const wrap = document.createElement('span');
  wrap.className = 'key key--mouse key--small';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mouse-glyph');
  svg.setAttribute('viewBox', MOUSE_SHAPE.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  const lit = (side: 'left' | 'right'): string =>
    glyph.button === side ? 'mouse-glyph__btn mouse-glyph__btn--lit' : 'mouse-glyph__btn';
  svg.innerHTML =
    '<rect class="mouse-glyph__body" x="1.4" y="1.4" width="17.2" height="25.2" rx="8.4"/>' +
    `<path class="${lit('left')}" d="${MOUSE_SHAPE.left}"/>` +
    `<path class="${lit('right')}" d="${MOUSE_SHAPE.right}"/>` +
    `<rect class="mouse-glyph__wheel${glyph.button === 'middle' ? ' mouse-glyph__wheel--lit' : ''}" x="8.6" y="5.2" width="2.8" height="6" rx="1.4"/>`;
  wrap.append(svg);
  return wrap;
}

/** Replaces `target`'s contents with a localised line carrying a key cap. */
export function renderKeyLine(target: HTMLElement, template: string, code: string): void {
  const [before, after] = splitOnKey(template);
  const cap = keyCapElement(code);
  target.replaceChildren(before, ...(cap ? [cap] : []), after);
}
