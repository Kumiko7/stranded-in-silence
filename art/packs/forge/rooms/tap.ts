import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  arcLamp,
  bench,
  crate,
  cyl,
  debris,
  disc,
  gauge,
  glowPool,
  heatShimmer,
  motes,
  pipeRun,
  post,
  quad,
  railing,
  ring,
  surge,
  valve,
  wallSign,
} from '../kit/props';

/**
 * The Tap - where the facility takes its power straight out of the mountain.
 *
 * A two-metre casing standing against the north wall and going through the
 * ceiling, wrapped in cooling rings, with a slot window down its face. Behind
 * that slot is the only genuinely hot thing in the Works, and the whole room is
 * lit by it: a narrow orange bar in a wall of cold grey machinery.
 *
 * The window is small on purpose. A whole glowing face reads as a lamp, and what
 * this has to read as is a very small hole into something very large.
 */
export const tap: RoomBlueprint = {
  id: 'forge.tap',
  nameKey: 'room.forge.tap',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 9,
  tags: ['works', 'machinery', 'landmark'],
  anchors: {
    chest: [{ position: [-2.6, 0, 3.35], rotationY: 0 }],
    itemSpawn: [
      { position: [2.6, 0.97, 2.9] },
      { position: [3.3, 1.38, -2.6] },
      { position: [-2.2, 0, -1.6] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.6] },
      { position: [-2.8, 0, -0.4] },
      { position: [2.8, 0, -0.4] },
    ],
    enemySpawn: [{ position: [2.6, 0, -3.2] }],
  },
  build,
};

const CORE_Z = -2.6;
const CORE_R = 1.05;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tap);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'grate',
    wall: 'panel',
    ceiling: 'pipes',
    band: 'hazard',
    bandHeight: 0.58,
    register: 'vent',
    hot: true,
    rail: true,
    mouth: 'blast',
  });

  /* --- the casing ------------------------------------------------------------------ */
  // Plinth, barrel, and the belly rings round it. Backed hard against the north
  // wall, which is the one wall this room never opens.
  room.geo('graphite', cyl(CORE_R * 1.24, CORE_R * 1.34, 0.3, 18), poseMatrix([0, 0.15, CORE_Z]), { tile: 0.7, castShadow: true });
  room.geo('steel', cyl(CORE_R, CORE_R, ceilingHeight - 0.3, 20), poseMatrix([0, 0.3 + (ceilingHeight - 0.3) / 2, CORE_Z]), { tile: 1.0, castShadow: true });
  for (const y of [0.85, 1.75, 2.6]) {
    room.geo('graphite', ring(CORE_R + 0.04, 0.08, 18), tiltMatrix([0, y, CORE_Z], [Math.PI / 2, 0, 0]), { tile: 0.4 });
  }
  // Cooling fins: a course of thin discs, which is what a heat exchanger has and
  // what stops a cylinder reading as a bin.
  for (let i = 0; i < 9; i++) {
    room.geo('steelPale', cyl(CORE_R + 0.2, CORE_R + 0.2, 0.03, 18), poseMatrix([0, 1.95 + i * 0.075, CORE_Z]), { tile: 0.4 });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    room.geo('steelPale', cyl(0.045, 0.045, 0.07, 6), tiltMatrix([Math.sin(a) * (CORE_R + 0.11), 1.75, CORE_Z + Math.cos(a) * (CORE_R + 0.11)], [Math.PI / 2, a, 0]), {
      tile: 0.2,
    });
  }

  /**
   * The slot window: a narrow emissive bar set INTO the shell with a heavy bezel
   * round it. The lit part is small; the housing round it is not.
   */
  room.box('graphite', [0.72, 1.6, 0.26], [0, 0.62, CORE_Z + CORE_R - 0.04], 0, { tile: 0.4 });
  // The glow faces +Z out into the room: a plane's front face is +Z at yaw 0.
  room.geo('surface.magma', quad(0.32, 1.28), poseMatrix([0, 1.42, CORE_Z + CORE_R + 0.1], 0), { receiveShadow: false });
  room.geo('glassPane', quad(0.42, 1.38), poseMatrix([0, 1.42, CORE_Z + CORE_R + 0.13], 0), { receiveShadow: false });
  room.geo('goldFilm', quad(0.42, 1.38), poseMatrix([0, 1.42, CORE_Z + CORE_R + 0.15], 0), { receiveShadow: false });
  for (const s of [-1, 1]) {
    room.box('steelPale', [0.11, 1.5, 0.17], [s * 0.3, 0.66, CORE_Z + CORE_R + 0.06], 0, { tile: 0.3 });
  }
  heatShimmer(room, 0, 1.5, CORE_Z + CORE_R + 0.32, 0.7, 1.7, 0);
  room.blockCircle(0, CORE_Z, CORE_R + 0.3);

  /* --- the plumbing ----------------------------------------------------------------- */
  // Six risers off the top into the ceiling, and two heavy runs out to the side
  // walls at 2.5 m, well above where the door lanes need clearing.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const px = Math.sin(a) * CORE_R * 0.62;
    const pz = CORE_Z + Math.cos(a) * CORE_R * 0.62;
    pipeRun(room, [[px, ceilingHeight - 0.5, pz], [px, ceilingHeight - 0.06, pz]], 0.07, i % 2 ? 'copperBus' : 'steel', false);
  }
  pipeRun(room, [
    [-CORE_R, 2.5, CORE_Z],
    [-2.9, 2.5, CORE_Z],
    [-3.4, 2.5, -0.6],
    [-3.4, 2.5, 2.8],
  ], 0.12);
  pipeRun(room, [
    [CORE_R, 2.35, CORE_Z],
    [2.9, 2.35, CORE_Z],
    [3.4, 2.35, -0.4],
    [3.4, 2.35, 3.0],
  ], 0.1, 'copperBus');
  valve(room, [-3.4, 1.7, 2.8], 0.22, 0, true);
  valve(room, [3.4, 1.5, 3.0], 0.2, 0, false);
  pipeRun(room, [[-3.4, 2.4, 2.8], [-3.4, 1.86, 2.8]], 0.09, 'steel', false);

  /* --- the watch ---------------------------------------------------------------------- */
  // A rail between the deck and the casing so nobody walks into it, and a bench
  // out of the way on the south-east.
  railing(room, [-1.7, 0, -1.1], [1.7, 0, -1.1], false, 1.05);
  bench(room, 2.6, 2.9, 2.0, 0.6, 0.97, 0);
  room.box('steelPale', [1.5, 0.05, 0.4], [3.5, 1.35, -2.6], Math.PI / 2, { tile: 0.5 });
  gauge(room, 'east', 1.4, 1.95, 0.15);
  gauge(room, 'east', 1.9, 1.6, 0.11);
  gauge(room, 'west', -1.5, 1.9, 0.13);
  crate(room, -3.0, -3.1, 0.3, 0.8, 0.6, 0.62, false);
  debris(room, -2.2, -1.2, 1.0, 8);
  motes(room, 0, 1.6, -0.4, 3.0, 12, 'spark');
  wallSign(room, 'south', 2.2, 2.3, true);
  wallSign(room, 'west', 2.4, 2.2, false);

  // Two floor discs of hot wash, where the casing is warming the grating.
  room.geo('surface.crustHot', disc(0.9, 14), tiltMatrix([0, 0.014, CORE_Z + 1.5], [-Math.PI / 2, 0, 0]), { tile: 0.4, receiveShadow: false });
  glowPool(room, 0, CORE_Z + 1.2, 2.3);

  /* --- light ------------------------------------------------------------------------- */
  // Warm, and beside the casing rather than inside it: a lamp sunk in its own
  // glowing mesh lights the inside of a cylinder and nothing else. Placed off to
  // one side it rims the barrel and throws the pipework across the whole deck.
  const core = new THREE.PointLight(0xff8c34, 14, ctx.dims.cellSize * 1.9, 2);
  core.position.set(0.15, 1.75, CORE_Z + CORE_R + 0.85);
  room.shadowLight(core);
  surge(room, core, 14, 0.15, 0.5);

  arcLamp(room, 'east', -2.6, 2.5, true, 10);
  post(room, 'steelDark', 0.05, 0.06, 0.9, [-3.3, 0, -3.3], 6);

  return room.finish();
}
