import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cocoon, drools, eggCluster, lumenPod, polyps, strut } from '../kit/props';

/**
 * The Cradle - a dead end with one way in, and something's next generation
 * packed into every metre of it.
 *
 * The walls are comb: hexagonal cells, most of them capped, a few of them not.
 * Eggs are heaped on the floor in three clutches and two cocoons hang from the
 * roof at roughly the size and shape of a person. Being the only room in the
 * beast with a single door, this is where a chest is worth walking into a dead
 * end for - and the room knows it.
 */
export const brood: RoomBlueprint = {
  id: 'viscera.brood',
  nameKey: 'room.viscera.brood',
  footprint: [[0, 0]],
  // One door. Rotation serves every dead end in the map from this one blueprint.
  doorWalls: wallsFor('north'),
  weight: 8,
  tags: ['wet', 'deadend', 'cluttered'],
  anchors: {
    chest: [{ position: [0, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [-3.3, 0, -0.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [3.2, 0.94, 2.2] },
      { position: [-2.2, 0.0, -2.8] },
      { position: [3.1, 0.0, -1.4] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.2] },
      { position: [1.9, 0, 1.2] },
    ],
    enemySpawn: [{ position: [-2.6, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, brood);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'flesh', wall: 'comb', ceiling: 'sacs', band: 'comb', bandHeight: 1.4, mouth: 'sphincter' });

  // Clutches, in the corners the single doorway does not look straight into.
  eggCluster(room, -2.5, 2.6, 7, 0.85);
  eggCluster(room, 2.4, -2.7, 6, 0.75);
  eggCluster(room, 1.5, 2.9, 5, 0.6);

  // Two cocoons, hung. Person-sized, which is the whole joke.
  cocoon(room, -1.4, -2.4, 1.6, 0.4);
  cocoon(room, 2.9, 0.6, 1.35, -0.7);

  // A comb shelf grown out of the east wall, holding an item.
  room.solid('chitinPlate', [0.7, 0.92, 1.1], [3.3, 0, 2.2], 0, { tile: 0.9 });
  room.geo('chitinDark', ball(0.26, 9), tiltMatrix([3.3, 0.94, 2.2], [0, 0.3, 0], [1.2, 0.3, 1.9]), { tile: 0.5 });

  // Open cells in the comb: the ones something has already come out of, with the
  // torn cap still hanging off the rim.
  for (const [side, along, y] of [
    ['east', -2.2, 2.3],
    ['south', -2.6, 1.9],
    ['west', 2.4, 2.5],
    ['south', 2.2, 2.6],
  ] as const) {
    const x = side === 'east' ? 3.55 : side === 'west' ? -3.55 : along;
    const z = side === 'south' ? 3.55 : side === 'east' || side === 'west' ? along : -3.55;
    const yaw = side === 'east' ? -Math.PI / 2 : side === 'west' ? Math.PI / 2 : 0;
    room.geo('meatDark', new THREE.CylinderGeometry(0.3, 0.34, 0.24, 8), tiltMatrix([x, y, z], [Math.PI / 2, yaw, 0]), {
      tile: 0.4,
      consume: true,
    });
    room.geo('caul', ball(0.32, 9), tiltMatrix([x, y - 0.12, z], [0.6, yaw, 0], [1, 0.5, 1]), {
      castShadow: false,
      tile: 0.5,
    });
  }

  // Threads holding the whole nursery together, corner to corner.
  for (const [a, b] of [
    [
      [-3.3, ceilingHeight - 0.3, -3.0],
      [-1.2, 2.2, 1.4],
    ],
    [
      [3.2, ceilingHeight - 0.4, -2.0],
      [0.6, 1.9, 2.6],
    ],
  ] as const) {
    strut(room, 'strand', a, b, 0.03, 5, { castShadow: false });
  }

  polyps(room, -3.0, 0, -1.2, 0.5, 7, true);
  drools(room, 0.4, 0.6, 1.9, 9);
  drools(room, -2.4, 2.0, 1.0, 5);

  // One pod, low, so the room is lit from among the eggs rather than above them.
  lumenPod(room, [-0.4, 0.32, 1.9], 0.28, true, false, 10);
  room.geo('meatPale', ball(0.4, 10), tiltMatrix([-0.4, 0.2, 1.9], [0, 0.4, 0], [1.4, 0.5, 1.4]), { tile: 0.6 });

  return room.finish();
}
