import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, breathe, cocoon, cyl, disc, drools, lumenPod, resinFlow } from '../kit/props';

/**
 * The Comb - a wall of cells, and most of them are still capped.
 *
 * Three faces of hexagonal chitin from floor to ceiling, each cell about the
 * width of a shoulder. Nine of them are open. Two of those have something part
 * way out and set into resin, which stopped being a rescue attempt and became
 * the room's only warm light.
 *
 * The comb is a lockable-looking thing that is not a locker, and players check
 * every cell anyway - which is exactly how long this room means to hold them.
 */
export const hive: RoomBlueprint = {
  id: 'viscera.hive',
  nameKey: 'room.viscera.hive',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east'),
  weight: 9,
  tags: ['calcified', 'cluttered'],
  anchors: {
    chest: [{ position: [-1.2, 0, 3.2], rotationY: 0 }],
    locker: [{ position: [1.8, 0, 3.25], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.05, 1.62, 0.4] },
      { position: [-3.05, 2.42, -2.0] },
      { position: [2.6, 0.0, -2.8] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.2] },
      { position: [-1.8, 0, -2.2] },
      { position: [2.2, 0, 1.6] },
    ],
    enemySpawn: [{ position: [-3.0, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hive);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'chitin', wall: 'comb', ceiling: 'chitin', mouth: 'mandible' });

  /**
   * The cells, on the three walls the generator can never open. Each is a short
   * hexagonal tube standing proud of the comb, so the wall has depth at grazing
   * angles instead of being a texture pretending to.
   */
  const faces: readonly (readonly ['south' | 'west', number])[] = [
    ['south', 0],
    ['west', 0],
  ];
  for (const [side] of faces) {
    for (let row = 0; row < 5; row++) {
      const y = 0.55 + row * 0.62;
      const offset = (row % 2) * 0.42;
      for (let i = 0; i < 8; i++) {
        const along = -3.0 + offset + i * 0.84;
        if (Math.abs(along) > 3.2) continue;
        const x = side === 'west' ? -3.45 : along;
        const z = side === 'south' ? 3.45 : along;
        const yaw = side === 'west' ? Math.PI / 2 : 0;
        // Capped, open, or occupied - deterministic from the cell's own index.
        const roll = (row * 7 + i * 13) % 11;
        const depth = 0.28 + (roll % 3) * 0.05;

        room.geo('chitinPlate', cyl(0.36, 0.38, depth, 6), tiltMatrix([x, y, z], [Math.PI / 2, yaw, 0]), {
          tile: 0.5,
        });
        const face: [number, number, number] = [x + Math.sin(yaw) * depth * 0.55, y, z + Math.cos(yaw) * depth * 0.55];

        if (roll < 6) {
          // Capped: a waxed lid, slightly domed.
          room.geo('resin', disc(0.33, 6), poseMatrix(face, yaw), { castShadow: false });
          room.geo('chitinDark', new THREE.TorusGeometry(0.34, 0.03, 5, 6), poseMatrix(face, yaw), { tile: 0.3, consume: true });
        } else if (roll < 9) {
          // Open, and the dark in it goes back further than the tube does.
          room.geo('chitinDark', disc(0.32, 6), poseMatrix([x, y, z], yaw), { castShadow: false });
        } else {
          // Occupied. Something is part way out and did not get further.
          room.geo('chitinDark', disc(0.32, 6), poseMatrix([x, y, z], yaw), { castShadow: false });
          room.geo('embryo', ball(0.24, 9), tiltMatrix(face, [0, yaw, 0], [1, 0.85, 1.5]), { tile: 0.5 });
          room.geo('resin', ball(0.3, 8), tiltMatrix([face[0], y - 0.1, face[2]], [0, yaw, 0], [1, 1.3, 1]), {
            castShadow: false,
            tile: 0.5,
          });
        }
      }
    }
  }

  // Two ledges of comb standing out far enough to put something on.
  for (const [y, z] of [
    [1.62, 0.4],
    [2.42, -2.0],
  ] as const) {
    room.solid('chitinPlate', [0.5, 0.12, 1.1], [-3.15, y, z], 0, { tile: 0.7 });
    room.geo('chitinDark', new THREE.BoxGeometry(0.16, 0.34, 1.0), tiltMatrix([-3.32, y - 0.2, z], [0, 0, 0.35]), {
      tile: 0.4,
      consume: true,
    });
  }
  // The ledges are shelves, not obstacles: strip the collider `solid` gave them
  // so nothing at head height blocks the floor beneath it.
  room.colliders.splice(room.colliders.length - 2, 2);

  cocoon(room, -2.2, 1.6, 1.4, 0.5);
  cocoon(room, 1.2, -2.6, 1.2, -0.4);
  resinFlow(room, 'south', -2.4, 2.6, 0.9);
  resinFlow(room, 'west', 2.2, 2.2, 0.7);
  drools(room, 0.6, 1.8, 1.5, 7);
  boneDebris(room, 2.6, -2.8, 1.0, 10);

  // Warm, from the two occupied cells: the only light the room has, and it is
  // coming from inside the wall.
  lumenPod(room, [-3.1, 1.05, -1.2], 0.2, true, true, 9);
  const cell = new THREE.PointLight(0xffa860, 7, ctx.dims.cellSize * 1.3, 2);
  cell.position.set(-1.0, 2.1, 3.0);
  room.light(cell);
  breathe(room, cell, 7, 0.2, 1.1);
  room.geo('lumenWarm', ball(0.16, 9), poseMatrix([-1.0, 2.1, 3.2]), { castShadow: false });

  return room.finish();
}
