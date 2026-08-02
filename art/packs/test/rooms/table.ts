import * as THREE from 'three';
import type { BuiltRoom, Collider, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { box, solid } from '../../../lib/build';
import { ALL_WALLS } from './common';

const TABLE_TOP_Y = 0.78;

/** A dining room. The long table is the landmark that makes this one memorable. */
export const table: RoomBlueprint = {
  id: 'test.table',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['furnished'],
  anchors: {
    patrolPoint: [{ position: [0, 0, -2.6] }, { position: [-2.8, 0, 1.6] }],
    itemSpawn: [
      { position: [2.0, TABLE_TOP_Y, 2.3] },
      { position: [2.9, TABLE_TOP_Y, 2.3] },
      { position: [-3.0, 0, -3.0] },
    ],
    chest: [{ position: [-3.0, 0, 3.1], rotationY: 0 }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const shell = ctx.kit.shell(ctx, table.footprint);
  const group = new THREE.Group();
  group.add(shell.object);
  const colliders: Collider[] = [...shell.colliders];

  const wood = ctx.materials.get('wood');
  const fabric = ctx.materials.get('fabric');

  // One collider for the whole table rather than one per leg.
  const top = solid(wood, [2.6, 0.08, 1.1], [2.4, TABLE_TOP_Y - 0.08, 2.3]);
  group.add(top.mesh);
  colliders.push(top.collider);
  for (const dx of [-1.15, 1.15]) {
    for (const dz of [-0.42, 0.42]) {
      group.add(box(wood, [0.1, TABLE_TOP_Y - 0.08, 0.1], [2.4 + dx, 0, 2.3 + dz]));
    }
  }

  for (const dx of [-0.8, 0.8]) {
    const chair = solid(fabric, [0.44, 0.46, 0.44], [2.4 + dx, 0, 1.35]);
    group.add(chair.mesh);
    colliders.push(chair.collider);
    group.add(box(fabric, [0.44, 0.5, 0.08], [2.4 + dx, 0.46, 1.17]));
  }

  return { object: group, colliders, lights: shell.lights };
}
