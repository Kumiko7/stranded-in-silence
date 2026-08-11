/**
 * Kerberos Deep - a hadal research station and public oceanarium, eleven
 * kilometres down, with the trench getting in.
 *
 * The pack is the whole map: swap it for another and gameplay does not change
 * by a byte. What it swaps in is a place with two halves. The **station** is
 * riveted plate, lab tile and failing amber emergency circuits - straight lines,
 * hard edges, everything losing to salt. The **abyss** is silt, pillow basalt,
 * cold coral and bioluminescence - no straight lines anywhere. They alternate as
 * you walk the maze, and the rooms that are honestly both (the moon pool, the
 * breach) are the ones that make the boundary read as deliberate.
 *
 * The signature object is the viewing pane: a wall of acrylic with the open
 * trench behind it. Half the rooms have one, no two show the same thing through
 * it, and it is the reason the map is frightening in a way a corridor is not -
 * you can see out, and something out there can see in.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is a pressure hatch, the chest a specimen transit case, the locker a
 * crew locker). The seam for themed replacements is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'abyss',
  nameKey: 'map.abyss.name',
  rooms,
  createMaterials,
  createKit,
};
