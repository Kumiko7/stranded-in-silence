import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  barShadow,
  cagedLamp,
  crate,
  cyl,
  debris,
  disc,
  messTable,
  motes,
  notice,
  pendantBulb,
  sag,
  tinStack,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * The Hall - sixteen metres of refectory under a lid of wire.
 *
 * The mess is the pack's biggest volume and the only room where a player can see
 * a long way in two directions at once, which is exactly what makes it
 * frightening in a game about not being able to see. Two ranks of bolted tables
 * down the middle, a servery shuttered at one end, and netting stretched under
 * the ceiling of all four cells because at some point somebody worked out what
 * a hall like this is for.
 *
 * The tables are the only solid things in it. Six of the eight outer edges are
 * offered to the generator, so the walkable grid is fixed before a single prop
 * goes down and everything lives in the five-metre square between the lanes.
 */
export const mess: RoomBlueprint = {
  id: 'prison.mess',
  nameKey: 'room.prison.mess',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'east'),
    ...wallsOn([0, 1], 'west', 'south'),
    ...wallsOn([1, 1], 'south'),
  ],
  weight: 6,
  tags: ['blocks', 'entrance', 'landmark'],
  anchors: {
    chest: [
      { position: [10.8, 0, 10.7], rotationY: Math.PI / 2 },
      { position: [-2.8, 0, -3.3], rotationY: Math.PI },
    ],
    locker: [{ position: [11.35, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.78, 3.4] },
      { position: [5.4, 0.78, 5.2] },
      { position: [8.4, 0.98, -2.55] },
      { position: [-2.9, 0, 10.6] },
    ],
    playerSpawn: [
      { position: [4.0, 0, 1.3], rotationY: Math.PI },
      { position: [4.0, 0, 3.3], rotationY: Math.PI },
      { position: [4.0, 0, 4.7], rotationY: 0 },
      { position: [4.0, 0, 6.7], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, 4.0] },
      { position: [8.0, 0, 4.0] },
      { position: [4.0, 0, -2.6] },
      { position: [4.0, 0, 10.6] },
    ],
    enemySpawn: [{ position: [11.2, 0, 5.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, mess);
  room.shell({
    floor: 'quarry',
    wall: 'block',
    band: 'dado',
    bandHeight: 1.2,
    // Netting under the ceiling of every cell: the detail that turns a dining
    // room into a place somebody decided needed netting.
    ceiling: 'mesh',
    register: 'caged',
    mouth: 'gate',
    rail: true,
    // The two outer edges the blueprint never offers, so the only two guaranteed
    // solid for a whole run: the servery hatch and a barred window.
    ports: [
      { cell: [1, 0], side: 'north', kind: 'hatch' },
      { cell: [1, 1], side: 'east', kind: 'bars', light: true },
    ],
  });

  /* --- the tables ---------------------------------------------------------------- */
  // Two ranks in the guaranteed-free square between the four door lanes, running
  // the long way so a player entering from any door is looking down them. The
  // gangway between them is 0.9 m, which is a gangway; anything under 0.7 is a
  // wall (docs/art/ART_PACK_CHECKLIST.md).
  messTable(room, 2.6, 4.0, Math.PI / 2, 3.4);
  messTable(room, 5.4, 4.0, Math.PI / 2, 3.4);
  tinStack(room, 2.6, 0.78, 2.8, 6, 0.115);
  tinStack(room, 5.4, 0.78, 5.6, 4, 0.105);
  for (let i = 0; i < 6; i++) {
    room.geo('enamel', cyl(0.045, 0.038, 0.09, 8), poseMatrix([room.range(2.2, 5.8), 0.8, room.range(2.6, 5.4)]), { castShadow: false });
  }

  /* --- the servery ---------------------------------------------------------------- */
  // Under the hatch on the north wall of the far cell. A steel counter, a run of
  // bain-marie wells with nothing in them, and a trolley of trays.
  room.solid('surface.enamel', [3.4, 0.9, 0.66], [8.0, 0, -2.7], 0, { tile: 0.7 });
  room.box('surgical', [3.5, 0.05, 0.76], [8.0, 0.9, -2.7], 0, { tile: 0.5, castShadow: false });
  for (let i = 0; i < 3; i++) {
    room.box('itemTar', [0.72, 0.04, 0.5], [6.8 + i * 1.2, 0.92, -2.7], 0, { tile: 0.3, castShadow: false });
    room.box('surgical', [0.8, 0.06, 0.58], [6.8 + i * 1.2, 0.86, -2.7], 0, { tile: 0.3, castShadow: false });
  }
  room.box('surgical', [0.9, 0.4, 0.5], [9.6, 0.95, -2.7], 0.2, { tile: 0.3, castShadow: false });
  crate(room, 10.9, 4.6, -0.3, 0.8, 0.6, 0.64, true);

  /* --- the rest of the hall -------------------------------------------------------- */
  crate(room, -2.9, 10.7, 0.4, 0.86, 0.62, 0.68, false);
  debris(room, 10.6, 6.4, 1.0, 7);
  debris(room, -3.0, 1.2, 0.8, 5);
  wallSign(room, 'west', 4.0, 2.5, 'amber', 0.8, [0, 0]);
  notice(room, 'south', -2.6, 1.95, 0.6, 0.42, 'surface.stencil', [0, 1]);
  wallStain(room, 'east', 2.6, 2.6, 0.8, 1.9, 'mould', [1, 0]);
  motes(room, 4, 1.8, 4, 4.2, 16, 'dust');

  /* --- light ------------------------------------------------------------------------ */
  // Four lamps for four cells. Three warm pendants over the tables and the
  // servery, and the barred window's cold moon at the far corner - which is the
  // one thing in the hall that is not the same colour as everything else.
  const a = pendantBulb(room, 2.6, 2.2, 1.1, true, 14);
  if (a) sag(room, a, 14, 0.24, 0.75);
  const b = pendantBulb(room, 5.4, 6.0, 1.1, true, 14);
  if (b) {
    room.bakeShadow(b, 512);
    sag(room, b, 14, 0.2, 0.6);
  }
  const c = pendantBulb(room, 8.4, -1.6, 1.2, true, 10);
  if (c) sag(room, c, 10, 0.4, 1.3);
  pendantBulb(room, -1.2, 8.6, 1.1, false);
  cagedLamp(room, 'west', -2.6, 2.4, false, 0, [0, 1]);

  // The window throws bars across the quarry tile at the far end, painted rather
  // than cast: a shadow-casting lamp per cell is not something a 2x2 could pay
  // for, and the image is the point rather than the physics.
  barShadow(room, 9.4, 9.6, 2.8, 3.6, Math.PI / 2, true);
  room.geo('warmWash', disc(2.0, 18), tiltMatrix([8.0, 0.014, -1.8], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
