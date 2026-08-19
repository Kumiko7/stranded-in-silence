/**
 * Blackgate - a Victorian gaol with a hospital bolted onto the side of it, and
 * one wing nobody wrote down.
 *
 * The pack is the whole map: swap it for another and gameplay does not change by
 * a byte. What it swaps in is a building with two halves and a century between
 * them. **The Blocks** is the gaol as it was built - painted cinderblock and
 * brick, poured concrete, red quarry tile, riveted bar steel, gloss paint over
 * everything to shoulder height and distemper above it. Every surface has been
 * repainted more often than it has been repaired, so the colour is thick and the
 * damage under it shows through. **The Ward** is the annexe that was added
 * later, and it is a hospital that happens to have locks on it: white glazed
 * tile, terrazzo, chequer lino, enamelled steel, quilted canvas. They alternate
 * as you walk the maze, and Reception - which is honestly both - is what makes
 * the boundary read as deliberate.
 *
 * The temperature split follows the guide rather than inverting it. The fill is
 * cold blue; the Blocks light themselves WARM, on a forty-watt tungsten night
 * circuit that was never switched off; the Ward lights itself COLD, on failing
 * fluorescent and x-ray green-white. Walking out of a cell landing into a tiled
 * treatment room is a change of temperature you feel before you have read a prop.
 *
 * A third, much smaller strand runs off the end of the Ward: **the Programme**.
 * Two rooms lit by germicidal ultraviolet, a violet that belongs to neither
 * half, which is exactly why they are frightening in a building where everything
 * else is at least explicable.
 *
 * The signature object is the **night-light course**: a channel along the base of
 * every wall in the map with the building's permanent circuit in it - caged
 * tungsten beads in the Blocks, a slotted cold strip in the Ward, a germicidal
 * tube in the Programme. It costs no light budget, it is the same object in all
 * three families in three materials, and it is what lets a player with no torch
 * always find the doors. The second is the **mouth** round every opening: a
 * barred gate frame with the bolt-bar parked over it, a rubber-gasketed clinical
 * frame with a wire-glass vision panel, a brick relieving arch, or a clamped
 * bulkhead ring. Between them they are in every view of every room in the pack.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is a cell door with a judas hatch and a feeding flap, the chest a
 * property trunk, the locker a staff locker). The seam for themed replacements
 * is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { createKit } from './kit/shell';
import { createMaterials } from './materials';
import { rooms } from './rooms';

export const pack: ArtPack = {
  id: 'prison',
  nameKey: 'map.prison.name',
  rooms,
  createMaterials,
  createKit,
};
