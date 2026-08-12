/**
 * Every room in the Sepulchre of the Nine.
 *
 * Five families, and the set is meant to be walked as a rhythm of temperature
 * changes rather than as twenty variations on one idea
 * (docs/art/ART_PACK_CHECKLIST.md §4):
 *
 *   SANCTUM     grey limestone, brick vaulting, tallow. Seven 1x1s, one 2x1
 *               corridor and the 2x2 the hill was dug out for.
 *   NECROPOLIS  ochre sandstone, painted plaster, gold, oil. Six 1x1s, the 1x3
 *               column hall and the L-shaped gilded chamber.
 *   THE ROT     mycelium and root, violet and teal. Two 1x1s, both of them on the
 *               boundary between the two halves above.
 *   THE CAVE    the hill itself, and the oldest thing here: limestone, flowstone,
 *               cold lichen, and one wall of hands blown in ochre thirty thousand
 *               years before the Order arrived. Two 1x1s.
 *   THE BARROW  oak, iron and paint. One 1x1, and nobody else in this map buried
 *               anybody the way the people in it did.
 *
 * The Sanctum started with twelve rooms and lost three of them - a vestibule, a
 * reliquary and a record office - because they were the same grey vaulted stone
 * with different furniture in it, and three rooms that nobody in the Sanctum built
 * are worth far more to the set than three more that they did.
 *
 * Eighteen of the twenty-two are 1x1 (82 %), which is the share the validator
 * enforces; the four shapes that are not are one each of 2x1, 1x3, 2x2 and L,
 * because the generator places at most one of each shape per map.
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { antechamber } from './antechamber';
import { apothecary } from './apothecary';
import { barrow } from './barrow';
import { bloom } from './bloom';
import { catacomb } from './catacomb';
import { cavern } from './cavern';
import { chapel } from './chapel';
import { circle } from './circle';
import { gilded } from './gilded';
import { hypostyle } from './hypostyle';
import { menagerie } from './menagerie';
import { offering } from './offering';
import { ossuary } from './ossuary';
import { painted } from './painted';
import { pit } from './pit';
import { robbers } from './robbers';
import { sepulchre } from './sepulchre';
import { serdab } from './serdab';
import { shaft } from './shaft';
import { undercroft } from './undercroft';
import { wabet } from './wabet';
import { yew } from './yew';

export const rooms: readonly RoomBlueprint[] = [
  /* --- the Sanctum ------------------------------------------------------- */
  ossuary,
  chapel,
  apothecary,
  circle,
  undercroft,
  pit,
  shaft,
  catacomb,
  sepulchre,

  /* --- the Necropolis ---------------------------------------------------- */
  antechamber,
  wabet,
  serdab,
  offering,
  robbers,
  menagerie,
  hypostyle,
  gilded,

  /* --- the Rot ----------------------------------------------------------- */
  bloom,
  yew,

  /* --- the cave, and the barrow the crypt cut into --------------------------- */
  cavern,
  painted,
  barrow,
];
