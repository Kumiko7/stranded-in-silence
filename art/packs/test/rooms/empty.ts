import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { box, range } from '../../../lib/build';
import { ALL_WALLS } from './common';

/** The bare room. Open sightlines, nowhere to hide - the safe-feeling one. */
export const empty: RoomBlueprint = {
  id: 'test.empty',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 14,
  tags: ['open', 'entrance'],
  anchors: {
    playerSpawn: [
      { position: [1.4, 0, 1.4], rotationY: Math.PI },
      { position: [-1.4, 0, 1.4], rotationY: Math.PI },
      { position: [1.4, 0, -1.4], rotationY: 0 },
      { position: [-1.4, 0, -1.4], rotationY: 0 },
    ],
    patrolPoint: [{ position: [2.4, 0, 2.4] }, { position: [-2.4, 0, -2.4] }],
    itemSpawn: [{ position: [3.0, 0, -3.0] }, { position: [-3.0, 0, 3.0] }],
    chest: [{ position: [3.0, 0, 3.0], rotationY: 0 }],
    locker: [{ position: [-3.3, 0, -2.4], rotationY: -Math.PI / 2 }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const shell = ctx.kit.shell(ctx, empty.footprint);
  const group = new THREE.Group();
  group.add(shell.object);

  // A little scattered debris so two copies of this room do not read identically.
  const debris = ctx.materials.get('stone');
  const count = 2 + Math.floor(ctx.rng() * 3);
  for (let i = 0; i < count; i++) {
    const size = range(ctx.rng, 0.12, 0.26);
    group.add(
      box(debris, [size, size * 0.5, size], [range(ctx.rng, -3.3, 3.3), 0, range(ctx.rng, -3.3, 3.3)], ctx.rng() * Math.PI),
    );
  }

  return { object: group, colliders: shell.colliders, lights: shell.lights };
}
