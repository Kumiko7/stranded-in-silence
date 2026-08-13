import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  debris,
  disc,
  glowPool,
  heatShimmer,
  lavafall,
  motes,
  obsidianBlades,
  rubble,
  steamJet,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Lavafall - the brightest room in the map, and the one everybody remembers.
 *
 * A sheet of melt coming down the whole height of the west wall into an apron on
 * the floor, with a bank of cooled crust round it. Nothing else in the room is
 * lit by anything else, so every prop is a black shape against a wall of orange,
 * and a player standing in a doorway is a silhouette to everybody else in it.
 *
 * The sheet is built on the wall rather than free-standing, and its apron
 * carries the only collider: you cannot walk into it, and the room never has to
 * argue with you about that.
 */
export const lavafallRoom: RoomBlueprint = {
  id: 'forge.lavafall',
  nameKey: 'room.forge.lavafall',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['mountain', 'landmark'],
  anchors: {
    chest: [{ position: [3.35, 0, -2.4], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [1.6, 0, 3.2] },
      { position: [3.2, 0.62, -1.4] },
      { position: [-1.7, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.2] },
      { position: [2.6, 0, 1.2] },
      { position: [0.6, 0, -2.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, lavafallRoom);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'basalt',
    wall: 'basalt',
    ceiling: 'tube',
    band: 'basalt',
    bandHeight: 0.55,
    register: 'fissure',
    hot: true,
    mouth: 'fissure',
  });

  /* --- the fall -------------------------------------------------------------------- */
  lavafall(room, 'west', 0, 2.4);
  // Steam and shimmer where it lands. Both are thin: a plume at any real opacity
  // greys out the very thing it is rising off.
  steamJet(room, -2.6, -0.9, 0.2, 2.4);
  steamJet(room, -2.5, 1.0, 0.2, 2.6);
  heatShimmer(room, -2.5, 1.5, 0.0, 2.6, 3.0, Math.PI / 2);
  motes(room, -1.6, 1.8, 0, 2.4, 18, 'spark');

  /* --- the bank -------------------------------------------------------------------- */
  // A shelf of cooled crust the flow has built up in front of itself, stepping
  // down away from the wall. Three courses, each a little lower and further out.
  for (let i = 0; i < 3; i++) {
    const x = -2.0 + i * 0.75;
    const h = 0.5 - i * 0.14;
    for (let k = 0; k < 6; k++) {
      const z = -2.8 + k * 1.1 + (i % 2) * 0.3;
      room.geo('cinder', ball(0.42 - i * 0.06, 6), tiltMatrix([x, h * 0.35, z], [0, i + k, 0], [1.2, 0.7, 1.15]), {
        tile: 0.6,
        castShadow: i === 0,
      });
    }
  }
  // The bank stops 0.8 m short of both end walls, so the strip behind it stays
  // reachable rather than becoming a sealed pocket.
  room.collider({ kind: 'box', center: [-2.1, 0], halfExtents: [0.6, 2.6] });

  // Obsidian where the flow chilled fast against the old floor.
  // Everything that brings a collider is kept clear of the door lanes: the strip
  // |x| < 1.5 runs north to south between two doorways, and |z| < 1.5 runs in
  // from the east one.
  obsidianBlades(room, 2.4, 2.9, 4, 1.1);
  obsidianBlades(room, -2.2, -3.1, 3, 0.8);
  rubble(room, 1.0, -1.4, 1.2, 12);
  rubble(room, 2.8, 2.2, 1.0, 9);
  debris(room, 2.4, -2.4, 0.8, 4);

  // A dead survey tripod somebody left set up, pointing at the fall.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    room.geo('steelDark', ball(0.03, 4), tiltMatrix([3.2 + Math.cos(a) * 0.18, 0.3, -1.4 + Math.sin(a) * 0.18], [0, a, 0.28], [1, 20, 1]), {
      receiveShadow: false,
    });
  }
  room.box('steelDark', [0.26, 0.16, 0.2], [3.2, 0.6, -1.4], 0.6, { tile: 0.2 });
  room.geo('screenDead', disc(0.07, 8), poseMatrix([3.2, 0.68, -1.52], 0.6), { receiveShadow: false });

  wallSign(room, 'north', 1.6, 2.2, true);
  glowPool(room, -1.8, 0, 3.2);
  glowPool(room, 0.6, 1.4, 2.0);

  /* --- light -------------------------------------------------------------------------- */
  // Two, both warm and both OUTSIDE the sheet rather than inside it: a lamp sunk
  // in its own emissive mesh lights the inside of a box and nothing else. Low and
  // out in the room, they rim the crust bank and throw the whole floor's
  // silhouette away from the wall.
  const base = new THREE.PointLight(0xff6a1c, 16, ctx.dims.cellSize * 2.1, 2);
  base.position.set(-1.4, 0.9, 0.3);
  room.shadowLight(base);
  surge(room, base, 16, 0.16, 0.4);

  const high = new THREE.PointLight(0xff9038, 9, ctx.dims.cellSize * 1.6, 2);
  high.position.set(-1.9, ceilingHeight - 0.9, -1.8);
  room.light(high);
  surge(room, high, 9, 0.22, 0.63);

  return room.finish();
}
