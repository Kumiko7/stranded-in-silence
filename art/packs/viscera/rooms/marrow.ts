import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, boneSlab, breathe, chitinShelf, disc, gillSlits, polyps, resinFlow, strut } from '../kit/props';

/**
 * The Marrow Vault - the inside of a bone, at the scale of a room.
 *
 * The walls are trabecular: a sponge of struts with the red still in it, and
 * the red is what lights the place. Where the sponge has collapsed there are
 * cavities you can put an arm into, and something is dripping out of two of
 * them onto the floor.
 */
export const marrow: RoomBlueprint = {
  id: 'viscera.marrow',
  nameKey: 'room.viscera.marrow',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['entrance', 'calcified', 'warm'],
  anchors: {
    chest: [{ position: [-3.0, 0, 2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0.86, -2.4] },
      { position: [-3.1, 1.45, -1.6] },
      { position: [2.4, 0.0, 2.9] },
    ],
    playerSpawn: [
      { position: [-1.4, 0, 1.3], rotationY: Math.PI },
      { position: [1.4, 0, 1.3], rotationY: Math.PI },
      { position: [-1.4, 0, -1.3], rotationY: 0 },
      { position: [1.4, 0, -1.3], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.4] },
      { position: [-2.2, 0, -0.6] },
      { position: [2.2, 0, 1.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, marrow);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'bone', wall: 'marrow', ceiling: 'vault', band: 'bone', bandHeight: 0.8, mouth: 'vertebrae' });

  /* --- the sponge ------------------------------------------------------------- */
  // Struts bridging each corner: the trabecular lattice, at room scale. They are
  // corner pieces only, so nothing ever crosses a doorway.
  for (const [cx, cz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    for (let i = 0; i < 7; i++) {
      const a: readonly [number, number, number] = [
        cx * (2.2 + room.range(0, 1.2)),
        room.range(1.2, ceilingHeight - 0.2),
        cz * (2.2 + room.range(0, 1.2)),
      ];
      const b: readonly [number, number, number] = [
        cx * (2.4 + room.range(0, 1.1)),
        room.range(1.0, ceilingHeight - 0.15),
        cz * (2.4 + room.range(0, 1.1)),
      ];
      strut(room, 'bonePale', a, b, room.range(0.045, 0.1), 6, { tile: 0.5 });
      room.geo('bonePale', ball(room.range(0.07, 0.13), 7), poseMatrix(b), { tile: 0.4 });
    }
  }

  // Cavities: holes bored into the walls, each one lit red from inside.
  const cavities: readonly (readonly ['north' | 'east' | 'south' | 'west', number, number, number])[] = [
    ['north', -2.5, 1.9, 0.42],
    ['north', 2.6, 2.5, 0.3],
    ['east', 1.6, 1.4, 0.36],
    ['south', -2.8, 2.2, 0.34],
    ['south', 2.4, 1.2, 0.26],
    ['west', -1.8, 2.6, 0.4],
    ['west', 2.6, 1.6, 0.28],
  ];
  for (const [side, along, y, r] of cavities) {
    const x = side === 'west' ? -3.62 : side === 'east' ? 3.62 : along;
    const z = side === 'north' ? -3.62 : side === 'south' ? 3.62 : along;
    const yaw = side === 'north' ? 0 : side === 'south' ? Math.PI : side === 'east' ? -Math.PI / 2 : Math.PI / 2;
    const inx = Math.sin(yaw) * 0.16;
    const inz = Math.cos(yaw) * 0.16;
    room.geo('meatDark', ball(r * 1.15, 10), tiltMatrix([x, y, z], [0, yaw, 0], [1, 1, 0.55]), { tile: 0.5 });
    room.geo('pulse', disc(r * 0.72, 12), poseMatrix([x + inx, y, z + inz], yaw), { castShadow: false });
    // The rim, chipped where the bone gave way.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      room.geo(
        'bonePale',
        ball(r * 0.3, 6),
        tiltMatrix([x + inx * 0.5 + Math.cos(a) * r * Math.cos(yaw), y + Math.sin(a) * r, z + inz * 0.5 - Math.cos(a) * r * Math.sin(yaw)], [0, yaw, 0], [1, 1, 0.6]),
        { tile: 0.3 },
      );
    }
  }

  /* --- the floor -------------------------------------------------------------- */
  // A slab of bone across the north, and a shelf in the west cavity wall.
  // Off the door lanes: a slab across the middle of a wall is a slab in a
  // doorway the day the generator opens that wall.
  boneSlab(room, -2.2, -2.4, 1.8, 0.9, 0.86, 0.3);
  chitinShelf(room, 'west', -1.6, 1.45, 1.1, 0.4);
  resinFlow(room, 'north', -2.5, 1.5, 0.7);
  resinFlow(room, 'west', -1.8, 2.2, 0.6);

  // Marrow that has run out and set: two pools, thick at the edges.
  for (const [x, z, r] of [
    [-2.4, -1.4, 0.9],
    [-2.9, 2.0, 0.7],
  ] as const) {
    room.geo('blood', disc(r, 16), tiltMatrix([x, 0.024, z], [-Math.PI / 2, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
    });
    room.geo('grit', new THREE.TorusGeometry(r, 0.055, 5, 18), poseMatrix([x, 0.03, z]), { castShadow: false, consume: true });
  }

  gillSlits(room, 'east', -2.4, 2.5, 4, 1.1);
  polyps(room, 2.8, 0, 0.4, 0.5, 6, false);
  boneDebris(room, 2.4, 2.9, 1.0, 12);
  boneDebris(room, -1.6, 3.1, 0.8, 8);

  /**
   * Both lights sit INSIDE cavities in the wall, aimed out. The room is lit by
   * the holes in itself, which is why the sponge reads as deep - a lamp in the
   * middle of the floor would flatten the whole lattice.
   */
  const deep = new THREE.PointLight(0xff6a4a, 11, ctx.dims.cellSize * 1.6, 2);
  deep.position.set(-2.4, 1.9, -3.2);
  room.light(deep);
  breathe(room, deep, 11, 0.2, 0.8);

  const far = new THREE.PointLight(0xff8a5a, 7, ctx.dims.cellSize * 1.3, 2);
  far.position.set(-3.2, 2.6, -1.8);
  room.light(far);
  breathe(room, far, 7, 0.24, 1.3);

  return room.finish();
}
