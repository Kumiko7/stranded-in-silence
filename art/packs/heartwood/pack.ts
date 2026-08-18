/**
 * Heartwood - the inside of a tree that was old before anybody arrived, and
 * everything that has since moved in.
 *
 * The pack is the whole map: swap it for another and gameplay does not change by
 * a byte. What it swaps in is a place with two halves. **The Bower** is what the
 * fae built inside the trunk - heartwood carved and waxed to honey, silver birch
 * panelling, woven willow, packed clay, leaf-inlaid parquet, and moth lanterns
 * on every wall. Somebody's hands were on all of it, and none of them are here.
 * **The Thicket** is the tree itself and the things living in it: bark canyons,
 * wet sapwood, black punk rot, mycelium, silk. Nothing here was made. They
 * alternate as you walk the maze, and the rooms that are honestly both - the
 * bark stair, the sap well, the pollen vault - are what make the boundary read
 * as deliberate.
 *
 * The temperature split is the ordinary horror one, and it is doing all the
 * work: the ambient fill is a cold blue-green, the Bower lights itself warm on
 * tapped sap and wax, and the Thicket lights itself cold on foxfire and gill
 * glow. Walking out of a carved hall into a spinner's gallery is a change of
 * temperature you feel before you have read a prop.
 *
 * A third, much smaller strand runs through both: **the Bloom**. Two rooms of
 * violet - petals that are not petals, a court of standing figures - in a colour
 * that belongs to neither half, which is exactly why it is frightening in both.
 *
 * The signature objects are the **register** and the **mouth**: a course of live
 * resin (or a foxfire-lit split, or a violet lace) along the base of every wall
 * in the map, and a ring round every doorway - carved arch, parted bark, or a
 * banded burrow ring. Neither costs light budget, both are in every view of
 * every room, and between them they are what lets a player with no torch always
 * find the doors.
 *
 * It does not override any shared art: doors, chests, lockers, the key and the
 * characters come from `art/shared/` and read correctly against these materials
 * (the door is a carved leaf of heartwood, the chest a banded wicker hamper, the
 * locker a birch press). The seam for themed replacements is `overrides` below.
 */
import type { ArtPack } from '../../lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'heartwood',
  nameKey: 'map.heartwood.name',
  rooms,
  createMaterials,
  createKit,
};
