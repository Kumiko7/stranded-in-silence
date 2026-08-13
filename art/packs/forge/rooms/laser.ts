import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  bench,
  crate,
  cyl,
  debris,
  disc,
  glowPool,
  laserBeam,
  laserHead,
  motes,
  post,
  quad,
  sparkFall,
  wallSign,
} from '../kit/props';

/**
 * The Cutting Floor - where whatever the site makes gets its final shaping.
 *
 * A gantry across the south wall with a cutting head hanging off it, a steel bed
 * scored into a grid by twenty years of use, and five beams standing between the
 * two. The beams are the room: they are the only saturated red in the Works,
 * they light the bed from above so everything else is a silhouette, and they are
 * still on.
 *
 * A light curtain across the front of the machine says where the safe side is.
 * It is also still on, and there is nothing behind it.
 */
export const laser: RoomBlueprint = {
  id: 'forge.laser',
  nameKey: 'room.forge.laser',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['works', 'machinery'],
  anchors: {
    chest: [{ position: [-3.35, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.5, 0.9, 3.0] },
      { position: [3.3, 0.97, -2.2] },
      { position: [1.6, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.3] },
      { position: [-2.7, 0, 0.1] },
      { position: [2.7, 0, -1.2] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

const BED_Z = 3.05;
const BED_TOP = 0.86;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, laser);
  room.shell({
    floor: 'scorch',
    wall: 'panel',
    ceiling: 'beams',
    band: 'hazard',
    bandHeight: 0.7,
    register: 'vent',
    mouth: 'blast',
  });

  /* --- the bed ---------------------------------------------------------------- */
  // Backed hard against the south wall, which is the one wall this room never
  // opens - so the machine can be as deep as it likes without eating a doorway.
  room.solid('graphite', [4.4, BED_TOP, 1.2], [0, 0, BED_Z], 0, { tile: 0.8, castShadow: true });
  room.box('surface.scorch', [4.5, 0.06, 1.28], [0, BED_TOP, BED_Z], 0, { tile: 0.9 });
  // The kerf grid burned into the bed: shallow dark lines, one way only, because
  // a cross-hatch reads as a chessboard rather than as a cutting surface.
  for (let i = 0; i < 13; i++) {
    room.box('graphite', [0.03, 0.012, 1.16], [-2.1 + i * 0.35, BED_TOP + 0.06, BED_Z], 0, { tile: 0.2 });
  }
  // The last piece, still on the bed and cut two thirds of the way through.
  room.box('steelPale', [1.3, 0.14, 0.7], [-1.5, BED_TOP + 0.07, BED_Z - 0.05], 0.12, { tile: 0.4, castShadow: true });
  room.box('surface.crustHot', [0.035, 0.02, 0.6], [-1.45, BED_TOP + 0.2, BED_Z - 0.05], 0.12, { tile: 0.2 });

  /* --- the gantry -------------------------------------------------------------- */
  const rail = 2.62;
  for (const s of [-1, 1]) {
    post(room, 'steel', 0.13, 0.17, rail, [s * 3.1, 0, BED_Z - 0.2], 8, { castShadow: true });
    room.box('graphite', [0.5, 0.1, 0.5], [s * 3.1, 0, BED_Z - 0.2], 0, { tile: 0.3 });
    // Cable chain climbing each column: the detail that says this thing moves.
    for (let i = 0; i < 8; i++) {
      room.box('cable', [0.11, 0.09, 0.14], [s * 3.28, 0.3 + i * 0.28, BED_Z - 0.2], 0, { tile: 0.2 });
    }
  }
  room.geo('steel', cyl(0.11, 0.11, 6.2, 8), tiltMatrix([0, rail, BED_Z - 0.36], [Math.PI / 2, Math.PI / 2, 0]), { tile: 0.6 });
  room.box('graphite', [6.2, 0.3, 0.26], [0, rail - 0.34, BED_Z - 0.05], 0, { tile: 0.7 });
  // The carriage, parked two thirds of the way along, and its head.
  room.box('steelPale', [0.9, 0.42, 0.6], [0.75, rail - 0.72, BED_Z - 0.05], 0, { tile: 0.4, castShadow: true });
  laserHead(room, 0.75, rail - 0.86, BED_Z - 0.05, Math.PI / 2);

  /* --- the beams ---------------------------------------------------------------- */
  // Five of them, fanning slightly, all landing on the bed. A beam that does not
  // LAND on something is a glowing rod.
  for (let i = 0; i < 5; i++) {
    const x = -1.9 + i * 0.95;
    laserBeam(room, [0.75, rail - 0.98, BED_Z - 0.05], [x, BED_TOP + 0.09, BED_Z + (i % 2 ? 0.2 : -0.2)], false, 0.013);
  }
  glowPool(room, 0, BED_Z, 1.9);
  sparkFall(room, -1.45, BED_Z - 0.05, BED_TOP + 0.2, 9);

  /* --- the light curtain ---------------------------------------------------------- */
  // The machine's own guard: two posts and two horizontal beams across the front
  // of it. No collider - it is light, and walking through it is the point.
  for (const s of [-1, 1]) {
    post(room, 'steelDark', 0.05, 0.06, 1.3, [s * 2.9, 0, 1.85], 6, { castShadow: false });
    room.geo('lumenCyan', disc(0.035, 8), poseMatrix([s * 2.9, 0.98, 1.79], 0), { receiveShadow: false });
  }
  for (const y of [0.5, 0.98]) {
    laserBeam(room, [-2.9, y, 1.83], [2.9, y, 1.83], true, 0.009);
  }
  room.geo('paintedWarn', quad(5.8, 0.12), tiltMatrix([0, 0.012, 1.7], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  /* --- the rest of the room -------------------------------------------------------- */
  bench(room, 3.3, -2.2, 2.0, 0.6, 0.97, Math.PI / 2);
  crate(room, 1.7, -3.15, -0.24, 0.78, 0.6, 0.62, false);
  debris(room, -2.0, -1.8, 1.0, 8);
  motes(room, 0, 1.7, 1.6, 3.0, 12, 'spark');
  wallSign(room, 'north', -2.6, 2.4, true);
  wallSign(room, 'east', -2.9, 1.7, false);
  // Scorch scars on the north wall, where a cut went wrong and kept going.
  for (let i = 0; i < 3; i++) {
    room.geo('graphite', quad(0.09, room.range(0.7, 1.6)), poseMatrix([-0.4 + i * 0.9, 1.7, -3.68], Math.PI), { receiveShadow: false });
  }

  /* --- light ------------------------------------------------------------------------ */
  // The cutting head is the only real lamp in the room, hung above the bed so the
  // gantry throws its shadow the length of the floor.
  // Knocked back from a saturated 0xff3a58 at 13: what floods a room is the
  // saturation rather than the brightness, and at full red the steel, the hazard
  // chevrons and the tempering all went to one colour. A paler lamp at a lower
  // intensity leaves the beams as the only pure red in the room, which is the
  // whole point of them.
  const head = new THREE.PointLight(0xff7a70, 9, ctx.dims.cellSize * 1.7, 2);
  head.position.set(0.75, rail - 1.2, BED_Z - 0.05);
  room.shadowLight(head);
  room.tick((t) => {
    head.intensity = 9 * (1 + Math.sin(t * 9.4) * 0.06 + Math.sin(t * 2.1) * 0.05);
  });

  // The alarm beacon is the room's second lamp and it lives at the FAR end from
  // the machine, so the half of the hall the cutting head does not reach still
  // has something to read the doors by.
  alarmBeacon(room, 3.45, 2.5, -2.4, true, 8);

  return room.finish();
}
