import * as THREE from 'three';
import type { BuiltRoom, Collider, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { box, range, solid } from '../../../lib/build';
import { ALL_WALLS } from './common';

/** An archive. Tall shelves make it feel narrow even though the floor is open. */
export const shelves: RoomBlueprint = {
  id: 'test.shelves',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['cluttered'],
  anchors: {
    patrolPoint: [{ position: [0, 0, 2.4] }, { position: [0, 0, -2.4] }],
    itemSpawn: [
      { position: [2.4, 1.15, -3.2] },
      { position: [-2.4, 1.15, 3.2] },
    ],
    // Backed against the west wall, so it faces east into the room.
    locker: [{ position: [-3.3, 0, -2.4], rotationY: -Math.PI / 2 }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const shell = ctx.kit.shell(ctx, shelves.footprint);
  const group = new THREE.Group();
  group.add(shell.object);
  const colliders: Collider[] = [...shell.colliders];

  const wood = ctx.materials.get('wood');
  const clutter = ctx.materials.get('stone');

  // Two shelf units, in opposite quadrants, backed against a wall.
  for (const [x, z, rot] of [
    [2.4, -3.3, 0],
    [-2.4, 3.3, 0],
  ] as const) {
    const unit = solid(wood, [2.4, 2.3, 0.5], [x, 0, z], rot);
    group.add(unit.mesh);
    colliders.push(unit.collider);

    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 0.55 + shelf * 0.6;
      for (let i = 0; i < 4; i++) {
        if (ctx.rng() < 0.35) continue;
        const w = range(ctx.rng, 0.1, 0.2);
        group.add(box(clutter, [w, range(ctx.rng, 0.18, 0.3), 0.22], [x - 0.9 + i * 0.6, y, z + 0.05]));
      }
    }
  }

  return { object: group, colliders, lights: shell.lights };
}
