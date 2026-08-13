/**
 * Vulcan's Anvil - a weapons black site drilled into a live volcano, with the
 * volcano getting in.
 *
 * The pack is the whole map: swap it for another and gameplay does not change by
 * a byte. What it swaps in is a place with two halves. **The Works** is the
 * facility - ablative hex tile, machined graphite panel, ferrocrete and hazard
 * chevron, everything stencilled with a number and everything discoloured by a
 * heat it was not designed for. **The Mountain** is what it was drilled into -
 * pahoehoe, obsidian, ash, sulphur, welded tuff, and no straight lines anywhere.
 * They alternate as you walk the maze, and the rooms that are honestly both (the
 * drill head, the tramway, the caldera) are what make the boundary read as
 * deliberate.
 *
 * The temperature split is **inverted** from the usual horror rule and it still
 * works: the ambient fill is cold blue, the facility lights itself cold too -
 * arc-white and cyan, with red where a circuit has given up - and the only warm
 * light anywhere is the mountain leaking in. Walking out of a lab and into a
 * lava tube is a change of temperature you feel before you have read a prop.
 *
 * A third, much smaller strand runs through both: **the thing they grew**. Two
 * rooms of chitin, membrane and a sick green glow that belongs to neither half,
 * which is exactly why it is frightening in both.
 *
 * The signature object is the heat register: a channel round the base of every
 * wall in the map with the mountain showing in it. It costs no light budget, it
 * is the same object on both sides of the boundary in two materials, and it is
 * what lets a player with no torch always find the doors.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is a blast hatch, the chest a transit case, the locker a crew
 * locker). The seam for themed replacements is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'forge',
  nameKey: 'map.forge.name',
  rooms,
  createMaterials,
  createKit,
};
