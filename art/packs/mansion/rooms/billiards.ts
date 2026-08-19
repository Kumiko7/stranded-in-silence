import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { armchair, ball, cobwebs, cyl, debris, painting, pendantLamp, sconce } from '../kit/props';

/**
 * The Billiard Room - the balls are still set for a break nobody took.
 *
 * A table this size in a room this size means there is exactly one way round it,
 * and the low shaded lamp over the baize lights the middle and nothing else.
 * Stand at the wall and you are invisible; cross the room and you are not.
 */
export const billiards: RoomBlueprint = {
  id: 'mansion.billiards',
  nameKey: 'room.mansion.billiards',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['cluttered'],
  anchors: {
    chest: [{ position: [3.05, 0, -2.7], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, -2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-0.6, 0.83, 0.0] },
      { position: [2.9, 0.92, 2.6] },
      { position: [-2.7, 0.0, 2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.6] },
      { position: [0, 0, -2.6] },
      { position: [-2.7, 0, 0.2] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, billiards);
  room.shell({
    floor: 'parquet',
    wall: 'damaskRed',
    wainscot: 'panel',
    ceiling: 'plaster',
    pictureRail: true,
  });

  // The table: slate bed, baize, cushioned rails, six pockets.
  const w = 3.4;
  const d = 1.8;
  room.box('surface.panel', [w + 0.24, 0.76, d + 0.24], [0, 0, 0], 0, { tile: 1.6 });
  room.box('velvetGreen', [w, 0.06, d], [0, 0.76, 0], 0, { tile: 1.8 });
  for (const dz of [-1, 1]) {
    room.box('woodDark', [w + 0.24, 0.1, 0.16], [0, 0.76, (dz * (d + 0.16)) / 2]);
  }
  for (const dx of [-1, 1]) {
    room.box('woodDark', [0.16, 0.1, d + 0.24], [(dx * (w + 0.16)) / 2, 0.76, 0]);
  }
  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 1]) {
      room.geo(
        'ironBlack',
        new THREE.TorusGeometry(0.09, 0.03, 5, 10),
        poseMatrix([(dx * (w - 0.1)) / 2, 0.8, (dz * (d + 0.06)) / 2]),
        { consume: true },
      );
    }
  }
  for (const [dx, dz] of [
    [-1.5, -0.7],
    [1.5, -0.7],
    [-1.5, 0.7],
    [1.5, 0.7],
  ] as const) {
    room.geo('woodDark', cyl(0.11, 0.15, 0.76, 10), poseMatrix([dx, 0.38, dz]), {});
  }
  room.collider({ kind: 'box', center: [0, 0], halfExtents: [(w + 0.2) / 2, (d + 0.2) / 2] });

  // The break, racked and never taken.
  const ballColours = ['bookRed', 'bookTan', 'bookGreen'] as const;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i <= r; i++) {
      room.geo(
        room.pick(ballColours),
        ball(0.028, 8),
        poseMatrix([0.9 + r * 0.05, 0.83, -0.07 * r + i * 0.058]),
        {},
      );
    }
  }
  room.geo('bone', ball(0.028, 8), poseMatrix([-0.6, 0.83, 0.0]), {});
  // A cue on the baize, and chalk.
  room.geo('woodPale', cyl(0.008, 0.017, 1.45, 6), tiltMatrix([-0.1, 0.82, 0.5], [0, 0.35, Math.PI / 2]), {
  });
  room.box('velvetGreen', [0.05, 0.04, 0.05], [1.4, 0.86, 0.82]);

  // Cue rack and score board on the north wall.
  room.box('surface.panel', [1.5, 1.9, 0.14], [-2.2, 0.4, -3.62], 0, { tile: 1.2 });
  for (let i = 0; i < 5; i++) {
    if (i === 3) continue;
    room.geo('woodPale', cyl(0.009, 0.019, 1.5, 6), poseMatrix([-2.75 + i * 0.28, 1.05, -3.5]), {
    });
  }
  room.box('surface.panel', [1.4, 0.8, 0.08], [1.8, 1.5, -3.62]);
  room.box('bone', [1.2, 0.6, 0.02], [1.8, 1.6, -3.56]);
  for (let i = 0; i < 6; i++) {
    room.geo('ironBlack', new THREE.BoxGeometry(0.02, 0.34, 0.01), poseMatrix([1.3 + i * 0.2, 1.72, -3.54]), {
      consume: true,
    });
  }

  pendantLamp(room, 0, 0, true);
  sconce(room, 'south', -2.4, 2.1, true);

  armchair(room, -2.8, 1.6, -Math.PI / 2 - 0.3, true);
  room.solid('wood', [1.2, 0.86, 0.44], [2.9, 0, 2.6], -Math.PI / 2, { tile: 1.2 });
  room.box('woodDark', [1.26, 0.06, 0.5], [2.9, 0.86, 2.6], -Math.PI / 2);
  room.geo('glass', cyl(0.06, 0.08, 0.24, 10), poseMatrix([2.9, 0.98, 2.3]), {});
  room.box('bookTan', [0.28, 0.04, 0.34], [-2.7, 0.0, 2.9], 0.5);

  painting(room, 'east', 1.6, 1.6, 0.9, 1.2, 0);
  painting(room, 'west', -1.2, 1.55, 0.7, 0.9, 3);

  debris(room, 2.4, -1.6, 1.2, 7);
  cobwebs(room, -3.2, 3.2, 5.5);
  cobwebs(room, 3.2, -3.2, 2.4, 1.1);

  return room.finish();
}
