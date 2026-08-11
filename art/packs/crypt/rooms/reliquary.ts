import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bookPile, candleStand, coinHoard, cobweb, cyl, debris, dustMotes, quad, reliquary as reliquaryProp, ring, urn, wallShelf } from '../kit/props';

/**
 * The Reliquary - two doors, one saint, and everything the Order was given.
 *
 * The room the whole crypt was built to protect: a gilded casket on a pillar
 * with a finger bone behind crystal, a heap of plate and coin nobody has counted
 * since the last abbot, and a wall of lead urns holding the rest of him.
 *
 * Gold is the loudest material in the map, so the hoard is kept LOW and wide and
 * there is exactly one tall gold object in the room. A heap of bright spheres at
 * chest height reads as popcorn.
 */
export const reliquary: RoomBlueprint = {
  id: 'crypt.reliquary',
  nameKey: 'room.crypt.reliquary',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south', 'east'),
  weight: 7,
  tags: ['sanctum', 'treasure', 'holy'],
  anchors: {
    chest: [
      { position: [-3.15, 0, 2.5], rotationY: -Math.PI / 2 },
      { position: [2.55, 0, 3.15], rotationY: 0 },
    ],
    itemSpawn: [
      { position: [-1.2, 1.02, -1.2] },
      { position: [-3.48, 1.47, 0.05] },
      { position: [2.3, 0.12, -2.6] },
    ],
    patrolPoint: [
      { position: [0.4, 0, -2.2] },
      { position: [-2.4, 0, 1.2] },
      { position: [2.4, 0, 1.6] },
    ],
    treasure: [
      { position: [2.85, 0, -2.95] },
      { position: [-2.5, 0, -0.4] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, reliquary);
  room.shell({
    floor: 'slab',
    wall: 'ashlar',
    ceiling: 'groin',
    dado: 'gilt',
    dadoHeight: 0.8,
    lamps: 'votive',
    mouth: 'gothic',
    niches: [
      // The urns are lit: it is the only wall in the room that has to read from
      // the doorway, and what it says is "there are a lot of these".
      { side: 'north', kind: 'urns', light: true },
      { side: 'west', kind: 'effigy' },
    ],
  });

  /* --- the relic ---------------------------------------------------------------- */
  // On its own pillar, off the room's centre line so it is not the first thing a
  // player walks into, and turned to face the corner the doors are in.
  reliquaryProp(room, -1.2, -1.2, room.range(0.5, 0.9), 1.0);

  // The rail round it: four short posts and a rope. It is the one object in the
  // crypt somebody was still protecting.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const px = -1.2 + Math.cos(a) * 0.95;
    const pz = -1.2 + Math.sin(a) * 0.95;
    room.geo('ironDark', cyl(0.026, 0.032, 0.72, 6), poseMatrix([px, 0.36, pz]), { tile: 0.3, castShadow: false });
    room.geo('brass', ball(0.045, 6), poseMatrix([px, 0.75, pz]), { castShadow: false });
    // The rope between this post and the next, sagging.
    const b = ((i + 1) / 4) * Math.PI * 2 + 0.78;
    const qx = -1.2 + Math.cos(b) * 0.95;
    const qz = -1.2 + Math.sin(b) * 0.95;
    room.geo('rope', cyl(0.016, 0.016, Math.hypot(qx - px, qz - pz), 5), tiltMatrix([(px + qx) / 2, 0.6, (pz + qz) / 2], [Math.PI / 2, Math.atan2(qx - px, qz - pz), 0]), {
      tile: 0.3,
      castShadow: false,
    });
  }

  /* --- the hoard ----------------------------------------------------------------- */
  // Not displayed - dumped. Two heaps in a corner with a broken crate over one of
  // them, because whoever put it here was in a hurry.
  coinHoard(room, 2.3, -2.6, 0.62);
  coinHoard(room, 3.0, -1.5, 0.34);
  room.box('timberDark', [0.9, 0.42, 0.7], [1.5, 0, -3.1], 0.4, { tile: 0.5 });
  room.collider({ kind: 'box', center: [1.5, -3.1], halfExtents: [0.42, 0.32], rotationY: 0.4 });
  for (let i = 0; i < 4; i++) {
    room.geo('goldPlain', cyl(0.045, 0.045, 0.012, 8), tiltMatrix([1.5 + room.range(-0.5, 0.5), 0.43, -3.1 + room.range(-0.3, 0.3)], [room.range(0, 1.2), room.range(0, 3), 0]), {
      castShadow: false,
    });
  }

  /* --- the west wall ------------------------------------------------------------- */
  // A shelf of what the urns would not hold, and the register of who is in them.
  //
  // Everything on it sits at x = -3.48, not -3.0: `wallShelf` insets the plank
  // 0.16 m from a wall face at -3.7, so the shelf top is right against the
  // masonry. Pairing a wall fitting with an anchor half a metre out into the room
  // is the one mistake this pack's helpers cannot catch (ROOM_FORMAT.md §2.1.1).
  wallShelf(room, 'west', -0.6, 1.42, 1.5);
  urn(room, -3.48, 1.47, -1.05, 0.3);
  urn(room, -3.48, 1.47, -0.2, 0.26);
  bookPile(room, -3.48, 1.47, 0.55, 3, -Math.PI / 2);

  /* --- light --------------------------------------------------------------------- */
  candleStand(room, 0.6, 1.9, true, 1.25, 7);

  /* --- decay --------------------------------------------------------------------- */
  // Nothing has been dusted. The gilt dado is failing in sheets and there is
  // plaster on top of the money.
  debris(room, -2.6, -2.9, 0.7, 7);
  debris(room, 0.4, 3.0, 0.6, 6);
  cobweb(room, -3.2, 2.8, -3.2, 1.0, 0.5);
  cobweb(room, 3.2, 2.9, 3.2, 0.8, 2.1);
  room.geo('cobweb', quad(1.6, 0.9), tiltMatrix([-1.2, 2.3, -1.2], [0.9, 0.6, 0.2]), { castShadow: false, receiveShadow: false });
  room.geo('ash', ring(0.9, 0.06, 14), tiltMatrix([-1.2, 0.014, -1.2], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  dustMotes(room, -1.2, 1.5, -1.2, 1.6, 18);

  return room.finish();
}
