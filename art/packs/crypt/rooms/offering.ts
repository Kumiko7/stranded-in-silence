import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, canopic, coinHoard, cyl, debris, disc, dustMotes, funeraryBoat, lampStand, quad, sandDrift, shabtiRanks, urn } from '../kit/props';

/**
 * The Offering Chamber - everything a king was going to need, stacked in rows.
 *
 * Four hundred sealed jars in mudbrick racks, ranks of servant figures waiting to
 * be told what to do, two model boats to get him across, and a heap of gold in
 * the corner that the robbers did not manage to carry.
 *
 * The room's idea is INVENTORY: it is frightening because it is so carefully
 * organised, and because every one of those jars was sealed by somebody who
 * expected it to be opened by the dead.
 */
export const offering: RoomBlueprint = {
  id: 'crypt.offering',
  nameKey: 'room.crypt.offering',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['necropolis', 'cluttered', 'treasure'],
  anchors: {
    chest: [{ position: [-3.15, 0, -1.6], rotationY: -Math.PI / 2 }],
    // North of the shabti bench: it reaches z = 2.72, and a locker wants 1.2 m of
    // clear floor across its whole width to step into.
    locker: [{ position: [-3.15, 0, 1.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [1.4, 0.08, -2.4] },
      { position: [-1.45, 0.68, 2.8] },
      { position: [3.0, 0, -2.0] },
    ],
    patrolPoint: [
      { position: [0.2, 0, -1.6] },
      { position: [-1.6, 0, 0.6] },
      { position: [2.5, 0, 2.4] },
    ],
    treasure: [{ position: [2.9, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, offering);
  room.shell({
    floor: 'sandstone',
    wall: 'mudbrick',
    ceiling: 'beams',
    dado: 'glyph',
    dadoHeight: 0.85,
    lamps: 'oil',
    mouth: 'lintel',
    niches: [{ side: 'west', kind: 'urns', light: true }],
  });

  /* --- the jar racks ---------------------------------------------------------------- */
  // Two tiers of mudbrick pigeonholes along the north wall, kept clear of the
  // middle of it. Every hole has a jar in it except the ones that do not, and the
  // empty ones are the interesting part.
  const holes = 6;
  for (const side of [-1, 1] as const) {
    const x0 = side * 2.35;
    room.solid('surface.mudbrick', [2.1, 1.6, 0.85], [x0, 0, -3.15], 0, { tile: 0.9 });
    for (let tier = 0; tier < 2; tier++) {
      const y = 0.28 + tier * 0.66;
      room.box('stoneWarmPale', [2.2, 0.07, 0.95], [x0, y - 0.07, -3.15], 0, { tile: 0.6, castShadow: false });
      for (let i = 0; i < holes / 2; i++) {
        const x = x0 - 0.7 + i * 0.7;
        // The divider between holes: what makes a rack a rack.
        room.box('surface.mudbrick', [0.09, 0.6, 0.8], [x + 0.35, y, -3.15], 0, { tile: 0.4, castShadow: false });
        if ((i * 3 + tier * 5 + (side > 0 ? 1 : 0)) % 7 === 0) continue; // an empty hole
        room.geo('stoneWarm', cyl(0.16, 0.12, 0.5, 10), poseMatrix([x, y + 0.25, -3.15]), { tile: 0.4, castShadow: false });
        // A mud seal over the mouth, stamped: this is what says "sealed" rather
        // than "stacked".
        room.geo('surface.mudbrick', ball(0.15, 8), tiltMatrix([x, y + 0.5, -3.15], [0, i, 0], [1, 0.55, 1]), { tile: 0.3, castShadow: false });
        if (i % 2 === 0) room.geo('goldDim', disc(0.055, 8), tiltMatrix([x, y + 0.56, -3.15], [-Math.PI / 2, 0.4, 0]), { castShadow: false, receiveShadow: false });
      }
    }
  }
  // One rack has come down, and its jars are in pieces on the floor under it.
  for (let i = 0; i < 7; i++) {
    room.geo('stoneWarm', ball(room.range(0.07, 0.16), 6), tiltMatrix([1.4 + room.range(-0.7, 0.7), 0.05, -2.4 + room.range(-0.2, 0.3)], [0, i, 0], [1.4, 0.4, 1.1]), {
      tile: 0.3,
      castShadow: false,
    });
  }
  room.geo('sandLoose', disc(0.9, 12), tiltMatrix([1.4, 0.013, -2.4], [-Math.PI / 2, 0.5, 0]), { castShadow: false, receiveShadow: false });

  /* --- the servants ----------------------------------------------------------------- */
  // A low bench along the south wall with the shabti on it in ranks, and the boats
  // at the end of the row where somebody put them down.
  // Stopped at x = -1.25: the generator may open the south wall, and a bench that
  // reached the middle of it would sit squarely in the doorway.
  room.solid('surface.mudbrick', [2.3, 0.62, 0.85], [-2.4, 0, 3.1], 0, { tile: 0.9 });
  room.box('stoneWarmPale', [2.4, 0.06, 0.95], [-2.4, 0.62, 3.1], 0, { tile: 0.6, castShadow: false });
  shabtiRanks(room, -2.9, 0.68, 3.05, 3, 5, 0, 0.2);
  funeraryBoat(room, -1.7, 0.68, 3.05, 0.2, 0.95);
  canopic(room, -1.45, 0.68, 3.28, 3, 0, 0.34);

  /* --- what the robbers left -------------------------------------------------------- */
  // In the corner furthest from the door, under a broken lid. Low and wide - gold
  // is the loudest material in the map and a heap of it at chest height reads as
  // popcorn.
  coinHoard(room, 2.9, 2.75, 0.6);
  room.geo('surface.sandstone', ball(0.75, 8), tiltMatrix([2.3, 0.16, 2.0], [0.24, 0.5, 0.18], [1.5, 0.12, 0.85]), { tile: 0.9, castShadow: false });
  urn(room, 3.3, 0, 1.6, 0.42, true);
  urn(room, 2.2, 0, 3.3, 0.34, true);

  /* --- light ------------------------------------------------------------------------ */
  // The recess of jars is one, and a single stand in the middle of the floor is the
  // other. Both gold: this half of the map has no cold light in it at all.
  lampStand(room, 0.4, 0.2, true, 8);

  /* --- the sand --------------------------------------------------------------------- */
  sandDrift(room, 3.0, -1.8, 1.3, 0.4);
  sandDrift(room, -2.6, -0.4, 1.0, 2.0);
  debris(room, -0.4, -1.0, 0.6, 6, true);
  dustMotes(room, 0.4, 1.5, 0.2, 2.6, 18);

  return room.finish();
}
