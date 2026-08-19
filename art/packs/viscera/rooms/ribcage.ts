import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  bilePool,
  boneDebris,
  boneSlab,
  breathe,
  chitinShelf,
  cyl,
  drools,
  lumenPod,
  nerveRun,
  ribArch,
  strut,
  vertebrae,
} from '../kit/props';

/**
 * The Nave - four cells of ribcage, and the biggest volume in the map.
 *
 * A spine runs the whole sixteen metres of it along the ceiling, and eleven
 * ribs spring off it and go down into the floor on both sides. Under the middle
 * of it the bone has failed and something has pooled there, which is what lights
 * the whole hall: a green floor, black ribs, and the arches going up out of
 * sight.
 *
 * It is a set piece, placed at most once per map, and it is the one room in the
 * beast where you can see far enough to watch something coming.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

export const ribcage: RoomBlueprint = {
  id: 'viscera.ribcage',
  nameKey: 'room.viscera.ribcage',
  footprint: FOOTPRINT,
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
    ...wallsOn([0, 1], 'south', 'west'),
    ...wallsOn([1, 1], 'south', 'east'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['entrance', 'calcified', 'landmark', 'open'],
  anchors: {
    chest: [
      { position: [-3.0, 0, 1.4], rotationY: -Math.PI / 2 },
      { position: [11.0, 0, 6.8], rotationY: Math.PI / 2 },
    ],
    locker: [
      { position: [1.6, 0, -3.25], rotationY: Math.PI },
      { position: [4.8, 0, 11.25], rotationY: 0 },
    ],
    itemSpawn: [
      { position: [4.0, 0.88, -2.6] },
      { position: [-3.1, 1.4, 6.0] },
      { position: [11.1, 1.4, 2.0] },
      { position: [8.4, 0.0, 10.4] },
    ],
    playerSpawn: [
      { position: [2.6, 0, 5.4], rotationY: Math.PI },
      { position: [5.4, 0, 5.4], rotationY: Math.PI },
      { position: [2.6, 0, 2.6], rotationY: 0 },
      { position: [5.4, 0, 2.6], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [4.0, 0, 0.6] },
      { position: [0.6, 0, 4.0] },
      { position: [7.4, 0, 4.0] },
      { position: [4.0, 0, 7.4] },
    ],
    enemySpawn: [{ position: [10.8, 0, 10.8] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, ribcage);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'suture', wall: 'bone', ceiling: 'flesh', band: 'bone', bandHeight: 0.9, mouth: 'vertebrae' });

  /* --- the spine -------------------------------------------------------------- */
  // Along the ceiling, the full length of the hall on the x axis at z = 4.
  for (let i = 0; i < 17; i++) {
    const x = -3.6 + i * 0.98;
    const y = ceilingHeight - 0.42 - Math.sin((i / 16) * Math.PI) * 0.22;
    room.geo('bone', cyl(0.4, 0.44, 0.62, 12), tiltMatrix([x, y, 4], [0, 0, Math.PI / 2]), {
      tile: 0.9,
      castShadow: false,
    });
    room.geo('cartilage', cyl(0.34, 0.34, 0.2, 12), tiltMatrix([x + 0.49, y, 4], [0, 0, Math.PI / 2]), {
      tile: 0.4,
      castShadow: false,
    });
    // The neural spine: a fin standing up off each vertebra, into the roof.
    room.geo('bonePale', new THREE.BoxGeometry(0.5, 0.5, 0.16), poseMatrix([x, y + 0.42, 4]), {
      tile: 0.5,
      castShadow: false,
      consume: true,
    });
  }
  // The cord inside it, showing between vertebrae.
  room.geo('nerve', cyl(0.12, 0.12, 17, 8), tiltMatrix([4, ceilingHeight - 0.52, 4], [0, 0, Math.PI / 2]), {
    castShadow: false,
  });

  /* --- the ribs ---------------------------------------------------------------- */
  // Eleven, springing off the spine and down into the floor both sides. The
  // arch helper samples fifteen segments, which is what makes them read as bone
  // rather than as a row of blocks under a ceiling.
  for (let i = 0; i < 11; i++) {
    const x = -3.2 + i * 0.94 + (i > 5 ? 6.0 : 0);
    if (x > 11.6) continue;
    const rise = 3.05 - Math.abs(i - 5) * 0.06;
    ribArch(room, 4, 4.6, rise, 0.3, x, Math.PI / 2, 'bone');
    // Costal cartilage where each rib meets the floor: paler, and it catches
    // whatever light is coming off the pool.
    for (const s of [-1, 1]) {
      room.geo('cartilage', ball(0.34, 9), tiltMatrix([x, 0.12, 4 + s * 4.6], [0, 0, 0], [1.2, 0.5, 1.2]), { tile: 0.5 });
    }
  }

  /* --- the pool ---------------------------------------------------------------- */
  // Where the floor gave way, in the middle of the hall. It is the room's light.
  for (const [x, z, r] of [
    [4.0, 4.0, 2.3],
    [2.4, 5.2, 1.5],
    [5.6, 3.0, 1.4],
  ] as const) {
    bilePool(room, x, z, r, false);
  }
  bilePool(room, 4.0, 4.0, 1.6, true, 21);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    room.geo(
      'bonePale',
      cyl(0.06, 0.09, room.range(0.7, 1.5), 6),
      tiltMatrix([4 + Math.cos(a) * 2.2, room.range(0.1, 0.5), 4 + Math.sin(a) * 2.2], [room.range(1.0, 1.5), a, 0]),
      { tile: 0.4 },
    );
  }

  /* --- the ends ---------------------------------------------------------------- */
  // A vertebral column standing at each end of the hall, holding the spine up.
  vertebrae(room, -1.4, 4.0, ceilingHeight, 0.5, true);
  vertebrae(room, 9.4, 4.0, ceilingHeight, 0.5, true);

  // Ledges, slabs and the fittings that make a hall usable.
  boneSlab(room, 4.0, -2.6, 2.2, 0.95, 0.88);
  chitinShelf(room, 'west', 6.0, 1.4, 1.4, 0.44, [0, 0]);
  chitinShelf(room, 'east', -2.0, 1.4, 1.4, 0.44, [1, 0]);

  nerveRun(room, [
    [-3.4, ceilingHeight - 0.5, 0.6],
    [0.4, ceilingHeight - 0.7, 1.6],
    [3.6, ceilingHeight - 0.6, 0.8],
  ]);
  nerveRun(room, [
    [11.4, ceilingHeight - 0.5, 7.4],
    [7.6, ceilingHeight - 0.7, 6.6],
    [4.4, ceilingHeight - 0.6, 7.6],
  ]);

  strut(room, 'tendon', [-3.5, ceilingHeight - 0.6, -3.0], [1.2, 2.4, 0.4], 0.06, 5, { castShadow: false });
  strut(room, 'tendon', [11.5, ceilingHeight - 0.6, 11.0], [6.8, 2.4, 7.6], 0.06, 5, { castShadow: false });

  drools(room, 2.0, 1.0, 2.2, 10);
  drools(room, 6.4, 7.2, 2.0, 9);
  boneDebris(room, 9.6, 1.6, 1.4, 14);
  boneDebris(room, -1.2, 8.6, 1.2, 12);
  boneDebris(room, 8.4, 9.6, 1.0, 10);

  // The second light, warm, at the far end - so the hall reads as having two
  // ends rather than as one green box.
  for (const [x, z, warm, power] of [
    [10.9, 9.8, true, 15],
    [-3.0, 9.6, false, 11],
    [10.9, -1.6, false, 11],
  ] as const) {
    lumenPod(room, [x, 1.6, z], 0.26, true, warm, power);
    room.solid('bone', [0.7, 1.6, 0.9], [x + Math.sign(x) * 0.3, 0, z], 0, { tile: 0.9 });
  }
  for (const [index, lamp] of room.lights.entries()) {
    if (index === 0) continue; // the pool, which breathes on its own
    breathe(room, lamp, [21, 15, 11, 11][index] ?? 12, 0.15, 0.6 + index * 0.2);
  }

  return room.finish();
}
