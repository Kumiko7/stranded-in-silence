import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cyl, disc, floorGully, lightShaft, motes, pulse, quad, ring, shackleWall, strut, tallyWall, wallStain } from '../kit/props';

/**
 * The Hole - punishment isolation, and the one room in the map where the night
 * circuit is out.
 *
 * Every other room in Blackgate is guaranteed navigable by the course of caged
 * beads along the base of its walls. This one has the same channel with the
 * bulbs dead in it, which is the only reason the absence reads as deliberate
 * rather than as a bug - a player has already seen twenty rooms where it works.
 *
 * What is left is a shaft of cold light from a ventilator far too high to reach,
 * a strip of it under the door, and nothing else. There is no bed. There is a
 * ring in the floor, a drain, and a wall somebody has been counting on for
 * longer than the marks make sense for.
 */
export const hole: RoomBlueprint = {
  id: 'prison.hole',
  nameKey: 'room.prison.hole',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east'),
  weight: 8,
  tags: ['blocks', 'dead-end'],
  anchors: {
    chest: [{ position: [-0.6, 0, 3.3], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.0, 0.42, -1.2] },
      { position: [1.6, 0, 3.0] },
      { position: [-2.9, 0, 1.9] },
    ],
    patrolPoint: [
      { position: [1.8, 0, 0.2] },
      { position: [-2.0, 0, -1.6] },
      { position: [-1.4, 0, 2.2] },
    ],
    enemySpawn: [{ position: [-3.1, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hole);
  room.shell({
    floor: 'concrete',
    wall: 'block',
    ceiling: 'soffit',
    band: 'none',
    // The dead circuit. Every other room in the pack is lit by this course; here
    // the channel is identical and the beads in it are grey.
    register: 'dead',
    mouth: 'gate',
    kick: true,
    seam: true,
    ports: [{ side: 'north', kind: 'grille', light: true }],
  });

  /* --- almost nothing ------------------------------------------------------------ */
  // Negative space is the whole design. One stone bench cast into the west wall,
  // a ring in the floor, and a gully. Anything else and the room stops being a
  // punishment and becomes a store.
  room.solid('surface.concrete', [0.56, 0.42, 2.0], [-3.35, 0, -1.0], 0, { tile: 0.9 });
  room.box('surface.concrete', [0.66, 0.06, 2.1], [-3.35, 0.42, -1.0], 0, { tile: 0.7, castShadow: false });
  room.box('wool', [0.5, 0.1, 0.9], [-3.3, 0.48, -1.7], 0.1, { tile: 0.4, castShadow: false });

  // The ring: a bolt through the floor in the middle of the room, with a short
  // chain on it and nothing at the other end.
  room.geo('ironPale', cyl(0.09, 0.11, 0.04, 9), poseMatrix([-0.4, 0.02, 0.4]), { castShadow: false });
  room.geo('ironBar', ring(0.07, 0.014, 8), tiltMatrix([-0.4, 0.05, 0.4], [Math.PI / 2, 0, 0]), { castShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('ironBar', ring(0.045, 0.012, 7), tiltMatrix([-0.3 + i * 0.11, 0.045, 0.5 + i * 0.07], [i % 2 ? 0.4 : Math.PI / 2, i * 0.9, 0]), { castShadow: false });
  }
  shackleWall(room, 'south', -1.4, 2, 1.55);
  floorGully(room, 1.9, -2.3, 0.15);

  /* --- the counting ------------------------------------------------------------- */
  // Three walls of it, at three heights, which is what makes it read as several
  // people rather than as decoration.
  tallyWall(room, 'west', 0.4, 1.35, 1.5, 1.1);
  tallyWall(room, 'north', -1.9, 1.05, 1.3, 0.9);
  tallyWall(room, 'south', 2.2, 1.55, 1.2, 0.8);
  wallStain(room, 'west', 2.4, 2.2, 0.55, 2.2, 'mould');
  wallStain(room, 'north', 2.6, 1.4, 0.4, 2.4, 'rust');
  motes(room, 0.4, 1.5, -0.6, 2.4, 12, 'dust');

  /* --- light ---------------------------------------------------------------------- */
  // The ventilator's shaft is the room's whole lighting design: one cold column
  // coming down out of the north wall at an angle, landing as an ellipse on the
  // floor. Its lamp is spent by the shell's port.
  lightShaft(room, [0, 2.45, -3.5], [1.0, 0.05, -0.6], 1.15, true);
  room.geo('coldWash', disc(1.5, 16), tiltMatrix([1.0, 0.014, -0.6], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  motes(room, 0.5, 1.5, -2.0, 0.8, 10, 'lime');

  // And the strip under the door: not a light, a promise of one. It is what
  // tells a player which wall the way out is on from anywhere in the room.
  room.geo('warmWash', quad(2.2, 1.5), tiltMatrix([2.9, 0.013, 0], [-Math.PI / 2, Math.PI / 2, 0]), { castShadow: false, receiveShadow: false });
  const seep = new THREE.PointLight(0xffb060, 5.5, ctx.dims.cellSize * 1.0, 2);
  seep.position.set(3.3, 0.35, 0);
  room.light(seep);
  pulse(room, seep, 5.5, 9, 0.75);

  // One dead bead, prised out of the channel and left on the floor, which is the
  // detail that says the dark in here was arranged rather than suffered.
  room.geo('bulbDead', ball(0.045, 6), poseMatrix([-2.9, 0.05, 1.9]), { castShadow: false });
  strut(room, 'ironBar', [-2.9, 0.02, 1.9], [-2.55, 0.02, 2.15], 0.008, 4, { castShadow: false, receiveShadow: false });

  return room.finish();
}
