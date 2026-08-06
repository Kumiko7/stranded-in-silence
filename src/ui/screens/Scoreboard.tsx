/**
 * The post-run scoreboard: one card per player, their figure on top and what
 * they did underneath.
 *
 * The figure is a PICTURE of the real `player.masked`, hat and all, rendered
 * off screen by `src/render/portraits.ts` and handed to this screen as a data
 * URL - so screens still never touch THREE (docs/systems/UI.md, rule 5) while
 * the card shows the actual body you were looking at five seconds ago. That is
 * what makes a column belong to a person rather than to a peer id, and it is
 * why buying a hat shows up here without anybody drawing it twice.
 *
 * The SVG silhouette below is the fallback for a browser that would not give us
 * a second GL context. It carries the wardrobe colour and nothing else.
 *
 * Which rows exist, in what order, and which direction is "better" all come
 * from `game.json -> scoring.categories`. The green ring marks the best value
 * in a category - and only when there is somebody to be better than, because a
 * solo player winning every category is not a result.
 */
import type { GameConfig } from '@/config/types';
import type { ScoreRow } from '@/game/Game';
import { t } from '@/i18n/index';

interface Props {
  rows: ScoreRow[];
  categories: GameConfig['scoring']['categories'];
  onContinue(): void;
}

export function Scoreboard({ rows, categories, onContinue }: Props) {
  const escaped = rows.filter((row) => row.status === 'escaped').length;
  const outcome =
    escaped === 0 ? 'run.wiped' : escaped === rows.length ? 'run.escaped' : 'run.partial';

  // A ring on a single player would just say "you are the only one here".
  const ranked = rows.length > 1;

  /** The best value in a category, or null when nobody has anything to show. */
  const bestOf = (id: string, higherIsBetter: boolean): number | null => {
    if (!ranked) return null;
    const values = rows.map((row) => valueOf(row, id));
    // Nobody did a thing all run: there is no winner of "opened no doors".
    if (values.every((value) => value === 0)) return null;
    return higherIsBetter ? Math.max(...values) : Math.min(...values);
  };

  const best = new Map(categories.map((category) => [category.id, bestOf(category.id, category.higherIsBetter)]));

  return (
    <div class="overlay overlay--score">
      <div class="score">
        <header class="score__head">
          <p class="score__eyebrow">{t('scoreboard.title')}</p>
          <h2 class="score__outcome">
            {t(outcome, outcome === 'run.partial' ? { escaped, total: rows.length } : undefined)}
          </h2>
        </header>

        <div class="score__cards" data-count={rows.length}>
          {rows.map((row) => (
            <article key={row.id} class={row.self ? 'card card--self' : 'card'}>
              <div class={`card__stage card__stage--${row.status}`}>
                {row.portrait ? (
                  <img class="figure figure--render" src={row.portrait} alt="" />
                ) : (
                  <PlayerFigure colourHex={row.colourHex} status={row.status} />
                )}
              </div>

              <div class="card__id">
                <span class="card__name">{t('hud.player.name', { n: row.index })}</span>
                <span class={`chip chip--${row.status}`}>{t(`hud.status.${row.status}`)}</span>
              </div>

              <dl class="card__stats">
                {categories.map((category) => {
                  const value = valueOf(row, category.id);
                  const isBest = best.get(category.id) === value;
                  return (
                    <div key={category.id} class={isBest ? 'stat stat--best' : 'stat'}>
                      <dt class="stat__label">{t(`scoreboard.category.${category.id}`)}</dt>
                      {/* The green ring IS the marker - no second icon, because
                          a number in a circle is already unmistakable. */}
                      <dd class="stat__value" title={isBest ? t('scoreboard.best') : undefined}>
                        <span class="stat__number">{value}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
        </div>

        <footer class="score__foot">
          <button class="btn btn--primary" onClick={onContinue}>
            {t('scoreboard.continue')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Whole numbers throughout. `noiseMade` accumulates loudness and is the only
 * fractional one; nobody wants to read three decimal places of footstep.
 */
function valueOf(row: ScoreRow, id: string): number {
  return Math.round((row.stats as Record<string, number>)[id] ?? 0);
}

/**
 * The fallback silhouette, for a browser that refused the portrait renderer a
 * context. Deliberately NOT a drawing of the current model - it is a body-shaped
 * shape in the right colour, which is all a fallback has to be. Keeping it
 * generic is what stops it needing an update every time a hat ships.
 */
function PlayerFigure({ colourHex, status }: { colourHex: string; status: ScoreRow['status'] }) {
  // Scoped per card - two figures on one screen must not share a gradient id.
  const id = `fig-${colourHex.replace('#', '')}-${status}`;

  return (
    <svg class="figure" viewBox="0 0 120 210" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stop-color={colourHex} stop-opacity="1" />
          <stop offset="55%" stop-color={colourHex} stop-opacity="0.86" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.45" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color={colourHex} stop-opacity="0.5" />
          <stop offset="100%" stop-color={colourHex} stop-opacity="0" />
        </radialGradient>
      </defs>

      {/* The pool of light the figure stands in, in its own colour. */}
      <ellipse class="figure__glow" cx="60" cy="176" rx="52" ry="26" fill={`url(#${id}-glow)`} />
      <ellipse class="figure__shadow" cx="60" cy="192" rx="34" ry="7" />

      <g class="figure__body" fill={`url(#${id}-cloth)`}>
        {/* legs */}
        <rect x="44" y="116" width="14" height="72" rx="4" />
        <rect x="62" y="116" width="14" height="72" rx="4" />
        {/* arms, behind the torso on both sides */}
        <rect x="26" y="88" width="11" height="58" rx="5" />
        <rect x="83" y="88" width="11" height="58" rx="5" />
        {/* torso: the capsule */}
        <rect x="36" y="74" width="48" height="72" rx="24" />
        {/* head */}
        <circle cx="60" cy="52" r="20" />
      </g>

      {/* Boots and mask are the one pale material on the body. */}
      <g class="figure__mask">
        <rect x="42" y="184" width="18" height="10" rx="3" />
        <rect x="60" y="184" width="18" height="10" rx="3" />
        <rect x="47" y="46" width="26" height="26" rx="4" />
      </g>

      {/* Two dark slots where a face would be. Nothing behind them. */}
      <g class="figure__eyes">
        <rect x="52" y="55" width="5" height="7" rx="2" />
        <rect x="63" y="55" width="5" height="7" rx="2" />
      </g>
    </svg>
  );
}
