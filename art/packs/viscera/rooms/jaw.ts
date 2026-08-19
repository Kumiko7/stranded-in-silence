import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  boneDebris,
  breathe,
  cyl,
  drools,
  glowShaft,
  lumenPod,
  polyps,
  resinFlow,
  spike,
  strut,
  toothRow,
} from '../kit/props';

/**
 * The Second Mouth - an L of chamber with a jaw in it, and the jaw is open.
 *
 * The hinge is in the corner cell: two condyles of bone the size of cars, with
 * the upper and lower arcades running away from them down both arms. Between
 * them, on the floor of the long arm, lies the tongue - eight metres of muscle
 * with a groove worn down the middle of it, and the groove goes somewhere.
 *
 * Nothing in the beast makes it clearer that the map is inside an animal, and
 * nothing else in the pack is this unpleasant to walk the length of.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [0, 1],
] as const;

export const jaw: RoomBlueprint = {
  id: 'viscera.jaw',
  nameKey: 'room.viscera.jaw',
  footprint: FOOTPRINT,
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east', 'south'),
    ...wallsOn([0, 1], 'south', 'west', 'east'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['calcified', 'landmark', 'cluttered'],
  anchors: {
    chest: [{ position: [3.0, 0, 10.9], rotationY: Math.PI / 2 }],
    locker: [{ position: [10.9, 0, 2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.6, 0.88, -2.9] },
      { position: [7.4, 0.0, 2.4] },
      { position: [-2.9, 0.88, 10.6] },
    ],
    patrolPoint: [
      { position: [0.2, 0, -0.8] },
      { position: [7.0, 0, -1.4] },
      { position: [-1.4, 0, 7.0] },
      { position: [-1.0, 0, 10.6] },
    ],
    enemySpawn: [{ position: [10.6, 0, -1.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, jaw);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'bone', wall: 'enamel', ceiling: 'palate', band: 'bone', bandHeight: 1.1, mouth: 'mandible' });

  /* --- the hinge -------------------------------------------------------------- */
  // Two condyles in the corner cell, one above the other, with the joint capsule
  // between them. The whole room hangs off this.
  for (const [y, r, mat] of [
    [2.35, 0.9, 'bone'],
    [0.95, 1.05, 'bone'],
  ] as const) {
    room.geo(mat, ball(r, 14), tiltMatrix([-2.2, y, -2.2], [0, 0.4, 0], [1.5, 0.8, 1]), { tile: 1.0 });
  }
  room.geo('cartilage', ball(0.95, 12), tiltMatrix([-2.2, 1.68, -2.2], [0, 0.4, 0], [1.45, 0.32, 0.95]), { tile: 0.7 });
  room.blockCircle(-2.2, -2.2, 1.15);
  // Muscle hauling the hinge shut, anchored up into the roof.
  for (let i = 0; i < 5; i++) {
    const a = -0.4 + i * 0.35;
    strut(room, 'meat', [-2.2 + Math.cos(a) * 1.2, 2.9, -2.2 + Math.sin(a) * 1.2], [-3.3, ceilingHeight, -3.3], 0.17, 7, {
      tile: 0.7,
    });
  }

  /* --- the arcades ------------------------------------------------------------- */
  // Upper and lower teeth running away down both arms. The lower row stands on
  // the floor; the upper hangs from the roof at the same spacing, which is what
  // makes the two read as one jaw rather than as two rows of spikes.
  const arcade: readonly (readonly [number, number, number])[] = [
    ...Array.from({ length: 8 }, (_, i) => [0.6 + i * 1.32, -3.1, 1 - i * 0.06] as const),
    ...Array.from({ length: 8 }, (_, i) => [-3.1, 0.6 + i * 1.32, 1 - i * 0.06] as const),
  ];
  for (const [x, z, scale] of arcade) {
    const h = (1.05 + ((Math.abs(x + z) * 3) % 4) * 0.16) * scale;
    const r = 0.13 + h * 0.1;
    room.geo('tooth', spike(r, h, 8), tiltMatrix([x, h / 2, z], [0, 0, 0.06]), { tile: 0.6 });
    room.geo('meat', ball(r * 1.5, 8), tiltMatrix([x, 0.06, z], [0, 0, 0], [1, 0.4, 1]), { tile: 0.4 });
    room.blockCircle(x, z, r * 1.1);

    const upper = h * 0.82;
    room.geo('tooth', spike(r * 0.9, upper, 8), tiltMatrix([x, ceilingHeight - upper / 2, z], [Math.PI, 0, -0.06]), { tile: 0.6 });
    room.geo('meat', ball(r * 1.4, 8), tiltMatrix([x, ceilingHeight - 0.06, z], [0, 0, 0], [1, 0.4, 1]), { tile: 0.4 });
  }

  /* --- the tongue -------------------------------------------------------------- */
  // Down the long arm, with a groove worn along it. It is decoration only - a
  // walkable ridge you cannot climb is a room that funnels you into the teeth.
  for (let i = 0; i < 9; i++) {
    const z = 0.4 + i * 1.15;
    const w = 2.6 - Math.abs(i - 3) * 0.16;
    // Flat, not fat: at half its own width in height this read as an inflatable
    // whale lying in the room rather than as a floor you walk on.
    room.geo('meat', ball(w * 0.5, 12), tiltMatrix([-0.4, 0.14, z], [0, 0.2, 0], [1, 0.3, 1.35]), { tile: 1.2 });
    room.geo('meatDark', new THREE.BoxGeometry(0.42, 0.1, 1.2), poseMatrix([-0.4, 0.3, z]), { tile: 0.4, consume: true });
    /**
     * A seam of glowing tissue down the groove. It is decoration doing a job:
     * an L can only be lit from two points, and this is what stops the far arm
     * from being a corridor a player cannot find the end of.
     */
    room.geo('lumenWarm', new THREE.BoxGeometry(0.14, 0.05, 0.85), poseMatrix([-0.4, 0.33, z]), {
      castShadow: false,
      consume: true,
    });
    // Papillae, dense enough to read as a surface rather than as scattered dots.
    for (let k = 0; k < 7; k++) {
      room.geo(
        'meatPale',
        ball(room.range(0.05, 0.13), 6),
        tiltMatrix([-0.4 + room.range(-1.1, 1.1), 0.3, z + room.range(-0.55, 0.55)], [0, 0, 0], [1, 1.5, 1]),
        { tile: 0.3 },
      );
    }
  }

  /* --- the fittings -------------------------------------------------------------- */
  room.solid('bone', [1.1, 0.88, 0.9], [-2.6, 0, -2.95], 0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([-2.6, 0.9, -2.95], [0, 0.2, 0], [1.6, 0.3, 1.3]), { tile: 0.5 });
  room.solid('bone', [1.0, 0.88, 0.9], [-2.9, 0, 10.6], -0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.28, 9), tiltMatrix([-2.9, 0.9, 10.6], [0, -0.2, 0], [1.6, 0.3, 1.3]), { tile: 0.5 });

  toothRow(room, 'north', 2.4, 2.2, 6, true, [1, 0]);
  toothRow(room, 'south', -2.4, 2.2, 6, true, [0, 1]);
  resinFlow(room, 'north', -2.2, 2.4, 0.9, [0, 0]);
  resinFlow(room, 'east', 2.2, 2.2, 0.8, [1, 0]);

  polyps(room, 9.4, 0, 1.6, 0.8, 9, false);
  polyps(room, 1.6, 0, 9.4, 0.8, 9, true);
  drools(room, 5.0, -1.6, 2.0, 10);
  drools(room, -1.6, 5.0, 2.0, 10);
  boneDebris(room, 7.4, 2.9, 1.2, 12);
  boneDebris(room, 2.9, 7.4, 1.2, 12);
  boneDebris(room, 10.4, -1.0, 1.0, 9);

  glowShaft(room, [-2.2, 3.0, -2.2], [-1.0, 0.3, -1.0], 2.0, true);

  /**
   * Warm at the hinge, cold at the far end of the long arm. An L can only be
   * lit from its corner or from its ends; from the corner alone both arms fall
   * away into nothing, so this does one of each.
   */
  const lamps: readonly (readonly [number, number, number, number, boolean, number])[] = [
    [-3.2, 1.5, -0.4, 0.28, true, 17],
    [5.4, 1.5, -3.3, 0.24, true, 15],
    [10.8, 1.5, -3.3, 0.22, false, 13],
    [3.2, 1.4, 9.4, 0.22, false, 14],
  ];
  for (const [x, y, z, r, warm, power] of lamps) {
    lumenPod(room, [x, y, z], r, true, warm, power);
    room.geo('meatPale', cyl(0.13, 0.24, y, 8), poseMatrix([x + (Math.abs(x) > 4 ? 0 : Math.sign(x) * 0.24), y / 2, z + (Math.abs(x) > 4 ? -0.16 : 0)]), {
      tile: 0.6,
    });
  }
  for (const [index, lamp] of room.lights.entries()) breathe(room, lamp, lamps[index]?.[5] ?? 12, 0.18, 0.7 + index * 0.2);

  return room.finish();
}
