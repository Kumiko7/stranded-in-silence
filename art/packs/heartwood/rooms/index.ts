/**
 * Every room in Heartwood, in the order the pack presents them.
 *
 * The set splits into two families that alternate as you walk the maze - the
 * **Bower** (what moved into the tree and made a home of it: carved heartwood,
 * woven willow, packed clay, moth lanterns and tapped sap) and the **Thicket**
 * (the tree, and what lives in the tree: bark, pulp, rot, mycelium, silk and
 * foxfire) - plus two rooms of the **Bloom**, which belongs to neither and is
 * kept small on purpose.
 *
 * Two rooms are honestly both halves at once and they are what makes the
 * boundary read as deliberate rather than as two art styles in one file: the
 * Sap Well (a Bower workshop built round a wound in the Thicket) and the Pollen
 * Vault (a Bower room the Bloom is in the middle of taking).
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { apiary } from './apiary';
import { archive } from './archive';
import { ascent } from './ascent';
import { barkCanyon } from './barkcanyon';
import { burrow } from './burrow';
import { cradles } from './cradles';
import { fungalDeep } from './fungaldeep';
import { gall } from './gall';
import { heartrot } from './heartrot';
import { hollow } from './hollow';
import { knot } from './knot';
import { loomHall } from './loomhall';
import { meadHall } from './meadhall';
import { mossDell } from './mossdell';
import { petalCourt } from './petalcourt';
import { pollenVault } from './pollenvault';
import { rootCoil } from './rootcoil';
import { sapWell } from './sapwell';
import { shrine } from './shrine';
import { spinners } from './spinners';
import { tendrils } from './tendrils';
import { thornCourt } from './thorncourt';

/* --- the Bower ------------------------------------------------------------- */
const bower: readonly RoomBlueprint[] = [
  hollow,
  burrow,
  petalCourt,
  loomHall,
  meadHall,
  archive,
  shrine,
  apiary,
  cradles,
  ascent,
];

/* --- the Thicket ----------------------------------------------------------- */
const thicket: readonly RoomBlueprint[] = [
  heartrot,
  mossDell,
  fungalDeep,
  rootCoil,
  barkCanyon,
  spinners,
  gall,
  tendrils,
  knot,
  sapWell,
];

/* --- the Bloom ------------------------------------------------------------- */
const bloom: readonly RoomBlueprint[] = [thornCourt, pollenVault];

export const rooms: readonly RoomBlueprint[] = [...bower, ...thicket, ...bloom];
