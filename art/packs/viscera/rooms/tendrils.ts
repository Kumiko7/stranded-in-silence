import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, caulCurtain, cyl, drools, lumenCluster, lumenPod, polyps, tendril } from '../kit/props';

/**
 * The Thicket - the most dangerous room in the map to be chased through.
 *
 * Eleven limbs come out of the floor and the ceiling, none of them where you
 * would put them, and two curtains of caul hang across the diagonals. There is
 * no sight line longer than four metres in here, which means the hunter is
 * never where you last saw it and neither is the door you came in by.
 */
export const tendrils: RoomBlueprint = {
  id: 'viscera.tendrils',
  nameKey: 'room.viscera.tendrils',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['wet', 'cluttered', 'blind'],
  anchors: {
    locker: [{ position: [3.2, 0, -2.9], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.1, 0.9, 2.6] },
      { position: [2.4, 0.0, 2.9] },
      { position: [-2.5, 0.0, -3.1] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.2] },
      { position: [-2.6, 0, -1.6] },
      { position: [1.6, 0, 2.0] },
    ],
    enemySpawn: [{ position: [-1.4, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tendrils);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'mucosa', wall: 'flesh', ceiling: 'flesh', mouth: 'sphincter' });

  /**
   * The limbs. Every one of them is clear of the four door lanes (|x| and |z|
   * under 1.1 at the walls) - a thicket that grows across a doorway is a room
   * the generator can strand somebody in.
   */
  const limbs: readonly (readonly [number, number, number, number, number])[] = [
    [-2.4, -2.3, 2.9, 0.42, 1.1],
    [-2.6, 1.9, 2.4, 0.36, -0.6],
    [2.3, -2.0, 3.1, 0.5, 2.4],
    [2.7, 2.4, 2.2, 0.3, -1.9],
    [-1.5, -1.6, 1.8, 0.28, 0.4],
    [1.6, 1.5, 2.0, 0.34, 1.7],
    [1.5, -1.3, 2.6, 0.46, -2.6],
  ];
  for (const [x, z, h, lean, facing] of limbs) tendril(room, x, z, h, lean, facing);

  // Four more coming down out of the ceiling, which is what stops the room
  // reading as a field of posts.
  const hanging: readonly (readonly [number, number, number, number])[] = [
    [-1.2, -1.0, 1.5, 0.6],
    [2.0, 1.4, 1.9, -1.2],
    [-2.8, 2.6, 1.2, 2.2],
    [0.9, 3.0, 1.6, 0.1],
  ];
  for (const [x, z, len, facing] of hanging) {
    let px = x;
    let py = ceilingHeight;
    let pz = z;
    let angle = 0;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const step = len / 7;
      const r = 0.16 * (1 - t * 0.8) + 0.02;
      angle += 0.22 + t * 0.2;
      const nx = px + Math.sin(angle) * Math.sin(facing) * step;
      const ny = py - Math.cos(angle) * step;
      const nz = pz + Math.sin(angle) * Math.cos(facing) * step;
      room.geo(
        'meat',
        cyl(r, r * 1.2, Math.hypot(nx - px, ny - py, nz - pz) * 1.1, 7),
        tiltMatrix(
          [(px + nx) / 2, (py + ny) / 2, (pz + nz) / 2],
          [Math.acos((ny - py) / Math.max(0.001, Math.hypot(nx - px, ny - py, nz - pz))), Math.atan2(nx - px, nz - pz), 0],
        ),
        { tile: 0.6 },
      );
      room.geo('meat', ball(r * 1.05, 7), tiltMatrix([nx, ny, nz], [0, 0, 0]), { tile: 0.5 });
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  // Two curtains on the diagonals. Neither crosses a doorway; both cut the room
  // into pieces you cannot see through.
  caulCurtain(room, -1.9, -1.9, 2.6, 2.6, Math.PI / 4);
  caulCurtain(room, 2.0, 2.0, 2.4, 2.6, Math.PI / 4);

  // A ledge in the south-west corner, and the floor is knuckled with polyps.
  room.solid('cartilage', [0.9, 0.9, 0.9], [-3.15, 0, 2.6], 0.2, { tile: 0.9 });
  room.geo('meatPale', ball(0.3, 9), tiltMatrix([-3.15, 0.92, 2.6], [0, 0.2, 0], [1.4, 0.3, 1.4]), { tile: 0.5 });

  polyps(room, -1.0, 0, 2.4, 0.8, 10, true);
  polyps(room, 2.6, 0, -0.6, 0.7, 9, false);
  polyps(room, 0.2, 0, -3.2, 0.6, 7, false);
  drools(room, -0.6, 0.8, 2.0, 10);

  lumenCluster(room, 0.2, -0.4, true, true, false);
  lumenPod(room, [-3.2, 1.6, -2.6], 0.2, true, false, 7);
  room.solid('meat', [0.5, 1.6, 0.6], [-3.35, 0, -2.6], 0, { tile: 0.8 });

  return room.finish();
}
