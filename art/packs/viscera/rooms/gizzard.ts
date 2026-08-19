import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, breathe, cyl, drools, gillSlits, lumenPod, polyps, resinFlow, spike, toothRow } from '../kit/props';

/**
 * The Gizzard - the room where the beast keeps its teeth in the wrong place.
 *
 * Two grinding plates stand out of the floor, the gap between them worn smooth
 * and packed with swallowed stones. Everything in here has been through it: the
 * grit is a metre deep in the corners, and what it did not manage to grind is
 * lying on top - a shard of shell, half a jaw, a rib.
 *
 * It is the hinge room of the pack, the one that is neither wet nor dry: gut on
 * the walls, chitin plates in the middle, and it appears on the way from one
 * zone to the other more often than not.
 */
export const gizzard: RoomBlueprint = {
  id: 'viscera.gizzard',
  nameKey: 'room.viscera.gizzard',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south', 'west'),
  weight: 10,
  tags: ['wet', 'calcified', 'cluttered'],
  anchors: {
    chest: [{ position: [-3.05, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 1.02, 3.25] },
      { position: [3.1, 0.0, 2.7] },
      { position: [-3.2, 0.0, 1.9] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 0.4] },
      { position: [2.4, 0, -0.6] },
      { position: [0.2, 0, 2.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gizzard);
  room.shell({ floor: 'chitin', wall: 'gut', ceiling: 'palate', band: 'chitin', bandHeight: 1.2, mouth: 'mandible' });

  /* --- the plates -------------------------------------------------------------- */
  // Two of them, facing each other across a 1.1 m gap that runs east-west, so
  // the room still has a lane through the middle whichever doors open.
  for (const s of [-1, 1]) {
    const z = s * 1.15;
    room.solid('chitinPlate', [4.2, 1.5, 0.55], [0, 0, z], 0, { tile: 1.2 });
    // The grinding face: a row of blunt cusps, worn flat in the middle.
    for (let i = 0; i < 9; i++) {
      const x = -1.85 + i * 0.46;
      const wear = 1 - Math.exp(-Math.pow(x / 1.4, 2));
      room.geo(
        'tooth',
        spike(0.14, 0.3 + wear * 0.45, 6),
        tiltMatrix([x, 1.5 + (0.3 + wear * 0.45) / 2 - 0.05, z - s * 0.24], [-s * 0.35, 0, 0]),
        { tile: 0.4 },
      );
    }
    room.geo('chitinDark', new THREE.BoxGeometry(4.3, 0.16, 0.7), poseMatrix([0, 1.52, z]), { tile: 0.8, consume: true });
    // Ribs of muscle behind each plate: the thing that drives it.
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i;
      room.geo(
        'meat',
        cyl(0.13, 0.19, 1.7, 7),
        tiltMatrix([x, 0.85, z + s * 0.5], [s * 0.28, 0, 0]),
        { tile: 0.6 },
      );
    }
  }

  // What is between them: stones, polished, packed tight.
  for (let i = 0; i < 22; i++) {
    const r = room.range(0.07, 0.2);
    room.geo(
      'grit',
      ball(r, 7),
      tiltMatrix([room.range(-2.0, 2.0), r * 0.7, room.range(-0.5, 0.5)], [room.range(0, 3), room.range(0, 3), 0], [1, 0.75, 1.1]),
      { tile: 0.4 },
    );
  }

  /* --- the drift ---------------------------------------------------------------- */
  // Grit heaped in the corners, and the things it could not grind lying on top.
  for (const [x, z, r] of [
    [-2.9, 2.7, 1.2],
    [3.0, -2.6, 1.1],
    [2.8, 2.8, 0.9],
  ] as const) {
    room.geo('grit', ball(r, 12), tiltMatrix([x, 0.05, z], [0, room.range(0, 3), 0], [1, 0.34, 1]), { tile: 1.0 });
    boneDebris(room, x, z, r * 0.9, 10);
  }
  room.geo('bonePale', cyl(0.11, 0.15, 1.5, 8), tiltMatrix([-3.2, 0.24, 1.9], [1.35, 0.7, 0]), {
    tile: 0.5,
  });
  room.geo('scute', new THREE.BoxGeometry(0.9, 0.09, 0.7), tiltMatrix([3.1, 0.3, 2.7], [0.2, 0.9, 0.25]), {
    tile: 0.7,
    consume: true,
  });

  // A shelf on the south wall, well off centre so it can never stand in the
  // doorway the generator might cut there.
  room.solid('chitinPlate', [1.2, 1.0, 0.7], [-2.2, 0, 3.25], 0, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([-2.2, 1.02, 3.25], [0, 0.3, 0], [1.9, 0.28, 1.2]), { tile: 0.5 });
  gillSlits(room, 'south', 2.3, 2.4, 4, 1.0);
  gillSlits(room, 'north', -2.4, 2.2, 3, 0.9);
  resinFlow(room, 'east', -1.8, 2.0, 0.8);

  polyps(room, -3.1, 0, 1.4, 0.6, 7, false);
  drools(room, 0.4, -2.6, 1.4, 6);
  toothRow(room, 'west', 2.4, 1.6, 5, true);

  // Warm from under the plates, so the gap between them glows and everything
  // standing in the room is lit from below the knee.
  lumenPod(room, [-1.6, 0.16, 0.0], 0.22, true, true, 8);
  lumenPod(room, [1.7, 0.16, 0.0], 0.18, false, true);
  const ember = new THREE.PointLight(0xff9a52, 6, ctx.dims.cellSize * 1.2, 2);
  ember.position.set(1.7, 0.5, 0);
  room.light(ember);
  breathe(room, ember, 6, 0.22, 1.9);

  return room.finish();
}
