/**
 * The wardrobe panel: options on the left, your actual player model on the right.
 *
 * The model on the right is not a preview render - it is the real `player.masked`
 * standing in the cabin, lit by the cabin, with the camera parked in front of it
 * while this panel is open. That is why the panel only claims the left half of
 * the screen and why it has no backdrop of its own.
 *
 * One option for now. Everything else the customiser will grow is a row added to
 * `player.json -> customisation` and a control here (plan step 43).
 */
import { t } from '@/i18n/index';

export interface ColourOption {
  id: string;
  nameKey: string;
  hex: string;
}

interface Props {
  colours: readonly ColourOption[];
  selected: string;
  /** Everything banked across every run. Nothing spends it yet - step 42 does. */
  coins: number;
  onSelect(id: string): void;
  onClose(): void;
}

export function Wardrobe({ colours, selected, coins, onSelect, onClose }: Props) {
  return (
    <div class="wardrobe">
      <div class="wardrobe__panel">
        <h2 class="wardrobe__title">{t('wardrobe.title')}</h2>

        {/* The purse lives here rather than on the run HUD because this is where
            it will be spent. In a run it is a tally; here it is a balance. */}
        <div class="wardrobe__purse">
          <span class="wardrobe__label">{t('wardrobe.coins')}</span>
          <span class="wardrobe__coins">{coins}</span>
          <span class="wardrobe__hint">{t('wardrobe.coinsHint')}</span>
        </div>

        <div class="wardrobe__group">
          <span class="wardrobe__label">{t('wardrobe.colour')}</span>
          <div class="wardrobe__swatches">
            {colours.map((colour) => (
              <button
                key={colour.id}
                type="button"
                class={colour.id === selected ? 'swatch swatch--active' : 'swatch'}
                style={{ '--swatch': colour.hex }}
                title={t(colour.nameKey)}
                aria-label={t(colour.nameKey)}
                onClick={() => onSelect(colour.id)}
              />
            ))}
          </div>
          <span class="wardrobe__selected">
            {t(colours.find((colour) => colour.id === selected)?.nameKey ?? 'wardrobe.colour')}
          </span>
        </div>

        <button class="btn btn--primary" data-sfx="back" onClick={onClose}>
          {t('wardrobe.done')}
        </button>
      </div>
    </div>
  );
}
