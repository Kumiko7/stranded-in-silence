import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basin,
  brackets,
  cyl,
  disc,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  ring,
  toadstools,
} from '../kit/props';

/**
 * The Heartrot - the dead centre of the tree, and the only quiet room in the map.
 *
 * Black punk wood going to fibre on every surface, a floor that has slumped
 * toward the west, and a sheet of standing water two metres across with
 * nothing living in it. No fungus, no web, no sap. Nothing has moved in here
 * because there is nothing here to want.
 *
 * It is a **start room**, and that is deliberate: four people arriving in the one
 * room in Heartwood that is genuinely empty will spend the first thirty seconds
 * of a run looking for the thing that is wrong with it, and there isn't one.
 *
 * The water has a colour you can see. A near-black glossy disc on a dark floor is
 * a hole in the floor, which this project has got wrong in three separate packs
 * (docs/art/ROOM_REVIEW.md) - so it is a dull green-grey with a reflection in it
 * and a rim you can read.
 */
export const heartrot: RoomBlueprint = {
  id: 'heartwood.heartrot',
  nameKey: 'room.heartwood.heartrot',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['thicket', 'entrance'],
  anchors: {
    chest: [{ position: [2.9, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [3.3, 0, 2.85], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.4, 0.8, -0.4] },
      { position: [-1.6, 0, 3.2] },
      { position: [1.9, 0, -2.6] },
    ],
    playerSpawn: [
      { position: [-0.8, 0, -1.4], rotationY: Math.PI },
      { position: [0.7, 0, -1.4], rotationY: Math.PI },
      { position: [-0.8, 0, -2.6], rotationY: Math.PI },
      { position: [0.7, 0, -2.6], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, -1.0] },
      { position: [-2.8, 0, 3.2] },
      { position: [2.4, 0, -0.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, heartrot);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'rot',
    wall: 'rot',
    ceiling: 'knots',
    band: 'pulp',
    bandHeight: 0.55,
    register: 'weep',
    mouth: 'grown',
    ports: [{ side: 'west', kind: 'knothole', scene: 'roots' }],
  });

  /* --- the water ---------------------------------------------------------------- */
  // At deck level with a rim, because there is no hole to cut in a floor slab.
  // The rim here is a slumped ring of soft wood rather than a coaming, which is
  // what a rot pool actually is.
  basin(room, -1.7, 1.5, 1.15, 'water', 0.16);
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * Math.PI * 2;
    room.geo(
      'rotProp',
      ball(room.range(0.14, 0.3), 6),
      tiltMatrix([-1.7 + Math.cos(a) * 1.32, 0.05, 1.5 + Math.sin(a) * 1.32], [0, a, 0], [1.5, 0.4, 1.0]),
      { tile: 0.4, castShadow: false },
    );
  }
  // A skin of pale scum on part of it, and three things standing out of it. That
  // is all: a still surface with one branch in it reads deeper than a busy one.
  room.geo('mycelium', disc(0.55, 12), tiltMatrix([-2.25, 0.1, 2.05], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (const [px, pz, len, lean] of [
    [-1.2, 0.9, 1.5, 0.42],
    [-2.3, 1.8, 0.85, 0.7],
    [-1.0, 2.2, 0.5, 1.1],
  ] as const) {
    room.geo('rotProp', cyl(0.035, 0.06, len, 6), tiltMatrix([px, 0.1 + Math.cos(lean) * len * 0.5, pz], [lean, px + pz, 0]), { tile: 0.25, castShadow: true });
  }

  /* --- the rot ------------------------------------------------------------------ */
  /**
   * The walls are failing in blocks rather than in strings, which is what dry rot
   * actually does and what makes this room read as decay rather than as dirt.
   * Cubes of punk wood standing proud, and the crumb that has come off them
   * banked at the foot of every wall.
   */
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(room.rng() * 4);
    const t = room.range(-3.2, 3.2);
    const px = side === 0 ? t : side === 1 ? 3.5 : side === 2 ? t : -3.5;
    const pz = side === 0 ? -3.5 : side === 1 ? t : side === 2 ? 3.5 : t;
    const s = room.range(0.14, 0.36);
    room.geo('rotProp', ball(s, 5), tiltMatrix([px, room.range(0.4, 2.8), pz], [room.range(-0.3, 0.3), room.range(0, 3), room.range(-0.3, 0.3)], [1, 1, 1]), { tile: 0.3, castShadow: false });
  }
  for (let i = 0; i < 30; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = 2.6 + room.range(0, 1.1);
    room.geo('rotProp', ball(room.range(0.08, 0.2), 5), tiltMatrix([Math.cos(a) * d, 0.02, Math.sin(a) * d], [0, a, 0], [1.4, 0.45, 1.1]), { tile: 0.25, castShadow: false, receiveShadow: false });
  }

  // Two dead boughs down through the ceiling, both of them hollow at the end.
  for (const [bx, bz] of [[-2.4, -2.9], [3.0, 1.4]] as const) {
    limb(room, 'rotProp', [bx, ceilingHeight, bz], [bx * 0.8, 1.1, bz * 0.75], 0.24, 0.14, 0.28, bx + bz, 6, { tile: 0.6, castShadow: true });
    room.geo('eyeDark', disc(0.13, 9), tiltMatrix([bx * 0.8, 1.06, bz * 0.75], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    room.blockCircle(bx * 0.82, bz * 0.78, 0.28);
  }

  // A ledge of sound wood on the west wall, which is the only flat surface in the
  // room and therefore where anything left behind would be.
  room.box('rotProp', [0.42, 0.07, 1.5], [-3.4, 0.72, -0.4], 0, { tile: 0.3 });
  for (const s of [-1, 1]) {
    room.geo('rotProp', cyl(0.04, 0.06, 0.7, 5), poseMatrix([-3.4, 0.36, -0.4 + s * 0.55]), { tile: 0.2, castShadow: false });
  }

  litter(room, -2.6, 2.6, 1.2, 8);
  litter(room, 2.4, -1.4, 1.0, 7);
  toadstools(room, -3.2, 1.4, 0.5, 4, false);
  brackets(room, 'north', -1.4, 1.7, 2);
  foxfire(room, [-3.3, 0.3, -2.4], 0.5, 6);
  foxfire(room, [2.9, 0.28, 3.3], 0.4, 5);
  plume(room, -1.7, 1.5, 0.2, 1.5, 2.0, 'hazeMist');
  motes(room, 0.2, 0.4, 2.8, 2.4, 12, 'dust');

  /* --- light ---------------------------------------------------------------------- */
  /**
   * Two lamps, both weak, both cold, and both a long way from each other. This is
   * the darkest room in the pack by design - but "dark" here means low contrast
   * and long shadows, not black: a player standing anywhere in it can still read
   * the layout and find all three doorways, which is the rule
   * (docs/art/ROOM_FORMAT.md §6).
   */
  const near = gillLamp(room, 'east', 2.6, 1.5, true, 7);
  if (near) {
    near.castShadow = true;
    near.shadow.mapSize.set(512, 512);
    near.shadow.autoUpdate = false;
    near.shadow.needsUpdate = true;
  }
  // The second is under the water's own rim, so the pool is the brightest thing
  // in the room and it is not very bright.
  const pool = new THREE.PointLight(0x74b0a0, 5, ctx.dims.cellSize * 1.2, 2);
  pool.position.set(-1.7, 0.45, 1.5);
  room.light(pool);
  const phase = room.range(0, 20);
  room.tick((t) => {
    pool.intensity = 5 * (1 + 0.12 * Math.sin(t * 0.28 + phase) + 0.04 * Math.sin(t * 0.9 + phase));
  });
  room.geo('surface.fox', disc(1.06, 16), tiltMatrix([-1.7, 0.105, 1.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  glowPool(room, -1.7, 1.5, 3.0, 'foxWash');
  glowPool(room, 2.8, 1.0, 2.0, 'foxWash');

  return room.finish();
}
