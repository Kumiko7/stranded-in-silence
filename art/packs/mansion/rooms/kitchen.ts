import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import * as THREE from 'three';
import { ALL_WALLS, Room } from './common';
import { cobwebs, debris, flicker, pendantLamp, table } from '../kit/props';

/**
 * The Kitchen - white tile, black iron, and the range still warm.
 *
 * The one room in the house built to be scrubbed, which makes the state of it
 * worse. Copper hangs over the block in the middle; the range glows at the north
 * wall and throws long shadows of the hanging pans across the tile.
 */
export const kitchen: RoomBlueprint = {
  id: 'mansion.kitchen',
  nameKey: 'room.mansion.kitchen',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['cluttered', 'service'],
  anchors: {
    chest: [{ position: [-2.9, 0, 3.1], rotationY: 0 }],
    locker: [
      { position: [3.25, 0, -2.5], rotationY: Math.PI / 2 },
      { position: [3.25, 0, -1.5], rotationY: Math.PI / 2 },
    ],
    itemSpawn: [
      { position: [0.0, 0.94, 0.0] },
      { position: [-1.2, 0.94, 0.3] },
      { position: [-3.2, 0.9, -1.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.4] },
      { position: [-2.4, 0, 0.4] },
      { position: [2.3, 0, 1.6] },
    ],
    enemySpawn: [{ position: [2.9, 0, 3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, kitchen);
  room.shell({ floor: 'tile', wall: 'tile', wainscot: 'tile', ceiling: 'plaster', skirting: false });

  // The range: cast iron, brick surround, and something still burning in it.
  room.solid('ironBlack', [2.1, 1.0, 0.78], [-2.3, 0, -3.3]);
  room.box('ironBlack', [2.2, 0.08, 0.86], [-2.3, 1.0, -3.3]);
  for (const dx of [-0.55, 0.1]) {
    room.geo('iron', new THREE.CylinderGeometry(0.19, 0.19, 0.03, 12), poseMatrix([-2.3 + dx, 1.06, -3.35]), {
      consume: true,
    });
  }
  room.box('emberGlow', [0.6, 0.28, 0.05], [-2.3, 0.28, -2.9], 0, { castShadow: false });
  room.box('ironBlack', [0.72, 0.36, 0.06], [-2.3, 0.24, -2.88]);
  room.geo('brass', new THREE.SphereGeometry(0.05, 8, 6), poseMatrix([-1.98, 0.42, -2.85]), { consume: true });
  // Flue up to the ceiling.
  room.box('ironBlack', [1.5, 1.2, 0.5], [-2.3, 1.08, -3.44]);
  room.box('rust', [0.34, 1.2, 0.34], [-2.3, 2.28, -3.44]);

  const fire = new THREE.PointLight(0xff8a3c, 11, 8, 2);
  fire.position.set(-2.3, 0.5, -2.8);
  room.light(fire);
  flicker(room, fire, 11, 0.26, 4.2);

  // The central block, worn hollow by a century of chopping.
  table(room, -0.4, 0.1, 2.9, 1.15, 0.92, 0);
  room.box('woodPale', [2.7, 0.05, 1.0], [-0.4, 0.92, 0.1], 0, { tile: 1.4 });
  room.box('silver', [0.03, 0.02, 0.24], [-0.9, 0.97, -0.2], 0.4);
  room.box('woodDark', [0.03, 0.02, 0.12], [-0.75, 0.97, -0.14], 0.4);

  // Pot rack over the block. The rail lies along X, so it needs a roll about Z -
  // `poseMatrix` only turns things about Y, which left it standing on end and
  // spearing the ceiling.
  room.geo('iron', new THREE.CylinderGeometry(0.02, 0.02, 2.6, 6), tiltMatrix([-0.4, 2.45, 0.1], [0, 0, Math.PI / 2]), {
    consume: true,
  });
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + i * 0.48;
    const r = room.range(0.11, 0.2);
    room.geo('copper', new THREE.CylinderGeometry(r, r * 0.82, r * 1.5, 12), poseMatrix([x, 2.22, 0.1]), {
      consume: true,
    });
    room.geo('iron', new THREE.TorusGeometry(0.05, 0.008, 4, 8), poseMatrix([x, 2.42, 0.1]), { consume: true });
  }

  // Scullery sink and draining board on the west wall.
  room.solid('porcelain', [0.7, 0.9, 1.5], [-3.35, 0, -1.9]);
  room.box('ash', [0.5, 0.06, 1.2], [-3.35, 0.9, -1.9]);
  room.geo('brass', new THREE.CylinderGeometry(0.022, 0.022, 0.4, 6), poseMatrix([-3.6, 1.15, -1.9]), { consume: true });
  room.geo('brass', new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), poseMatrix([-3.5, 1.32, -1.9], 0), { consume: true });

  // The dresser: plates on edge, most of them cracked.
  room.solid('woodPale', [2.4, 2.1, 0.42], [1.9, 0, -3.5]);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 0.95 + shelf * 0.38;
    room.box('woodDark', [2.3, 0.03, 0.38], [1.9, y, -3.5]);
    for (let i = 0; i < 7; i++) {
      if (room.chance(0.25)) continue;
      room.geo(
        'porcelain',
        new THREE.CylinderGeometry(room.range(0.1, 0.15), room.range(0.1, 0.15), 0.02, 12),
        poseMatrix([0.85 + i * 0.32, y + 0.14, -3.5], Math.PI / 2),
        { consume: true },
      );
    }
  }

  pendantLamp(room, 0.6, 1.9, true);

  debris(room, 1.4, 2.2, 1.6, 12);
  debris(room, -1.0, -1.6, 1.0, 6);
  cobwebs(room, 3.2, 3.2, 3.9);
  cobwebs(room, -3.2, 3.2, 5.5, 0.8);

  return room.finish();
}
