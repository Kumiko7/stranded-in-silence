import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, bilePool, boneDebris, drools, lumenCluster, nerveRun, polyps, tendril, toothRow } from '../kit/props';

/**
 * The Gullet - where you came in, and the last part of the beast that was glad
 * to see you.
 *
 * Muscle on all four walls, ringed twice by constrictor bands so the chamber
 * reads as something that can still swallow. The floor is wet. In one corner
 * lies a bolus: whatever it took before you, wrapped in caul and going down.
 */
export const gullet: RoomBlueprint = {
  id: 'viscera.gullet',
  nameKey: 'room.viscera.gullet',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['entrance', 'wet', 'open'],
  anchors: {
    chest: [{ position: [2.9, 0, -2.5], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.2, 0, 2.4], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.5, 1.3, -2.6] },
      { position: [1.7, 0.0, 2.2] },
      { position: [-3.35, 0.78, 3.35] },
    ],
    playerSpawn: [
      { position: [-1.4, 0, 1.5], rotationY: Math.PI },
      { position: [1.4, 0, 1.5], rotationY: Math.PI },
      { position: [-1.4, 0, -1.3], rotationY: 0 },
      { position: [1.4, 0, -1.3], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, 0.3] },
      { position: [-1.7, 0, -1.7] },
      { position: [1.9, 0, 1.6] },
    ],
    enemySpawn: [{ position: [3.3, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gullet);
  const { cellSize, ceilingHeight } = ctx.dims;
  room.shell({ floor: 'mucosa', wall: 'muscle', ceiling: 'palate', mouth: 'sphincter' });

  // Two constrictor rings, both above the door head so neither ever crosses an
  // opening. They are what makes the room read as a throat rather than a cube.
  for (const [y, thickness] of [
    [2.52, 0.2],
    [3.02, 0.14],
  ] as const) {
    for (const [dx, dz, rot] of [
      [0, -1, 0],
      [0, 1, 0],
      [-1, 0, Math.PI / 2],
      [1, 0, Math.PI / 2],
    ] as const) {
      room.geo(
        'meat',
        new THREE.CylinderGeometry(thickness, thickness * 1.2, cellSize, 8),
        tiltMatrix([dx * (cellSize / 2 - 0.28), y, dz * (cellSize / 2 - 0.28)], [0, rot, Math.PI / 2]),
        { tile: 0.8, consume: true },
      );
    }
  }

  // The bolus: something swallowed, still wrapped, wedged in the north-west
  // corner. The room's one hard silhouette, and it holds an item.
  const bx = -2.5;
  const bz = -2.6;
  room.geo('meatPale', ball(0.84, 12), tiltMatrix([bx, 0.62, bz], [0.2, 0.7, 0], [1, 0.82, 1.15]), { tile: 1.2 });
  room.geo('meatDark', ball(0.6, 10), tiltMatrix([bx + 0.12, 0.62, bz - 0.1], [0, 0.4, 0], [1, 0.95, 1]), { tile: 0.8 });
  // The wrapping, half torn off it.
  room.geo('caul', ball(0.9, 10), tiltMatrix([bx - 0.1, 0.55, bz + 0.1], [0.3, 1.2, 0], [1, 0.7, 1]), {
    castShadow: false,
    tile: 1.0,
  });
  for (let i = 0; i < 6; i++) {
    const a = room.range(0, Math.PI * 2);
    room.geo(
      'bonePale',
      new THREE.CylinderGeometry(0.028, 0.045, room.range(0.4, 0.85), 6),
      tiltMatrix([bx + Math.cos(a) * 0.48, room.range(0.55, 1.0), bz + Math.sin(a) * 0.48], [room.range(0.6, 1.4), a, 0]),
      { tile: 0.4, consume: true },
    );
  }
  room.blockCircle(bx, bz, 0.72);

  // A knuckle of hardened tissue in the south-west corner, holding the third
  // item. Tucked right into the angle so it never crowds the locker beside it.
  room.solid('cartilage', [0.8, 0.72, 0.6], [-3.35, 0, 3.35], 0, { tile: 0.8 });
  room.geo('bonePale', ball(0.24, 9), tiltMatrix([-3.35, 0.74, 3.35], [0, 0.4, 0], [1.6, 0.45, 1.3]), { tile: 0.5 });

  // Teeth, low, angled back the way you came - a throat only opens one way.
  toothRow(room, 'north', 2.3, 1.7, 5, false);
  toothRow(room, 'south', -2.5, 1.9, 5, true);

  // Tendrils, wet corners, and grit where the last meal came apart.
  tendril(room, 3.4, -3.3, 2.5, 0.42, -2.2);
  tendril(room, -3.4, -2.0, 1.9, 0.3, 1.1);
  polyps(room, 2.6, 0, -1.2, 0.5, 7, true);
  polyps(room, -1.3, 0, 3.3, 0.6, 8, false);
  drools(room, 0.6, -1.4, 1.6, 8);
  drools(room, -2.2, 1.2, 1.2, 5);
  boneDebris(room, 1.6, -2.4, 1.0, 9);

  // A nerve running the length of the ceiling and down one corner: free light,
  // and the eye follows it straight to the next doorway.
  nerveRun(room, [
    [-3.4, ceilingHeight - 0.32, -3.0],
    [-1.1, ceilingHeight - 0.5, -1.4],
    [1.4, ceilingHeight - 0.42, 1.0],
    [3.3, ceilingHeight - 0.34, 2.6],
    [3.5, 1.4, 3.4],
  ]);

  // Warm light in the wet zone. A cold green practical over red tissue turns
  // the whole chamber olive - the bile pool is the one green thing in here,
  // and it earns its colour by being the only one.
  lumenCluster(room, 0.4, -0.3, true, true, true);
  bilePool(room, 2.6, 2.7, 0.85, true, 8);

  // The pool has eaten into the floor around itself.
  room.geo('slick', new THREE.CircleGeometry(1.45, 18), tiltMatrix([2.6, 0.02, 2.7], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.4,
    consume: true,
  });
  room.geo('grit', new THREE.TorusGeometry(1.45, 0.06, 5, 20), poseMatrix([2.6, 0.025, 2.7]), {
    castShadow: false,
    consume: true,
  });

  return room.finish();
}
