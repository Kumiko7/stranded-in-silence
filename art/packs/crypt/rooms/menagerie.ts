import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cyl, debris, disc, dustMotes, lampStand, quad, ring, sandDrift, scarabLitter, skull, strut, urn, wrappedBody } from '../kit/props';

/**
 * The Beast Gallery - four thousand wrapped animals in a wall of pigeonholes.
 *
 * Ibises, cats, hawks and shrews, each one bandaged, sealed and stacked in its
 * own hole in a honeycomb of mudbrick that runs from the floor to the roof slabs.
 * On a bier down the middle is the thing they were all offerings to: a crocodile
 * three and a half metres long, wrapped, with its jaw still showing.
 *
 * The room's effect is REPETITION - hundreds of identical small bundles, and one
 * that is far too big. Nothing here is arranged for a player; it is arranged for
 * stocktaking.
 */
export const menagerie: RoomBlueprint = {
  id: 'crypt.menagerie',
  nameKey: 'room.crypt.menagerie',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['necropolis', 'cluttered'],
  anchors: {
    chest: [{ position: [-2.6, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [2.65, 0, 3.15], rotationY: 0 }],
    // Two of them are the two empty pigeonholes in the west stack. An item wants a
    // spot that reads as intentional, and a hole with nothing in it in a wall of
    // holes with something in them is the most intentional spot in the room.
    itemSpawn: [
      { position: [-3.5, 1.08, -1.51] },
      { position: [-3.5, 0.66, -2.35] },
      { position: [1.5, 0, -2.7] },
    ],
    patrolPoint: [
      { position: [0.4, 0, -2.4] },
      { position: [-2.5, 0, 1.2] },
      { position: [2.5, 0, 1.2] },
    ],
    enemySpawn: [{ position: [2.7, 0, -2.8] }],
  },
  build,
};

/**
 * A honeycomb of pigeonholes on a wall, with a small wrapped animal in most of
 * them. The gaps and the varying bundle sizes are the whole read: an even grid of
 * identical shapes is a wine rack.
 */
function honeycomb(room: Room, xFace: number, faceSign: number, z0: number, z1: number, rotationY: number): void {
  // A coarser grid than the first pass: five courses of holes at 52 cm rather
  // than six at 42. Both faces of this run the length of the room, so the pitch
  // is squared into the room's cost - it was two fifths of it.
  const cols = Math.floor((z1 - z0) / 0.52);
  const rows = 5;
  const x = xFace + faceSign * 0.24;
  room.box('surface.mudbrick', [0.48, 2.7, z1 - z0], [x, 0, (z0 + z1) / 2], 0, { tile: 0.9 });
  room.collider({ kind: 'box', center: [x, (z0 + z1) / 2], halfExtents: [0.2, (z1 - z0) / 2 - 0.04] });
  for (let r = 0; r < rows; r++) {
    const y = 0.24 + r * 0.5;
    // The shelf each course stands on, and the ribs between the holes.
    room.box('stoneWarmPale', [0.5, 0.05, z1 - z0], [x, y - 0.05, (z0 + z1) / 2], 0, { tile: 0.5, castShadow: false });
    for (let c = 0; c < cols; c++) {
      const cz = z0 + 0.26 + c * 0.52;
      room.box('surface.mudbrick', [0.5, 0.44, 0.06], [x, y, cz + 0.26], 0, { tile: 0.3, castShadow: false });
      // The dark of the hole. Every one of these is a place something is lying
      // down, and the ones with nothing in them are the ones a player notices.
      room.box('stoneDark', [0.3, 0.4, 0.42], [x - faceSign * 0.16, y, cz], 0, { tile: 0.3, castShadow: false });
      if ((r * 5 + c * 3) % 11 === 0) continue;
      const long = (r + c) % 4 === 0;
      const len = long ? 0.3 : 0.19;
      // A bundle: a tapered body and a bound head, turned a few degrees. Small,
      // and there are eighty of them.
      room.geo('linen', cyl(0.055, 0.075, len, 6), tiltMatrix([x - faceSign * 0.12, y + 0.06, cz], [Math.PI / 2, rotationY + ((c * 7 + r) % 5) * 0.06, 0]), {
        tile: 0.4,
        castShadow: false,
      });
      room.geo('linen', ball(0.06, 6), tiltMatrix([x - faceSign * 0.12 - faceSign * len * 0.55, y + 0.07, cz], [0, rotationY, 0], [0.9, 1, 1.1]), {
        tile: 0.3,
        castShadow: false,
      });
      if (long) {
        // A beak or a tail on the long ones, which is what stops eighty bundles
        // reading as eighty of the same thing.
        room.geo('linen', cyl(0.012, 0.026, 0.12, 5), tiltMatrix([x - faceSign * (0.12 + len * 0.75), y + 0.07, cz], [Math.PI / 2, rotationY, 0.3]), {
          castShadow: false,
        });
      }
      if ((r + c) % 7 === 0) room.geo('goldDim', disc(0.03, 7), tiltMatrix([x - faceSign * 0.28, y + 0.06, cz], [0, rotationY, 0]), { castShadow: false });
    }
  }
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, menagerie);
  room.shell({
    floor: 'sandstone',
    wall: 'mudbrick',
    ceiling: 'slabs',
    dado: 'none',
    lamps: 'oil',
    mouth: 'lintel',
    // The four sons again, and this recess is lit: it is the only wall of this
    // room that is not a wall of holes, so it has to be the one a player reads.
    niches: [{ side: 'south', kind: 'urns', light: true }],
  });

  /* --- the walls of holes ---------------------------------------------------------- */
  // Two stacks, both kept clear of the door lanes on their own wall - the east and
  // west walls can both open, so each stack sits on the north half of its wall.
  honeycomb(room, -3.7, 1, -3.4, -1.2, -Math.PI / 2);
  honeycomb(room, 3.7, -1, -3.4, -1.2, Math.PI / 2);

  /* --- the crocodile --------------------------------------------------------------- */
  // On a bier down the middle of the room, and much too big. It is the one object
  // in here that is not part of a set.
  const bier = 0.5;
  for (const t of [-1.2, 0, 1.2]) {
    room.box('surface.mudbrick', [0.34, bier, 0.9], [t, 0, 1.2], 0.06, { tile: 0.6 });
  }
  room.box('surface.sandstone', [3.4, 0.1, 1.0], [0, bier, 1.2], 0.06, { tile: 0.9 });
  room.collider({ kind: 'box', center: [0, 1.2], halfExtents: [1.66, 0.46], rotationY: 0.06 });
  wrappedBody(room, -0.2, bier + 0.1, 1.2, Math.PI / 2 + 0.06, 2.6);
  // The head end: a long wrapped snout, and the jaw NOT wrapped - the one place
  // the bandaging has come away, and the only reason this reads as a crocodile.
  room.geo('linen', cyl(0.14, 0.2, 0.9, 7), tiltMatrix([1.45, bier + 0.24, 1.15], [Math.PI / 2, 0.06, 0]), { tile: 0.5, castShadow: false });
  room.geo('fleshDry', cyl(0.09, 0.13, 0.5, 6), tiltMatrix([2.05, bier + 0.22, 1.12], [Math.PI / 2, 0.06, 0.06]), { tile: 0.4, castShadow: false });
  room.geo('fleshDry', cyl(0.07, 0.11, 0.46, 6), tiltMatrix([2.0, bier + 0.12, 1.12], [Math.PI / 2, 0.06, -0.16]), { tile: 0.4, castShadow: false });
  for (let i = 0; i < 7; i++) {
    // Teeth. Small, pale, and in two rows, which is all it takes.
    for (const s of [-1, 1]) {
      room.geo('bonePale', cyl(0.008, 0.014, 0.05, 4), poseMatrix([1.85 + i * 0.06, bier + 0.17 + s * 0.02, 1.12 + (s * 0.05)]), { castShadow: false });
    }
  }
  // The cords round the body, and a gilded collar behind the head.
  for (let i = 0; i < 5; i++) {
    room.geo('rope', ring(0.19, 0.02, 10), tiltMatrix([-1.4 + i * 0.6, bier + 0.22, 1.2], [0, 0, Math.PI / 2]), { castShadow: false });
  }
  room.geo('goldDim', ring(0.22, 0.035, 12), tiltMatrix([1.05, bier + 0.24, 1.16], [0, 0, Math.PI / 2]), { castShadow: false });

  /* --- the stock-taking ------------------------------------------------------------ */
  // A jar of resin and a stack of empty pigeonhole plugs at the end of the bier:
  // whoever was doing this had a system and stopped in the middle of it.
  urn(room, -2.6, 0, 2.6, 0.36, true);
  for (let i = 0; i < 5; i++) {
    room.geo('surface.mudbrick', cyl(0.15, 0.15, 0.07, 8), poseMatrix([-2.0, 0.04 + i * 0.07, 2.9]), { tile: 0.3, castShadow: false });
  }
  room.geo('linen', ball(0.26, 8), tiltMatrix([-1.5, 0.02, 2.5], [0, 0.4, 0], [1.2, 0.6, 0.9]), { tile: 0.5, castShadow: false });

  /* --- what got in ---------------------------------------------------------------- */
  // Scarabs, on the floor and in a drift against the bier. Half of them are on
  // their backs with their legs up, which is what makes a player look twice.
  scarabLitter(room, 0.4, -1.4, 1.3, 20);
  scarabLitter(room, -2.4, -0.4, 0.9, 12);
  scarabLitter(room, 2.2, 2.4, 0.8, 10);
  // And what they left of one of the bundles: linen shredded, and the small bones
  // out of it scattered.
  room.geo('linen', quad(0.4, 0.3), tiltMatrix([1.2, 0.015, -1.9], [-Math.PI / 2, 0.6, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 6; i++) {
    strut(room, 'bonePale', [1.0 + room.range(-0.4, 0.4), 0.03, -2.0 + room.range(-0.4, 0.4)], [1.2 + room.range(-0.4, 0.4), 0.03, -1.8 + room.range(-0.4, 0.4)], 0.008, 4, {
      castShadow: false,
    });
  }
  skull(room, 1.35, 0.02, -2.35, room.range(0, 6), 0.55, 'bonePale');

  /* --- light ---------------------------------------------------------------------- */
  // One stand, north of the bier, and the recess is the other. The walls of holes
  // are deliberately left underlit: they are better half seen.
  //
  // NOT at (2.6, -0.2), which is where it started: that is inside the east
  // doorway's 1.2 m, and a lamp stand standing in a doorway seals the room off
  // entirely on the seed where that is the only door the generator opens.
  lampStand(room, 1.5, -2.5, true, 8);

  /* --- the dust ------------------------------------------------------------------- */
  sandDrift(room, 0, -3.0, 1.6, 0);
  debris(room, -1.4, -2.8, 0.6, 6, true);
  dustMotes(room, 0.4, 1.5, 0.6, 2.8, 18);

  return room.finish();
}
