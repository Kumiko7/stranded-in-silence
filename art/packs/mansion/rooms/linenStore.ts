import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { cobwebs, debris, pendantLamp } from '../kit/props';

/**
 * The Linen Store - a dead end with a wall in the middle of it.
 *
 * One door, and a partition that turns the cell into an L: you cannot see the
 * back of the room from the doorway, and you cannot see the doorway from the
 * back of the room. The best hiding place in the manor and the worst place to be
 * cornered, which is the same sentence.
 *
 * It offers one wall, so the generator can only use it at a dead end - but it
 * turns the room to face whichever way that dead end runs, which is why there is
 * one of these rather than four near-identical copies.
 */
export const linenStore: RoomBlueprint = {
  id: 'mansion.linenStore',
  nameKey: 'room.mansion.linenStore',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north'),
  weight: 14,
  tags: ['deadEnd', 'tight', 'service'],
  anchors: {
    // Behind the partition, out of sight of the only door.
    chest: [{ position: [-1.4, 0, 3.15], rotationY: 0 }],
    locker: [
      { position: [0.8, 0, 3.25], rotationY: 0 },
      { position: [1.8, 0, 3.25], rotationY: 0 },
    ],
    itemSpawn: [
      { position: [-3.15, 1.04, 1.0] },
      { position: [2.4, 0.32, -2.4] },
    ],
    patrolPoint: [{ position: [0, 0, -2.3] }, { position: [2.5, 0, 0.4] }, { position: [-0.6, 0, 2.2] }],
    enemySpawn: [{ position: [-1.6, 0, 1.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, linenStore);
  room.shell({ floor: 'boards', wall: 'plaster', wainscot: 'panel', ceiling: 'boards', cornice: false });

  // The partition, with the way through hard against one corner.
  room.solid('surface.plaster', [5.1, ctx.dims.ceilingHeight, 0.24], [-1.15, 0, -0.8], 0, { tile: 2.6 });
  room.box('woodDark', [0.3, ctx.dims.ceilingHeight, 0.34], [1.4, 0, -0.8]);

  // Deep shelves of folded linen down the far wall.
  for (let bay = 0; bay < 2; bay++) {
    const z = 1.0 + bay * 1.8;
    room.solid('woodPale', [0.7, 2.3, 1.6], [-3.3, 0, z], 0, { tile: 1.4 });
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 0.42 + shelf * 0.58;
      room.box('woodDark', [0.6, 0.04, 1.5], [-3.2, y, z]);
      for (let i = 0; i < 3; i++) {
        if (room.chance(0.25)) continue;
        room.box('linen', [0.5, room.range(0.14, 0.26), 0.42], [-3.2, y + 0.04, z - 0.5 + i * 0.5], 0, { tile: 0.8 });
      }
    }
  }

  // A pile of sheets that came off a shelf, dumped by the door and forgotten.
  room.box('linen', [0.9, 0.3, 0.7], [2.4, 0, -2.4], 0.4, { tile: 1 });
  room.box('linen', [0.7, 0.18, 0.6], [2.5, 0.3, -2.5], -0.2, { tile: 1 });

  // Brooms, stood in the corner behind the door.
  for (let i = 0; i < 3; i++) {
    const x = -3.2 + i * 0.22;
    room.geo('woodPale', new THREE.CylinderGeometry(0.022, 0.022, 1.5, 5), poseMatrix([x, 0.78, -3.0]), {
      consume: true,
    });
    room.box('deadLeaf', [0.24, 0.3, 0.1], [x, 0.02, -3.0], i);
  }

  // Two lamps, because one cannot light both halves of an L.
  pendantLamp(room, 0.6, -2.2, true);
  pendantLamp(room, -0.6, 1.6, true);

  debris(room, 1.6, -1.9, 1.1, 7);
  cobwebs(room, -3.2, -3.2, 0.8, 1.4);

  return room.finish();
}
