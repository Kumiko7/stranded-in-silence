/**
 * What to call a player on screen.
 *
 * One function because there are six places that draw a player - the roster,
 * the chat log, the scoreboard, the spectator's header, the pause list and the
 * nameplate over their head - and a player who is `Anna` in one of them and
 * `Player 3` in another is two people as far as the person reading it is
 * concerned.
 *
 * The number is the fallback rather than the label: it is what names somebody
 * who has never typed one, which is every player until they open the options.
 */
import { t } from '@/i18n/index';

export function playerLabel(name: string | null, index: number): string {
  return name ?? t('hud.player.name', { n: index });
}
