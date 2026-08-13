/**
 * The main menu: a full-bleed slideshow of the game behind a left-aligned
 * lockup and a vertical nav.
 *
 * Three things are worth knowing before changing it.
 *
 * The title is *typeset*, not a picture. It has to be, because the game ships in
 * six languages and a baked wordmark would be English in all of them - so the
 * treatment (gradient fill, the glow behind it, the ornament rule) is CSS over
 * `t('game.title')` and a Japanese menu gets the same logo.
 *
 * The backdrop is two layers, never more. The outgoing still sits underneath at
 * full opacity with its drift frozen at the value the incoming one starts from,
 * and only the incoming layer animates - so the cross-fade has no dip in the
 * middle and no second animation to keep in step.
 *
 * Nothing here is sized in `vw`/`vh`. `#screen-root` carries a `zoom`, which
 * multiplies rendered viewport units and would double-count them; `rem` is the
 * one unit that scales exactly once (docs/systems/UI.md).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MenuBackgroundConfig, MenusConfig } from '@/config/types';
import { t } from '@/i18n/index';

interface Props {
  code: string;
  status: 'connecting' | 'ready' | 'error';
  error: string | null;
  menus: MenusConfig;
  onStart(): void;
  onJoin(code: string): void;
  onOptions(): void;
}

const CODE_LENGTH = 6;
/** Drift directions, cycled so two stills in a row never move the same way. */
const DRIFTS = 4;

export function MainMenu({ code, status, error, menus, onStart, onJoin, onOptions }: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const ready = status === 'ready';
  const slides = menus.mainMenuBackground === 'screenshots' ? menus.background : null;

  /*
   * Focus lands on Play, so the menu answers the keyboard before it has been
   * touched with a mouse: arrows move, Enter starts.
   *
   * It re-runs when the lobby comes up because Play is disabled until then, and
   * a disabled button cannot hold focus - but only while focus is still in the
   * menu, so it cannot pull the caret out of the options panel layered over it.
   */
  useEffect(() => {
    const active = document.activeElement;
    if (active !== document.body && !nav.current?.contains(active)) return;
    items(nav.current)[0]?.focus();
  }, [ready]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const join = () => {
    if (ready && joinCode.length === CODE_LENGTH) onJoin(joinCode);
  };

  /**
   * Arrows and WASD walk the nav, wrapping. Bound to the nav rather than the
   * window so it cannot steal a key from the options panel layered over it, or
   * from the code box - which is a nav child and opts out by name.
   */
  const walk = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowDown' || event.key === 's' ? 1 : event.key === 'ArrowUp' || event.key === 'w' ? -1 : 0;
    if (!step || event.target instanceof HTMLInputElement) return;
    event.preventDefault();

    const all = items(nav.current);
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(at + step + all.length) % all.length]?.focus();
  };

  return (
    <div class="menu">
      {slides && <Backdrop config={slides} />}

      <div class="menu__body">
        <header class="logo">
          <div class="logo__lockup">
            {/* The glow is the same string again, blurred underneath. Hidden
                from assistive tech so the title is not announced twice. */}
            <span class="logo__word logo__word--glow" aria-hidden="true">
              {t('game.title')}
            </span>
            <h1 class="logo__word logo__word--fill">{t('game.title')}</h1>
          </div>
          <div class="logo__rule" aria-hidden="true">
            <i />
          </div>
          <p class="logo__tagline">{t('game.tagline')}</p>
        </header>

        <nav class="menu__nav" ref={nav} onKeyDown={walk}>
          <button class="menu__item menu__item--primary" disabled={!ready} onClick={onStart}>
            {t('menu.play')}
          </button>

          <button class="menu__item" aria-expanded={joinOpen} disabled={!ready} onClick={() => setJoinOpen(!joinOpen)}>
            {t('menu.join')}
          </button>

          {joinOpen && (
            <div class="menu__drawer">
              <input
                class="menu__input"
                maxLength={CODE_LENGTH}
                placeholder={t('join.prompt')}
                value={joinCode}
                disabled={!ready}
                ref={(node) => node?.focus()}
                onInput={(event) => setJoinCode((event.target as HTMLInputElement).value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') join();
                  // Backing out of the code box is one Escape, and it must not
                  // travel on to the escape stack in main.tsx.
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setJoinOpen(false);
                    items(nav.current)[1]?.focus();
                  }
                }}
              />
              <button class="btn btn--small" disabled={!ready || joinCode.length !== CODE_LENGTH} onClick={join}>
                {t('menu.join')}
              </button>
            </div>
          )}

          <button class="menu__item" onClick={onOptions}>
            {t('menu.options')}
          </button>
        </nav>
      </div>

      <footer class="menu__foot">
        <div class={`menu__session menu__session--${status}`}>
          <span class="menu__dot" aria-hidden="true" />
          <span class="menu__state">{error ?? (ready ? t('menu.status.ready') : t('join.connecting'))}</span>

          <span class="menu__label">{t('menu.yourCode')}</span>
          <code class="menu__code">{ready ? code : '------'}</code>
          <button class="btn btn--small" disabled={!ready} onClick={copy}>
            {copied ? t('common.copied') : t('lobby.copyCode')}
          </button>
        </div>

        <div class="menu__version">{t('menu.version', { version: __APP_VERSION__ })}</div>
      </footer>
    </div>
  );
}

/** The nav's focusable rows, in the order the arrow keys walk them. */
function items(root: HTMLElement | null): HTMLButtonElement[] {
  return [...(root?.querySelectorAll<HTMLButtonElement>('.menu__item') ?? [])].filter((item) => !item.disabled);
}

/**
 * The cross-faded stills.
 *
 * Only the incoming layer animates; the one it is covering keeps full opacity
 * underneath until the next change replaces it, which is what makes the fade
 * even rather than dipping through the black behind both of them.
 */
function Backdrop({ config }: { config: MenuBackgroundConfig }) {
  // Shuffled once per mount, so the menu does not open on the same still every
  // launch. Nothing here is simulated, so the seeded RNG has no claim on it.
  const order = useMemo(() => shuffle(config.images.map((file) => config.folder + file)), [config]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Fetched up front: a still that arrives mid-fade arrives as a flash.
    for (const src of order) new Image().src = src;
  }, [order]);

  useEffect(() => {
    if (order.length < 2) return;
    const timer = setInterval(() => setStep((current) => current + 1), config.holdSeconds * 1000);
    return () => clearInterval(timer);
  }, [order, config.holdSeconds]);

  const current = order[step % order.length];
  const previous = step > 0 ? order[(step - 1) % order.length] : null;

  return (
    <div
      class="menu__stage"
      aria-hidden="true"
      style={{
        '--menu-fade': `${config.fadeSeconds}s`,
        // The drift has to finish in exactly one hold: the still freezes at its
        // rest transform the instant it becomes the outgoing layer, and a drift
        // still halfway through would snap there in full view.
        '--menu-hold': `${config.holdSeconds}s`,
        '--menu-drift': config.drift,
        '--menu-dim': config.dim,
        '--menu-grain': config.grain,
      }}
    >
      {previous && <div class="menu__still menu__still--held" style={{ backgroundImage: `url("${previous}")` }} />}
      {current && (
        <div
          key={step}
          class={`menu__still menu__still--live menu__still--drift${step % DRIFTS}`}
          style={{ backgroundImage: `url("${current}")` }}
        />
      )}

      <div class="menu__scrim" />
      <div class="menu__grade" />
      {config.grain > 0 && <div class="menu__grain" />}
    </div>
  );
}

/** Fisher-Yates over a copy. Menu dressing only - never a simulated value. */
function shuffle<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
