import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boulders, cyl, drip, dustMotes, flowstoneColumn, lichenPatch, quad, rimstonePool, skull, stalagmite, strut } from '../kit/props';

/**
 * The Sink - the hill, before anybody was buried in it.
 *
 * A natural limestone chamber the crypt broke into from above: no masonry, no
 * courses, no straight line anywhere. A column of flowstone floor to ceiling, a
 * rimstone pool holding water that has been dripping into it since before the
 * language the crypt is inscribed in existed, and lichen in the wet seams that is
 * the only light in this map with no flame behind it.
 *
 * It is the pack's crossroads - a door on every wall - and it is deliberately the
 * EMPTIEST room in the set. Negative space is scary, and after twenty rooms of
 * carved stone and stacked dead a space that nobody made at all is the change of
 * temperature the map needs most.
 */
export const cavern: RoomBlueprint = {
  id: 'crypt.cavern',
  nameKey: 'room.crypt.cavern',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 12,
  tags: ['cave', 'entrance', 'open'],
  anchors: {
    chest: [{ position: [-3.1, 0, 2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.5, 0.5, -2.9] },
      { position: [-2.7, 0, -2.6] },
      { position: [3.05, 0, 1.4] },
    ],
    // Pulled in from +-1.8 to +-1.5: the pool's kerb is a collider a metre and a
    // quarter across, and a spawn a player cannot stand on is the first frame of a
    // run gone wrong.
    playerSpawn: [
      { position: [-1.5, 0, 2.2], rotationY: 0 },
      { position: [-0.5, 0, 2.5], rotationY: 0 },
      { position: [0.5, 0, 2.5], rotationY: 0 },
      { position: [1.5, 0, 2.2], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, -2.3] },
      { position: [-2.3, 0, 0.3] },
      { position: [2.3, 0, 0.3] },
      { position: [0, 0, 2.2] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cavern);
  room.shell({
    floor: 'clay',
    wall: 'rock',
    ceiling: 'cave',
    dado: 'none',
    lamps: 'lichen',
    mouth: 'rubble',
    // No plinth and no cornice. A cave has no line where the floor becomes the
    // wall or where the wall becomes the roof, and drawing one is the single
    // fastest way to make a natural chamber read as a cellar somebody built.
    plinth: true,
    seam: false,
  });

  /* --- the column ------------------------------------------------------------- */
  // Off-centre, in the quadrant between two doorways, so it never stands in a
  // sight line but is always in frame. It is the room's only vertical measure.
  flowstoneColumn(room, -1.7, -1.6, 0.42);

  /* --- the pool --------------------------------------------------------------- */
  // In the corner the water has been running to for ten thousand years, with the
  // lichen densest round its lip. Lit from under the surface, which is the one
  // thing in this room a player will walk over to look at.
  rimstonePool(room, 2.75, 2.75, 0.95, true);
  drip(room, 2.75, 2.75, 3.3);
  drip(room, -0.4, -2.7, 3.2);
  drip(room, 1.6, 0.6, 3.28);

  /* --- the floor -------------------------------------------------------------- */
  // Three stalagmites at three heights, in a loose line under the ceiling's
  // driplines, and the boulders where the roof has come down. Everything is in the
  // corners: the middle of this room is meant to be empty.
  //
  // Everything with a collider is in the NORTH half or hard in a corner, because
  // the south half holds the four player spawns and the chest anchor - and
  // `boulders()` and `stalagmite()` place their own colliders at seeded RANDOM
  // positions, so keeping them a metre from an anchor is not enough. Near an
  // anchor, one seed in five is a chest nobody can open.
  stalagmite(room, -2.9, 1.1, 1.35, 0.28);
  stalagmite(room, 2.8, -1.1, 1.05, 0.24);
  stalagmite(room, 3.1, 0.7, 0.7, 0.2);
  stalagmite(room, -1.0, -3.0, 0.5, 0.17);
  boulders(room, 2.7, -2.7, 0.9, 4);
  boulders(room, -2.9, -2.5, 0.8, 3);

  /* --- where the crypt broke in ----------------------------------------------- */
  // A wedge of dressed ashlar high on one wall with the spoil still lying under
  // it: the only man-made thing in the room, and the reason there is a doorway in
  // a cave at all. It is high up and small, so a player finds it rather than
  // being shown it.
  room.box('surface.ashlar', [1.6, 1.1, 0.12], [0.9, 1.9, -3.62], 0.03, { tile: 1.6 });
  room.box('stonePale', [1.8, 0.12, 0.2], [0.9, 3.0, -3.58], 0.03, { tile: 0.6 });
  for (let i = 0; i < 6; i++) {
    room.geo('stonePale', ball(room.range(0.12, 0.24), 6), tiltMatrix([0.9 + room.range(-0.9, 0.9), 0.06, -3.0 + room.range(-0.3, 0.5)], [0, i, 0], [1.3, 0.6, 1.1]), {
      tile: 0.5,
    });
  }
  // And what came down with it: one skull, in the spoil, a long way from its shelf.
  skull(room, 1.5, 0.05, -2.7, room.range(0, 6), 1.1, 'boneDark');

  /* --- light ------------------------------------------------------------------ */
  // Two patches of lichen, both real lights, at opposite ends and both cold. The
  // shell's lichen course does the walls; these two do the floor.
  // Two real lights, both pale rather than saturated. At intensity 4 and 3 the room
  // was legal and unreadable from three of its four doorways: a cave has to be the
  // darkest room in the map without being the one nobody can cross.
  lichenPatch(room, -3.2, 1.5, -0.6, 1.4, true, 7);
  lichenPatch(room, 2.9, 1.2, 0.8, 1.1, true, 5);
  lichenPatch(room, -1.7, 2.2, -1.6, 0.8, false);
  lichenPatch(room, 0.8, 0.8, 3.4, 0.7, false);

  /* --- the air ---------------------------------------------------------------- */
  // Cold and wet. Motes only: this room already has three drips and a lit pool,
  // and a haze quad in here would be the fourth pane of glass this pack hung.
  dustMotes(room, 0, 1.5, 0, 3.2, 20);
  for (let i = 0; i < 4; i++) {
    // Rootlets that have come down through the crack, feeling for the water.
    const x = room.range(0.2, 1.6);
    strut(room, 'rootPale', [x, 3.3, -3.4], [x + room.range(-0.3, 0.3), room.range(1.6, 2.6), -3.0], 0.02, 4, { castShadow: false });
  }
  room.geo('water', quad(0.9, 1.3), tiltMatrix([-3.5, 1.0, 2.6], [0, Math.PI / 2, 0.1]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
