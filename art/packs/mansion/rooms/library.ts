import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { armchair, bookRow, bookcase, candelabra, chair, cobwebs, cyl, fireplace, oilLamp, rug, table } from '../kit/props';

/**
 * The Library - every wall is books, and the ladder is on the wrong side.
 *
 * Tall cases make the floor feel narrower than it is, which is exactly the point:
 * you cannot see who is on the other side of the room until you commit to walking
 * round it. The fire is still going, which nobody wants to think about.
 */
export const library: RoomBlueprint = {
  id: 'mansion.library',
  nameKey: 'room.mansion.library',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['cluttered', 'quiet'],
  anchors: {
    chest: [{ position: [-2.4, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [-3.3, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0.4, 0.78, 0.35] },
      { position: [-2.55, 1.5, -3.48] },
      { position: [2.9, 0.0, -1.2] },
      { position: [2.5, 1.51, 3.48] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.2] },
      { position: [-2.2, 0, -1.6] },
      { position: [2.3, 0, 1.4] },
    ],
    enemySpawn: [{ position: [2.9, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, library);
  room.shell({ floor: 'parquet', wall: 'panel', ceiling: 'coffered' });

  bookcase(room, 'north', -2.4, 2.3, 5);
  bookcase(room, 'north', 2.4, 2.3, 5);
  bookcase(room, 'west', 2.4, 2.2, 5);
  bookcase(room, 'east', 2.5, 2.0, 4);

  fireplace(room, 'south', 2.5, true);

  rug(room, 0, 0.1, 3.4, 2.8, 0.04);
  table(room, 0, 0.35, 1.9, 1.0, 0.76, 0.05);
  candelabra(room, [-0.55, 0.78, 0.3], 3);
  // The room's second light. A library lit by its hearth alone is a fire in a
  // black box: the four walls of books - the only reason the room exists - were
  // below the ambient floor from three of its four doorways.
  oilLamp(room, [0.62, 0.78, 0.1], true, 'velvetGreen');
  room.box('paper', [0.42, 0.03, 0.3], [0.05, 0.78, 0.6], 0.3);

  // A reading stand with an atlas open on it, and the piles nobody reshelved.
  // South-east corner: clear of the door lanes AND of the 1.6 m a chest wants in
  // front of it, which is the constraint that actually decides where this goes.
  room.geo('woodDark', cyl(0.05, 0.22, 0.9, 8), poseMatrix([2.45, 0.45, 2.2]), {});
  room.geo('woodDark', new THREE.BoxGeometry(0.5, 0.04, 0.4), tiltMatrix([2.45, 0.94, 2.2], [-0.35, 2.5, 0]), { consume: true });
  room.geo('paper', new THREE.BoxGeometry(0.44, 0.03, 0.34), tiltMatrix([2.45, 0.98, 2.18], [-0.35, 2.5, 0]), { consume: true });
  room.blockCircle(2.45, 2.2, 0.26);
  for (const [px, pz] of [
    [3.05, 0.9],
    [-2.9, -1.2],
  ] as const) {
    let y = 0;
    for (let i = 0; i < 6; i++) {
      const w = room.range(0.2, 0.28);
      room.geo(
        room.pick(['bookRed', 'bookGreen', 'bookTan'] as const),
        new THREE.BoxGeometry(w, room.range(0.04, 0.07), w * 0.78),
        poseMatrix([px + room.range(-0.04, 0.04), y, pz + room.range(-0.04, 0.04)], room.range(0, 0.5)),
        { tile: 0.4, consume: true },
      );
      y += 0.07;
    }
  }
  chair(room, -0.1, 1.4, Math.PI + 0.2);
  chair(room, 0.35, -0.8, 0.1);
  armchair(room, 2.4, -1.4, -Math.PI / 2 - 0.2);

  // The rolling ladder, leaning where somebody left it a very long time ago.
  room.geo('brass', cyl(0.03, 0.03, 6.6, 6), tiltMatrix([0, 2.3, -3.3], [0, 0, Math.PI / 2]), {
  });
  for (const s of [-0.22, 0.22]) {
    room.geo('woodDark', new THREE.BoxGeometry(0.07, 2.4, 0.07), tiltMatrix([-1.9 + s, 1.2, -3.0], [0.2, 0, 0.07]), {
      consume: true,
    });
  }
  for (let i = 0; i < 7; i++) {
    room.geo(
      'woodDark',
      new THREE.BoxGeometry(0.5, 0.04, 0.09),
      tiltMatrix([-1.9 + i * 0.02, 0.24 + i * 0.32, -3.24 + i * 0.07], [0, 0, 0.07]),
      { consume: true },
    );
  }

  // Books that came off the shelves and were never put back.
  bookRow(room, 1.7, 0.02, -2.0, 1.1, 0.4, 0.5);
  for (let i = 0; i < 6; i++) {
    room.geo(
      room.pick(['bookRed', 'bookGreen', 'bookTan'] as const),
      new THREE.BoxGeometry(room.range(0.16, 0.24), room.range(0.03, 0.06), room.range(0.2, 0.3)),
      poseMatrix([room.range(-2.8, 2.8), 0.03, room.range(-2.4, 2.6)], room.range(0, Math.PI)),
      { tile: 0.4, consume: true },
    );
  }

  cobwebs(room, -3.2, -3.2, 0.8, 1.2);
  cobwebs(room, 3.2, -3.2, 2.4);

  return room.finish();
}
