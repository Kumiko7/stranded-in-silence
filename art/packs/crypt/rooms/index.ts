/**
 * Every room in the Sepulchre of the Nine.
 *
 * The set is two halves plus the thing eating both of them, and it is meant to be
 * walked as a rhythm of temperature changes rather than as twenty variations on
 * one idea (docs/art/ART_PACK_CHECKLIST.md §4):
 *
 *   SANCTUM     grey limestone, brick vaulting, tallow. Ten 1x1s, one 2x1
 *               corridor and the 2x2 that the hill was dug out for.
 *   NECROPOLIS  ochre sandstone, painted plaster, gold, oil. Six 1x1s, the 1x3
 *               column hall and the L-shaped gilded chamber.
 *   THE ROT     mycelium and root, violet and teal, and no flame at all. Two
 *               1x1s, both of them on the boundary between the other two.
 *
 * Eighteen of the twenty-two are 1x1 (82 %), which is the share the validator
 * enforces; the four shapes that are not are one each of 2x1, 1x3, 2x2 and L,
 * because the generator places at most one of each shape per map.
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { antechamber } from './antechamber';
import { apothecary } from './apothecary';
import { bloom } from './bloom';
import { catacomb } from './catacomb';
import { chapel } from './chapel';
import { circle } from './circle';
import { gate } from './gate';
import { gilded } from './gilded';
import { hypostyle } from './hypostyle';
import { menagerie } from './menagerie';
import { offering } from './offering';
import { ossuary } from './ossuary';
import { pit } from './pit';
import { reliquary } from './reliquary';
import { robbers } from './robbers';
import { scriptorium } from './scriptorium';
import { sepulchre } from './sepulchre';
import { serdab } from './serdab';
import { shaft } from './shaft';
import { undercroft } from './undercroft';
import { wabet } from './wabet';
import { yew } from './yew';

export const rooms: readonly RoomBlueprint[] = [
  /* --- the Sanctum ------------------------------------------------------- */
  gate,
  ossuary,
  chapel,
  reliquary,
  scriptorium,
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
];
