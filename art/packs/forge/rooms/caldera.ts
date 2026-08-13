import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  alarmBeacon,
  floorFissure,
  ball,
  boulders,
  catwalk,
  crate,
  cyl,
  debris,
  glowPool,
  heatShimmer,
  ladder,
  lavaPool,
  motes,
  obsidianBlades,
  post,
  quad,
  railing,
  rubble,
  spatterCone,
  steamJet,
  strut,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Caldera - a 2x2 chamber with a lava lake in the middle of it, and the one
 * room in the map you can see all the way across.
 *
 * The lake fills the whole centre and the walkable floor is the ring round it,
 * which falls straight out of the door lanes: on a 2x2 the openings are centred
 * on every cell, so the strips at x = 0, x = 8, z = 0 and z = 8 have to stay
 * clear - and a lake that exactly fills what is left is a set piece the geometry
 * asked for rather than one imposed on it.
 *
 * The Works is clinging to the north-east corner - a gantry, a ladder, a
 * catwalk over the lake it should never have been built across - and losing.
 * The lake surges on a slow cycle you feel in the shadows before you see it in
 * the light, and there is nowhere in this room a player is not lit from below.
 */
export const caldera: RoomBlueprint = {
  id: 'forge.caldera',
  nameKey: 'room.forge.caldera',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
    ...wallsOn([0, 1], 'south', 'west'),
    ...wallsOn([1, 1], 'south', 'east'),
  ],
  weight: 6,
  tags: ['mountain', 'landmark'],
  anchors: {
    chest: [
      { position: [-3.35, 0, 2.6], rotationY: -Math.PI / 2 },
      { position: [11.35, 0, 5.4], rotationY: Math.PI / 2 },
    ],
    locker: [{ position: [5.4, 0, 11.4], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.0, 0.66, 6.0] },
      { position: [9.4, 0, -3.2] },
      { position: [2.6, 0, 11.2] },
      { position: [11.2, 0, 0.4] },
    ],
    patrolPoint: [
      { position: [4.0, 0, -2.6] },
      { position: [-2.6, 0, 4.0] },
      { position: [4.0, 0, 10.6] },
      { position: [10.6, 0, 4.0] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 10.8] }],
  },
  build,
};

const LAKE_X = 4;
const LAKE_Z = 4;
const LAKE = 5.2;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, caldera);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'basalt',
    wall: 'basalt',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.55,
    register: 'fissure',
    hot: true,
    mouth: 'fissure',
  });

  /* --- the lake -------------------------------------------------------------------- */
  lavaPool(room, LAKE_X, LAKE_Z, LAKE, LAKE, 0, true, 18);
  // Crust rafts drifting on it, at four sizes. They are what stop a lit rectangle
  // reading as a lit rectangle.
  for (let i = 0; i < 4; i++) {
    const rx = LAKE_X + room.range(-LAKE * 0.34, LAKE * 0.34);
    const rz = LAKE_Z + room.range(-LAKE * 0.34, LAKE * 0.34);
    room.geo('rockDark', ball(room.range(0.26, 0.5), 6), tiltMatrix([rx, 0.06, rz], [0, room.range(0, 3), 0], [1.5, 0.14, 1.3]), { tile: 0.7 });
  }
  // A fountain at the far corner of it, throwing specks. Slow, small, constant.
  for (let i = 0; i < 13; i++) {
    room.geo('lumenMolten', ball(room.range(0.03, 0.075), 4), poseMatrix([5.6 + room.range(-0.6, 0.6), room.range(0.1, 2.1), 2.2 + room.range(-0.6, 0.6)]), {
      receiveShadow: false,
    });
  }
  steamJet(room, 5.6, 2.2, 0.4, 2.6);
  heatShimmer(room, LAKE_X, 1.8, LAKE_Z - LAKE / 2 - 0.3, 6.0, 3.0, 0);
  heatShimmer(room, LAKE_X, 1.8, LAKE_Z + LAKE / 2 + 0.3, 6.0, 3.0, 0);
  motes(room, LAKE_X, 2.2, LAKE_Z, 4.0, 26, 'spark');

  /* --- the works, clinging on --------------------------------------------------------- */
  // A gantry frame in the north-east corner and a catwalk out over the lake that
  // stops halfway. Nobody is getting up there, which is the point of putting
  // vertical interest in a game with no vertical movement: it costs nothing.
  for (const [gx, gz] of [
    [9.6, -2.4],
    [11.0, -2.4],
    [9.6, 0.6],
    [11.0, 0.6],
  ] as const) {
    post(room, 'tempered', 0.1, 0.13, 2.7, [gx, 0, gz], 6, { castShadow: true });
  }
  for (const y of [1.3, 2.6]) {
    room.geo('tempered', cyl(0.06, 0.06, 3.2, 5), tiltMatrix([10.3, y, -2.4], [Math.PI / 2, Math.PI / 2, 0]), { tile: 0.4 });
    room.geo('tempered', cyl(0.06, 0.06, 3.2, 5), tiltMatrix([10.3, y, 0.6], [Math.PI / 2, Math.PI / 2, 0]), { tile: 0.4 });
  }
  room.geo('surface.grate', quad(1.6, 3.2), tiltMatrix([10.3, 2.66, -0.9], [-Math.PI / 2, 0, 0]), { tile: 0.7 });
  catwalk(room, [9.6, 2.62, 1.0], [5.2, 2.62, 4.4], 1.0);
  ladder(room, 'east', -1.0, [1, 0]);
  alarmBeacon(room, 10.3, 2.8, -2.4, false);

  // The cable that used to feed it, hanging down and going into the lake.
  strut(room, 'cable', [10.3, 2.5, 0.7], [8.4, 0.9, 2.2], 0.05, 5, { receiveShadow: false });
  strut(room, 'cable', [8.4, 0.9, 2.2], [7.0, 0.1, 3.0], 0.05, 5, { receiveShadow: false });

  /* --- the ring ------------------------------------------------------------------------ */
  // A rail on the two sides where the ledge is narrowest, broken in the middle of
  // each so the ring never becomes a sealed corridor.
  railing(room, [-1.0, 0, 0.6], [1.0, 0, 0.6], true, 1.02);
  railing(room, [7.0, 0, 7.4], [9.0, 0, 7.4], true, 1.02);
  room.geo('paintedWarn', quad(0.12, 5.6), tiltMatrix([1.0, 0.012, 4.0], [-Math.PI / 2, Math.PI / 2, 0]), { receiveShadow: false });

  /**
   * Fissures radiating off the lake across the whole ring.
   *
   * A 5.2 m lake is the biggest thing the door lanes leave room for, and on its
   * own in a sixteen-metre chamber it reads as a campfire rather than as a
   * caldera. These are what make the FLOOR the hot thing: they are flat, they
   * carry no collider, so unlike anything else in the room they are allowed to
   * cross the lanes - which is the only reason the heat can reach the corners.
   */
  for (const [fx, fz, len, yaw] of [
    [1.0, 0.6, 4.4, 0.78],
    [7.2, 0.8, 3.8, -0.78],
    [0.8, 7.4, 4.0, -0.7],
    [7.0, 7.2, 4.6, 0.72],
    [4.0, -1.4, 3.4, 0.06],
    [4.2, 9.6, 3.0, -0.1],
    [-1.6, 4.2, 3.2, 1.5],
    [9.8, 3.8, 2.8, 1.5],
  ] as const) {
    floorFissure(room, fx, fz, len, yaw, room.chance(0.6));
  }

  spatterCone(room, -2.9, -2.7, 1.15, false);
  spatterCone(room, 10.8, 9.4, 0.85, false);
  obsidianBlades(room, -2.4, 9.6, 5, 1.2);
  obsidianBlades(room, 10.6, -3.0, 3, 0.8);
  // On a 2x2 the openings are centred on EVERY cell, so the lanes at x = 0, x = 8,
  // z = 0 and z = 8 all have to stay clear - which leaves nowhere on the ring wide
  // enough for a heap of `boulders()` and its scattered colliders. The rock on the
  // ledge is `rubble()`, which reads the same and blocks nothing.
  rubble(room, 2.0, -3.0, 1.4, 14);
  rubble(room, -3.0, 6.6, 1.2, 12);
  rubble(room, 5.6, 10.8, 1.3, 13);
  rubble(room, 0.4, 10.4, 1.6, 14);
  rubble(room, 10.4, 2.0, 1.4, 12);
  debris(room, -2.8, 1.0, 0.9, 6);

  // A shipping case somebody was carrying when they stopped carrying it.
  crate(room, -3.0, 6.0, 0.4, 0.9, 0.66, 0.7, false);
  crate(room, 2.6, 11.0, -0.3, 0.8, 0.6, 0.62, true);

  wallSign(room, 'west', -2.6, 2.3, true, 0.66, [0, 0]);
  wallSign(room, 'south', 2.6, 2.3, true, 0.66, [1, 1]);

  glowPool(room, LAKE_X, LAKE_Z, 6.4);
  glowPool(room, -2.9, -2.7, 1.6);
  glowPool(room, 1.0, 0.6, 2.4);
  glowPool(room, 7.0, 7.2, 2.4);

  /* --- light --------------------------------------------------------------------------- */
  // Four on a 2x2, and the lake has already spent one of them from above its own
  // surface. Three more sit low on three sides so nothing in the ring is lit from
  // only one direction, and the whole room is underlit - there is nowhere in here
  // a player does not throw their shadow up a wall.
  const west = new THREE.PointLight(0xff7a26, 9, ctx.dims.cellSize * 1.8, 2);
  west.position.set(0.6, 0.8, 4.0);
  room.light(west);
  surge(room, west, 9, 0.2, 0.44);

  const east = new THREE.PointLight(0xff8a3c, 8, ctx.dims.cellSize * 1.7, 2);
  east.position.set(7.6, 0.8, 5.0);
  room.light(east);
  surge(room, east, 8, 0.24, 0.57);

  const far = new THREE.PointLight(0xff6a1e, 7, ctx.dims.cellSize * 1.6, 2);
  far.position.set(4.2, 0.8, 7.6);
  room.light(far);
  surge(room, far, 7, 0.26, 0.36);

  void ceilingHeight;
  return room.finish();
}
