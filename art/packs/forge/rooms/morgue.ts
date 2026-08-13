import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  arcLamp,
  ball,
  cryoDrawers,
  debris,
  disc,
  glowPool,
  medBed,
  motes,
  pipeRun,
  quad,
  shelf,
  specimenJar,
  stutter,
  wallSign,
} from '../kit/props';

/**
 * Cold Storage - the one refrigerated room inside a volcano, and the only place
 * in the map where the heat register runs cold.
 *
 * A single door, three walls of drawers, and a gurney parked where somebody left
 * it. The register here is an arc-white service light instead of the mountain's
 * ember crust, which is how a player knows before they have read anything that
 * this room is not part of the mountain - and it is the one room where the
 * absence of the map's heat is the frightening thing.
 *
 * One drawer is open. It is empty, and the frost on the tray has been disturbed.
 */
export const morgue: RoomBlueprint = {
  id: 'forge.morgue',
  nameKey: 'room.forge.morgue',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 6,
  tags: ['works', 'dead-end'],
  anchors: {
    chest: [{ position: [3.35, 0, 2.6], rotationY: Math.PI / 2 }],
    locker: [{ position: [3.4, 0, -0.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.4, 0.83, 1.4] },
      { position: [-2.6, 0.79, -2.35] },
      { position: [-3.2, 1.55, 1.5] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 3.0] },
      { position: [1.4, 0, -1.0] },
      { position: [-1.6, 0, 0.4] },
    ],
    enemySpawn: [{ position: [-3.1, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, morgue);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'pipes',
    band: 'panel',
    bandHeight: 1.0,
    register: 'cold',
    mouth: 'blast',
  });

  /* --- the drawers --------------------------------------------------------------- */
  // Nine on the north wall, six on the west. The open one is low and to the left,
  // which puts it in the first frame a player sees from the only doorway.
  cryoDrawers(room, 'north', -0.3, 3, 3, 3);
  cryoDrawers(room, 'west', -1.4, 2, 3, -1);

  /* --- the room ------------------------------------------------------------------- */
  medBed(room, 0.4, 1.4, Math.PI / 2, false);
  // A rolling tray table beside it, with the instruments still laid out.
  room.solid('steelPale', [0.7, 0.78, 0.5], [-2.6, 0, -2.35], 0, { tile: 0.4 });
  room.box('steelPale', [0.78, 0.05, 0.56], [-2.6, 0.78, -2.35], 0, { tile: 0.3 });
  for (let i = 0; i < 4; i++) {
    room.box('steelPale', [0.05, 0.02, 0.24], [-2.82 + i * 0.14, 0.83, -2.35], room.range(-0.1, 0.1), { tile: 0.2 });
  }
  shelf(room, 'west', 1.5, 1.5, 1.2, 0.34);
  for (let i = 0; i < 4; i++) specimenJar(room, -3.2, 1.55, 1.0 + i * 0.3, 0.08, 0.24, false);

  /* --- the cold ------------------------------------------------------------------- */
  // Rime creeping out from under the drawer bank, and frost fur on the pipes.
  // Transparent, because an opaque white patch lying flat reads as spilt milk.
  for (let i = 0; i < 5; i++) {
    room.geo('rime', disc(room.range(0.4, 0.9), 10), tiltMatrix([room.range(-3.0, 2.0), 0.012, room.range(-3.2, -1.2)], [-Math.PI / 2, 0, 0]), {
      receiveShadow: false,
    });
  }
  for (let i = 0; i < 14; i++) {
    room.geo('frost', ball(room.range(0.04, 0.1), 5), poseMatrix([room.range(-3.4, 3.4), ceilingHeight - room.range(0.3, 0.5), room.range(-3.4, 2.0)]), {
      receiveShadow: false,
    });
  }
  pipeRun(
    room,
    [
      [3.4, 2.7, -3.4],
      [3.4, 2.7, 1.0],
      [1.0, 2.7, 1.0],
    ],
    0.11,
    'steelPale',
    false,
  );
  motes(room, 0, 1.4, 0.6, 3.0, 10, 'ash');
  debris(room, -1.4, 2.8, 0.8, 5);
  wallSign(room, 'south', 2.6, 2.4, false);

  // The temperature panel by the door, and the number on it, which is wrong.
  room.box('graphite', [0.42, 0.34, 0.09], [2.3, 1.6, 3.6], Math.PI, { tile: 0.2 });
  room.geo('screenData', quad(0.32, 0.22), poseMatrix([2.3, 1.77, 3.54], 0), { receiveShadow: false });

  /* --- light ------------------------------------------------------------------------ */
  // Both lamps are cold and both are failing, which is what makes the drawers
  // read as a wall of dark slots rather than as a filing cabinet.
  const overhead = new THREE.PointLight(0xd0eaff, 11, ctx.dims.cellSize * 1.6, 2);
  overhead.position.set(0.2, ceilingHeight - 0.6, 0.4);
  room.shadowLight(overhead);
  stutter(room, overhead, 11, 0.55, 7.4);

  const lamp = arcLamp(room, 'east', 1.4, 2.4, true, 9);
  if (lamp) stutter(room, lamp, 9, 0.75, 4.6);

  glowPool(room, 0.2, -2.6, 1.7, true);

  return room.finish();
}
