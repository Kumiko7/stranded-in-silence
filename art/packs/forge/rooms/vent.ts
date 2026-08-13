import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  ball,
  debris,
  floorFissure,
  glowPool,
  motes,
  mudPot,
  rubble,
  spatterCone,
  steamJet,
  surge,
  wallSign,
} from '../kit/props';

/**
 * Built once at module scope and reused by every instance of the room. The
 * batcher clones what it is given, so this is never freed and never needs to be
 * - which is exactly why it must NOT be passed `consume: true`.
 */
const BOARD = new THREE.BoxGeometry(0.28, 0.07, 1.6);

/**
 * The Fumarole - a working vent field, and the second room in the map that
 * offers all four walls.
 *
 * Two mud pots and two spatter cones, one in each corner, with the middle of the
 * floor left as bare rock: a room that can be entered from any side has to keep
 * the whole cross through the middle clear, and the discipline turns out to suit
 * a vent field exactly - the ground you can stand on is the ground that is not
 * doing anything.
 *
 * Everything here is at deck level with a raised rim. There is no hole in the
 * floor anywhere in this game, and a pot you could fall into would need one.
 */
export const vent: RoomBlueprint = {
  id: 'forge.vent',
  nameKey: 'room.forge.vent',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['mountain'],
  anchors: {
    chest: [{ position: [-3.35, 0, 2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [1.5, 0, -3.4] },
      { position: [-1.4, 0, 3.4] },
      { position: [-0.28, 0.19, 2.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [0, 0, -2.6] },
      { position: [0, 0, 2.6] },
    ],
    enemySpawn: [{ position: [3.3, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, vent);
  room.shell({
    floor: 'basalt',
    wall: 'tuff',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.5,
    register: 'fissure',
    hot: true,
    mouth: 'fissure',
  });

  /* --- the field ------------------------------------------------------------------- */
  // One feature per corner, at four different heights, so no two doorways see the
  // same silhouette.
  // Three of the four corners get a feature. The fourth is left as bare rock,
  // because the case stands on that wall and a container needs 1.6 m of clear
  // floor in front of it that a mud pot would eat.
  spatterCone(room, -2.6, -2.5, 1.25, true, 9);
  mudPot(room, 2.6, -2.5, 0.85);
  spatterCone(room, 2.55, 2.55, 0.75, false);

  // The crust between them: a rind creeping out from every vent, at deck level.
  for (const [cx, cz] of [
    [-2.6, -2.5],
    [2.6, -2.5],
    [-2.0, 3.1],
    [2.55, 2.55],
  ] as const) {
    for (let i = 0; i < 7; i++) {
      const a = room.range(0, Math.PI * 2);
      const d = 0.7 + room.rng() * 0.9;
      room.geo('surface.crustHot', ball(room.range(0.18, 0.34), 5), tiltMatrix([cx + Math.cos(a) * d, 0.02, cz + Math.sin(a) * d], [0, a, 0], [1.4, 0.16, 1.2]), {
        tile: 0.3,
      });
    }
  }

  /* --- the ground ------------------------------------------------------------------ */
  // Fissures running corner to corner across the open cross. Flat, no colliders,
  // and they are what makes the safe ground look like it is only temporarily safe.
  floorFissure(room, -1.5, -1.5, 2.6, 0.78, true);
  floorFissure(room, 1.6, 1.6, 2.4, 0.78, true);
  floorFissure(room, 1.5, -1.6, 2.2, -0.78, false);
  rubble(room, 0, 0, 2.2, 16);
  rubble(room, -3.2, -0.4, 0.7, 7);
  debris(room, 1.6, 3.2, 0.7, 4);

  // A boardwalk somebody laid across the worst of it and then abandoned: four
  // planks on blocks, going nowhere, at head-height for a crawling thing.
  for (let i = 0; i < 4; i++) {
    room.geo('itemWood', BOARD, tiltMatrix([-0.9 + i * 0.62, 0.14, 2.1 + i * 0.2], [0, 0.4, room.range(-0.05, 0.05)]), { tile: 0.4 });
  }

  steamJet(room, -2.6, -2.5, 1.3, 1.8);
  steamJet(room, 2.6, -2.5, 0.15, 1.5);
  steamJet(room, -2.0, 3.1, 0.15, 1.3);
  motes(room, 0, 1.6, 0, 3.4, 14, 'ash');
  wallSign(room, 'north', 2.6, 2.2, true);

  glowPool(room, -2.0, 3.1, 1.4);
  glowPool(room, -2.6, -2.5, 2.0);
  glowPool(room, 2.55, 2.55, 1.5);
  glowPool(room, -1.5, -1.5, 1.4);

  /* --- light ------------------------------------------------------------------------ */
  // One of the two is the big cone's, spent above. The second sits low in the
  // middle of the room off the fissures, so a player crossing the open floor is
  // underlit and throws a shadow up the far wall - which is the only reason to
  // spend a light on empty ground.
  const ground = new THREE.PointLight(0xff6a1e, 7, ctx.dims.cellSize * 1.6, 2);
  ground.position.set(0.2, 0.4, 0.2);
  room.light(ground);
  surge(room, ground, 7, 0.24, 0.5);

  return room.finish();
}
