/**
 * Every room in Ravenhollow Manor.
 *
 * Nineteen 1x1 blueprints plus four multi-cell set pieces. Rooms are rotated in
 * 90 degree steps to fit their slot, so the one-door linen store serves every
 * dead end in the map on its own and nothing needs a mirrored twin.
 *
 * Multi-cell set pieces are packed into the grid before the maze is grown, at
 * most one of each per map, and only while `world.json -> layout.multiCellRooms`
 * is enabled.
 */
import type { RoomBlueprint } from '../../../lib/contract';
import { attic } from './attic';
import { ballroom } from './ballroom';
import { bathroom } from './bathroom';
import { bedroom } from './bedroom';
import { billiards } from './billiards';
import { boiler } from './boiler';
import { cellar } from './cellar';
import { chapel } from './chapel';
import { clocks } from './clocks';
import { conservatory } from './conservatory';
import { dining } from './dining';
import { foyer } from './foyer';
import { gallery } from './gallery';
import { kitchen } from './kitchen';
import { landing } from './landing';
import { laundry } from './laundry';
import { library } from './library';
import { linenStore } from './linenStore';
import { musicRoom } from './musicRoom';
import { nursery } from './nursery';
import { seance } from './seance';
import { study } from './study';
import { trophy } from './trophy';

export const rooms: readonly RoomBlueprint[] = [
  // 1x1 - the body of the manor.
  foyer,
  library,
  dining,
  kitchen,
  conservatory,
  nursery,
  study,
  musicRoom,
  bathroom,
  bedroom,
  chapel,
  boiler,
  cellar,
  trophy,
  billiards,
  clocks,
  laundry,
  seance,
  linenStore,

  // Multi-cell set pieces, one of each, used only when the generator packs them.
  gallery,
  ballroom,
  landing,
  attic,
];
