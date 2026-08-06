import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, disc, drools, lumenPod, organSac, polyps, resinFlow, strut } from '../kit/props';

/**
 * The Cisterns - where the beast keeps what it makes.
 *
 * Six glands hang off the south wall on stalks, each one dripping into a
 * cartilage basin below it. What overflows has been overflowing for a long
 * time: the amber on the floor is deep enough to have swallowed the bottom of
 * everything standing in it, and it is the only warm light in the wet zone.
 */
export const bile: RoomBlueprint = {
  id: 'viscera.bile',
  nameKey: 'room.viscera.bile',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['wet', 'warm'],
  anchors: {
    chest: [{ position: [3.2, 0, -2.2], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.3, 0, -2.4], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.6, 1.05, 2.9] },
      { position: [1.5, 1.05, 2.9] },
      { position: [1.8, 0.0, -3.2] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.4, 0, 1.2] },
      { position: [2.6, 0, -0.4] },
    ],
    enemySpawn: [{ position: [-3.1, 0, -3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, bile);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'gut', wall: 'flesh', ceiling: 'sinew', band: 'gut', mouth: 'sphincter' });

  /* --- the glands ------------------------------------------------------------ */
  // Six of them along the south wall, alternating high and low so the row is a
  // rhythm rather than a fence.
  for (let i = 0; i < 6; i++) {
    const x = -2.9 + i * 1.16;
    const high = i % 2 === 0;
    const y = high ? 2.35 : 2.0;
    const r = high ? 0.44 : 0.34;
    strut(room, 'meatDark', [x, ceilingHeight, 3.3], [x, y + r, 3.3], 0.07, 6, { tile: 0.4 });
    room.geo('gland', ball(r, 11), tiltMatrix([x, y, 3.3], [0, i * 0.7, 0], [1, 1.35, 1]), { tile: 0.8 });
    room.geo('vein', new THREE.TorusGeometry(r * 0.72, 0.035, 5, 12), tiltMatrix([x, y + r * 0.5, 3.3], [0.3, 0, 0]), {
      tile: 0.3,
      consume: true,
    });
    // The drip: a thread of resin from the nipple of the gland to the basin.
    room.geo('resin', new THREE.CylinderGeometry(0.016, 0.03, y - r - 0.6, 5), poseMatrix([x, (y - r + 0.6) / 2, 3.28]), {
      castShadow: false,
      tile: 0.3,
      consume: true,
    });
  }

  // The basins: a shelf of cartilage the width of the wall, pooled with amber.
  room.solid('cartilage', [7.0, 0.9, 0.9], [0, 0, 3.15], 0, { tile: 1.2 });
  room.box('cartilage', [7.2, 0.14, 1.05], [0, 0.9, 3.15], 0, { tile: 1.0 });
  for (let i = 0; i < 6; i++) {
    const x = -2.9 + i * 1.16;
    room.geo('resin', disc(0.4, 14), tiltMatrix([x, 0.98, 3.15], [-Math.PI / 2, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
      tile: 0.8,
    });
    room.geo('cartilage', new THREE.TorusGeometry(0.42, 0.05, 5, 14), poseMatrix([x, 0.97, 3.15]), { tile: 0.4, consume: true });
  }

  /* --- what has overflowed ---------------------------------------------------- */
  for (const [x, z, r] of [
    [-1.2, 2.0, 1.5],
    [1.6, 1.8, 1.2],
    [0.2, 0.6, 0.9],
  ] as const) {
    room.geo('resin', disc(r, 18), tiltMatrix([x, 0.022, z], [-Math.PI / 2, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
      tile: 1.4,
    });
    room.geo('grit', new THREE.TorusGeometry(r, 0.06, 5, 20), poseMatrix([x, 0.03, z]), { castShadow: false, consume: true });
  }
  resinFlow(room, 'west', 1.4, 2.1, 1.0);
  resinFlow(room, 'north', -2.2, 1.9, 0.8);

  // Things caught in it, half sunk.
  for (let i = 0; i < 5; i++) {
    room.geo(
      'bonePale',
      new THREE.CylinderGeometry(0.035, 0.05, room.range(0.5, 1.1), 6),
      tiltMatrix([room.range(-1.8, 1.8), room.range(0.06, 0.3), room.range(0.4, 2.4)], [room.range(1.2, 1.6), room.range(0, 3), 0]),
      { tile: 0.4, consume: true },
    );
  }

  organSac(room, -2.9, 2.3, -1.4, 0.6, true);
  polyps(room, 2.8, 0, -1.8, 0.6, 8, false);
  drools(room, 1.0, -2.4, 1.6, 7);
  boneDebris(room, -1.0, -3.1, 1.0, 9);

  // Warm from inside the biggest gland, and a second pod over the basins.
  lumenPod(room, [-2.9, 2.0, 3.3], 0.26, true, true, 9);
  lumenPod(room, [1.9, 1.7, 3.3], 0.2, true, true, 6);

  return room.finish();
}
