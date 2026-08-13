import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ashCast,
  ashDrift,
  ball,
  debris,
  floorFissure,
  glowPool,
  lightShaft,
  motes,
  rubble,
  spatterCone,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Ash Fall - a chamber the mountain filled while people were still in it.
 *
 * A bore driven through the west wall lets a column of grey light down from
 * somewhere very far above, and the ash under it is drifted into dunes. In three
 * places the drift has set round something and the something has not lasted, so
 * what is left is the hollow: a person-shaped void with its arms over its head.
 *
 * Nothing in this room is dangerous and nothing in it moves. It is the quietest
 * room in the map and it is the worst one.
 */
export const cast: RoomBlueprint = {
  id: 'forge.cast',
  nameKey: 'room.forge.cast',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['mountain', 'landmark'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.35], rotationY: Math.PI }],
    itemSpawn: [
      { position: [1.2, 0, 3.1] },
      { position: [1.4, 0, -3.3] },
      { position: [3.3, 0, 1.9] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.4] },
      { position: [1.0, 0, 2.0] },
      { position: [0.4, 0, -2.4] },
    ],
    enemySpawn: [{ position: [3.3, 0, -2.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cast);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'ash',
    wall: 'tuff',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.4,
    register: 'fissure',
    mouth: 'fissure',
    ports: [{ side: 'west', kind: 'bore', light: true }],
  });

  /* --- the drift -------------------------------------------------------------------- */
  ashDrift(room, -2.4, -1.0, 1.5, 0.4);
  ashDrift(room, -2.0, 2.2, 1.7, -0.2);
  ashDrift(room, 1.4, 3.1, 1.3, 0.15);
  for (let i = 0; i < 16; i++) {
    room.geo('ashPale', ball(room.range(0.1, 0.3), 5), tiltMatrix([room.range(-3.2, 3.2), 0.02, room.range(-3.2, 3.2)], [0, i, 0], [1.5, 0.24, 1.3]), {
      tile: 0.4,
    });
  }

  /* --- the casts -------------------------------------------------------------------- */
  // Three, at three angles, and all of them curled. What makes a silhouette read
  // as a person is that it is NOT a rectangle: a head, a waist narrower than the
  // shoulders, and limbs with daylight between them.
  // A cast is a 1.1 x 1.9 m box turned to an arbitrary angle, so its corners
  // reach further than its size suggests. All three are kept clear of the strip
  // |x| < 1.5 that runs between the north and south doorways.
  ashCast(room, -2.5, 0.6, 0.4, true);
  ashCast(room, 2.6, 2.6, -1.9, true);
  ashCast(room, -2.6, -2.6, 2.3, false);

  // A fourth shape that is only most of the way to being one, half buried.
  room.geo('ashPale', ball(0.26, 6), tiltMatrix([2.5, 0.12, -1.6], [0.2, 1.1, 0], [1.5, 0.6, 0.8]), { tile: 0.3, castShadow: true });
  room.geo('ashPale', ball(0.13, 5), poseMatrix([2.28, 0.16, -2.0]), { tile: 0.2, castShadow: true });

  /* --- the light shaft --------------------------------------------------------------- */
  // Down from the bore, landing on the floor. Additive, so it adds only the
  // bright and never lays a grey film over the drift it crosses.
  lightShaft(room, [-3.3, 2.2, -0.2], [-1.6, 0.02, 0.9], 1.3, true);
  glowPool(room, -1.7, 0.9, 1.6, true);
  motes(room, -2.0, 1.4, 0.4, 1.6, 20, 'ash');
  motes(room, 0.6, 1.6, 1.6, 3.0, 10, 'ash');

  /* --- the rock ----------------------------------------------------------------------- */
  floorFissure(room, 2.6, 1.8, 3.0, 1.3, true);
  spatterCone(room, 3.2, 3.2, 0.55, false);
  rubble(room, 2.8, -2.4, 1.0, 9);
  rubble(room, 0.4, -1.0, 1.4, 10);
  debris(room, -0.4, 3.2, 0.8, 4);
  wallSign(room, 'north', 2.6, 2.2, true);

  // A hand tool lying where it was dropped, half under the ash. One object in
  // this room is man-made, and it is the wrong size for the room around it.
  room.box('steelDark', [0.44, 0.05, 0.07], [0.2, 0.03, -1.1], 0.9, { tile: 0.2 });
  room.box('itemWood', [0.2, 0.05, 0.06], [-0.05, 0.03, -1.25], 0.9, { tile: 0.2 });

  glowPool(room, 2.6, 1.8, 1.6);

  /* --- light ------------------------------------------------------------------------ */
  // One lamp is the bore's, spent by the shell, and it is cold grey - the only
  // daylight anywhere in the map, and it is still not daylight. The second is a
  // dull ember off the fissure, and between them the casts are lit from two
  // directions at once, which is what gives them their edges.
  const ember = new THREE.PointLight(0xff6a20, 7, ctx.dims.cellSize * 1.5, 2);
  ember.position.set(2.4, 0.5, 1.8);
  room.shadowLight(ember);
  surge(room, ember, 7, 0.22, 0.4);

  void ceilingHeight;
  return room.finish();
}
