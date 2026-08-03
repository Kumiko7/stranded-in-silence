import * as THREE from 'three';
import type { BuiltRoom, Collider, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { pick, range, solid } from '../../../lib/build';
import { ALL_WALLS, QUADRANTS } from './common';

/** Storage. Cluttered and blind-cornered - the room you regret running through. */
export const crates: RoomBlueprint = {
  id: 'test.crates',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 12,
  tags: ['cluttered'],
  anchors: {
    patrolPoint: [{ position: [0, 0, 2.8] }, { position: [-2.8, 0, 0] }],
    itemSpawn: [
      { position: [2.3, 0.9, 2.3] },
      { position: [-2.3, 0, 2.9] },
    ],
    // Backed against the east wall, so it faces west into the room.
    locker: [{ position: [3.3, 0, -2.4], rotationY: Math.PI / 2 }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const shell = ctx.kit.shell(ctx, crates.footprint);
  const group = new THREE.Group();
  group.add(shell.object);
  const colliders: Collider[] = [...shell.colliders];

  const wood = ctx.materials.get('wood');

  for (const [qx, qz] of QUADRANTS) {
    // The south-east corner is the locker's: a stack there opens into its door.
    if (qx > 0 && qz < 0) continue;
    const stackHeight = pick(ctx.rng, [1, 1, 2]);
    let y = 0;
    for (let i = 0; i < stackHeight; i++) {
      const size = range(ctx.rng, 0.7, 0.95);
      const jitter = i === 0 ? 0 : range(ctx.rng, -0.12, 0.12);
      const crate = solid(
        wood,
        [size, size, size],
        [qx + jitter, y, qz + jitter],
        range(ctx.rng, -0.25, 0.25),
      );
      group.add(crate.mesh);
      if (i === 0) colliders.push(crate.collider); // only the base blocks movement
      y += size;
    }
  }

  return { object: group, colliders, lights: shell.lights };
}
