import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneHeap, brazier, cyl, debris, dustMotes, haft, horseSkull, mastStump, quad, ring, sconce, shield, shipHull, skull, strut, wrappedBody } from '../kit/props';

/**
 * The Ship Grave - a boat, a horse and a king, under four feet of turf.
 *
 * A stave-lined chamber the crypt's builders cut into and then walled off again,
 * with a clinker-built hull sitting in the earth at the bottom of it. The timber
 * is nine tenths gone: what is left is the shape of it in iron rivets, five
 * strakes on the sheltered side, the stem post still standing, and a mast snapped
 * off at chest height.
 *
 * Nobody in this map buried anybody like this. The room is here to be a different
 * culture rather than a different room: oak and iron and paint instead of stone,
 * a carved beast over the doorway instead of an arch, and a runestone against the
 * one wall the generator cannot open.
 */
export const barrow: RoomBlueprint = {
  id: 'crypt.barrow',
  nameKey: 'room.crypt.barrow',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['barrow', 'treasure'],
  anchors: {
    chest: [{ position: [2.5, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [2.6, 0, -3.15], rotationY: Math.PI }],
    itemSpawn: [
      { position: [0.2, 0.55, -0.1] },
      { position: [-2.6, 0, -2.5] },
      { position: [-1.4, 0, 2.9] },
    ],
    patrolPoint: [
      { position: [1.9, 0, -1.6] },
      { position: [1.9, 0, 1.8] },
      { position: [-2.9, 0, 0.4] },
    ],
    enemySpawn: [{ position: [-2.9, 0, -2.9] }],
    treasure: [{ position: [0.6, 0.5, -0.8] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, barrow);
  room.shell({
    floor: 'earth',
    wall: 'timber',
    ceiling: 'turf',
    dado: 'none',
    lamps: 'oil',
    lampSpacing: 3.0,
    // Two carved posts and a lintel with a beast's head on it. It is the one thing
    // in the map that says the people who cut this door had never seen an arch.
    mouth: 'stave',
    niches: [{ side: 'west', kind: 'runestone' }],
  });

  /* --- the ship --------------------------------------------------------------- */
  // Down the room's long axis, north to south, tilted a few degrees the way a hull
  // settles when the earth under one side gives.
  // 4.4 m and centred 10 cm north of the room's middle. At five metres the hull's
  // collider reached z = 2.55 and sat in the south doorway - which on the seed where
  // that is the only door the generator opens is a room nobody can enter.
  const hull = 0.06;
  const keel = -0.1;
  shipHull(room, -0.5, keel, Math.PI / 2 + hull, 4.4);
  mastStump(room, -0.5, keel, 1.35);

  // The rivet rows: two lines of iron in the earth outboard of the surviving
  // strakes, where the planking has rotted away and left only its fastenings. It
  // is the best detail in this room and it costs one small sphere each.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 13; i++) {
      const f = (i + 0.5) / 13 - 0.5;
      const z = keel + f * 4.4;
      const x = -0.5 + s * (1.15 - Math.pow(Math.abs(f) * 2, 3) * 0.7);
      room.geo('ironPale', ball(0.026, 5), poseMatrix([x, 0.02, z]), { castShadow: false, receiveShadow: false });
      if (i % 3 === 0) {
        room.geo('ironDark', ball(0.034, 5), tiltMatrix([x + s * 0.09, 0.015, z + 0.06], [0, i, 0], [1.4, 0.5, 1]), {
          castShadow: false,
          receiveShadow: false,
        });
      }
    }
  }

  /* --- who is in it ------------------------------------------------------------ */
  // Amidships, on a bed of shields laid flat, wrapped in wool rather than linen -
  // and a sword laid along him rather than folded hands. The pose is the culture.
  wrappedBody(room, -0.4, 0.24, keel, Math.PI / 2 + hull, 1.85);
  room.box('ironPale', [0.06, 0.02, 1.05], [-0.28, 0.44, keel], Math.PI / 2 + hull, { tile: 0.3, castShadow: false });
  room.box('timberDark', [0.09, 0.05, 0.2], [-0.28, 0.44, keel - 0.62], Math.PI / 2 + hull, { castShadow: false });
  room.geo('goldPlain', ball(0.05, 6), poseMatrix([-0.28, 0.48, keel - 0.76]), { castShadow: false });
  // The grave goods round him: a cauldron on its side, a whetstone, a heap of
  // silver, and a drinking horn with its mount still on it.
  room.geo('iron', cyl(0.26, 0.2, 0.3, 10), tiltMatrix([0.55, 0.16, 1.5], [Math.PI / 2, 0.6, 0.2]), { tile: 0.4 });
  room.geo('ironDark', ring(0.26, 0.022, 11), tiltMatrix([0.55, 0.3, 1.5], [0.9, 0.6, 0]), { castShadow: false });
  room.geo('bone', cyl(0.05, 0.09, 0.34, 7), tiltMatrix([0.2, 0.55, keel], [1.35, 0.4, 0]), { castShadow: false });
  room.geo('goldPlain', ring(0.09, 0.018, 9), tiltMatrix([0.34, 0.59, keel + 0.08], [1.35, 0.4, 0]), { castShadow: false });

  /* --- the shields ------------------------------------------------------------- */
  // Along the gunwale on the surviving side, overlapping, alternating red and
  // white: the one place in this pack where two saturated colours are allowed.
  for (let i = 0; i < 5; i++) {
    const z = keel - 1.6 + i * 0.8;
    shield(room, 0.66, 0.72 + Math.pow(Math.abs(z - keel) / 2.2, 2.4) * 0.5, z, Math.PI / 2, 0.34, i % 2 === 0, 0.12);
  }
  // Two more that have fallen off it and are lying in the earth.
  shield(room, 1.8, 0.06, -0.9, Math.PI / 2, 0.34, false, Math.PI / 2 - 0.1);
  shield(room, -2.5, 0.05, 1.4, 0.4, 0.32, true, Math.PI / 2 + 0.06);

  /* --- the horse -------------------------------------------------------------- */
  // At the prow, where it was killed. Its skull, its bit, and the ring the reins
  // were tied to: three objects and the whole story of a very bad afternoon.
  horseSkull(room, -0.9, 0.06, -2.7, 1.9, 1.05);
  boneHeap(room, -1.7, -2.9, 0.6, 8);
  room.geo('ironPale', cyl(0.012, 0.012, 0.22, 5), tiltMatrix([-0.55, 0.1, -2.55], [Math.PI / 2, 1.9, 0]), { castShadow: false });
  for (const s of [-1, 1]) {
    room.geo('ironPale', ring(0.05, 0.011, 8), tiltMatrix([-0.55 + s * 0.13, 0.1, -2.5], [0, 1.9, Math.PI / 2]), { castShadow: false });
  }

  /* --- the weapons ------------------------------------------------------------ */
  // Leaning against the stave wall in the corner, where they were stood up rather
  // than laid down: a spear, another spear and an axe.
  haft(room, 3.3, -1.9, -Math.PI / 2, 2.0, false);
  haft(room, 3.35, -1.5, -Math.PI / 2 + 0.2, 1.8, false);
  haft(room, 3.3, 2.3, -Math.PI / 2 - 0.1, 1.7, true);

  /* --- light ------------------------------------------------------------------ */
  // An iron cauldron of coals at the stern and a torch by the door. The oil course
  // on the walls does the rest, and there is nothing cold in this room at all.
  // Clear of the chest anchor's approach at (2.5, 3.15): a brazier is 0.4 m of
  // collider and a container wants 1.6 m across its whole width.
  brazier(room, 1.5, 2.9, true, 10, true);
  sconce(room, 'north', 2.2, 1.9, true, true, 7);

  /* --- the mound -------------------------------------------------------------- */
  // Earth coming through the staves at the far end, and the roots of whatever is
  // growing on top of the mound coming with it.
  room.geo('surface.turf', ball(1.3, 7), tiltMatrix([-3.3, 0.5, -1.2], [0, 0.4, 0], [0.5, 1.1, 1.6]), { tile: 2.0 });
  for (let i = 0; i < 5; i++) {
    strut(
      room,
      'root',
      [-3.5, room.range(1.4, 2.8), room.range(-2.4, 0.2)],
      [-2.6 + room.range(-0.3, 0.3), room.range(0.2, 1.0), room.range(-2.4, 0.4)],
      room.range(0.02, 0.05),
      5,
      { castShadow: false },
    );
  }
  skull(room, -3.0, 0.04, 2.4, room.range(0, 6), 1.0, 'boneDark');
  debris(room, 2.8, 0.4, 0.7, 6);
  debris(room, -2.4, 2.8, 0.6, 5);
  dustMotes(room, -0.5, 1.4, 0.2, 3.0, 16);
  // One shaft of turf-filtered light down the crack the crypt's masons left.
  room.geo('hazeWarm', quad(0.5, 2.6), tiltMatrix([2.6, 1.6, -0.4], [0, 0.5, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
