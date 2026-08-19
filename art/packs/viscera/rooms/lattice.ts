import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, boneSlab, breathe, cyl, drools, glowShaft, lumenPod, polyps, strut } from '../kit/props';

/**
 * The Lattice - petrified cartilage, and the only translucent room in the map.
 *
 * Four columns of it hold the roof up, milky and fibrous and lit from inside by
 * whatever is left glowing at their cores. Between them the floor is a raft of
 * plates that never quite set, and the pore in the north wall throws the whole
 * lattice into shadow across it.
 *
 * It is the pack's quiet room: nothing here is bleeding, growing or watching,
 * and after four chambers that are, that reads as far more sinister than it has
 * any right to.
 */
export const lattice: RoomBlueprint = {
  id: 'viscera.lattice',
  nameKey: 'room.viscera.lattice',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 9,
  tags: ['calcified', 'cold', 'quiet'],
  anchors: {
    chest: [{ position: [0.0, 0, -3.2], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.4, 0.88, -3.1] },
      { position: [3.1, 0.0, 2.8] },
      { position: [-2.6, 0.0, 1.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-3.0, 0, -1.2] },
      { position: [2.4, 0, -0.8] },
    ],
    enemySpawn: [{ position: [3.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, lattice);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'cartilage',
    wall: 'cartilage',
    ceiling: 'vault',
    band: 'bone',
    bandHeight: 0.7,
    mouth: 'vertebrae',
    ridge: true,
    pores: [{ side: 'north', kind: 'ossified', tall: true, light: true }],
  });

  /* --- the columns -------------------------------------------------------------- */
  // Four of them, on the diagonals so no doorway is ever looking at one. Each is
  // a bundle of fibres rather than a post, spread at both ends.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const x = sx * 2.15;
    const z = sz * 2.15;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spread = 0.34;
      strut(
        room,
        'cartilage',
        [x + Math.cos(a) * spread, 0, z + Math.sin(a) * spread],
        [x + Math.cos(a) * spread * 0.42, ceilingHeight, z + Math.sin(a) * spread * 0.42],
        0.075,
        6,
        { tile: 0.7 },
      );
    }
    // The core, still lit, and the collars binding the bundle at three heights.
    room.geo('lumenCold', cyl(0.075, 0.075, ceilingHeight - 0.3, 8), poseMatrix([x, ceilingHeight / 2, z]), {
      castShadow: false,
    });
    for (const y of [0.55, 1.6, 2.65]) {
      room.geo('bonePale', new THREE.TorusGeometry(0.36, 0.06, 5, 14), poseMatrix([x, y, z]), { tile: 0.4, consume: true });
    }
    room.geo('bonePale', ball(0.46, 10), tiltMatrix([x, 0.06, z], [0, 0, 0], [1.2, 0.35, 1.2]), { tile: 0.5 });
    room.blockCircle(x, z, 0.46);
  }

  /* --- the raft ------------------------------------------------------------------ */
  // Plates of cartilage that never set flat, tilted a few degrees against each
  // other. Purely visual - a floor you can trip over is a floor that traps you.
  for (let i = 0; i < 9; i++) {
    const x = room.range(-3.0, 3.0);
    const z = room.range(-3.0, 3.0);
    if (Math.abs(x) < 1.3 && Math.abs(z) < 1.3) continue;
    room.geo(
      'cartilage',
      new THREE.BoxGeometry(room.range(0.9, 1.8), 0.07, room.range(0.8, 1.6)),
      tiltMatrix([x, 0.035, z], [room.range(-0.05, 0.05), room.range(0, 3), room.range(-0.05, 0.05)]),
      { tile: 1.0, castShadow: false, consume: true },
    );
  }

  boneSlab(room, -2.4, -3.1, 1.7, 0.8, 0.88, 0.15);
  glowShaft(room, [0, 2.6, -3.5], [0.3, 0.2, 0.4], 1.9);

  polyps(room, 3.1, 0, 0.6, 0.5, 6, true);
  drools(room, -1.2, 1.2, 1.4, 6);
  boneDebris(room, 3.0, 2.8, 0.9, 9);
  boneDebris(room, -2.8, -1.2, 0.8, 7);

  // One cold pod low among the columns, so their cores are not the only light
  // and the floor plates catch a grazing edge.
  lumenPod(room, [-2.9, 0.5, -2.8], 0.21, false, false);
  const chill = new THREE.PointLight(0x7fb0ff, 4, ctx.dims.cellSize, 2);
  chill.position.set(2.15, 1.6, 2.15);
  room.light(chill);
  breathe(room, chill, 4, 0.16, 0.6);

  return room.finish();
}
