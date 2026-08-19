import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { cobwebs, cyl, debris, flicker, hangingSheet, pendantLamp } from '../kit/props';

/**
 * The Laundry - forty sheets on the lines and no way to see past them.
 *
 * The only room in the manor where the sightline breakers are soft: hanging
 * linen you can walk straight through, which means something can be standing
 * two metres away and you will not know. The copper is still lit under its tub.
 */
export const laundry: RoomBlueprint = {
  id: 'mansion.laundry',
  nameKey: 'room.mansion.laundry',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['service', 'blind'],
  anchors: {
    chest: [{ position: [1.8, 0, 3.15], rotationY: 0 }],
    locker: [
      { position: [3.25, 0, 2.5], rotationY: Math.PI / 2 },
      { position: [3.25, 0, 1.5], rotationY: Math.PI / 2 },
    ],
    itemSpawn: [
      { position: [-2.9, 0.98, 1.4] },
      { position: [1.6, 0.0, -2.6] },
      { position: [2.4, 0.9, -3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-1.6, 0, 2.6] },
      { position: [1.8, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, laundry);
  room.shell({ floor: 'stone', wall: 'plaster', wainscot: 'tile', ceiling: 'boards', cornice: false });

  // The copper: a brick base with a fire under it and a lid half off.
  room.solid('surface.brick', [1.3, 0.72, 1.3], [-2.9, 0, -2.2], 0, { tile: 1.4 });
  room.geo('copper', cyl(0.56, 0.5, 0.7, 14), poseMatrix([-2.9, 1.07, -2.2]), {
    tile: 1.2,
  });
  room.geo('copper', cyl(0.58, 0.58, 0.04, 14), tiltMatrix([-2.5, 1.36, -1.75], [0.5, 0, 0.3]), {
  });
  room.geo('emberGlow', new THREE.BoxGeometry(0.44, 0.2, 0.06), poseMatrix([-2.9, 0.2, -1.56]), {
    castShadow: false,
    consume: true,
  });
  room.geo('ironBlack', new THREE.BoxGeometry(0.58, 0.3, 0.06), poseMatrix([-2.9, 0.18, -1.54]), { consume: true });
  const fire = new THREE.PointLight(0xff8a44, 9, 7, 2);
  fire.position.set(-2.9, 0.4, -1.45);
  room.light(fire);
  flicker(room, fire, 9, 0.28, 4.6);

  // The mangle: two rollers, a crank, and a bucket under it.
  room.solid('ironBlack', [1.2, 0.9, 0.6], [-2.9, 0, 1.4], -Math.PI / 2);
  room.box('woodPale', [1.1, 0.08, 0.56], [-2.9, 0.9, 1.4], -Math.PI / 2);
  for (const dy of [1.0, 1.18]) {
    room.geo('woodPale', cyl(0.09, 0.09, 1.0, 10), tiltMatrix([-2.9, dy, 1.4], [0, 0, Math.PI / 2]), {
    });
  }
  room.geo('iron', new THREE.TorusGeometry(0.16, 0.02, 4, 12), tiltMatrix([-2.9, 1.09, 0.85], [0, 0, 0]), {
    consume: true,
  });
  room.geo('rust', cyl(0.2, 0.16, 0.3, 10), poseMatrix([-2.3, 0.15, 2.1]), {});

  // Wash tubs on trestles.
  for (const x of [1.6, 2.7]) {
    room.solid('woodPale', [0.9, 0.82, 0.9], [x, 0, -3.3], 0, { tile: 1.2 });
    room.geo('woodDark', cyl(0.42, 0.36, 0.36, 12), poseMatrix([x, 0.98, -3.3]), {
      tile: 1,
    });
    room.geo('iron', new THREE.TorusGeometry(0.42, 0.02, 4, 14), poseMatrix([x, 1.1, -3.3]), { consume: true });
  }
  room.box('linen', [0.44, 0.1, 0.36], [1.6, 0.0, -2.6], 0.5);

  // The lines. Four of them, at different heights, most of the way full.
  for (let line = 0; line < 4; line++) {
    const z = -0.8 + line * 1.15;
    const y = 2.3 + (line % 2) * 0.2;
    room.geo('linen', cyl(0.012, 0.012, 7.4, 4), tiltMatrix([0, y, z], [0, 0, Math.PI / 2]), {
    });
    let x = -3.2;
    while (x < 3.0) {
      const width = room.range(0.6, 1.1);
      if (room.chance(0.22)) {
        x += width + room.range(0.1, 0.5);
        continue;
      }
      hangingSheet(room, x + width / 2, z, width, room.range(1.1, 1.7));
      x += width + room.range(0.06, 0.3);
    }
  }

  // A shelf of soap, starch and blue.
  room.box('woodPale', [1.8, 0.05, 0.28], [-2.9, 1.7, 0.2], -Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    room.geo(
      room.pick(['paper', 'bookGreen', 'rust'] as const),
      new THREE.BoxGeometry(0.14, room.range(0.12, 0.22), 0.14),
      poseMatrix([-2.9, 1.83, -0.5 + i * 0.28]),
      { tile: 0.3, consume: true },
    );
  }

  pendantLamp(room, 1.0, 1.2, true);

  debris(room, 0.6, 3.0, 1.4, 8);
  cobwebs(room, 3.2, -3.2, 2.4, 1.3);

  return room.finish();
}
