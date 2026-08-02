/**
 * The test pack: functional geometry that satisfies the full art contract.
 *
 * It exists so world, movement and networking can be built and played before any
 * real art does. A themed pack replaces it by implementing the same interface -
 * see docs/art/ART_PACK_CHECKLIST.md. Nothing in src/ knows this pack exists
 * beyond its id in config/maps.json.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'test',
  nameKey: 'map.test.name',
  rooms,
  createMaterials,
  createKit,
};
