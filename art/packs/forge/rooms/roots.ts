import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  bioSac,
  bioVeins,
  cocoon,
  debris,
  floorFissure,
  glowPool,
  motes,
  rubble,
  strut,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Nursery - what got out of the Vivarium, four hundred metres away and
 * eighteen years later, growing in bare rock.
 *
 * Sacs on a chitin pedestal, veins up every wall, and two shapes wrapped against
 * the stone that used to be people. The green here is the same green as the
 * Vivarium's and it is standing in a room made entirely of the Mountain, which
 * is the only thing this room has to say and the reason it is the second of only
 * two rooms in the map that carry it.
 *
 * It is warm and it is growing, and the thing that is keeping it warm is a
 * fissure it has grown along.
 */
export const roots: RoomBlueprint = {
  id: 'forge.roots',
  nameKey: 'room.forge.roots',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 7,
  tags: ['mountain', 'bio', 'landmark'],
  anchors: {
    chest: [{ position: [-3.35, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.4, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.4, 0, 3.2] },
      { position: [-2.6, 0, 1.6] },
      { position: [2.9, 0, 0.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.4, 0, -0.6] },
      { position: [2.4, 0, -0.6] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, roots);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'basalt',
    wall: 'tuff',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.55,
    register: 'bio',
    mouth: 'fissure',
    ports: [{ side: 'south', kind: 'crack' }],
  });

  /* --- the growth ------------------------------------------------------------------ */
  // Three sacs in the south band, at three sizes. Only the biggest is lit: a
  // room of glowing pods reads as a lamp shop, and what has to carry here is the
  // silhouette of the thing curled inside the one that is.
  bioSac(room, -1.9, 0, 2.9, 1.25, true, 7);
  bioSac(room, 0.5, 0, 3.3, 0.85, false);
  bioSac(room, 2.3, 0, 2.6, 0.65, false);

  bioVeins(room, 'north', 2.2, 4);
  bioVeins(room, 'east', 2.4, 3);
  bioVeins(room, 'west', -2.4, 3);
  cocoon(room, 'north', -1.6, 0.4);
  cocoon(room, 'east', -2.4, 0.35);

  // The mat it is all growing out of: a web of cord across the floor of the south
  // band, with nodes ON it rather than a glowing cord. Glow has to be points on a
  // dark line, or a run of it reads as bunting.
  for (let i = 0; i < 11; i++) {
    const x0 = room.range(-3.2, 3.2);
    const z0 = room.range(1.4, 3.4);
    const x1 = x0 + room.range(-1.4, 1.4);
    const z1 = z0 + room.range(-1.0, 1.0);
    strut(room, 'sinew', [x0, 0.05, z0], [x1, 0.05, z1], room.range(0.025, 0.055), 5, { receiveShadow: false });
    if (room.chance(0.5)) room.geo('chitin', ball(room.range(0.045, 0.08), 5), poseMatrix([x1, 0.08, z1]), { receiveShadow: false });
  }
  // And the runners climbing off the floor into the ceiling, which is what makes
  // the room read as being colonised rather than decorated.
  for (let i = 0; i < 5; i++) {
    const x = -2.6 + i * 1.3;
    strut(room, 'sinew', [x, 0.06, 2.6 + room.range(-0.6, 0.6)], [x + room.range(-0.8, 0.8), ceilingHeight - 0.2, 1.0 + room.range(-0.8, 0.8)], room.range(0.03, 0.06), 5, {
      receiveShadow: false,
    });
  }

  /* --- the rock ---------------------------------------------------------------------- */
  floorFissure(room, -1.6, 2.4, 4.0, 0.12, true);
  rubble(room, -2.8, -2.0, 1.0, 10);
  rubble(room, 3.0, 1.6, 0.9, 9);
  rubble(room, 0.6, -1.6, 1.4, 12);
  debris(room, -2.2, -3.2, 0.8, 5);
  motes(room, 0, 1.5, 2.2, 3.2, 18, 'spore');
  wallSign(room, 'west', 2.6, 2.2, true);

  glowPool(room, -1.9, 2.9, 2.2);
  glowPool(room, -1.6, 2.4, 1.8);

  /* --- light ------------------------------------------------------------------------ */
  // One is the big sac's, spent above and beside it rather than inside it. The
  // second is a dull ember off the fissure, and the two colours meeting across
  // the floor is the whole picture: the thing is warm because the mountain is.
  const ember = new THREE.PointLight(0xff6a20, 8, ctx.dims.cellSize * 1.6, 2);
  ember.position.set(-1.5, 0.45, 1.6);
  room.shadowLight(ember);
  surge(room, ember, 8, 0.2, 0.42);

  return room.finish();
}
