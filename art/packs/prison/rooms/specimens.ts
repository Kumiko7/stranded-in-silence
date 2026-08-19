import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cardWall,
  cyl,
  debris,
  disc,
  jarShelf,
  medCabinet,
  motes,
  notice,
  paperDrift,
  slab,
  specimenJar,
  strobe,
  strut,
  tubeLight,
  wallStain,
  waxModel,
  xrayBox,
} from '../kit/props';

/**
 * The Collection - four shelves of jars, two wax models and a ledger listing
 * every one of them by a number rather than a name.
 *
 * A teaching collection is a completely legitimate thing for a hospital to have,
 * and this one is arranged and labelled with real care, which is exactly the
 * point: somebody catalogued this. The wax figures are teaching models - a torso
 * opened down the front with the inside painted - and they are on plinths at
 * head height, so they are the first things a player meets from every doorway.
 *
 * One jar on the top shelf is lit from inside, and it is the only violet in this
 * half of the map. It is where the Programme starts.
 */
export const specimens: RoomBlueprint = {
  id: 'prison.specimens',
  nameKey: 'room.prison.specimens',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['ward'],
  anchors: {
    chest: [{ position: [-3.3, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.6, 0.79, 2.5] },
      { position: [3.44, 1.44, 2.6] },
      { position: [0.2, 0.79, 2.66] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.6, 0, -2.2] },
      { position: [2.6, 0, -2.2] },
    ],
    enemySpawn: [{ position: [-1.4, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, specimens);
  room.shell({
    floor: 'lino',
    wall: 'distemper',
    band: 'tile',
    bandHeight: 1.05,
    ceiling: 'lath',
    register: 'strip',
    mouth: 'clinic',
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the shelves ------------------------------------------------------------------ */
  // Four courses down the south wall, in the band the generator can never open,
  // with a gap in every run - a complete row of identical jars reads as a
  // pattern, and it is the missing ones that make a collection read as used.
  for (let i = 0; i < 4; i++) {
    jarShelf(room, 'south', -1.9, 0.95 + i * 0.55, 5, 1.9, false);
    jarShelf(room, 'south', 1.9, 0.95 + i * 0.55, 5, 1.9, false);
  }
  // The one that is lit. It is on the top shelf, off to one side, and it is the
  // only violet anywhere in the Ward.
  specimenJar(room, 1.35, 2.62, 3.44, 0.11, 0.32, true);

  /* --- the models ------------------------------------------------------------------- */
  // Two, at two heights and two angles. A pair of identical figures facing the
  // same way is a shop display; these are turned toward each other.
  waxModel(room, -2.55, 2.5, 0.5, 1.55);
  waxModel(room, 2.6, 2.45, -0.7, 1.4);

  /* --- the catalogue ---------------------------------------------------------------- */
  // A writing table in the middle band with the register open on it, and a card
  // rack on the east wall where the index lives.
  room.solid('timberDark', [1.3, 0.74, 0.66], [0.6, 0, 2.5], 0.08, { tile: 0.5 });
  room.box('timber', [1.36, 0.05, 0.72], [0.6, 0.74, 2.5], 0.08, { tile: 0.4, castShadow: false });
  slab(room, 'paper', [0.5, 0.04, 0.36], [0.5, 0.79, 2.46], [0, 0.22, 0], { tile: 0.3 });
  room.geo('brass', cyl(0.045, 0.055, 0.08, 8), poseMatrix([1.05, 0.79, 2.62]), { castShadow: false });
  specimenJar(room, 0.9, 0.79, 2.3, 0.075, 0.2, false);
  cardWall(room, 'north', -2.5, 1.6, 2.0, 1.4);
  medCabinet(room, 'east', -2.6);
  xrayBox(room, 'west', 2.5, 1.62, true);

  /* --- the room -------------------------------------------------------------------- */
  notice(room, 'east', 2.5, 1.9, 0.5, 0.36, 'surface.stencil');
  notice(room, 'west', -2.6, 1.7, 0.44, 0.6, 'paper');
  wallStain(room, 'south', -3.0, 2.6, 0.5, 1.4, 'mould');
  paperDrift(room, -1.4, -1.6, 1.0, 8);
  debris(room, 2.6, 0.6, 0.6, 4);
  motes(room, 0, 1.6, 1.6, 3.0, 12, 'dust');
  // A jar that came off a shelf, and the ring it left. Nothing is in it now.
  room.geo('itemGlass', cyl(0.1, 0.1, 0.28, 9, true), tiltMatrix([-1.6, 0.1, -0.9], [0, 0.4, Math.PI / 2]), { castShadow: false });
  room.geo('stain', disc(0.55, 12), tiltMatrix([-1.5, 0.013, -0.95], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('glassCrack', ball(room.range(0.015, 0.035), 4), poseMatrix([-1.6 + room.range(-0.4, 0.4), 0.03, -0.9 + room.range(-0.35, 0.35)]), { castShadow: false });
  }

  /* --- light ------------------------------------------------------------------------ */
  // Two lamps: a batten over the table, and the x-ray box on the west wall, which
  // is the coldest surface in the pack and the room's second source. The jars
  // themselves carry no light at all - a wall of lit glass would be a chandelier,
  // and what makes them frightening is that they are dim.
  const over = tubeLight(room, 0.4, 1.4, 2.2, 0, true, true, 8, 0.42);
  if (over) {
    room.bakeShadow(over, 512);
    strobe(room, over, 8, 0.5, 7.4);
  }
  tubeLight(room, -1.4, -2.2, 1.8, Math.PI / 2, false);
  room.geo('coldWash', disc(2.2, 18), tiltMatrix([0.4, 0.014, 1.8], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
