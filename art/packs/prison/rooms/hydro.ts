import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  cyl,
  debris,
  disc,
  drainChannel,
  floorGully,
  gauge,
  hydroTub,
  motes,
  notice,
  pipeRun,
  puddle,
  steamPlume,
  strobe,
  strut,
  trolley,
  tubeLight,
  valve,
  wallStain,
} from '../kit/props';

/**
 * Continuous Bath - three tubs, three canvas lids, and one of the collars is
 * not empty.
 *
 * Hydrotherapy was a real treatment and this is real equipment: a laced cover
 * over the bath with a hole for the head, a thermometer on the wall, a valve
 * chest so the temperature could be held for hours. Nothing in the room is an
 * instrument of torture. That is the entire reason it works.
 *
 * The floor falls to a gutter across the middle, and the tile carries that fall
 * in its normal map, which is what makes the room read as drained rather than
 * merely tiled.
 */
export const hydro: RoomBlueprint = {
  id: 'prison.hydro',
  nameKey: 'room.prison.hydro',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['ward'],
  anchors: {
    chest: [{ position: [-3.25, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.9, 0.81, -0.9] },
      { position: [3.38, 1.53, 2.2] },
      { position: [-2.9, 0, 1.0] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.6, 0, -2.0] },
      { position: [2.6, 0, -2.0] },
    ],
    enemySpawn: [{ position: [-1.6, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hydro);
  room.shell({
    floor: 'drain',
    wall: 'wardTile',
    band: 'none',
    ceiling: 'lath',
    register: 'strip',
    mouth: 'clinic',
    damp: true,
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the tubs -------------------------------------------------------------------- */
  // Three, across the band against the wall the generator can never open, turned
  // end-on so a player walks between them rather than past them. The occupied one
  // is the middle one, which means it is unavoidable from every doorway.
  const occupied = Math.floor(room.range(0, 3));
  const places: readonly [number, number][] = [
    [-2.55, 2.3],
    [0, 2.5],
    [2.55, 2.3],
  ];
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    if (!place) continue;
    hydroTub(room, place[0], place[1], Math.PI / 2, i === occupied);
  }

  /* --- the plumbing ---------------------------------------------------------------- */
  // A valve chest on the east wall with two gauges and a thermometer: the room's
  // one piece of visible machinery, and the reason the tubs could be held at a
  // temperature all night.
  room.solid('enamel', [0.34, 1.5, 1.3], [3.4, 0, 2.2], 0, { tile: 0.6 });
  for (let i = 0; i < 3; i++) {
    valve(room, [3.1, 0.7 + i * 0.34, 1.75 + i * 0.4], 0.12, Math.PI / 2, i === 1);
  }
  gauge(room, 'east', -0.2, 1.85, 0.13);
  gauge(room, 'east', -1.4, 1.85, 0.1);
  room.box('surgical', [0.03, 0.5, 0.07], [3.5, 1.3, -0.9], 0, { tile: 0.2, castShadow: false });
  room.geo('lumenTube', cyl(0.008, 0.008, 0.42, 4), poseMatrix([3.47, 1.3, -0.9]), { castShadow: false });
  pipeRun(
    room,
    [
      [3.4, 2.2, 1.5],
      [3.4, 2.2, 3.3],
      [-3.4, 2.2, 3.4],
      [-3.4, 1.7, 1.6],
    ],
    0.055,
    'lead',
  );
  for (const px of [-2.55, 0, 2.55]) {
    strut(room, 'lead', [px + 0.55, 2.2, 3.35], [px + 0.55, 1.5, 3.3], 0.03, 5, { castShadow: false });
  }

  /* --- the floor ------------------------------------------------------------------- */
  drainChannel(room, [-3.4, 0.9], [3.4, 0.9], 0.26);
  floorGully(room, -3.0, 0.9, 0.14);
  puddle(room, -1.3, 1.5, 0.9);
  puddle(room, 1.8, 0.4, 0.7);
  trolley(room, 0.9, -0.9, 0.3, true);
  steamPlume(room, 0, 1.9, 0.6, 1.9, 1.5);
  steamPlume(room, -2.55, 1.7, 0.6, 1.4, 1.0);

  /* --- the room -------------------------------------------------------------------- */
  notice(room, 'north', -2.6, 1.9, 0.56, 0.42, 'surface.cards');
  notice(room, 'south', 2.7, 1.9, 0.5, 0.36, 'paper');
  wallStain(room, 'west', -2.4, 2.4, 0.6, 1.6, 'mould');
  wallStain(room, 'east', 2.4, 2.5, 0.5, 1.4, 'rust');
  debris(room, -2.9, 1.0, 0.6, 4);
  motes(room, 0, 1.6, 1.6, 3.0, 12, 'lime');

  /* --- light -------------------------------------------------------------------------- */
  // Two battens, one over the tubs and one at the door end, and the far one is
  // going. A fluorescent strobes; it does not sag. That difference is most of
  // what separates the Ward from the Blocks before a player has read a prop.
  const over = tubeLight(room, 0, 2.2, 2.4, 0, true, true, 9, 0.42);
  if (over) {
    room.bakeShadow(over, 512);
    strobe(room, over, 9, 0.55, 6.5);
  }
  const near = tubeLight(room, 0.4, -1.6, 1.9, Math.PI / 2, true, true, 6, 0.42);
  if (near) strobe(room, near, 6, 0.85, 3.8);
  tubeLight(room, -2.6, -2.4, 1.6, 0, false);
  room.geo('coldWash', disc(2.6, 18), tiltMatrix([0, 0.014, 2.0], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
