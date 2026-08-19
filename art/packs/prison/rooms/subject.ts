import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cocoon,
  cyl,
  debris,
  disc,
  glowPool,
  motes,
  notice,
  resinGrowth,
  restraintChair,
  ring,
  strobe,
  strut,
  subjectTank,
  uvTube,
  wallStain,
} from '../kit/props';

/**
 * Containment - one chair, one door, and everything in the room growing out of
 * the same corner of it.
 *
 * The far end of the Programme and the end of the map's argument: a sealed
 * bulkhead into a room where the crust has stopped being something on the walls
 * and started being the walls. The chair in the middle is the same restraint
 * chair that stands in the Treatment Room, except that this one has been grown
 * over from the floor up and the straps are inside the resin rather than on it.
 *
 * One door. Whatever the seal was fitted for, it was fitted from the outside.
 */
export const subject: RoomBlueprint = {
  id: 'prison.subject',
  nameKey: 'room.prison.subject',
  footprint: [[0, 0]],
  doorWalls: wallsFor('west'),
  weight: 6,
  maxPerMap: 1,
  tags: ['programme', 'dead-end'],
  anchors: {
    chest: [{ position: [-0.6, 0, -3.3], rotationY: Math.PI }],
    itemSpawn: [
      { position: [2.5, 0.86, 2.4] },
      { position: [-1.6, 0, 2.9] },
      { position: [2.9, 0, -1.8] },
    ],
    patrolPoint: [
      { position: [-1.8, 0, 0.4] },
      { position: [1.8, 0, -1.6] },
      { position: [1.4, 0, 2.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, subject);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    // The one room in the pack whose floor and walls are both the crust. It is
    // the only place the growth is the architecture rather than on it, and it is
    // the last room in the set for exactly that reason.
    floor: 'resin',
    wall: 'resin',
    band: 'none',
    ceiling: 'lath',
    register: 'uv',
    mouth: 'seal',
    kick: false,
    ports: [{ side: 'east', kind: 'judas' }],
  });

  /* --- the chair --------------------------------------------------------------------- */
  // Dead centre, which is the one place in this pack a set piece is ever put -
  // and it is allowed here because there is exactly one door and its lane runs
  // from the west wall to the middle, stopping short.
  restraintChair(room, 1.5, 0.2, -1.25, false);
  // Grown over from the floor: a mound round the legs and a sheath up ONE side of
  // the back, not a dome over the whole thing. The first pass buried the chair in
  // resin and the object the room is named for stopped being readable at all -
  // what makes this frightening is recognising a chair under it, so the growth
  // has to leave the silhouette alone.
  resinGrowth(room, 1.5, 0.3, 0.55, 4);
  room.geo('surface.resin', ball(0.24, 8), tiltMatrix([1.86, 0.5, 0.5], [0, 1.1, 0], [0.8, 2.1, 0.7]), { tile: 0.5, castShadow: true });
  room.geo('caul', ball(0.27, 8), tiltMatrix([1.84, 0.54, 0.48], [0, 1.1, 0], [0.85, 2.15, 0.75]), { castShadow: false });
  for (let i = 0; i < 6; i++) {
    strut(room, 'sinew', [1.5 + Math.cos(i) * 0.34, 0.5 + i * 0.24, 0.2 + Math.sin(i) * 0.3], [3.3, 1.0 + i * 0.3, 0.4 + Math.sin(i) * 1.1], 0.02, 4, {
      castShadow: false,
    });
  }
  glowPool(room, 1.5, 0.2, 2.4, 'violet');
  glowPool(room, -1.4, -1.6, 1.8, 'violet');
  glowPool(room, -2.2, 1.8, 1.6, 'violet');

  /* --- the corner it came from -------------------------------------------------------- */
  // Everything in the room points back at the south-east corner. The tank there
  // is open, its cap is on the floor, and the crust is thickest between it and
  // the chair.
  const tank = subjectTank(room, 2.85, 2.85, 0.5, 2.05, false, true, 12);
  if (tank) {
    room.bakeShadow(tank, 512);
    strobe(room, tank, 12, 0.3, 8.5);
  }
  room.geo('steelDark', cyl(0.62, 0.58, 0.18, 12), tiltMatrix([1.7, 0.14, 3.1], [0.4, 0.6, 0.2]), { tile: 0.4, castShadow: false });
  resinGrowth(room, 2.6, 2.6, 1.4, 8);
  resinGrowth(room, 2.1, 1.5, 0.9, 5);
  cocoon(room, 'south', -1.6, 0.5);
  cocoon(room, 'north', 2.0, 0.9);

  // The crust running up into the lath, and the ring of it round the ceiling
  // hole. Lumps at two sizes, never one - a chain of equal blobs reads as pipe.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    room.geo('surface.resin', ball(0.2 + ((i * 7) % 5) / 22, 7), tiltMatrix([2.2 + Math.cos(a) * 1.0, ceilingHeight - 0.18, 1.9 + Math.sin(a) * 0.85], [0, a, 0], [1.3, 0.5, 1.2]), {
      tile: 0.5,
      castShadow: false,
    });
  }
  for (let i = 0; i < 5; i++) {
    strut(room, 'sinew', [2.9, 2.2 + i * 0.2, 2.6], [2.2 + Math.cos(i * 1.3) * 0.9, ceilingHeight - 0.25, 1.9 + Math.sin(i * 1.3) * 0.7], 0.022, 4, { castShadow: false });
  }

  /* --- what is left of the ward -------------------------------------------------------- */
  // A trolley on its side, a shelf that has come off the wall, and a shackle
  // still bolted to the one patch of tile the crust has not reached.
  room.geo('surgical', cyl(0.03, 0.03, 0.6, 6), tiltMatrix([2.5, 0.6, 2.4], [0.2, 0.5, Math.PI / 2]), { castShadow: false });
  room.box('surgical', [0.64, 0.03, 0.44], [2.5, 0.84, 2.4], 0.5, { tile: 0.3, castShadow: false });
  room.box('ironPale', [0.04, 0.16, 0.16], [-3.62, 1.5, -2.2], 0, { castShadow: false });
  room.geo('ironBar', ring(0.06, 0.014, 8), poseMatrix([-3.5, 1.5, -2.2], Math.PI / 2), { castShadow: false });
  for (let i = 0; i < 4; i++) {
    room.geo('ironBar', ring(0.045, 0.012, 7), tiltMatrix([-3.44, 1.42 - i * 0.09, -2.2], [i % 2 ? Math.PI / 2 : 0, Math.PI / 2, 0]), { castShadow: false });
  }
  notice(room, 'north', -2.5, 1.9, 0.5, 0.36, 'surface.stencil');
  wallStain(room, 'north', 1.2, 2.6, 0.6, 1.4, 'stain');
  debris(room, -1.6, 2.9, 0.8, 5);
  motes(room, 1.4, 1.6, 1.2, 3.0, 16, 'spore');

  /* --- light ------------------------------------------------------------------------- */
  // Two lamps and no white anywhere. The tube over the door is the only fitting
  // still on its bracket; the tank is the other, and it is the shadow caster.
  // Directly over the chair. It was by the door on the first sheet and the one
  // object the room is named for was invisible from every camera.
  const tube = uvTube(room, 1.4, 2.75, 0.2, 1.6, 0, true, 13);
  if (tube) strobe(room, tube, 13, 0.34, 6.2);
  room.geo('violetWash', disc(1.8, 16), tiltMatrix([-2.4, 0.014, 0], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('spill', disc(1.5, 14), tiltMatrix([2.2, 0.013, 2.0], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('caul', ball(room.range(0.03, 0.07), 5), poseMatrix([room.range(0.4, 3.0), room.range(0.4, 2.4), room.range(0.4, 3.0)]), { castShadow: false });
  }

  return room.finish();
}
