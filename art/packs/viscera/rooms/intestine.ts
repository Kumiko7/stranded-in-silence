import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, boneDebris, breathe, drools, lumenPod, organSac, polyps, resinFlow } from '../kit/props';

/**
 * The Coil - sixteen metres of gut, and the only room in the map you cannot see
 * the far end of.
 *
 * Peristaltic rings run the whole length at head height and step down as they
 * go, so the tube reads as narrowing even though it does not. Everything in it
 * has been pushed one way. So will you be.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
] as const;

export const intestine: RoomBlueprint = {
  id: 'viscera.intestine',
  nameKey: 'room.viscera.intestine',
  footprint: FOOTPRINT,
  doorWalls: [...wallsOn([0, 0], 'north', 'south', 'west'), ...wallsOn([1, 0], 'north', 'south', 'east')],
  weight: 7,
  maxPerMap: 1,
  tags: ['wet', 'corridor'],
  anchors: {
    chest: [{ position: [6.6, 0, -3.15], rotationY: Math.PI }],
    locker: [{ position: [1.4, 0, 3.25], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.4, 0.92, 2.9] },
      { position: [4.0, 0.0, -2.9] },
      { position: [9.4, 0.86, 2.7] },
    ],
    patrolPoint: [
      { position: [-2.0, 0, 0.2] },
      { position: [4.0, 0, 0.6] },
      { position: [9.6, 0, -0.4] },
    ],
    enemySpawn: [{ position: [10.8, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, intestine);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'gut', wall: 'gut', ceiling: 'palate', mouth: 'sphincter' });

  /**
   * The rings. Fifteen of them down the length of the tube, each a torus in the
   * vertical plane, stepping down and in as they go east - which is what makes
   * a straight corridor feel like it is closing.
   */
  for (let i = 0; i < 15; i++) {
    const x = -3.2 + i * 0.92;
    const t = i / 14;
    const r = 3.35 - t * 0.55;
    const y = 1.7 - t * 0.12;
    room.geo('meat', new THREE.TorusGeometry(r, 0.24 + Math.sin(t * Math.PI) * 0.1, 6, 18), tiltMatrix([x, y, 0], [0, Math.PI / 2, 0]), {
      tile: 0.9,
      castShadow: false,
      consume: true,
    });
    // A darker inner ring, set back, so each fold has depth.
    room.geo('meatDark', new THREE.TorusGeometry(r - 0.22, 0.12, 5, 16), tiltMatrix([x + 0.2, y, 0], [0, Math.PI / 2, 0]), {
      tile: 0.5,
      castShadow: false,
      consume: true,
    });
    /**
     * Every fourth fold carries a live rim. Two pods at the ends of a sixteen
     * metre tube leave the middle black, and this is the only way to light it
     * without a third real light: emission costs nothing and the rings are
     * already there.
     */
    if (i % 4 === 2) {
      room.geo('lumenWarm', new THREE.TorusGeometry(r - 0.34, 0.05, 5, 18), tiltMatrix([x + 0.26, y, 0], [0, Math.PI / 2, 0]), {
        castShadow: false,
        consume: true,
      });
    }
  }

  // Villi on the walls between the rings, and cords of muscle over the top.
  for (let i = 0; i < 26; i++) {
    const x = -3.4 + i * 0.6;
    const s = i % 2 === 0 ? -1 : 1;
    room.geo(
      'meatPale',
      new THREE.CylinderGeometry(0.06, 0.13, room.range(0.5, 1.1), 6),
      tiltMatrix([x, room.range(0.5, 2.4), s * 3.5], [s * 0.9, 0, 0]),
      { tile: 0.4, consume: true },
    );
  }

  // Two constrictions where the tube has clamped down: a sac hanging off the
  // roof of each, and the room's only cover.
  for (const [x, z] of [
    [1.2, -2.2],
    [7.0, 2.3],
  ] as const) {
    organSac(room, x, 2.05, z, 0.8, true);
    room.blockCircle(x, z, 0.72);
    polyps(room, x, 0, z, 0.9, 9, true);
  }

  // Shelves at each end, and something the gut could not move.
  room.solid('cartilage', [1.2, 0.92, 0.8], [-2.4, 0, 2.95], -0.15, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([-2.4, 0.94, 2.95], [0, -0.15, 0], [1.9, 0.3, 1.3]), { tile: 0.5 });
  room.solid('cartilage', [1.1, 0.86, 0.8], [9.4, 0, 2.75], 0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.28, 9), tiltMatrix([9.4, 0.88, 2.75], [0, 0.2, 0], [1.8, 0.3, 1.3]), { tile: 0.5 });

  room.geo('caul', ball(0.9, 12), tiltMatrix([4.4, 0.7, -1.8], [0.2, 0.7, 0], [1.2, 0.75, 1]), { castShadow: false, tile: 1.1 });
  room.geo('meatDark', ball(0.66, 10), tiltMatrix([4.4, 0.66, -1.8], [0, 0.4, 0], [1, 0.9, 1]), { tile: 0.8 });
  room.blockCircle(4.4, -1.8, 0.8);
  boneDebris(room, 4.4, -1.8, 1.3, 12);

  resinFlow(room, 'north', -2.6, 2.2, 0.9, [0, 0]);
  resinFlow(room, 'south', -1.4, 2.0, 0.8, [1, 0]);
  drools(room, 0.4, 1.6, 2.0, 10);
  drools(room, 6.6, -1.0, 2.0, 10);
  boneDebris(room, 8.6, -2.6, 1.1, 10);

  /**
   * One pod at each end, both warm, both low. Lighting a tube from the middle
   * flattens every ring at once; lighting it from the ends gives every fold a
   * bright edge and a shadow, which is the whole reason to build rings.
   */
  lumenPod(room, [-3.3, 0.9, -1.4], 0.24, true, true, 10);
  room.solid('meat', [0.5, 0.9, 0.7], [-3.5, 0, -1.4], 0, { tile: 0.7 });
  lumenPod(room, [11.3, 1.2, 1.2], 0.22, true, true, 9);
  room.geo('meatPale', new THREE.CylinderGeometry(0.14, 0.22, 1.2, 8), poseMatrix([11.45, 0.6, 1.2]), { tile: 0.6, consume: true });

  // And one in the middle, tucked behind the widest fold: a tube lit only from
  // its two ends has a black waist exactly where the cover is.
  lumenPod(room, [4.2, 1.1, 3.3], 0.2, true, false, 9);
  room.geo('meatPale', new THREE.CylinderGeometry(0.12, 0.2, 1.1, 8), poseMatrix([4.2, 0.55, 3.42]), { tile: 0.6, consume: true });

  for (const [index, lamp] of room.lights.entries()) breathe(room, lamp, [10, 9, 9][index] ?? 9, 0.18, 0.8 + index * 0.2);

  return room.finish();
}
