import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  bench,
  candles,
  cyl,
  glowPool,
  hanging,
  litter,
  mothLantern,
  motes,
  quad,
  shelf,
  stool,
} from '../kit/props';

/**
 * The Weaving Hall - two looms, and the thing on them is not wool.
 *
 * The warp is drawn from floor to ceiling in fine pale strands that catch the
 * lantern the way hair does, and the cloth coming off the second loom has a
 * pattern in it. The pattern is a room with four doorways and some small figures
 * standing in the middle of it.
 *
 * Everything solid is in the west band, which this room never opens. The middle
 * is bare parquet with one low bench on it, so a player walks in past sixteen
 * metres of drawn thread and only works out what they are looking at when they
 * are already inside.
 */
export const loomHall: RoomBlueprint = {
  id: 'heartwood.loomhall',
  nameKey: 'room.heartwood.loomhall',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['bower'],
  anchors: {
    chest: [{ position: [2.85, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [-3.3, 0, 3.1], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.35, 1.02, -1.5] },
      { position: [3.5, 1.28, 1.1] },
      { position: [-2.6, 0, 1.55] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0] },
      { position: [-0.9, 0, -2.7] },
      { position: [2.4, 0, 2.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, loomHall);
  room.shell({
    floor: 'parquet',
    wall: 'heart',
    ceiling: 'rafters',
    band: 'lattice',
    bandHeight: 1.25,
    rail: true,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'west', kind: 'niche' }],
  });

  /**
   * A warp-weighted loom: two uprights, a cloth beam, a heddle rod, the warp
   * itself and the weights hanging on it.
   *
   * The warp is the object. Ninety-odd strands would be ninety draw calls loose,
   * so they go through the room's batch as thin boxes of `strand` - unlit, which
   * is what lets one thread survive being in a dark room.
   */
  const loom = (z: number, woven: number, weights: boolean): void => {
    const x = -2.85;
    const w = 1.9;
    const h = 2.5;
    for (const s of [-1, 1]) {
      room.box('timberDark', [0.13, h, 0.16], [x, 0, z + s * w * 0.5], 0, { tile: 0.4, castShadow: true });
      room.box('timberDark', [0.36, 0.1, 0.4], [x, 0, z + s * w * 0.5], 0, { tile: 0.2 });
    }
    // Cloth beam at the top, heddle rod at chest height, breast beam low down.
    room.geo('timber', cyl(0.075, 0.075, w + 0.24, 8), tiltMatrix([x, h - 0.12, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
    room.geo('timberPale', cyl(0.035, 0.035, w + 0.1, 6), tiltMatrix([x + 0.1, 1.42, z], [Math.PI / 2, 0, 0]), { tile: 0.2, castShadow: false });
    room.geo('timber', cyl(0.055, 0.055, w + 0.16, 7), tiltMatrix([x, 0.98, z], [Math.PI / 2, 0, 0]), { tile: 0.25, castShadow: false });

    // The warp. Thirty threads is plenty at this width; sixty is a solid sheet.
    for (let i = 0; i < 30; i++) {
      const t = -w / 2 + (w * (i + 0.5)) / 30;
      const top = h - 0.16;
      const bottom = weights ? 0.28 : 0.98;
      room.box('strand', [0.008, top - bottom, 0.008], [x + (i % 2) * 0.05, bottom, z + t], 0, { castShadow: false, receiveShadow: false });
      if (weights && i % 3 === 0) {
        // Loom weights: fired clay rings, and the reason a warp-weighted loom is
        // the most legible loom to build - the row of them says what it is.
        room.geo('pottery', ball(0.055, 6), tiltMatrix([x, 0.24, z + t], [0, 0, 0], [0.7, 1.5, 0.7]), { tile: 0.1, castShadow: false, receiveShadow: false });
      }
    }
    // The finished cloth, rolled on the top beam and hanging down the front of
    // the warp. Built with folds, so the fall catches the light at a different
    // angle from the face (docs/art/ROOM_REVIEW.md).
    if (woven > 0) {
      for (let i = 0; i < 6; i++) {
        const t = -w / 2 + (w * (i + 0.5)) / 6;
        room.geo('weave', quad(w / 6 + 0.05, woven), tiltMatrix([x + 0.13 + (i % 2) * 0.02, h - 0.16 - woven / 2, z + t], [0, -Math.PI / 2, (i % 2 ? 1 : -1) * 0.05]), { castShadow: false, receiveShadow: false });
      }
      room.geo('timber', cyl(0.12, 0.12, w + 0.2, 9), tiltMatrix([x + 0.12, h - 0.12, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
    }
    room.collider({ kind: 'box', center: [x, z], halfExtents: [0.3, w / 2 + 0.06] });
  };

  loom(-1.5, 0.7, true);
  loom(1.3, 1.75, false);

  /**
   * The pattern in the second loom's cloth: a doorway, and four small figures
   * standing in a row. Boxes on top of the hanging, in a paler thread, at the
   * size a woven motif would really be.
   */
  for (let i = 0; i < 4; i++) {
    const fz = 0.65 + i * 0.42;
    room.box('timberPale', [0.02, 0.2, 0.055], [-2.68, 1.35, fz], 0, { tile: 0.1 });
    room.geo('timberPale', ball(0.04, 5), poseMatrix([-2.67, 1.61, fz]), { castShadow: false, receiveShadow: false });
    for (const s of [-1, 1]) {
      room.box('timberPale', [0.02, 0.09, 0.02], [-2.68, 1.16, fz + s * 0.035], 0, { tile: 0.08 });
    }
  }
  room.box('bone', [0.02, 0.5, 0.06], [-2.68, 1.9, 1.35], 0, { tile: 0.1 });
  room.box('bone', [0.02, 0.06, 0.62], [-2.68, 2.38, 1.35], 0, { tile: 0.1 });

  /* --- the working end -------------------------------------------------------- */
  bench(room, -2.35, -1.5, 1.2, 0, 0.98);
  room.box('timber', [1.3, 0.05, 0.5], [-2.35, 0.98, -1.5], 0, { tile: 0.4 });
  for (let i = 0; i < 5; i++) {
    // Spindles and bobbins wound with thread, standing on the bench.
    const bz = -2.0 + i * 0.25;
    room.geo('timberDark', cyl(0.012, 0.016, 0.26, 5), poseMatrix([-2.5 + (i % 2) * 0.2, 1.16, bz]), { castShadow: false, receiveShadow: false });
    room.geo(i % 2 ? 'silkProp' : 'weave', ball(0.045, 6), tiltMatrix([-2.5 + (i % 2) * 0.2, 1.14, bz], [0, 0, 0], [1, 1.5, 1]), { castShadow: false, receiveShadow: false });
  }

  stool(room, -1.75, 0.3, 0.44);
  stool(room, -1.9, -2.6, 0.44);
  basket(room, -2.6, 1.55, 0.28, 0.42, false);
  basket(room, -3.2, -3.1, 0.22, 0.3, true);

  shelf(room, 'east', -1.1, 1.26, 1.6, 0.3);
  for (let i = 0; i < 6; i++) {
    room.geo(
      i % 3 === 0 ? 'weaveGreen' : i % 3 === 1 ? 'weave' : 'linen',
      cyl(0.07, 0.07, 0.3, 7),
      tiltMatrix([3.5, 1.42, 0.4 + i * 0.28], [0, 0, Math.PI / 2]),
      { tile: 0.2, castShadow: false, receiveShadow: false },
    );
  }

  // Hangings on the north wall: the hall's finished work, and a bare rail beside
  // them where one has been taken down.
  hanging(room, 'north', -1.0, 1.4, 1.5, 1.5, 'weave');
  hanging(room, 'north', 1.1, 1.4, 1.1, 1.3, 'weaveGreen');
  room.box('timberDark', [1.0, 0.05, 0.06], [2.6, 2.9, -3.6], 0, { tile: 0.3 });

  litter(room, 3.2, 3.3, 0.8, 6);

  /* --- light ------------------------------------------------------------------ */
  // One lantern between the looms so both cast, and a second on the far side of
  // the room so the warp is backlit from one doorway and front-lit from another.
  // A drawn thread only reads when there is light behind it.
  const near = mothLantern(room, 'west', 0.05, 2.35, true, 10);
  if (near) {
    near.castShadow = true;
    near.shadow.mapSize.set(512, 512);
    near.shadow.autoUpdate = false;
    near.shadow.needsUpdate = true;
  }
  mothLantern(room, 'east', 1.9, 2.2, true, 7);
  mothLantern(room, 'south', 2.4, 2.15, false);

  candles(room, -2.35, 1.03, -1.15, 2, 0.1);
  motes(room, -2.4, 0, 1.8, 2.6, 14, 'dust');
  glowPool(room, -2.6, -1.5, 2.2);
  glowPool(room, -2.6, 1.35, 2.0);

  // Loose thread lying across the boards, running from the looms to the door.
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI);
    const len = room.range(0.8, 2.2);
    const px = room.range(-2.2, 1.5);
    const pz = room.range(-2.5, 2.5);
    room.box('strand', [len, 0.006, 0.006], [px, 0.014, pz], a, { castShadow: false, receiveShadow: false });
  }

  return room.finish();
}
