import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  chair,
  cyl,
  debris,
  disc,
  motes,
  notice,
  puddle,
  railing,
  slab,
  slabTable,
  strobe,
  strut,
  theatreLamp,
  trolley,
  tubeLight,
  wallStain,
  washTrough,
  xrayBox,
} from '../kit/props';

/**
 * The Theatre - a table with straps on it and a bank of seats looking down at it.
 *
 * The gallery is the room. Everything a surgical theatre is for happens on the
 * table; everything this one is ABOUT happens on the four rows of tip-up seats
 * facing it across the floor, which is why they are the only thing in the map
 * arranged so that a player standing at the table is being looked at from the
 * front.
 *
 * The lamp over the table is the only genuinely bright thing in the Ward and it
 * is the room's shadow caster, which puts the table's own silhouette on twelve
 * metres of tile.
 */
export const theatre: RoomBlueprint = {
  id: 'prison.theatre',
  nameKey: 'room.prison.theatre',
  footprint: [
    [0, 0],
    [1, 0],
  ],
  doorWalls: [...wallsOn([0, 0], 'north', 'south', 'west'), ...wallsOn([1, 0], 'south', 'east')],
  weight: 6,
  tags: ['ward', 'landmark'],
  anchors: {
    chest: [{ position: [11.3, 0, 2.7], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.35, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [5.5, 0.83, 2.2] },
      { position: [2.2, 0.83, 2.6] },
      { position: [10.6, 0.95, -2.8] },
      { position: [7.4, 0, 3.1] },
    ],
    patrolPoint: [
      { position: [4.0, 0, 0.2] },
      { position: [0, 0, 2.6] },
      { position: [8.0, 0, -2.6] },
      { position: [11.0, 0, 0.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, theatre);
  room.shell({
    floor: 'terrazzo',
    wall: 'wardTile',
    band: 'none',
    ceiling: 'lath',
    register: 'strip',
    mouth: 'clinic',
    // The one outer edge the blueprint never offers, so the only one guaranteed
    // solid for a whole run: it takes the extract grille and the x-ray boxes.
    ports: [{ cell: [1, 0], side: 'north', kind: 'grille' }],
  });

  /* --- the table ------------------------------------------------------------------- */
  // In the guaranteed-free band between the door lanes, turned so that a player
  // coming through any of the five doors sees it end-on with the gallery behind.
  slabTable(room, 4.0, 2.25, 0, 2, true);
  trolley(room, 5.5, 2.2, -0.4, true);
  trolley(room, 2.2, 2.6, 0.3, true);
  room.geo('enamel', cyl(0.19, 0.16, 0.24, 10), poseMatrix([3.0, 0.12, 3.0]), { castShadow: false });
  room.geo('stain', disc(0.5, 12), tiltMatrix([3.1, 0.013, 2.95], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  puddle(room, 4.6, 3.0, 0.6);

  /* --- the gallery ----------------------------------------------------------------- */
  // Four rows of tip-up seats on a stepped platform, facing the table. Each step
  // is a solid box; the whole thing is one collider, because a player walking
  // into the front of it should stop rather than climb.
  for (let r = 0; r < 3; r++) {
    const z = -2.05 - r * 0.62;
    const h = 0.16 + r * 0.16;
    room.solid('surface.terrazzo', [4.6, h, 0.64], [4.0, 0, z], 0, { tile: 1.0 });
    for (let k = 0; k < 5; k++) {
      const sx = 2.1 + k * 0.95;
      // Tip-up seats: the frame, the back, and the seat itself folded UP, which
      // is what makes an empty auditorium read as empty rather than as unbuilt.
      room.box('ironBar', [0.06, 0.44, 0.46], [sx - 0.3, h, z], 0, { tile: 0.2, castShadow: false });
      room.box('ironBar', [0.06, 0.44, 0.46], [sx + 0.3, h, z], 0, { tile: 0.2, castShadow: false });
      slab(room, 'timberDark', [0.62, 0.04, 0.42], [sx, h + 0.5, z - 0.16], [1.2, 0, 0], { tile: 0.3 });
      room.box('timberDark', [0.64, 0.4, 0.05], [sx, h + 0.44, z - 0.24], 0, { tile: 0.3, castShadow: false });
    }
  }
  railing(room, [1.6, 0, -1.75], [6.4, 0, -1.75], false, 0.98);
  chair(room, 6.0, 3.0, -0.4, 'timberDark');

  /* --- the scrub end ---------------------------------------------------------------- */
  washTrough(room, 'north', -2.4, 1.5, [1, 0]);
  xrayBox(room, 'north', -0.4, 1.7, true, [1, 0]);
  room.solid('enamel', [1.1, 0.9, 0.5], [10.6, 0, -3.2], 0, { tile: 0.5 });
  room.box('surgical', [1.16, 0.05, 0.58], [10.6, 0.9, -3.2], 0, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 6; i++) {
    room.box('surgical', [0.12, 0.02, 0.03], [10.2 + i * 0.16, 0.95, -3.2], room.range(-0.2, 0.2), { castShadow: false });
  }
  strut(room, 'rubberProp', [11.6, 2.2, -1.2], [10.9, 1.4, -1.0], 0.03, 5, { castShadow: false });
  strut(room, 'rubberProp', [10.9, 1.4, -1.0], [10.4, 0.2, -1.4], 0.03, 5, { castShadow: false });

  /* --- the room ----------------------------------------------------------------------- */
  notice(room, 'north', 1.0, 2.3, 0.6, 0.44, 'surface.cards', [1, 0]);
  wallStain(room, 'east', 2.6, 2.5, 0.6, 1.8, 'mould', [1, 0]);
  wallStain(room, 'west', -2.6, 2.6, 0.5, 1.6, 'rust', [0, 0]);
  debris(room, 9.4, 2.6, 0.9, 6);
  motes(room, 4, 1.7, 0, 3.6, 14, 'dust');

  /* --- light -------------------------------------------------------------------------- */
  // Three lamps for two cells. The theatre lamp is the brightest thing in the
  // Ward and it is the shadow caster, standing clear above the table with nothing
  // between it and either end of the room.
  const over = theatreLamp(room, 4.0, 2.25, true, 13, 1.15);
  if (over) room.bakeShadow(over, 512);
  const far = tubeLight(room, 8.6, 0.4, 2.2, 0, true, true, 7, 0.42);
  if (far) strobe(room, far, 7, 0.7, 5.2);
  tubeLight(room, 0.6, -0.4, 2.0, 0, false);
  room.geo('coldWash', disc(2.4, 18), tiltMatrix([4.0, 0.014, 0.6], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
