/**
 * The wardrobe panel: options on the left, your actual player model on the right.
 *
 * The model on the right is not a preview render - it is the real
 * `player.masked` standing in the cabin, lit by the cabin, with the camera
 * parked in front of it while this panel is open. That is why the panel only
 * claims the left half of the screen and why it has no backdrop of its own.
 *
 * It is also why picking a hat you do not own is not a mistake: touching one
 * puts it on the mannequin two metres in front of you and leaves a price under
 * the list. **You try a hat on, and then you buy it** - a shop that made you
 * pay before you could see the thing would be a worse shop, and the model is
 * already standing there.
 */
import { t } from '@/i18n/index';

export interface ColourOption {
  id: string;
  nameKey: string;
  hex: string;
}

export interface HatOption {
  id: string;
  nameKey: string;
  /** Banked coins. `0` is free, and free hats never show a price. */
  cost: number;
  owned: boolean;
}

interface Props {
  colours: readonly ColourOption[];
  selected: string;
  hats: readonly HatOption[];
  /** What this player is actually wearing out of the cabin. */
  hatId: string;
  /** What the mannequin is showing. The same, unless a hat is being tried on. */
  previewHatId: string;
  /** Everything banked across every run. This is where it gets spent. */
  coins: number;
  onSelect(id: string): void;
  /** Equips an owned hat, or tries an unowned one on. */
  onHat(id: string): void;
  onBuyHat(id: string): void;
  onClose(): void;
}

export function Wardrobe({
  colours,
  selected,
  hats,
  hatId,
  previewHatId,
  coins,
  onSelect,
  onHat,
  onBuyHat,
  onClose,
}: Props) {
  const previewed = hats.find((hat) => hat.id === previewHatId) ?? null;
  // The buy bar only exists for a hat being tried on. An owned one was equipped
  // the moment it was clicked, so there is nothing left to ask.
  const forSale = previewed && !previewed.owned ? previewed : null;
  const affordable = forSale !== null && forSale.cost <= coins;

  return (
    <div class="wardrobe">
      <div class="wardrobe__panel">
        <h2 class="wardrobe__title">{t('wardrobe.title')}</h2>

        {/* The purse lives here rather than on the run HUD because this is where
            it is spent. In a run it is a tally; here it is a balance. */}
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

        <div class="wardrobe__group wardrobe__group--grow">
          <span class="wardrobe__label">{t('wardrobe.hats')}</span>
          <div class="wardrobe__hats">
            {hats.map((hat) => (
              <HatChip
                key={hat.id}
                hat={hat}
                worn={hat.id === hatId}
                previewing={hat.id === previewHatId && hat.id !== hatId}
                affordable={hat.cost <= coins}
                onPick={() => onHat(hat.id)}
              />
            ))}
          </div>
        </div>

        {forSale && (
          <button
            class={affordable ? 'btn btn--primary' : 'btn'}
            disabled={!affordable}
            onClick={() => onBuyHat(forSale.id)}
          >
            {t(affordable ? 'wardrobe.buy' : 'wardrobe.cannotAfford', {
              item: t(forSale.nameKey),
              cost: forSale.cost,
            })}
          </button>
        )}

        <button class="btn" data-sfx="back" onClick={onClose}>
          {t('wardrobe.done')}
        </button>
      </div>
    </div>
  );
}

/**
 * One hat in the list. Three states worth distinguishing at a glance: what you
 * are wearing, what you own, and what a run's takings away it is - so an
 * unowned hat carries its price and nothing else does.
 */
function HatChip({
  hat,
  worn,
  previewing,
  affordable,
  onPick,
}: {
  hat: HatOption;
  worn: boolean;
  previewing: boolean;
  affordable: boolean;
  onPick(): void;
}) {
  const classes = [
    'hat',
    worn ? 'hat--worn' : '',
    previewing ? 'hat--trying' : '',
    hat.owned ? 'hat--owned' : affordable ? 'hat--forsale' : 'hat--locked',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" class={classes} onClick={onPick}>
      <span class="hat__name">{t(hat.nameKey)}</span>
      {!hat.owned && <span class="hat__cost">{hat.cost}</span>}
      {worn && <span class="hat__worn">{t('wardrobe.worn')}</span>}
    </button>
  );
}
