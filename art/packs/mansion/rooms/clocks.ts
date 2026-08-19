import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { cobwebs, cyl, debris, longcaseClock, pendantLamp, sconce, table } from '../kit/props';

/**
 * The Clock Room - forty-one clocks, all stopped at four minutes past three.
 *
 * The identity does all the work: longcase clocks standing shoulder to shoulder
 * round the walls like people, wall clocks above them, and a repairer's bench in
 * the middle covered in movements that will never go again.
 */
export const clocks: RoomBlueprint = {
  id: 'mansion.clocks',
  nameKey: 'room.mansion.clocks',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 7,
  maxPerMap: 2,
  tags: ['wrong', 'cluttered'],
  anchors: {
    chest: [{ position: [-3.0, 0, -2.4], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0.5, 0.88, -0.2] },
      { position: [-0.6, 0.88, 0.3] },
      { position: [2.9, 1.45, 2.7] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.2] },
      { position: [-2.4, 0, -0.4] },
      { position: [2.4, 0, -1.4] },
    ],
    enemySpawn: [{ position: [2.9, 0, -2.4] }],
  },
  build,
};

/** A wall clock: case, dial, hands stopped where every other hand is stopped. */
function wallClock(room: Room, x: number, y: number, z: number, rotationY: number, radius: number): void {
  const out = (d: number): [number, number, number] => [x - Math.sin(rotationY) * d, y, z - Math.cos(rotationY) * d];

  room.geo('woodDark', cyl(radius + 0.04, radius + 0.04, 0.1, 16), tiltMatrix(out(0.05), [Math.PI / 2, rotationY, 0]), {
    tile: 0.5,
  });
  room.geo('bone', cyl(radius, radius, 0.02, 16), tiltMatrix(out(0.1), [Math.PI / 2, rotationY, 0]), {
  });
  const face = out(0.12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    room.geo(
      'ironBlack',
      new THREE.BoxGeometry(0.012, 0.012, 0.04),
      poseMatrix([face[0] + Math.cos(rotationY) * Math.cos(a) * radius * 0.82, y + Math.sin(a) * radius * 0.82, face[2] - Math.sin(rotationY) * Math.cos(a) * radius * 0.82], rotationY),
      { consume: true },
    );
  }
  // 3:04, on every dial in the room.
  room.geo('ironBlack', new THREE.BoxGeometry(0.014, radius * 0.6, 0.01), tiltMatrix([face[0], y + radius * 0.24, face[2]], [0, rotationY, -1.57]), {
    consume: true,
  });
  room.geo('ironBlack', new THREE.BoxGeometry(0.01, radius * 0.85, 0.01), tiltMatrix([face[0], y + radius * 0.36, face[2]], [0, rotationY, -0.35]), {
    consume: true,
  });
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, clocks);
  room.shell({ floor: 'boards', wall: 'plaster', wainscot: 'panel', ceiling: 'plaster', pictureRail: true });

  // Longcases shoulder to shoulder, like a queue that has been waiting a while.
  longcaseClock(room, 'north', -2.9);
  longcaseClock(room, 'north', -2.15);
  longcaseClock(room, 'north', 2.2);
  longcaseClock(room, 'east', 2.5);
  longcaseClock(room, 'east', 3.2);
  longcaseClock(room, 'west', 2.4);
  longcaseClock(room, 'south', -2.6);
  longcaseClock(room, 'south', 3.2);

  // And the wall clocks above them.
  wallClock(room, -1.2, 2.5, -3.6, Math.PI, 0.26);
  wallClock(room, 1.0, 2.7, -3.6, Math.PI, 0.19);
  wallClock(room, 3.6, 2.6, 0.4, Math.PI / 2, 0.3);
  wallClock(room, 3.6, 2.4, -1.1, Math.PI / 2, 0.16);
  wallClock(room, -3.6, 2.55, -1.6, -Math.PI / 2, 0.24);
  wallClock(room, -3.6, 2.75, 0.6, -Math.PI / 2, 0.17);
  wallClock(room, 1.4, 2.6, 3.6, 0, 0.22);
  wallClock(room, -0.4, 2.85, 3.6, 0, 0.15);

  // The repairer's bench: movements, springs, and a glass dome with nothing in it.
  table(room, 0, 0, 2.2, 1.0, 0.86, 0.04);
  for (let i = 0; i < 9; i++) {
    room.geo(
      'brass',
      cyl(room.range(0.04, 0.09), room.range(0.04, 0.09), 0.03, 10),
      poseMatrix([room.range(-0.9, 0.9), 0.88, room.range(-0.36, 0.36)], room.range(0, Math.PI)),
      {},
    );
  }
  for (let i = 0; i < 7; i++) {
    room.geo(
      'silver',
      new THREE.TorusGeometry(room.range(0.02, 0.05), 0.004, 4, 10),
      tiltMatrix([room.range(-0.9, 0.9), 0.88, room.range(-0.36, 0.36)], [Math.PI / 2, 0, 0]),
      { consume: true },
    );
  }
  room.geo('glass', cyl(0.16, 0.16, 0.34, 12, true), poseMatrix([0.5, 1.03, -0.2]), {
  });
  room.geo('woodDark', cyl(0.2, 0.2, 0.04, 12), poseMatrix([0.5, 0.88, -0.2]), {});

  // A stool, and a case of pendulums against the far wall.
  room.box('woodDark', [0.42, 0.6, 0.42], [-0.4, 0, 1.3], 0.3);
  room.blockCircle(-0.4, 1.3, 0.28);
  room.solid('woodPale', [1.3, 1.4, 0.34], [2.9, 0, 2.7], -Math.PI / 2, { tile: 1.2 });
  room.box('woodDark', [1.36, 0.05, 0.4], [2.9, 1.4, 2.7], -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    room.geo('brass', cyl(0.06, 0.06, 0.012, 12), tiltMatrix([2.98, 0.6 + room.range(-0.1, 0.5), 2.2 + i * 0.24], [0, 0, Math.PI / 2]), {
    });
  }

  pendantLamp(room, 0, 0, true);
  sconce(room, 'south', 0.6, 2.2, true);

  debris(room, -2.0, 1.6, 1.4, 8);
  cobwebs(room, -3.2, -3.2, 0.8, 1.3);
  cobwebs(room, 3.2, 3.2, 3.9);

  return room.finish();
}
