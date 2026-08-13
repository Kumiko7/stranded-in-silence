/**
 * How a binding is drawn: a key cap, or a mouse with the right button lit.
 *
 * Two components, and the second is the one most prompts want. `KeyLine` takes
 * a locale key whose string contains `{key}` - "Hold {key}", "Press {key} on a
 * poster" - and renders the sentence with a real cap in the gap, so word order
 * stays the translator's business. Japanese puts the key first; nothing here
 * has to know that.
 */
import { glyphFor, splitOnKey, MOUSE_SHAPE, type MouseButton } from '../keys';
import { t } from '@/i18n/index';

export function KeyCap({ code, size = 'normal' }: { code: string; size?: 'normal' | 'small' }) {
  const glyph = glyphFor(code);
  if (glyph.kind === 'none') return null;

  const modifier = size === 'small' ? ' key--small' : '';

  if (glyph.kind === 'mouse') {
    return (
      <span class={`key key--mouse${modifier}`}>
        <MouseGlyph button={glyph.button} />
      </span>
    );
  }

  return <span class={`key${glyph.wide ? ' key--wide' : ''}${modifier}`}>{glyph.label}</span>;
}

/**
 * A prompt line with the key cap inline. `params` covers any other placeholder
 * the string carries, exactly as `t()` would.
 *
 * `code` may be several bindings, which puts a cluster of caps in the one gap -
 * that is what "{key} to move" is, and it keeps the string a single sentence
 * with a single placeholder however many keys the action actually takes.
 */
export function KeyLine({
  textKey,
  code,
  params,
  size,
}: {
  textKey: string;
  code: string | readonly string[];
  params?: Record<string, string | number>;
  size?: 'normal' | 'small';
}) {
  const [before, after] = splitOnKey(t(textKey, params));
  const codes = typeof code === 'string' ? [code] : code;

  return (
    <>
      {before}
      {codes.map((one) => (
        <KeyCap key={one} code={one} size={size} />
      ))}
      {after}
    </>
  );
}

/**
 * The mouse. One shape, four states - the body is always drawn, and the
 * pressed button is filled. Deliberately not a Font Awesome glyph: none of them
 * distinguish left from right, which is the only thing this has to say.
 */
export function MouseGlyph({ button }: { button: MouseButton }) {
  return (
    <svg class="mouse-glyph" viewBox={MOUSE_SHAPE.viewBox} aria-hidden="true">
      {/* Body */}
      <rect class="mouse-glyph__body" x="1.4" y="1.4" width="17.2" height="25.2" rx="8.4" />
      {/* The two top buttons and the wheel between them, lit one at a time. */}
      <path
        class={button === 'left' ? 'mouse-glyph__btn mouse-glyph__btn--lit' : 'mouse-glyph__btn'}
        d={MOUSE_SHAPE.left}
      />
      <path
        class={button === 'right' ? 'mouse-glyph__btn mouse-glyph__btn--lit' : 'mouse-glyph__btn'}
        d={MOUSE_SHAPE.right}
      />
      <rect
        class={button === 'middle' ? 'mouse-glyph__wheel mouse-glyph__wheel--lit' : 'mouse-glyph__wheel'}
        x="8.6"
        y="5.2"
        width="2.8"
        height="6"
        rx="1.4"
      />
      {button === 'side' && <rect class="mouse-glyph__side mouse-glyph__btn--lit" x="0.6" y="9" width="2.6" height="5.5" rx="1.3" />}
    </svg>
  );
}
