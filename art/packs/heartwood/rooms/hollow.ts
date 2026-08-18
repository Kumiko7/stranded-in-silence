import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  ball,
  basket,
  candles,
  carvedPanel,
  cyl,
  disc,
  glowPool,
  litter,
  mossPatch,
  mothLantern,
  motes,
  phial,
  post,
  pot,
  quad,
  shelf,
  strut,
} from '../kit/props';

/**
 * The Hollow Gate - the landing at the top of the stair, and where a run begins.
 *
 * Somebody built a porch inside a tree: four carved newel posts holding a hoop
 * of hanging phials, a peg rail with cloaks still on it, a shelf of lamp oil,
 * and a floor worn to a shine down the middle by however many feet.
 *
 * It offers all four walls, so every solid thing in it lives in a corner or flat
 * against a wall, and the whole middle is bare parquet. That is not a compromise
 * - it is the room. A player arrives, can see straight out of every doorway, and
 * gets one clear look at what this place used to be before any of the rest of it
 * happens.
 */
export const hollow: RoomBlueprint = {
  id: 'heartwood.hollow',
  nameKey: 'room.heartwood.hollow',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['bower', 'entrance'],
  anchors: {
    chest: [{ position: [-3.2, 0, 1.95], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -1.95], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.2, 1.36, 3.52] },
      { position: [-2.2, 1.36, -3.52] },
      { position: [-1.7, 0, 3.35] },
    ],
    playerSpawn: [
      { position: [-0.9, 0, 1.15], rotationY: 0 },
      { position: [0.9, 0, 1.15], rotationY: 0 },
      { position: [-0.9, 0, -1.15], rotationY: Math.PI },
      { position: [0.9, 0, -1.15], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.0, 0, -2.0] },
      { position: [2.0, 0, 2.0] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hollow);
  room.shell({
    floor: 'parquet',
    wall: 'heart',
    ceiling: 'vault',
    band: 'plank',
    bandHeight: 1.15,
    rail: true,
    register: 'sapline',
    mouth: 'carved',
  });

  /* --- the four newels ------------------------------------------------------ */
  // One carved post per corner with a hoop of hanging phials between them. They
  // are the room's only vertical rhythm and they are what a player reads the
  // space by - and they are hard against the corners, because a room offering
  // all four walls has nowhere else a solid thing may stand.
  const NEWEL = 3.05;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * NEWEL;
    const z = sz * NEWEL;
    post(room, 'timberDark', 0.15, 0.19, 0.24, [x, 0, z], 8, { tile: 0.3 });
    post(room, 'timber', 0.11, 0.14, 2.05, [x, 0.24, z], 8, { tile: 0.6, castShadow: true });
    // Fluting: four reeds up the shaft, which is the pack's carving language.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      post(room, 'timberPale', 0.025, 0.03, 1.9, [x + Math.cos(a) * 0.125, 0.3, z + Math.sin(a) * 0.125], 5, {
        tile: 0.2,
        castShadow: false,
        receiveShadow: false,
      });
    }
    // Capital, and a carved acorn on top of it.
    post(room, 'timberDark', 0.19, 0.13, 0.16, [x, 2.29, z], 8, { tile: 0.2 });
    room.geo('timberDark', ball(0.13, 8), tiltMatrix([x, 2.44, z], [0, 0, 0], [1, 0.5, 1]), { tile: 0.2, castShadow: false });
    room.geo('bone', ball(0.12, 8), tiltMatrix([x, 2.53, z], [0, 0, 0], [1, 1.25, 1]), { tile: 0.2, castShadow: false });
    room.blockCircle(x, z, 0.17);
  }
  // The hoop, and the phials hanging off it. Two draws' worth of detail that
  // ties the ceiling to the floor and puts a light at eye level in four corners.
  for (const [ax, az, bx, bz] of [
    [-NEWEL, -NEWEL, NEWEL, -NEWEL],
    [-NEWEL, NEWEL, NEWEL, NEWEL],
    [-NEWEL, -NEWEL, -NEWEL, NEWEL],
    [NEWEL, -NEWEL, NEWEL, NEWEL],
  ] as const) {
    strut(room, 'copper', [ax, 2.42, az], [bx, 2.42, bz], 0.018, 5, { tile: 0.4, castShadow: false, receiveShadow: false });
  }
  for (let i = 0; i < 8; i++) {
    const t = room.range(0.12, 0.88);
    const onX = i % 2 === 0;
    const far = i % 4 < 2;
    const px = onX ? -NEWEL + t * NEWEL * 2 : far ? -NEWEL : NEWEL;
    const pz = onX ? (far ? -NEWEL : NEWEL) : -NEWEL + t * NEWEL * 2;
    const drop = room.range(0.18, 0.46);
    room.geo('strand', cyl(0.008, 0.008, drop, 4), poseMatrix([px, 2.42 - drop / 2, pz]), {
      tile: 0.2,
      castShadow: false,
      receiveShadow: false,
    });
    phial(room, px, 2.42 - drop - 0.15, pz, 0.045, 0.15, room.chance(0.55));
  }

  /* --- what is against the walls --------------------------------------------- */
  // A peg rail on the north wall with cloaks on it, hung with folds so it reads
  // as cloth rather than as three planks (docs/art/ROOM_REVIEW.md).
  room.box('timberDark', [1.9, 0.06, 0.1], [-2.2, 1.42, -3.6], 0, { tile: 0.4 });
  for (let i = 0; i < 4; i++) {
    const x = -3.0 + i * 0.55;
    room.box('timberDark', [0.05, 0.05, 0.16], [x, 1.34, -3.52], 0, { tile: 0.15 });
    if (i === 1 || i === 3) continue;
    for (let k = 0; k < 3; k++) {
      room.geo(
        i === 0 ? 'weaveGreen' : 'weave',
        quad(0.2, room.range(0.6, 0.95)),
        tiltMatrix([x + (k - 1) * 0.09, 0.95, -3.44 + k * 0.02], [0, 0, (k - 1) * 0.11]),
        { castShadow: false, receiveShadow: false },
      );
    }
  }
  shelf(room, 'north', 2.2, 1.3, 1.5, 0.34);
  for (let i = 0; i < 4; i++) {
    phial(room, -1.65 - i * 0.36, 1.36, -3.52, 0.05, 0.17, i === 1);
  }

  shelf(room, 'south', 2.2, 1.3, 1.5, 0.34);
  pot(room, 2.7, 1.36, 3.52, 0.11, 0.22, 'verdigris');
  pot(room, 1.75, 1.36, 3.52, 0.09, 0.17);

  basket(room, -1.7, 3.35, 0.25, 0.38, false);
  basket(room, -2.25, 3.5, 0.18, 0.26, true);
  basket(room, 2.5, -3.4, 0.22, 0.32, false);
  pot(room, -3.45, 0, -1.5, 0.2, 0.38);

  // The story wall: carved panels of the people who lived here, hung well OFF
  // the centreline of each wall. Every wall here may become a doorway, and a
  // doorway's architrave reaches about a metre either side of centre - so a
  // panel over the middle of a wall is a panel with a door through it.
  carvedPanel(room, 'south', -2.35, 1.5, 1.6, 1.0, 2);
  carvedPanel(room, 'north', -2.35, 1.5, 1.6, 1.0, 2);
  carvedPanel(room, 'east', 2.35, 1.5, 1.6, 1.0, 2);
  carvedPanel(room, 'west', 2.35, 1.5, 1.6, 1.0, 2);

  // Moss creeping in at the edges of a floor somebody used to sweep.
  mossPatch(room, -3.5, 0.02, 0.4, 0.7, 5);
  mossPatch(room, 3.4, 0.02, 1.4, 0.6, 4);
  litter(room, 3.2, -3.3, 0.7, 6);

  /* --- light ------------------------------------------------------------------ */
  // Two lanterns on opposite walls, which is what makes the newels throw across
  // the room in two directions rather than one. Everything else in here is the
  // sapline, the phials and three candles.
  const west = mothLantern(room, 'west', -1.9, 2.15, true, 10);
  if (west) {
    west.castShadow = true;
    west.shadow.mapSize.set(512, 512);
    west.shadow.autoUpdate = false;
    west.shadow.needsUpdate = true;
  }
  mothLantern(room, 'east', 1.9, 2.15, true, 8);
  mothLantern(room, 'south', -2.4, 2.1, false);

  candles(room, 2.2, 1.35, 3.52, 3, 0.14);
  motes(room, 0, 0, 2.6, 2.4, 16, 'pollen');

  // The worn path down the middle: a pale wash on the parquet where the traffic
  // went. Additive, so it lightens the boards rather than laying a rug on them.
  // ONE quad rather than a quad plus a disc plus a pool: stacked, the three of
  // them put an orange puddle in the middle of the floor on the first sheet.
  room.geo('sapWash', quad(1.7, 7.4), tiltMatrix([0, 0.014, 0], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  return room.finish();
}
