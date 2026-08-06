import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bilePool, boneDebris, drools, fleshFolds, glowShaft, polyps, ribArch } from '../kit/props';

/**
 * The Stomach - a chamber half full of something that is still working on the
 * last thing to fall in here.
 *
 * The lake is the room: it lights everything from below, it eats the floor at
 * its edge, and the only dry ground is the rugae shelf along the west wall. In
 * the middle of it stands what is left of an animal that did not get out, its
 * ribs going the way the bone floor of every other chamber came from.
 */
export const stomach: RoomBlueprint = {
  id: 'viscera.stomach',
  nameKey: 'room.viscera.stomach',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 9,
  tags: ['wet', 'acid', 'open'],
  anchors: {
    chest: [{ position: [-3.0, 0, 2.8], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0.9, 0.86, -1.4] },
      { position: [-3.15, 1.0, -2.2] },
      { position: [2.9, 0.0, -3.1] },
    ],
    patrolPoint: [
      { position: [-2.4, 0, 0.2] },
      { position: [1.6, 0, 2.4] },
      { position: [2.6, 0, -1.6] },
    ],
    enemySpawn: [{ position: [3.3, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, stomach);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'mucosa',
    wall: 'gut',
    ceiling: 'sacs',
    mouth: 'sphincter',
    pores: [{ side: 'north', kind: 'membrane', tall: true, light: true }],
  });

  // The lake. Overlapping pools rather than one disc, so the edge is ragged and
  // the surface is not a single flat circle you can read as a plate.
  const lake: readonly (readonly [number, number, number])[] = [
    [0.6, 0.4, 2.5],
    [-0.9, 1.9, 1.7],
    [1.9, -1.6, 1.5],
    [-0.2, -2.4, 1.1],
  ];
  for (const [x, z, r] of lake) bilePool(room, x, z, r, false);
  // Only one of them carries the real light, sunk in the middle of the lake so
  // everything in the room is underlit.
  bilePool(room, 0.9, 0.1, 1.2, true, 11);

  // What is left of the last animal, standing in the middle of it.
  ribArch(room, -1.4, 1.15, 1.5, 0.17, 0.9, 0.35, 'bonePale');
  ribArch(room, -0.6, 1.0, 1.3, 0.15, 0.9, 0.35, 'bonePale');
  ribArch(room, 0.2, 0.8, 1.05, 0.13, 0.9, 0.35, 'bonePale');
  room.geo('bone', ball(0.34, 10), tiltMatrix([0.9, 0.62, -1.9], [0.4, 0.5, 0], [1.5, 0.85, 1]), { tile: 0.6 });
  room.solid('bone', [0.5, 0.86, 1.9], [0.9, 0, -1.4], 0.35, { tile: 0.9 });
  // The bone is being eaten: pitted, and pale where the acid has reached it.
  for (let i = 0; i < 7; i++) {
    room.geo(
      'grit',
      ball(room.range(0.06, 0.15), 6),
      tiltMatrix([0.9 + room.range(-0.5, 0.5), room.range(0.1, 0.9), -1.4 + room.range(-0.9, 0.9)], [0, 0, 0], [1, 0.6, 1]),
      { tile: 0.3 },
    );
  }

  // The dry shelf along the west wall - a ledge of rugae, and the only place in
  // the room a chest could sit without dissolving.
  room.solid('meat', [0.85, 0.94, 2.0], [-3.35, 0, -2.2], 0, { tile: 1.1 });
  room.geo('meatPale', ball(0.5, 10), tiltMatrix([-3.35, 0.96, -2.2], [0, 0.3, 0], [1.7, 0.34, 3.8]), { tile: 0.7 });
  fleshFolds(room, 'west', 1.6, 2.4, 5);
  fleshFolds(room, 'south', -2.2, 2.2, 4);

  // Gastric rugae running up the north wall, under the membrane.
  fleshFolds(room, 'north', 2.4, 2.2, 4);
  glowShaft(room, [0, 2.6, -3.6], [0.6, 0.1, 0.6], 1.7);

  polyps(room, -2.6, 0, -3.2, 0.7, 9, true);
  polyps(room, 3.2, 0, 1.4, 0.6, 7, false);
  drools(room, 1.4, 1.0, 1.8, 9);
  drools(room, -1.8, -2.6, 1.2, 6);
  boneDebris(room, 2.9, -3.0, 0.9, 11);
  boneDebris(room, -1.2, 3.2, 0.8, 7);

  // The crust the lake leaves as it drops: a tidemark all round the room.
  for (const [x, z, r] of lake) {
    room.geo('grit', new THREE.TorusGeometry(r + 0.22, 0.05, 5, 20), tiltMatrix([x, 0.03, z], [0, 0, 0]), {
      castShadow: false,
      consume: true,
    });
  }

  // Something still hanging from the roof, half digested.
  room.geo('caul', ball(0.55, 10), tiltMatrix([-2.3, ceilingHeight - 1.15, 2.2], [0.2, 0.6, 0], [1, 1.5, 1]), {
    castShadow: false,
    tile: 0.9,
  });
  room.geo('meatDark', new THREE.CylinderGeometry(0.07, 0.05, 0.9, 6), tiltMatrix([-2.3, ceilingHeight - 0.45, 2.2], [0, 0, 0]), {
    tile: 0.4,
    consume: true,
  });

  return room.finish();
}
