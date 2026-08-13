import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  arcLamp,
  ball,
  bunk,
  crate,
  debris,
  glowPool,
  motes,
  quad,
  shelf,
  specimenJar,
  stutter,
  wallSign,
} from '../kit/props';

/**
 * The Crew Warren - where forty people lived eleven hundred metres inside a
 * mountain, on shifts, in three bunks to a bay.
 *
 * Everything personal in the map is in this room: taped photographs, a mug, a
 * boot, a shelf of somebody's things. It is the only room in the Works with a
 * warm light in it, and the warm light is a reading lamp somebody clipped to
 * their own bunk rail - which is why it reads as a person and not as the
 * mountain.
 *
 * The mattress on the lower south bunk has been opened along its whole length,
 * from underneath.
 */
export const dorm: RoomBlueprint = {
  id: 'forge.dorm',
  nameKey: 'room.forge.dorm',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 10,
  tags: ['works', 'entrance'],
  anchors: {
    chest: [{ position: [-3.35, 0, -2.4], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-2.6, 0, -3.4], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.4, 0.64, 2.7] },
      { position: [3.16, 1.55, -0.4] },
      { position: [0.9, 0, 3.3] },
    ],
    playerSpawn: [
      { position: [-1.5, 0, -0.9], rotationY: -Math.PI * 0.3 },
      { position: [1.5, 0, -0.9], rotationY: Math.PI * 0.3 },
      { position: [-0.6, 0, 1.2], rotationY: Math.PI },
      { position: [0.9, 0, 1.2], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.2, 0, -1.6] },
      { position: [2.6, 0, -1.6] },
    ],
    enemySpawn: [{ position: [1.0, 0, 2.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, dorm);
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'duct',
    band: 'scorch',
    bandHeight: 0.95,
    register: 'vent',
    mouth: 'blast',
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the bays ------------------------------------------------------------------ */
  bunk(room, -2.4, 2.7, 0, true);
  bunk(room, 2.4, 2.7, 0, true);
  bunk(room, 2.5, -2.7, 0, false);

  // The opened mattress on the lower south-west bunk: a long dark split with the
  // stuffing pulled out from beneath it rather than cut from above.
  room.geo('graphite', quad(1.5, 0.24), tiltMatrix([-2.4, 0.65, 2.62], [-Math.PI / 2, 0.05, 0]), { receiveShadow: false });
  for (let i = 0; i < 7; i++) {
    room.geo('itemCloth', ball(room.range(0.05, 0.11), 5), poseMatrix([-2.4 + room.range(-0.9, 0.9), 0.02, 2.7 + room.range(-0.7, 0.9)]));
  }

  /* --- what people leave ---------------------------------------------------------- */
  // Photographs taped to the wall over the north bunks, at three sizes and none
  // of them straight. Nothing else in the map is at a human scale.
  for (let i = 0; i < 9; i++) {
    room.geo('canvasPale', quad(room.range(0.13, 0.21), room.range(0.11, 0.17)), tiltMatrix([1.4 + room.range(-1.0, 1.0), 1.7 + room.range(-0.35, 0.45), -3.66], [0, Math.PI, room.range(-0.16, 0.16)]), {
      receiveShadow: false,
    });
  }
  shelf(room, 'east', 0.4, 1.5, 1.4, 0.34);
  specimenJar(room, 3.16, 1.55, 0.1, 0.08, 0.24, false);
  room.box('itemEnamel', [0.11, 0.12, 0.11], [3.2, 1.55, -0.75], 0.3, { tile: 0.2 });
  room.box('itemWood', [0.24, 0.05, 0.18], [3.14, 1.55, -1.1], -0.2, { tile: 0.2 });

  // A boot, on its side, in the middle of the floor. One boot.
  room.geo('rubber', ball(0.13, 6), tiltMatrix([-0.4, 0.1, -2.3], [0, 0.9, 1.4], [1.9, 0.75, 0.9]), { tile: 0.2 });

  crate(room, -3.1, 1.1, 0.3, 0.7, 0.5, 0.55, false);
  debris(room, 1.0, 0.4, 1.0, 7);
  motes(room, 0, 1.6, 0.4, 3.0, 9, 'ash');
  wallSign(room, 'north', -2.9, 2.45, false);
  wallSign(room, 'west', -2.9, 2.2, true);

  /* --- light ------------------------------------------------------------------------ */
  // The only warm lamp in the Works: a reading light clipped to a bunk rail. It
  // is small, it is low, and it is the reason this room feels like somebody's.
  room.box('steelDark', [0.09, 0.14, 0.09], [-1.42, 1.4, 2.35], 0.4, { tile: 0.2 });
  room.geo('bulb', ball(0.05, 6), poseMatrix([-1.42, 1.4, 2.28]), { receiveShadow: false });
  const reading = new THREE.PointLight(0xffb060, 7, ctx.dims.cellSize * 1.1, 2);
  reading.position.set(-1.42, 1.4, 2.2);
  room.light(reading);

  const lamp = arcLamp(room, 'north', 1.7, 2.5, true, 11);
  if (lamp) stutter(room, lamp, 11, 0.5, 8.2);

  glowPool(room, -1.6, 2.3, 1.1);

  return room.finish();
}
