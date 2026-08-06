import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, chitinShelf, drools, lumenPod, nerveRun, ribArch, strut, vertebrae } from '../kit/props';

/**
 * The Column - one vertebra of the thing, seen from inside.
 *
 * The spine goes straight through the middle of the room, floor to ceiling, and
 * the cord inside it is the brightest blue in the map. Ribs spring off it both
 * ways and vanish into the walls, so the room reads as a cross-section of
 * something far bigger than the map you are walking.
 */
export const spine: RoomBlueprint = {
  id: 'viscera.spine',
  nameKey: 'room.viscera.spine',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['calcified', 'cold', 'landmark'],
  anchors: {
    chest: [{ position: [3.1, 0, 2.8], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.3, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.2, 1.4, 1.6] },
      { position: [2.8, 0.0, -2.9] },
      { position: [-2.4, 0.0, 3.0] },
    ],
    patrolPoint: [
      { position: [-2.3, 0, 0.4] },
      { position: [2.3, 0, -0.4] },
      { position: [0.4, 0, 2.6] },
    ],
    enemySpawn: [{ position: [-2.8, 0, -0.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, spine);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'suture', wall: 'bone', ceiling: 'ribs', band: 'bone', bandHeight: 0.85, mouth: 'vertebrae' });

  /* --- the column ---------------------------------------------------------------- */
  // Slightly off centre, so the four doorways do not all get the same view and
  // the walking space is one broad side rather than four narrow ones.
  const cx = -0.55;
  const cz = 0.35;
  vertebrae(room, cx, cz, ceilingHeight, 0.42, true);

  // The cord, running up the inside of it. Visible through the gaps between
  // vertebrae, which is why the column is stacked rather than extruded.
  room.geo('nerve', new THREE.CylinderGeometry(0.11, 0.11, ceilingHeight, 8), poseMatrix([cx, ceilingHeight / 2, cz]), {
    castShadow: false,
    consume: true,
  });
  nerveRun(room, [
    [cx, 2.6, cz],
    [-2.6, 2.9, -1.8],
    [-3.4, 2.4, -3.0],
  ]);
  nerveRun(room, [
    [cx, 1.9, cz],
    [2.4, 2.3, 1.6],
    [3.4, 1.9, 2.9],
  ]);

  /* --- the ribs ------------------------------------------------------------------ */
  // Springing off the column both ways and running into the walls. Sampled fine
  // enough to read as bone rather than as a row of blocks under the ceiling.
  for (const [z, rise, yaw] of [
    [-2.2, 2.5, 0.12],
    [-0.8, 2.9, -0.08],
    [1.4, 2.7, 0.16],
    [2.8, 2.2, -0.14],
  ] as const) {
    ribArch(room, cz + z, 3.5, rise, 0.2, cx, yaw, 'bone');
  }

  // Ligament running the length of the column, tying every rib to it.
  for (let i = 0; i < 7; i++) {
    const y = 0.45 + i * 0.45;
    for (const s of [-1, 1]) {
      strut(room, 'tendon', [cx + s * 0.4, y, cz], [cx + s * 1.5, y + 0.35, cz + (i % 2 ? 0.7 : -0.7)], 0.035, 5, { tile: 0.4 });
    }
  }

  /* --- the room ------------------------------------------------------------------- */
  chitinShelf(room, 'west', 1.6, 1.4, 1.2, 0.42);
  room.solid('bone', [1.0, 0.9, 0.9], [2.8, 0, -2.9], 0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([2.8, 0.92, -2.9], [0, 0.2, 0], [1.5, 0.3, 1.4]), { tile: 0.5 });

  drools(room, 1.8, -1.6, 1.4, 6);
  boneDebris(room, -2.4, 3.0, 1.0, 11);
  boneDebris(room, 2.6, 1.4, 0.8, 7);

  // Cold from the cord, warm from a single pod in the corner: the two-colour
  // split is what gives the ribs an edge to catch on both sides.
  const cord = new THREE.PointLight(0x5fa0ff, 9, ctx.dims.cellSize * 1.6, 2);
  cord.position.set(cx + 0.5, 2.1, cz + 0.3);
  cord.castShadow = true;
  cord.shadow.mapSize.set(512, 512);
  cord.shadow.autoUpdate = false;
  cord.shadow.needsUpdate = true;
  room.light(cord);

  lumenPod(room, [3.3, 1.7, -0.2], 0.18, true, true, 6);

  return room.finish();
}
