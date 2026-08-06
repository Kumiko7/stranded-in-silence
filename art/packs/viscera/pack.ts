/**
 * The Leviathan - the inside of something enormous, and still alive.
 *
 * The pack is the whole map: swap it for another and gameplay does not change
 * by a byte. What it swaps in is a body. Rooms are organs, corridors are
 * vessels, and the two zones - wet viscera and calcified skeleton - alternate
 * so that walking the maze feels like moving through anatomy rather than
 * through a set of rooms that happen to be red.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is bone in a cartilage frame, the chest a chitin case). The seam
 * for themed replacements is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'viscera',
  nameKey: 'map.viscera.name',
  rooms,
  createMaterials,
  createKit,
};
