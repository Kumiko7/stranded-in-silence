import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, cyl, drools, fleshFolds, lumenPod, polyps, strut } from '../kit/props';

/**
 * The Loom - a room strung like an instrument.
 *
 * Twenty-odd tendons run floor to ceiling under tension, each anchored in a
 * knuckle of bone at both ends, and the whole lattice leans one way as if the
 * beast is holding a pose. You can walk between them; you cannot see through
 * them; and the two anchor blocks are the only cover in the room.
 */
export const sinew: RoomBlueprint = {
  id: 'viscera.sinew',
  nameKey: 'room.viscera.sinew',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['wet', 'blind'],
  anchors: {
    locker: [{ position: [-3.3, 0, -2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.9, 1.02, -2.7] },
      { position: [-2.6, 0.0, 3.0] },
      { position: [1.4, 0.0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.8, 0, 2.2] },
      { position: [2.2, 0, 1.0] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, sinew);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'cartilage', wall: 'muscle', ceiling: 'sinew', mouth: 'sphincter', ridge: true });

  /**
   * The warp. Every cord leans the same way, which is what makes the lattice
   * read as tension rather than as scaffolding - and none of them stands in a
   * door lane, because a cord you cannot walk past is a cord that strands you.
   */
  const cords: readonly (readonly [number, number])[] = [
    [-2.9, -2.6],
    [-2.2, -1.5],
    [-1.5, -2.9],
    [-2.6, 0.3],
    [-1.9, 1.6],
    [-2.8, 2.4],
    [1.6, -2.8],
    [2.4, -1.7],
    [3.0, -0.4],
    [1.8, 0.6],
    [2.6, 1.9],
    [1.5, 2.7],
    [3.1, 3.0],
    [-0.2, 2.6],
    [0.6, -2.4],
  ];
  for (const [x, z] of cords) {
    const lean = 0.42;
    const r = 0.05 + ((Math.abs(x * 7 + z * 3) | 0) % 4) * 0.014;
    strut(room, 'tendon', [x, 0, z], [x + lean, ceilingHeight, z - lean * 0.4], r, 6, { tile: 0.7 });
    // Anchor knuckles at both ends, and a wrap of muscle a third of the way up.
    room.geo('bonePale', ball(r * 2.6, 8), tiltMatrix([x, 0.04, z], [0, 0, 0], [1.4, 0.6, 1.4]), { tile: 0.4 });
    room.geo('bonePale', ball(r * 2.4, 8), tiltMatrix([x + lean, ceilingHeight - 0.05, z - lean * 0.4], [0, 0, 0], [1.3, 0.6, 1.3]), {
      tile: 0.4,
    });
    room.geo(
      'meat',
      cyl(r * 1.9, r * 1.6, 0.5, 7),
      tiltMatrix([x + lean * 0.35, ceilingHeight * 0.35, z - lean * 0.14], [0, 0, -0.4]),
      { tile: 0.4 },
    );
  }

  // Two anchor blocks: bone knuckles the whole lattice pulls against, and the
  // only two things in the room you can put your back to.
  room.solid('bone', [1.3, 1.05, 1.0], [2.9, 0, -2.7], 0.2, { tile: 1.0 });
  room.geo('bonePale', ball(0.42, 10), tiltMatrix([2.9, 1.05, -2.7], [0, 0.2, 0], [1.6, 0.4, 1.3]), { tile: 0.5 });
  room.solid('bone', [1.1, 0.75, 1.1], [-1.0, 0, -3.1], -0.3, { tile: 1.0 });

  fleshFolds(room, 'east', 2.2, 2.0, 4);
  fleshFolds(room, 'north', 1.2, 2.2, 5);
  polyps(room, 0.4, 0, 1.4, 0.7, 8, true);
  drools(room, -0.8, -1.0, 1.6, 8);
  boneDebris(room, -2.4, 3.0, 1.0, 9);

  // Two small pods, low and wide apart, so the cords throw long shadows in both
  // directions and the lattice never resolves into a single flat screen.
  lumenPod(room, [-3.25, 1.15, -1.9], 0.2, true, true, 8);
  room.solid('meat', [0.5, 1.15, 0.7], [-3.4, 0, -1.9], 0, { tile: 0.7 });
  lumenPod(room, [3.3, 1.9, 2.4], 0.17, true, false, 6);
  room.geo('meatPale', cyl(0.12, 0.2, 1.9, 8), poseMatrix([3.42, 0.95, 2.4]), { tile: 0.6 });

  return room.finish();
}
