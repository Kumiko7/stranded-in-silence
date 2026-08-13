import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  battenLight,
  crate,
  cyl,
  debris,
  glowPool,
  hangingHook,
  monitorBank,
  motes,
  ordnanceCradle,
  quad,
  railing,
  wallSign,
} from '../kit/props';

/**
 * The Ordnance Bay - what the black site is actually for.
 *
 * Two cradles against the west wall with the things they carry still strapped
 * down, a hoist on a rail over them, and a great deal of stencilling nobody is
 * going to read. What makes this room frightening is not that the ordnance is
 * dangerous: it is that it is clearly **finished**, clearly for somewhere else,
 * and clearly still waiting for a lorry that is now twenty years late.
 *
 * Behind them, a blast door welded shut and bulged outward. It is the second one
 * in the map like that, and both of them are dished the wrong way.
 */
export const armoury: RoomBlueprint = {
  id: 'forge.armoury',
  nameKey: 'room.forge.armoury',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['works', 'machinery'],
  anchors: {
    chest: [{ position: [3.4, 0, 2.4], rotationY: Math.PI / 2 }],
    locker: [{ position: [3.4, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.7, 0.88, -2.4] },
      { position: [1.5, 0, 3.2] },
      { position: [1.2, 0.7, 2.8] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-0.2, 0, -2.6] },
      { position: [2.2, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 0.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, armoury);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'ferro',
    wall: 'stencil',
    ceiling: 'trusses',
    band: 'hazard',
    bandHeight: 0.62,
    register: 'vent',
    mouth: 'blast',
    ports: [{ side: 'west', kind: 'sealed' }],
  });

  /* --- the cradles ------------------------------------------------------------- */
  ordnanceCradle(room, -2.7, -2.4, Math.PI / 2, true);
  ordnanceCradle(room, -2.7, 2.4, Math.PI / 2, false);

  // The hoist rail down the length of the bay, and the block hanging off it.
  room.geo('steel', cyl(0.09, 0.09, 7.0, 8), tiltMatrix([-2.7, ceilingHeight - 0.55, 0], [Math.PI / 2, 0, 0]), { tile: 0.6 });
  room.box('graphite', [0.3, 0.16, 7.0], [-2.7, ceilingHeight - 0.5, 0], 0, { tile: 0.7 });
  hangingHook(room, -2.7, 0.1, 1.5);

  // A painted keep-out box on the deck round the cradles, and a rail across the
  // open end of it. The rail is short of the wall at both ends on purpose.
  room.geo('paintedWarn', quad(0.12, 6.6), tiltMatrix([-1.55, 0.012, 0], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  railing(room, [-1.55, 0, -3.0], [-1.55, 0, -1.6], true, 1.0);
  railing(room, [-1.55, 0, 1.6], [-1.55, 0, 3.0], true, 1.0);

  /* --- the paperwork side -------------------------------------------------------- */
  // A despatch desk with the manifest board over it, and a stack of empty cases.
  room.solid('steelDark', [1.5, 0.88, 0.7], [-2.7, 0, -2.4 - 0.0], Math.PI / 2, { tile: 0.5 });
  monitorBank(room, 1.7, 1.6, -3.5, Math.PI, 3, 1, false);
  crate(room, 1.2, 3.2, -0.3, 0.9, 0.65, 0.7, true);
  crate(room, 1.4, -3.1, 0.4, 0.9, 0.7, 0.7, false);
  debris(room, 0.4, 2.6, 1.0, 8);
  motes(room, 0, 1.8, 0, 3.0, 9, 'ash');

  wallSign(room, 'north', -2.6, 2.4, true);
  wallSign(room, 'south', -2.4, 2.35, false);
  wallSign(room, 'east', 1.9, 2.2, true);

  /* --- light --------------------------------------------------------------------- */
  // A batten over each cradle would flatten them, so there is one, off to the
  // side, and a red beacon that turns the far end of the bay over slowly.
  const work = new THREE.PointLight(0xd0e8ff, 12, ctx.dims.cellSize * 1.7, 2);
  work.position.set(-0.6, ceilingHeight - 0.7, -1.1);
  room.shadowLight(work);
  battenLight(room, -0.6, -1.1, 2.4, Math.PI / 2, true, false);
  alarmBeacon(room, 3.5, 2.55, 3.1, true, 7);
  glowPool(room, -2.7, 0.1, 1.6, true);

  return room.finish();
}
