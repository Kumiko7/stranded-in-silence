import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { solid } from '../../../lib/build';
import { ALL_WALLS, QUADRANTS } from './common';

/** Four pillars. Breaks sightlines without blocking movement - good for chases. */
export const pillars: RoomBlueprint = {
  id: 'test.pillars',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 12,
  tags: ['open'],
  anchors: {
    patrolPoint: [{ position: [0, 0, 2.6] }, { position: [0, 0, -2.6] }, { position: [2.6, 0, 0] }],
    itemSpawn: [{ position: [3.2, 0, 0] }, { position: [-3.2, 0, 0] }],
    // Against the south wall between the pillars, facing north into the room.
    chest: [{ position: [3.1, 0, 3.15], rotationY: 0 }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const shell = ctx.kit.shell(ctx, pillars.footprint);
  const group = new THREE.Group();
  group.add(shell.object);
  const colliders = [...shell.colliders];

  const stone = ctx.materials.get('stone');
  for (const [x, z] of QUADRANTS) {
    const pillar = solid(stone, [0.55, ctx.dims.ceilingHeight, 0.55], [x, 0, z]);
    group.add(pillar.mesh);
    colliders.push(pillar.collider);
  }

  return { object: group, colliders, lights: shell.lights };
}
