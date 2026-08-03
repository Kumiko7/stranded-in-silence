/**
 * Ravenhollow Manor.
 *
 * A 1920s country house that was rich, then empty, and is now neither. The pack
 * is the whole map: swap it for another and gameplay does not change by a byte.
 *
 * It does not override any shared art - doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials.
 * Themed replacements are plan step 33; the seam is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'mansion',
  nameKey: 'map.mansion.name',
  rooms,
  createMaterials,
  createKit,
};
