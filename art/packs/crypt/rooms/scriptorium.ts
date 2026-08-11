import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bench, bookPile, candleStand, cobweb, cyl, debris, dustMotes, lectern, quad, sconce, skull, wallShelf } from '../kit/props';

/**
 * The Obit Room - where the Order wrote down who had died, until it stopped.
 *
 * Racks of mouldering registers, a lectern with the last entry still open on it,
 * and a desk with a skull on the corner where the scribe kept it to remind
 * himself what he was doing. The south wall is a lattice of skulls behind bone
 * bars, which is what the room is FOR: it is the index.
 *
 * The one room in the pack where the horror is bureaucratic. Forty thousand
 * people, and somebody had to write all of it down.
 */
export const scriptorium: RoomBlueprint = {
  id: 'crypt.scriptorium',
  nameKey: 'room.crypt.scriptorium',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['sanctum', 'cluttered'],
  anchors: {
    chest: [{ position: [-2.55, 0, 3.1], rotationY: 0 }],
    locker: [{ position: [2.6, 0, -3.15], rotationY: Math.PI }],
    itemSpawn: [
      { position: [0.75, 0.92, 2.5] },
      { position: [-0.9, 1.16, -1.5] },
      { position: [-3.42, 1.71, 2.0] },
      { position: [2.6, 0.92, 2.2] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.4] },
      { position: [-2.2, 0, 0.2] },
      { position: [1.2, 0, 1.2] },
    ],
    enemySpawn: [{ position: [-3.0, 0, -2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, scriptorium);
  room.shell({
    floor: 'flag',
    wall: 'plaster',
    ceiling: 'beams',
    dado: 'inscription',
    dadoHeight: 1.2,
    lamps: 'votive',
    mouth: 'gothic',
    // The index: the names on the wall, and behind them the people. It is not lit
    // - a player finds it by walking into it, which is the correct way round.
    niches: [{ side: 'south', kind: 'ossuary' }],
  });

  /* --- the writing desk --------------------------------------------------------- */
  // Set at an angle to the room and to the light, the way a desk somebody chose
  // the position of always is.
  bench(room, 0.75, 2.35, 0.14, 2.2, 0.85);
  bookPile(room, 0.0, 0.92, 2.3, 4, 0.2);
  bookPile(room, 1.5, 0.92, 2.45, 2, -0.4);
  // The scribe's skull, kept on the corner of his own desk.
  skull(room, 1.62, 0.92, 2.1, room.range(2.4, 3.2), 1.0, 'boneDark');
  // An inkhorn, a knife and a rule, all of them a single small shape - a desk
  // reads as used from three things on it, not from twelve.
  room.geo('ironDark', cyl(0.035, 0.045, 0.11, 8), poseMatrix([0.55, 0.97, 2.05]), { castShadow: false });
  room.geo('ironPale', cyl(0.006, 0.006, 0.22, 5), tiltMatrix([0.9, 0.94, 2.02], [Math.PI / 2, 0.6, 0]), { castShadow: false });
  room.box('parchment', [0.34, 0.008, 0.26], [0.35, 0.925, 2.05], 0.24, { tile: 0.3, castShadow: false });

  /* --- the racks ---------------------------------------------------------------- */
  // Registers by the yard, in three tiers on the west wall - and kept clear of
  // the middle of it, because the generator may open that wall and a shelf across
  // a doorway is the one thing no collider check would catch.
  //
  // Everything on them sits at x = -3.42, hard against the plaster: `wallShelf`
  // insets the plank 0.16 m from a face at -3.7 (ROOM_FORMAT.md §2.1.1).
  for (let i = 0; i < 3; i++) {
    wallShelf(room, 'west', 2.0, 1.06 + i * 0.6, 1.5);
  }
  for (let i = 0; i < 3; i++) {
    const y = 1.11 + i * 0.6;
    bookPile(room, -3.42, y, 1.45 + i * 0.12, 3 + (i % 2), -Math.PI / 2);
    // Rolls stacked on their sides, which is how a rack of documents reads.
    for (let k = 0; k < 3; k++) {
      room.geo('parchment', cyl(0.045, 0.045, 0.34, 8), tiltMatrix([-3.42, y + 0.05 + k * 0.09, 2.6 - k * 0.06], [Math.PI / 2, 0, 0]), {
        tile: 0.3,
        castShadow: false,
      });
    }
  }

  /* --- the lectern -------------------------------------------------------------- */
  // In the middle of the floor, turned toward the wall of names. The last entry
  // is open on it and there is no candle beside it any more.
  lectern(room, -0.9, -1.5, room.range(2.6, 3.4));
  candleStand(room, 0.3, -1.9, true, 1.15, 6);

  /* --- a second desk, abandoned earlier ----------------------------------------- */
  // Pushed back to z = 2.2 so it stays out of the east doorway's 1.2 m.
  bench(room, 2.65, 2.2, Math.PI / 2 + 0.1, 1.6, 0.8);
  bookPile(room, 2.6, 0.92, 1.7, 5, 1.4);
  room.geo('parchment', quad(0.3, 0.4), tiltMatrix([2.2, 0.02, 0.4], [-Math.PI / 2, 0.7, 0]), { castShadow: false, receiveShadow: false });
  room.geo('parchment', quad(0.26, 0.34), tiltMatrix([1.6, 0.02, -0.5], [-Math.PI / 2, 2.1, 0]), { castShadow: false, receiveShadow: false });

  /* --- decay -------------------------------------------------------------------- */
  sconce(room, 'north', -2.7, 1.95, true, false, 5);
  debris(room, -2.9, 2.6, 0.65, 6);
  cobweb(room, -3.2, 2.7, -3.1, 1.0, 0.4);
  cobweb(room, 3.2, 2.8, -3.2, 0.9, 2.4);
  dustMotes(room, 0.3, 1.5, 0.4, 2.4, 20);

  return room.finish();
}
