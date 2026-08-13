import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  boulders,
  cyl,
  debris,
  floorFissure,
  glowPool,
  lavaRunnel,
  motes,
  rubble,
  spatterCone,
  steamJet,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Lava Tube - an L-shaped drained flow, and the only room in the map with a
 * corner you cannot see round.
 *
 * A tube is not a cave: it has a smooth ropy floor, a roof hung with lavacicles
 * where the last of the flow dripped as it drained, and a bench line round the
 * wall at the height the melt was standing at when it stopped. All three of
 * those follow the tube round its corner, which is what makes the L read as one
 * continuous thing rather than as two rooms stuck together.
 *
 * A live runnel still crosses the elbow. It carries a collider, so the way round
 * the corner is along the outside of the bend.
 */
export const tube: RoomBlueprint = {
  id: 'forge.tube',
  nameKey: 'room.forge.tube',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east', 'south'),
    ...wallsOn([0, 1], 'west', 'south', 'east'),
  ],
  weight: 7,
  tags: ['mountain', 'corridor'],
  anchors: {
    chest: [{ position: [10.4, 0, 3.35], rotationY: 0 }],
    locker: [{ position: [-3.4, 0, 10.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [3.2, 0, -2.9] },
      { position: [8.4, 0, -3.2] },
      { position: [-2.8, 0, 6.4] },
    ],
    patrolPoint: [
      { position: [0.2, 0, -0.4] },
      { position: [7.8, 0, 0.4] },
      { position: [0.4, 0, 8.0] },
      { position: [2.6, 0, 2.6] },
    ],
    enemySpawn: [{ position: [3.3, 0, 9.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tube);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'basalt',
    wall: 'basalt',
    ceiling: 'tube',
    band: 'basalt',
    bandHeight: 0.62,
    register: 'fissure',
    hot: true,
    mouth: 'fissure',
    seam: false,
  });

  /**
   * The bench line: a shelf of chilled crust running round the wall at the level
   * the melt stood at. It follows the L, which is what stitches the two legs of
   * the room into one tube - and it is built as overlapping lumps rather than a
   * moulding, because a continuous band at a constant height reads as a dado
   * rail somebody screwed to a cave.
   */
  const bench: readonly (readonly [number, number])[] = [
    [-3.3, -3.3], [-3.3, 0], [-3.3, 3.2], [-3.1, 6.6], [-3.3, 9.6],
    [0, 11.3], [3.2, 11.3], [3.2, 8.0], [3.4, 4.6], [6.6, 3.3],
    [9.8, 3.3], [11.3, 0], [11.3, -3.3], [8.0, -3.4], [4.6, -3.4], [1.0, -3.4],
  ];
  for (const [bx, bz] of bench) {
    for (let i = 0; i < 3; i++) {
      room.geo('cinder', ball(room.range(0.3, 0.46), 5), tiltMatrix([bx + room.range(-0.4, 0.4), 0.66 + room.range(-0.1, 0.1), bz + room.range(-0.4, 0.4)], [0, i * 2, 0], [1.5, 0.42, 1.0]), {
        tile: 0.5,
      });
    }
  }

  /* --- the elbow ---------------------------------------------------------------------- */
  // The runnel comes out of the east leg and turns down the south one, cutting
  // the inside of the bend. The way round is the outside.
  lavaRunnel(room, [7.4, -1.2], [2.6, 1.6], 0.6);
  lavaRunnel(room, [2.6, 1.6], [1.4, 6.6], 0.55);
  spatterCone(room, 2.4, 4.0, 0.9, true, 10);
  steamJet(room, 2.4, 4.0, 0.95, 1.8);

  /* --- the two legs -------------------------------------------------------------------- */
  // A collapsed section in the east leg: roof blocks on the floor and a scar
  // overhead where they came from.
  rubble(room, 6.4, -2.4, 1.4, 14);
  for (let i = 0; i < 5; i++) {
    room.geo('rockDark', ball(room.range(0.4, 0.8), 5), tiltMatrix([5.6 + room.range(-1.2, 1.2), ceilingHeight - 0.2, -2.2 + room.range(-0.8, 0.8)], [0, i, 0], [1.3, 0.5, 1.2]), {
      tile: 0.8,
    });
  }
  floorFissure(room, 9.0, -1.8, 3.4, 0.3, true);
  floorFissure(room, -2.4, 8.4, 3.6, 1.4, false);
  boulders(room, -3.0, 5.0, 0.9, 3);
  rubble(room, 8.6, 1.2, 1.4, 12);
  rubble(room, -1.4, 9.6, 1.4, 12);
  debris(room, 3.2, -2.9, 0.7, 4);

  // Squeeze-ups: blobs of melt pushed up through the floor as it cooled. Two of
  // them, out in the open, and they are the only thing in the room at knee height.
  for (const [sx, sz] of [
    [0.8, -1.6],
    [-1.0, 10.0],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      room.geo('cinder', ball(0.38 - i * 0.07, 6), poseMatrix([sx + i * 0.05, i * 0.16, sz + i * 0.04]), { tile: 0.4, castShadow: i === 0 });
    }
  }

  motes(room, 3.0, 1.7, 0, 3.4, 12, 'ash');
  motes(room, 0, 1.7, 7.0, 3.4, 12, 'spark');
  wallSign(room, 'north', -2.6, 2.2, true, 0.66, [0, 0]);
  glowPool(room, 5.0, 0.2, 2.6);
  glowPool(room, 2.0, 4.0, 2.4);
  glowPool(room, 1.6, 8.2, 1.8);

  /* --- light ------------------------------------------------------------------------- */
  // Four on a three-cell room. One is the elbow cone's, spent above. The other
  // three sit low over the runnel, one per leg and one at the bend, so the tube
  // is a line of light with the walls falling away either side of it - and both
  // legs are readable from the corner without either being evenly lit.
  const east = new THREE.PointLight(0xff7024, 11, ctx.dims.cellSize * 1.8, 2);
  east.position.set(6.4, 0.7, -0.4);
  room.shadowLight(east);
  surge(room, east, 11, 0.18, 0.38);

  const south = new THREE.PointLight(0xff7a2a, 9, ctx.dims.cellSize * 1.6, 2);
  south.position.set(1.5, 0.7, 6.8);
  room.light(south);
  surge(room, south, 9, 0.22, 0.5);

  const far = new THREE.PointLight(0xff8a3c, 6, ctx.dims.cellSize * 1.4, 2);
  far.position.set(9.8, 0.6, -2.0);
  room.light(far);
  surge(room, far, 6, 0.28, 0.62);

  return room.finish();
}
