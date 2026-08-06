import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, breathe, chitinShelf, gillSlits, lumenPod, resinFlow, spike, toothRow } from '../kit/props';

/**
 * The Dentition - a room the beast grows its spares in.
 *
 * Four generations of tooth stand in rows across the floor, the oldest at the
 * back and nearly two metres of it, the newest still coming through the gum in
 * the corner. Walking the room means walking the rows, which is deliberate: the
 * sight lines are long down the aisles and nil across them.
 */
export const teeth: RoomBlueprint = {
  id: 'viscera.teeth',
  nameKey: 'room.viscera.teeth',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south', 'west'),
  weight: 9,
  tags: ['calcified', 'blind'],
  anchors: {
    chest: [{ position: [3.2, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [3.2, 1.5, -1.2] },
      { position: [-2.9, 0.0, -2.9] },
      { position: [1.2, 0.0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.75, 0, 1.5] },
      { position: [2.6, 0, -1.6] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -1.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, teeth);
  room.shell({ floor: 'suture', wall: 'enamel', ceiling: 'spines', band: 'bone', bandHeight: 1.3, mouth: 'mandible' });

  /**
   * Four rows running east-west, so the north and south doorways look straight
   * down an aisle and the west one looks across all four. Each row is offset and
   * graded: the teeth get taller and older toward the east wall.
   */
  const rows: readonly (readonly [number, number, number])[] = [
    [-2.5, 0.55, 4],
    [-0.9, 0.95, 5],
    [0.7, 1.35, 5],
    [2.3, 1.75, 4],
  ];
  for (const [z, height, count] of rows) {
    for (let i = 0; i < count; i++) {
      // The rows stop short of the east wall, which is where the containers go.
      const x = -2.4 + i * (4.4 / Math.max(1, count - 1));
      // Never in the north-south door lane at the row nearest a door.
      if (Math.abs(x) < 1.15 && Math.abs(z) > 2.0) continue;
      const h = height * (0.78 + ((i * 5) % 4) * 0.11);
      const r = 0.14 + h * 0.09;
      const lean = ((i * 7) % 5) * 0.035 - 0.07;

      room.geo('tooth', spike(r, h, 8), tiltMatrix([x, h / 2, z], [0, 0, lean]), { tile: 0.6 });
      // The root socket, and the gum it is still growing out of.
      room.geo('bonePale', new THREE.CylinderGeometry(r * 1.35, r * 1.5, 0.16, 9), poseMatrix([x, 0.08, z]), {
        tile: 0.4,
        consume: true,
      });
      room.geo('meat', ball(r * 1.5, 8), tiltMatrix([x, 0.06, z], [0, 0, 0], [1, 0.4, 1]), { tile: 0.4 });
      room.blockCircle(x, z, r * 1.15);

      // Old teeth are cracked, and one in each row has snapped off short.
      if ((i * 3) % 5 === 0) {
        room.geo('tooth', new THREE.BoxGeometry(0.03, h * 0.7, r * 1.4), tiltMatrix([x, h * 0.45, z], [0, 0.6, lean]), {
          tile: 0.3,
          consume: true,
        });
      }
    }
  }

  // The one coming through: a cusp breaking the floor in the north-west corner.
  room.geo('tooth', spike(0.3, 0.55, 8), tiltMatrix([-2.9, 0.18, -2.9], [0, 0, 0.25]), { tile: 0.5 });
  room.geo('meat', ball(0.5, 10), tiltMatrix([-2.9, 0.06, -2.9], [0, 0.4, 0], [1, 0.4, 1]), { tile: 0.6 });
  room.geo('blood', ball(0.34, 8), tiltMatrix([-2.9, 0.05, -2.9], [0, 0.4, 0], [1, 0.25, 1]), { castShadow: false });

  // The east wall: a rack of shed crowns, and a ledge holding one of them.
  for (let i = 0; i < 6; i++) {
    const z = -2.8 + i * 1.1;
    room.geo('tooth', spike(0.1 + (i % 3) * 0.02, 0.45 + (i % 3) * 0.16, 7), tiltMatrix([3.62, 2.6 - (i % 2) * 0.5, z], [Math.PI / 2, 0, 0]), {
      tile: 0.4,
    });
  }
  chitinShelf(room, 'east', 1.2, 1.5, 1.2, 0.42);
  toothRow(room, 'south', 2.2, 2.0, 6, true);
  gillSlits(room, 'north', 2.5, 2.4, 4, 1.0);
  resinFlow(room, 'east', 2.4, 2.4, 0.9);
  boneDebris(room, 1.2, 3.1, 1.0, 12);
  boneDebris(room, -1.4, -3.0, 0.8, 8);

  /**
   * Both lights are low and at opposite ends, so every tooth throws a long
   * shadow down its own aisle. A single overhead lamp would flatten the rows
   * into a floor pattern and lose the whole room.
   */
  lumenPod(room, [-3.3, 0.62, 0.2], 0.22, true, false, 9);
  room.geo('meat', ball(0.4, 9), tiltMatrix([-3.45, 0.35, 0.2], [0, 0, 0], [0.7, 1.6, 1]), { tile: 0.5 });

  const warm = new THREE.PointLight(0xffa85a, 8, ctx.dims.cellSize * 1.4, 2);
  warm.position.set(3.1, 0.7, 2.6);
  room.light(warm);
  breathe(room, warm, 8, 0.18, 1.2);
  room.geo('lumenWarm', ball(0.2, 10), poseMatrix([3.3, 0.7, 2.6]), { castShadow: false });

  return room.finish();
}
