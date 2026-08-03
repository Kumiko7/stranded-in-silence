import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { bust, cobwebs, debris, painting, rug, sconce } from '../kit/props';

/**
 * The Long Gallery (2x1) - sixteen metres of people watching you walk.
 *
 * The only room in the manor with a proper sightline: enter at one end and you
 * can see the far door, which cuts both ways. Portraits the whole length of both
 * walls, a runner down the middle, and two sconces that leave the middle third
 * of the gallery in the dark.
 */
export const gallery: RoomBlueprint = {
  id: 'mansion.gallery',
  nameKey: 'room.mansion.gallery',
  footprint: [
    [0, 0],
    [1, 0],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'west', 'north', 'south'),
    ...wallsOn([1, 0], 'east', 'north', 'south'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['open', 'grand'],
  anchors: {
    chest: [{ position: [3.9, 0, -3.15], rotationY: Math.PI }],
    locker: [{ position: [4.1, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.05, 0.96, -2.2] },
      { position: [11.05, 0.96, 2.2] },
      { position: [6.4, 0.0, -2.6] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 0] },
      { position: [4.0, 0, 0] },
      { position: [10.2, 0, 0] },
    ],
    enemySpawn: [{ position: [10.0, 0, -2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gallery);
  room.shell({
    floor: 'parquet',
    wall: 'damaskGreen',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
  });

  rug(room, 4.0, 0, 12.0, 2.4);

  // Portraits the whole length of both walls, hung at slightly wrong heights.
  for (let i = 0; i < 7; i++) {
    const along = -2.6 + i * 2.0;
    const cell = along > 4 ? ([1, 0] as const) : ([0, 0] as const);
    const local = along - cell[0] * 8;
    painting(room, 'north', -local, 1.42 + room.range(0, 0.28), room.range(0.6, 1.05), room.range(0.8, 1.4), i % 4, cell);
    painting(room, 'south', local, 1.4 + room.range(0, 0.3), room.range(0.6, 1.05), room.range(0.8, 1.4), (i + 2) % 4, cell);
  }
  // One frame is empty, and the wall behind it is a different colour.
  room.box('gilt', [0.94, 1.24, 0.06], [6.6, 1.4, -3.62]);
  room.box('surface.damaskGreen', [0.8, 1.1, 0.02], [6.6, 1.47, -3.57], 0, { tile: 0.9 });

  bust(room, -3.05, -2.2, 0.4);
  bust(room, 11.05, 2.2, -0.4);
  bust(room, 11.0, -2.4, 0.9);

  // A bench in the middle, for looking at the paintings.
  room.solid('woodDark', [1.9, 0.42, 0.56], [4.0, 0, 0.9], 0.03, { tile: 1.2 });
  room.box('velvetRed', [1.8, 0.1, 0.46], [4.0, 0.42, 0.9], 0.03, { tile: 0.9 });

  // A ladder and a dust sheet: somebody was taking them down when it happened.
  room.geo('woodPale', new THREE.BoxGeometry(0.08, 2.6, 0.08), poseMatrix([5.95, 1.3, 2.8], 0.1), { consume: true });
  room.geo('woodPale', new THREE.BoxGeometry(0.08, 2.6, 0.08), poseMatrix([6.45, 1.3, 2.8], 0.1), { consume: true });
  for (let i = 0; i < 6; i++) {
    room.geo('woodPale', new THREE.BoxGeometry(0.5, 0.05, 0.07), poseMatrix([6.2, 0.4 + i * 0.4, 2.8]), {
      consume: true,
    });
  }
  room.blockCircle(6.2, 2.8, 0.4);
  room.box('dustSheet', [1.4, 0.14, 1.0], [6.4, 0, -2.6], 0.5, { tile: 1.3 });

  sconce(room, 'north', -1.4, 2.1, true, [0, 0]);
  sconce(room, 'south', 1.4, 2.1, true, [1, 0]);
  sconce(room, 'north', 1.6, 2.1, false, [1, 0]);
  sconce(room, 'south', -1.6, 2.1, false, [0, 0]);

  debris(room, 2.0, 2.4, 1.6, 10);
  debris(room, 9.0, -2.0, 1.4, 8);
  cobwebs(room, -3.2, -3.2, 0.8, 1.3);
  cobwebs(room, 11.2, 3.2, 3.9, 1.2);

  return room.finish();
}
