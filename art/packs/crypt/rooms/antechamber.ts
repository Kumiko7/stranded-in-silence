import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, canopic, cyl, debris, dustMotes, dustShaft, funeraryBoat, lampStand, quad, sandDrift, shabtiRanks, statue } from '../kit/props';

/**
 * The Antechamber - four thousand years older than the crypt above it, and it
 * shows.
 *
 * Painted plaster in registers on every wall, sand coming in under the doors, a
 * false door in the south wall for the dead to use, and a jackal-headed sentinel
 * sitting on a shrine chest watching the one that the living use.
 *
 * The Necropolis half of the map is WARM: ochre sandstone, gold, oil lamps, dry
 * air. Walking in from the Sanctum's grey limestone and cold votive candles
 * should register as a change in temperature before a single prop is read.
 */
export const antechamber: RoomBlueprint = {
  id: 'crypt.antechamber',
  nameKey: 'room.crypt.antechamber',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 11,
  tags: ['necropolis', 'entrance', 'open'],
  anchors: {
    chest: [{ position: [2.55, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.9, 0.92, 3.05] },
      { position: [-2.35, 0.92, 2.6] },
      { position: [3.0, 0, -2.9] },
    ],
    playerSpawn: [
      { position: [-1.9, 0, 2.1], rotationY: 0 },
      { position: [-0.65, 0, 2.5], rotationY: 0 },
      { position: [0.65, 0, 2.5], rotationY: 0 },
      { position: [1.9, 0, 2.1], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, -2.3] },
      { position: [-2.5, 0, 0.2] },
      { position: [2.5, 0, 0.6] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, antechamber);
  room.shell({
    floor: 'sand',
    wall: 'frieze',
    ceiling: 'stars',
    dado: 'glyph',
    dadoHeight: 1.15,
    lamps: 'oil',
    mouth: 'lintel',
    // The false door: a stela the dead are supposed to come and go through, with
    // its offering slab still in front of it. Nothing goes through it.
    niches: [{ side: 'south', kind: 'stela' }],
  });

  /* --- the sentinel ---------------------------------------------------------------- */
  // On the diagonal from the north doorway, so it is the first thing seen from the
  // most likely approach and it is looking straight back.
  statue(room, -2.75, -2.65, room.range(0.5, 0.85), 'sentinel', 1.0);

  /* --- the offering shelf ---------------------------------------------------------- */
  // A low mastaba bench along the south-west, with the jars and the boats on it.
  room.solid('surface.sandstone', [1.9, 0.86, 0.8], [-2.55, 0, 2.8], 0, { tile: 0.9 });
  room.box('stoneWarmPale', [2.0, 0.06, 0.9], [-2.55, 0.86, 2.8], 0, { tile: 0.6, castShadow: false });
  canopic(room, -3.3, 0.92, 2.6, 1, Math.PI, 0.38);
  canopic(room, -3.25, 0.92, 3.1, 2, Math.PI, 0.36);
  funeraryBoat(room, -1.9, 0.92, 2.85, 0.4, 0.9);
  shabtiRanks(room, 1.2, 0, 3.05, 2, 5, 0, 0.19);

  /* --- the light wells ------------------------------------------------------------- */
  // Two shafts of dry hot light down out of the corbelled roof - the dynasty's
  // architects left them, and they are why this room is the brightest in the map.
  dustShaft(room, 1.4, -1.6, 3.3, 0.05, 1.1, true);
  dustShaft(room, -1.2, 0.9, 3.3, 0.05, 0.8, true);
  for (const [x, z, r] of [
    [1.4, -1.6, 0.6],
    [-1.2, 0.9, 0.45],
  ] as const) {
    // The shaft's mouth in the ceiling: a stepped opening, so the light has
    // somewhere to have come from.
    for (let i = 0; i < 3; i++) {
      room.geo('stoneDark', cyl(r + i * 0.09, r + i * 0.09, 0.06, 4), poseMatrix([x, 3.34 - i * 0.07, z]), { tile: 0.4, castShadow: false });
    }
    room.geo('wash.gold', ball(r * 0.9, 8), tiltMatrix([x, 3.2, z], [0, 0.7, 0], [1, 0.3, 1]), { castShadow: false, receiveShadow: false });
  }

  /* --- light ----------------------------------------------------------------------- */
  // Two oil lamps on stands, both lit. Gold rather than amber, low rather than at
  // head height: it is the floor and the gilding this room wants lit.
  lampStand(room, 2.7, -2.6, true, 8);
  lampStand(room, -2.9, 1.0, true, 7);

  /* --- the sand -------------------------------------------------------------------- */
  // Coming in under the north door and drifted against everything on that side.
  sandDrift(room, 0, -3.0, 1.9, 0);
  sandDrift(room, -1.9, -2.4, 1.2, 0.6);
  sandDrift(room, 2.4, 1.9, 1.4, 2.2);
  debris(room, 3.0, -0.6, 0.6, 6, true);
  debris(room, -0.6, 3.0, 0.55, 5, true);

  /* --- the paint that is left ------------------------------------------------------ */
  // A band of cartouches over the dado on the two walls a player faces on the way
  // in. Tilted a degree or two each, because nothing here was set out by machine.
  for (let i = 0; i < 3; i++) {
    room.geo('surface.glyph', quad(0.5, 0.9), tiltMatrix([-3.66, 2.15, -2.4 + i * 1.3], [0, Math.PI / 2, room.range(-0.03, 0.03)]), {
      tile: 0.7,
      castShadow: false,
    });
    room.geo('goldDim', ball(0.05, 6), poseMatrix([-3.6, 2.66, -2.4 + i * 1.3]), { castShadow: false });
  }
  dustMotes(room, 1.4, 1.7, -1.6, 1.4, 16);
  dustMotes(room, -1.2, 1.5, 0.9, 1.1, 12);

  return room.finish();
}
