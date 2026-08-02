import * as THREE from 'three';
import type { BuiltRoom, Collider, RoomBlueprint, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES } from '../../../lib/contract';
import { range, solid } from '../../../lib/build';
import { wallsFor } from './common';

/**
 * A dead-end store room with exactly one door.
 *
 * A blueprint whose `doorWalls` is a strict subset only fits slots needing that
 * subset, so we emit one variant per side. Generating variants from a single
 * factory keeps them in sync - much better than four near-identical files.
 */
function makeCloset(side: Side): RoomBlueprint {
  const inward = { north: 1, south: -1, east: -1, west: 1 }[side];
  const alongZ = side === 'north' || side === 'south';

  // Push the contents to the far end, away from the single doorway.
  const backX = alongZ ? 0 : 2.6 * inward;
  const backZ = alongZ ? 2.6 * inward : 0;

  return {
    id: `test.closet.${side}`,
    footprint: [[0, 0]],
    doorWalls: wallsFor(side),
    weight: 6,
    tags: ['deadEnd'],
    anchors: {
      patrolPoint: [{ position: [backX * 0.4, 0, backZ * 0.4] }, { position: [backX * 0.8, 0, backZ * 0.8] }],
      itemSpawn: [{ position: [backX, 0.95, backZ] }],
      chest: [{ position: [backX * 1.1, 0, backZ * 1.1] }],
    },
    build(ctx: RoomBuildContext): BuiltRoom {
      const shell = ctx.kit.shell(ctx, [[0, 0]]);
      const group = new THREE.Group();
      group.add(shell.object);
      const colliders: Collider[] = [...shell.colliders];

      const wood = ctx.materials.get('wood');
      const bench = solid(
        wood,
        alongZ ? [4.2, 0.9, 0.7] : [0.7, 0.9, 4.2],
        [backX * 1.25, 0, backZ * 1.25],
      );
      group.add(bench.mesh);
      colliders.push(bench.collider);

      const junk = ctx.materials.get('stone');
      for (let i = 0; i < 3; i++) {
        const s = range(ctx.rng, 0.2, 0.35);
        const spread = range(ctx.rng, -1.4, 1.4);
        const piece = solid(
          junk,
          [s, s, s],
          [alongZ ? spread : backX * 0.5, 0, alongZ ? backZ * 0.5 : spread],
          ctx.rng() * Math.PI,
        );
        group.add(piece.mesh);
        colliders.push(piece.collider);
      }

      return { object: group, colliders, lights: shell.lights };
    },
  };
}

export const closets: RoomBlueprint[] = SIDES.map(makeCloset);
