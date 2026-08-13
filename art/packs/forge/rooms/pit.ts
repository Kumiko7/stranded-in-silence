import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { boxGeometry } from '../../../lib/build';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  catwalk,
  crate,
  cyl,
  debris,
  disc,
  glowPool,
  hangingHook,
  heatShimmer,
  lightShaft,
  motes,
  post,
  quad,
  railing,
  ring,
  rubble,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Drop - a disposal shaft, and the room that is honest about what the
 * facility was doing with what it could not keep.
 *
 * A four-metre well in the south half of the floor with a coaming of welded
 * plate round it, a light coming UP out of it, and a chain rail that has been
 * cut on one side. There is a hoist over it and a hook on the end of the hoist.
 *
 * The well is at deck level with a raised rim rather than recessed, because the
 * kit lays one solid floor slab per cell and anything below y = 0 is behind it.
 * A raised coaming reads as a well; a hole does not exist.
 */
export const pit: RoomBlueprint = {
  id: 'forge.pit',
  nameKey: 'room.forge.pit',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['hinge', 'mountain', 'landmark'],
  anchors: {
    chest: [{ position: [-3.35, 0, -2.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [2.6, 0, -3.4], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.9, 0, 2.9] },
      { position: [3.2, 0.65, 2.6] },
      { position: [0.4, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [0, 0, -0.4] },
      { position: [-2.9, 0, -0.8] },
      { position: [2.9, 0, -0.8] },
    ],
    enemySpawn: [{ position: [3.2, 0, -1.6] }],
  },
  build,
};

const WELL_Z = 2.55;
const WELL_R = 1.55;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, pit);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'ferro',
    wall: 'ferro',
    ceiling: 'trusses',
    band: 'hazard',
    bandHeight: 0.5,
    register: 'vent',
    hot: true,
    mouth: 'blast',
  });

  /* --- the well --------------------------------------------------------------------- */
  // The coaming: a welded ring standing 0.4 m proud, in twelve plates so it reads
  // as fabricated rather than turned.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    room.geo('tempered', boxGeometry(0.78, 0.42, 0.2), tiltMatrix([Math.cos(a) * WELL_R, 0.21, WELL_Z + Math.sin(a) * WELL_R], [0, -a, 0]), {
      tile: 0.5,
      castShadow: true,
    });
    room.geo('graphite', boxGeometry(0.1, 0.5, 0.26), tiltMatrix([Math.cos(a + 0.22) * WELL_R, 0.25, WELL_Z + Math.sin(a + 0.22) * WELL_R], [0, -a, 0]), {
      tile: 0.2,
    });
  }
  room.geo('surface.hazard', ring(WELL_R + 0.3, 0.16, 20), tiltMatrix([0, 0.03, WELL_Z], [Math.PI / 2, 0, 0]), { tile: 0.4 });

  // Down the throat: three courses of lining going away, then the glow. Painted
  // as rings rather than a disc so the eye reads depth instead of a lit lid.
  for (let i = 0; i < 4; i++) {
    const r = WELL_R * (1 - i * 0.1);
    room.geo(i < 2 ? 'graphite' : 'cinder', cyl(r, r, 0.34, 18, true), poseMatrix([0, 0.2 - i * 0.05, WELL_Z]), { tile: 0.4 });
  }
  room.geo('surface.magma', disc(WELL_R * 0.72, 18), tiltMatrix([0, 0.05, WELL_Z], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  // A small bright eye at the very centre, not a wide one: an unlit disc filling
  // most of the throat reads as a bowl of soup rather than as a long way down.
  room.geo('ember', disc(WELL_R * 0.16, 12), tiltMatrix([0, 0.07, WELL_Z], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  room.blockCircle(0, WELL_Z, WELL_R + 0.42);

  // The column of light coming up out of it, and the shimmer standing over it.
  lightShaft(room, [0, 0.1, WELL_Z], [0, ceilingHeight, WELL_Z], 2.2);
  heatShimmer(room, 0, 1.6, WELL_Z, 3.0, 3.0, 0);
  motes(room, 0, 1.8, WELL_Z, 1.6, 20, 'spark');

  /* --- the rail --------------------------------------------------------------------- */
  // Three runs of it round the north side of the well, with a fourth missing. The
  // gap is on the side you arrive from.
  railing(room, [-2.6, 0, 0.6], [-0.9, 0, 0.6], true, 1.02);
  railing(room, [0.9, 0, 0.6], [2.6, 0, 0.6], true, 1.02);
  railing(room, [-2.85, 0, 0.9], [-2.85, 0, 2.6], true, 1.02);
  // The cut ends of the missing run, still bolted to the deck.
  for (const x of [2.85, 2.85]) {
    post(room, 'steel', 0.032, 0.038, 0.42, [x, 0, 1.0], 6);
  }
  room.geo('steel', cyl(0.028, 0.028, 0.5, 6), tiltMatrix([2.85, 0.3, 1.3], [1.1, 0, 0]), { tile: 0.3 });
  room.geo('paintedWarn', quad(0.14, 4.4), tiltMatrix([0, 0.012, 0.85], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  /* --- the hoist -------------------------------------------------------------------- */
  catwalk(room, [-3.6, 2.7, WELL_Z], [3.6, 2.7, WELL_Z], 0.9);
  room.box('steelPale', [0.9, 0.42, 0.6], [0.9, 2.05, WELL_Z], 0, { tile: 0.4, castShadow: true });
  hangingHook(room, 0.9, WELL_Z, 1.6);

  /* --- the rest ---------------------------------------------------------------------- */
  crate(room, -2.9, 2.9, 0.3, 0.8, 0.62, 0.64, false);
  room.solid('steelDark', [1.0, 0.6, 0.7], [3.2, 0, 2.6], -0.3, { tile: 0.4 });
  rubble(room, -3.0, -1.4, 1.0, 10);
  rubble(room, 1.6, -2.4, 1.2, 10);
  debris(room, -1.4, -1.6, 1.0, 7);
  wallSign(room, 'north', -1.6, 2.4, true);
  wallSign(room, 'east', 2.7, 2.2, true);
  alarmBeacon(room, -3.5, 2.5, -3.2, false);
  glowPool(room, 0, WELL_Z, 3.2);

  /* --- light ------------------------------------------------------------------------ */
  // The well itself, from just above the rim rather than down inside it, so the
  // coaming plates and the rail throw their shadows up the walls; and a red
  // beacon on the far side, which is the only cold-facility colour left in here.
  const shaft = new THREE.PointLight(0xff7024, 15, ctx.dims.cellSize * 2.0, 2);
  shaft.position.set(0, 0.85, WELL_Z);
  room.shadowLight(shaft);
  surge(room, shaft, 15, 0.18, 0.36);

  alarmBeacon(room, 3.45, 2.5, -3.2, true, 8);

  return room.finish();
}
