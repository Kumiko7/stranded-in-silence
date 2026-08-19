/**
 * Every room in Blackgate, in the order the pack presents them.
 *
 * The set is split into two families that alternate as you walk the maze - the
 * Blocks (the gaol as it was built) and the Ward (the hospital annexe that was
 * added to it) - with one hinge room that is honestly both, and two rooms of the
 * thing the Ward was actually doing, which belongs to neither.
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { boiler } from './boiler';
import { cell } from './cell';
import { chapel } from './chapel';
import { gallows } from './gallows';
import { gatehouse } from './gatehouse';
import { hole } from './hole';
import { laundry } from './laundry';
import { mess } from './mess';
import { punishment } from './punishment';
import { records } from './records';
import { showers } from './showers';
import { tier } from './tier';
import { visitation } from './visitation';
import { yard } from './yard';

import { decon } from './decon';
import { electro } from './electro';
import { gallery } from './gallery';
import { hydro } from './hydro';
import { morgue } from './morgue';
import { padded } from './padded';
import { specimens } from './specimens';
import { theatre } from './theatre';

import { intake } from './intake';

import { incubation } from './incubation';
import { subject } from './subject';

/* --- the Blocks ------------------------------------------------------------- */
const blocks: readonly RoomBlueprint[] = [
  tier,
  cell,
  hole,
  showers,
  laundry,
  mess,
  gatehouse,
  chapel,
  records,
  gallows,
  visitation,
  punishment,
  boiler,
  yard,
];

/* --- the Ward --------------------------------------------------------------- */
const ward: readonly RoomBlueprint[] = [hydro, padded, theatre, gallery, decon, morgue, electro, specimens];

/* --- the hinge, and the Programme ------------------------------------------- */
const hinge: readonly RoomBlueprint[] = [intake];
const programme: readonly RoomBlueprint[] = [incubation, subject];

export const rooms: readonly RoomBlueprint[] = [...blocks, ...ward, ...hinge, ...programme];
