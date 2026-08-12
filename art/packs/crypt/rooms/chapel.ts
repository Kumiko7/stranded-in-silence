import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { altar, ball, bookPile, candleStand, censer, cobweb, cyl, debris, dustMotes, pew, quad, sconce, statue, wrappedBody } from '../kit/props';

/**
 * The Burial Chapel - the last room above ground, and it knows it.
 *
 * A stained lancet in the west wall is the only daylight in the whole map, and
 * everything in here is arranged to face it: an altar under the glass, two stone
 * benches, and a bier standing in the aisle with somebody still on it.
 *
 * The window is the point. It is tuned well DOWN against the candles - the
 * moment a window is brighter than the flames in the room, the room stops being
 * a crypt and becomes a room with a television in it.
 */
export const chapel: RoomBlueprint = {
  id: 'crypt.chapel',
  nameKey: 'room.crypt.chapel',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['sanctum', 'entrance', 'holy'],
  anchors: {
    chest: [{ position: [-2.6, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.35, 1.05, -0.55] },
      { position: [1.6, 0.55, -1.45] },
      { position: [-2.9, 0.7, -1.95] },
      { position: [3.0, 0, -2.9] },
    ],
    playerSpawn: [
      { position: [2.85, 0, -2.5], rotationY: Math.PI / 2 },
      { position: [2.85, 0, 2.5], rotationY: Math.PI / 2 },
      { position: [1.9, 0, -3.0], rotationY: Math.PI / 2 },
      { position: [1.9, 0, 3.0], rotationY: Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [-1.6, 0, -2.4] },
      { position: [-1.6, 0, 2.4] },
      { position: [2.6, 0, 0] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, chapel);
  room.shell({
    floor: 'slab',
    wall: 'plaster',
    ceiling: 'groin',
    dado: 'inscription',
    dadoHeight: 1.15,
    lamps: 'votive',
    mouth: 'gothic',
    // The lancet carries the room. It is the only niche in the pack with a real
    // light behind it, and the shell splays the reveal so the light spreads
    // rather than arriving as a slot.
    niches: [{ side: 'west', kind: 'lancet', light: true }],
  });

  /* --- the altar end ----------------------------------------------------------- */
  altar(room, -2.55, 0, -Math.PI / 2, 1.8);
  // The credence shelf beside it, and the book that was left open on it.
  room.solid('stonePale', [0.5, 0.68, 0.9], [-2.9, 0, -1.9], 0, { tile: 0.5 });
  bookPile(room, -2.9, 0.68, -1.9, 2, 0.4);
  // Kept off the chest's approach: a container wants 1.6 m clear in front of it
  // and the validator walks a player across the whole width of it.
  statue(room, -3.05, -2.95, 1.9, 'saint', 0.95);

  /* --- the nave ----------------------------------------------------------------- */
  // Two benches facing the altar, pulled clear of every door lane: the generator
  // may open north, east or south, and each of those wants 1.2 m (ROOM_FORMAT.md
  // §3 rule 2).
  pew(room, 1.6, -1.4, Math.PI / 2, 1.8);
  pew(room, 1.6, 1.4, Math.PI / 2, 1.8);

  // The bier, in the aisle, with a body on it under a pall. Somebody set this
  // down here and did not come back for it.
  const bierY = 0.62;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      room.box('timberDark', [0.1, bierY, 0.1], [-0.4 + s * 0.85, 0, 0.4 + t * 0.3], 0, { tile: 0.3, castShadow: false });
    }
  }
  room.box('timber', [2.1, 0.08, 0.8], [-0.4, bierY, 0.4], 0, { tile: 0.5 });
  room.collider({ kind: 'box', center: [-0.4, 0.4], halfExtents: [1.0, 0.36] });
  wrappedBody(room, -0.4, bierY + 0.08, 0.4, 0, 1.75);
  // The pall over the legs, hanging off the side of the bier.
  room.geo('velvet', quad(1.1, 0.6), tiltMatrix([-0.9, bierY - 0.2, 0.82], [0.1, 0, 0]), { tile: 0.6, castShadow: false, receiveShadow: false });

  /* --- light -------------------------------------------------------------------- */
  // One stand at the head of the bier. The window does the rest, and the votive
  // course does the corners.
  candleStand(room, 1.0, -0.2, true, 1.2, 6);
  sconce(room, 'south', -2.7, 1.95, false);
  sconce(room, 'north', 2.7, 1.95, false);
  censer(room, 0.6, 2.4, 1.3);

  /* --- the fabric --------------------------------------------------------------- */
  // A run of memorial plaques on the plaster over the dado, tilted a few degrees
  // each: nothing in this place is level.
  for (let i = 0; i < 3; i++) {
    const z = -2.2 + i * 2.2;
    room.geo('surface.inscription', quad(0.62, 0.44), tiltMatrix([3.66, 1.9, z], [0, -Math.PI / 2, room.range(-0.04, 0.04)]), {
      tile: 0.5,
      castShadow: false,
    });
    room.geo('stonePale', ball(0.06, 6), poseMatrix([3.62, 2.18, z]), { castShadow: false });
  }
  debris(room, -3.1, -2.9, 0.6, 6);
  cobweb(room, 3.2, 2.9, -3.2, 0.9, 1.1);
  room.geo('cobweb', cyl(0.02, 0.02, 1.4, 4), poseMatrix([-3.4, 2.6, -3.2]), { castShadow: false, receiveShadow: false });
  dustMotes(room, -1.6, 1.6, 0, 2.0, 20);

  return room.finish();
}
