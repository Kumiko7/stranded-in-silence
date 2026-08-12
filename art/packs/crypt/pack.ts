/**
 * The Sepulchre of the Nine - a consecrated crypt built on top of a dynastic
 * tomb four thousand years older than it, with something coming up through both.
 *
 * The pack is the whole map: swap it for another and gameplay does not change by
 * a byte. What it swaps in is a place with two halves and a wound. The
 * **Sanctum** is what the Order built - grey limestone ashlar, brick vaulting,
 * lime plaster failing off it, walls faced in the dead, and tallow burning in a
 * niche every two metres. The **Necropolis** is what they built on top of and
 * never understood - ochre sandstone, painted registers, gold leaf, drifted sand,
 * oil lamps, and doorways with no arch in them because nobody had invented one.
 * The **Rot** is what is arriving: mycelium, root, violet and teal, and the only
 * light in the map with no flame behind it.
 *
 * Underneath both of them is the hill itself - **the cave**: wet limestone,
 * flowstone, cold lichen, and one wall where somebody blew ochre round their hands
 * thirty thousand years before the Order arrived. And cut into the hill beside it,
 * **the barrow**: a clinker-built ship under four feet of turf, with shields on the
 * gunwale, a horse at the prow and a runestone at its head. Oak, iron and paint
 * where everything else here is stone.
 *
 * The families alternate as you walk the maze, and the map reads oldest to newest
 * as you go: cave, barrow, dynasty, Order. The rooms that are honestly two things
 * at once - the robbers' tunnel, the bloom, the yew, the painted cave with a
 * six-hundred-year-old candle stand in front of its paintings - are the ones that
 * make each boundary read as deliberate rather than as an accident of generation.
 *
 * The signature object is the wall niche: a recess in a wall the generator can
 * never open, with something in it. A corpse on a shelf, a stack of skulls behind
 * bone bars, a hooded figure at the back of a hole, a grille with a hand-print on
 * the inside of it. Half the rooms have one, no two show the same thing, and it is
 * why the map is frightening in a way a corridor is not: you can see INTO the
 * walls, and one of them has been opened from the other side.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is an iron-bound oak leaf, the chest a reliquary casket, the locker a
 * vestry aumbry). The seam for themed replacements is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'crypt',
  nameKey: 'map.crypt.name',
  rooms,
  createMaterials,
  createKit,
};
