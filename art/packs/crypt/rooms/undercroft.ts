import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bracketFungus, cobweb, cyl, debris, disc, dustMotes, hangingLamp, pillar, pool, puddle, quad, ring, sconce, wrappedBody } from '../kit/props';

/**
 * The Drowned Undercroft - the crypt's lowest floor, and the water knows it.
 *
 * Two brick piers holding up a barrel vault, a sump in the corner that has not
 * drained since the river changed course, and a coffin that floated out of its
 * loculus and has been lying in the middle of the floor ever since.
 *
 * The water is at DECK LEVEL with a raised kerb round it, not sunk into the
 * floor: the shell lays a solid slab per cell and anything below y = 0 is simply
 * behind it (docs/art/ROOM_REVIEW.md §4). A pool with a lip reads as a sump
 * anyway, and a hole does not exist in this engine.
 */
export const undercroft: RoomBlueprint = {
  id: 'crypt.undercroft',
  nameKey: 'room.crypt.undercroft',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['sanctum', 'wet'],
  anchors: {
    locker: [{ position: [-3.15, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-0.5, 0.42, 0.5] },
      { position: [-3.5, 0.83, 2.55] },
      { position: [2.4, 0, -3.0] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.3] },
      { position: [-1.8, 0, 2.4] },
      { position: [2.5, 0, 0.6] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, undercroft);
  room.shell({
    floor: 'flag',
    wall: 'brick',
    ceiling: 'barrel',
    dado: 'stone',
    dadoHeight: 0.85,
    lamps: 'votive',
    mouth: 'gothic',
    // A loculus with the water coming out of it, which is where the coffin in the
    // middle of the floor came from.
    niches: [{ side: 'west', kind: 'loculus' }],
  });

  /* --- the sump ------------------------------------------------------------------- */
  // In the corner, kept out of every door lane. It is faintly lit from under the
  // surface, which is the only light in the room that is not a flame - and the
  // reason is not explained.
  pool(room, 2.5, 2.5, 2.1, 2.1, true);
  // The drain that stopped working, and the grating over it.
  room.geo('ironDark', disc(0.26, 12), tiltMatrix([2.5, 0.125, 2.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 4; i++) {
    room.box('iron', [0.5, 0.02, 0.045], [2.5, 0.125, 2.32 + i * 0.12], 0.2, { castShadow: false, receiveShadow: false });
  }

  /* --- the piers ------------------------------------------------------------------ */
  // Two, on the room's long axis, with the vault springing off them. They are
  // what makes the space feel like it is holding something up.
  pillar(room, -2.3, -0.9, 'cluster', 0.38);
  pillar(room, 1.0, -2.6, 'cluster', 0.36);

  /* --- the coffin ----------------------------------------------------------------- */
  // Floated out, grounded when the water dropped, and opened by the fall. Low
  // enough to read as debris rather than as furniture.
  room.box('timberDark', [1.9, 0.34, 0.72], [-0.5, 0, 0.5], 0.42, { tile: 0.6 });
  room.collider({ kind: 'box', center: [-0.5, 0.5], halfExtents: [0.9, 0.32], rotationY: 0.42 });
  room.box('stoneDark', [1.6, 0.06, 0.5], [-0.5, 0.34, 0.5], 0.42, { tile: 0.4, castShadow: false });
  wrappedBody(room, -0.5, 0.4, 0.5, 0.42, 1.6);
  // The lid, floated off and left leaning on the kerb where the water put it.
  room.box('timberDark', [1.8, 0.09, 0.66], [1.0, 0.34, 1.3], 0.42, { tile: 0.6, castShadow: false });
  room.geo('iron', ring(0.06, 0.014, 8), tiltMatrix([1.5, 0.44, 1.1], [0.4, 0.42, 0]), { castShadow: false });

  /* --- the water everywhere else -------------------------------------------------- */
  // A tide line on the brick at 40 cm, and standing water where the floor dips.
  for (const [side, along, width] of [
    ['north', 2.5, 2.4],
    ['east', -2.6, 2.2],
    ['south', -2.4, 2.4],
  ] as const) {
    const yaw = side === 'north' ? Math.PI : side === 'east' ? Math.PI / 2 : 0;
    const x = side === 'north' ? -along : side === 'east' ? 3.66 : along;
    const z = side === 'north' ? -3.66 : side === 'east' ? -along : 3.66;
    room.geo('moss', quad(width, 0.34), poseMatrix([x, 0.22, z], yaw + Math.PI), { tile: 0.6, castShadow: false, receiveShadow: false });
  }
  puddle(room, -1.6, -2.4, 0.7);
  puddle(room, 0.4, 3.0, 0.55);
  puddle(room, -2.9, 1.6, 0.5);

  /* --- what grows here ------------------------------------------------------------ */
  bracketFungus(room, 'east', 2.4, 0.5, 3);
  bracketFungus(room, 'north', -2.9, 0.7, 2);
  room.geo('moss', disc(0.9, 12), tiltMatrix([-3.2, 0.014, 0.4], [-Math.PI / 2, 0.6, 0]), { castShadow: false, receiveShadow: false });

  /* --- light ---------------------------------------------------------------------- */
  // One lantern on a chain over the coffin - the only thing in the room that
  // moves - and a dead sconce on the far wall so the corner is not black.
  hangingLamp(room, -0.5, -0.4, 1.15, true, 7);
  sconce(room, 'south', 2.7, 1.9, true, false, 5);

  /* --- decay ---------------------------------------------------------------------- */
  // A shelf of what was salvaged and then abandoned, and the brick that came down
  // out of the vault when the water got into it.
  // Kept south of z = 1.8: the loculus takes the middle of this wall, and a plank
  // across a niche recess is a plank across the thing the niche is for.
  room.box('timber', [1.2, 0.05, 0.3], [-3.53, 0.78, 2.4], -Math.PI / 2, { tile: 0.5, castShadow: false });
  room.geo('lead', cyl(0.07, 0.06, 0.18, 8), poseMatrix([-3.5, 0.83, 2.0]), { castShadow: false });
  debris(room, 2.0, -1.4, 0.75, 8);
  debris(room, -2.6, 2.9, 0.6, 6);
  for (let i = 0; i < 5; i++) {
    room.geo('surface.brick', ball(room.range(0.1, 0.2), 6), tiltMatrix([room.range(1.4, 2.6), 0.05, room.range(-2.2, -0.8)], [0, i, 0], [1.3, 0.6, 1.1]), {
      tile: 0.4,
      castShadow: false,
    });
  }
  cobweb(room, -3.2, 2.6, -3.2, 0.9, 0.5);
  dustMotes(room, 0, 1.4, 0.4, 2.4, 14);

  return room.finish();
}
