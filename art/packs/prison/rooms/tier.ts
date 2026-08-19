import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { Room, wallsOn } from './common';
import {
  barShadow,
  cellFront,
  crate,
  debris,
  dutyDesk,
  hangingChain,
  motes,
  mopBucket,
  notice,
  pendantBulb,
  sag,
  tallyWall,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * A Landing - twenty-four metres of cell fronts, and the room the whole map is
 * laid out around.
 *
 * Eight cells, four a side, every one of them a barred recess with a bunk and a
 * pail in it and nothing else. One stands open. Above, the mesh gantry of the
 * tier that used to be there; below, a line of pendant bulbs down the middle of
 * the walking lane, which is what a night circuit in a Victorian gaol actually
 * was.
 *
 * The room's whole job is the sight line: from either end you are looking down a
 * tunnel of vertical bars with the light falling between them, and there is no
 * angle from which you can see into every recess at once.
 */
export const tier: RoomBlueprint = {
  id: 'prison.tier',
  nameKey: 'room.prison.tier',
  footprint: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  doorWalls: [...wallsOn([0, 0], 'north'), ...wallsOn([0, 2], 'south'), ...wallsOn([0, 1], 'east', 'west')],
  weight: 7,
  tags: ['blocks', 'landmark'],
  anchors: {
    chest: [{ position: [-3.0, 0, 11.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.15, 0, 5.1], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.7, 0.79, 11.5] },
      { position: [-2.9, 0.6, 4.6] },
      { position: [2.5, 0.62, 18.4] },
      { position: [-2.6, 0, -2.4] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.4] },
      { position: [0, 0, 5.4] },
      { position: [0, 0, 11.6] },
      { position: [0, 0, 18.4] },
    ],
    enemySpawn: [{ position: [-2.8, 0, 6.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tier);
  room.shell({
    floor: 'concrete',
    wall: 'block',
    ceiling: 'gantry',
    band: 'dado',
    bandHeight: 1.15,
    register: 'caged',
    mouth: 'gate',
    rail: true,
  });

  /* --- the cells ------------------------------------------------------------ */
  // Four bays a side, on the two end cells. The middle cell's side walls are
  // offered to the generator, so they stay bare - and that gap in the run is
  // what stops twenty-four metres of bars reading as wallpaper.
  //
  // `along` on a cell front runs along the prop's own +X, which the wall's
  // facing turns: on the east wall +along is -z and on the west wall it is +z.
  // The pairs below are therefore mirrored on purpose (ROOM_FORMAT.md §2.1.1).
  const open = Math.floor(room.range(0, 8));
  let index = 0;
  for (const cz of [0, 16]) {
    for (const dz of [-2.05, 2.05]) {
      cellFront(room, 3.7, cz + dz, Math.PI / 2, 2.3, index++ === open);
      cellFront(room, -3.7, cz + dz, -Math.PI / 2, 2.3, index++ === open);
    }
  }

  /* --- the landing ----------------------------------------------------------- */
  // A warder's desk pulled out against the east wall between two bays, with the
  // occurrence book still open on it. Clear of every door lane by a metre.
  dutyDesk(room, 2.72, 11.5, Math.PI / 2, 1.5);
  crate(room, -2.9, 4.6, 0.3, 0.86, 0.6, 0.66, true);
  crate(room, 2.5, 18.4, -0.4, 0.8, 0.55, 0.6, false);
  mopBucket(room, -2.7, 18.6, 0.4);

  // Chains hanging off the gantry over the lane. They are the one thing in the
  // room that moves, and a landing needs something moving in it.
  hangingChain(room, 1.5, 2.6, 1.15, 'shackle');
  hangingChain(room, -1.4, 13.8, 0.95, 'hook');

  /* --- what the place is for ------------------------------------------------- */
  tallyWall(room, 'west', 6.4, 1.4, 1.3, 0.95);
  tallyWall(room, 'east', -13.2, 1.3, 1.1, 0.8);
  wallStain(room, 'east', -6.5, 1.9, 0.7, 2.0, 'mould');
  wallStain(room, 'west', 15.5, 2.1, 0.5, 1.6, 'rust');
  notice(room, 'east', -9.2, 1.85, 0.56, 0.4);
  wallSign(room, 'west', 1.4, 2.35, 'amber', 0.7);
  debris(room, -2.4, -2.4, 0.9, 7);
  debris(room, 2.6, 14.6, 0.8, 5);
  motes(room, 0, 1.6, 8, 3.2, 14, 'dust');

  /* --- light ------------------------------------------------------------------ */
  // Four pendants down the centre line, three of them still alight. They hang
  // over the walking lane rather than on a wall, because a wall lamp lights the
  // wall it is bolted to and this room is about the floor between the bars.
  const near = pendantBulb(room, 0, -1.4, 0.85, true, 10);
  if (near) sag(room, near, 10, 0.26, 0.8);
  const mid = pendantBulb(room, 0, 7.4, 0.85, true, 11);
  if (mid) {
    // The one baked shadow caster in the room stands in the middle of the run
    // with nothing large between it and either end - which is the whole trick to
    // a shadow-casting lamp not painting the room black.
    room.bakeShadow(mid, 512);
    sag(room, mid, 11, 0.2, 0.6);
  }
  const far = pendantBulb(room, 0, 16.6, 0.85, true, 10);
  if (far) sag(room, far, 10, 0.3, 1.1);
  pendantBulb(room, 0, 11.8, 0.85, false);

  // The image the room exists for: barred light on the floor, painted rather
  // than cast. A shadow-casting lamp per bay is not something two hundred
  // metres of landing could ever pay for.
  for (const [x, z, yaw] of [
    [2.1, 0.4, Math.PI / 2],
    [-2.1, 2.6, Math.PI / 2],
    [2.2, 15.2, Math.PI / 2],
    [-2.2, 17.6, Math.PI / 2],
  ] as const) {
    barShadow(room, x, z, 2.6, 3.0, yaw);
  }

  return room.finish();
}
