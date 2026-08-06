/**
 * Every chamber of the Leviathan.
 *
 * Twenty 1x1 blueprints plus four multi-cell set pieces. Rooms are rotated in
 * 90 degree steps to fit their slot, so the one-door brood cell serves every
 * dead end in the map on its own and nothing needs a mirrored twin.
 *
 * The set is deliberately split down the middle between **wet** chambers -
 * flesh, bile, nerve, brood - and **calcified** ones - bone, chitin, cartilage,
 * enamel. Walking from one zone into the other is the map's main beat, so the
 * two halves are weighted evenly and neither has more than one really bright
 * room in it.
 *
 * Multi-cell set pieces are packed into the grid before the maze is grown, at
 * most one of each per map, and only while `world.json -> layout.multiCellRooms`
 * is enabled.
 */
import type { RoomBlueprint } from '../../../lib/contract';
import { bile } from './bile';

import { bloom } from './bloom';
import { carapace } from './carapace';
import { brain } from './brain';
import { brood } from './brood';
import { eye } from './eye';
import { gizzard } from './gizzard';
import { gullet } from './gullet';
import { intestine } from './intestine';
import { heart } from './heart';
import { hive } from './hive';
import { jaw } from './jaw';
import { lattice } from './lattice';
import { lungs } from './lungs';
import { marrow } from './marrow';
import { scales } from './scales';
import { sinew } from './sinew';
import { spine } from './spine';
import { stomach } from './stomach';
import { teeth } from './teeth';
import { tendrils } from './tendrils';
import { veins } from './veins';
import { ribcage } from './ribcage';
import { windpipe } from './windpipe';

export const rooms: readonly RoomBlueprint[] = [
  // 1x1 - wet
  gullet,
  stomach,
  heart,
  lungs,
  bile,
  brain,
  eye,
  brood,
  tendrils,
  veins,
  bloom,
  gizzard,
  sinew,

  // 1x1 - calcified
  marrow,
  teeth,
  carapace,
  lattice,
  spine,
  scales,
  hive,

  // Multi-cell set pieces, one of each, used only when the generator packs them.
  ribcage,
  intestine,
  windpipe,
  jaw,
];
