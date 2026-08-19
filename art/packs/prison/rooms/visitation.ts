import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cagedLamp,
  chair,
  cyl,
  debris,
  disc,
  motes,
  notice,
  pendantBulb,
  quad,
  radiator,
  sag,
  strut,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * Visits - four bays of wire glass, and the only room in Blackgate built so that
 * two people could look at each other.
 *
 * A counter the length of the south wall with a mesh screen over it and four
 * cabins behind, each one lit from inside so that anybody standing at the glass
 * is a silhouette to whoever is on the other side. Handsets on armoured cords,
 * three of them on the hook and one hanging down.
 *
 * The cabins are a recess with a painted depth and a shape sitting in one of
 * them. At this light level, through that glass, a modelled cabin and a painted
 * one are the same thing - and the painted one leaves the budget for the screen,
 * which is what the room is actually about.
 */
export const visitation: RoomBlueprint = {
  id: 'prison.visitation',
  nameKey: 'room.prison.visitation',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [-3.3, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, 1.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.4, 0.95, 3.02] },
      { position: [2.4, 0.95, 3.02] },
      { position: [0.4, 0, 1.5] },
    ],
    patrolPoint: [
      { position: [0, 0, 1.4] },
      { position: [-2.6, 0, -1.6] },
      { position: [2.6, 0, -1.6] },
    ],
    enemySpawn: [{ position: [-1.4, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, visitation);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'lino',
    wall: 'block',
    band: 'dado',
    bandHeight: 1.15,
    ceiling: 'soffit',
    register: 'caged',
    mouth: 'gate',
    rail: true,
  });

  /* --- the screen ------------------------------------------------------------------- */
  // A counter the width of the room in the band against the wall the blueprint
  // never offers, with the mesh running from it to the ceiling.
  room.solid('timberDark', [6.9, 0.92, 0.56], [0, 0, 3.36], 0, { tile: 0.7 });
  room.box('timber', [7.0, 0.05, 0.66], [0, 0.92, 3.36], 0, { tile: 0.5, castShadow: false });

  const bays = [-2.4, -0.8, 0.8, 2.4];
  for (let i = 0; i < bays.length; i++) {
    const bx = bays[i] ?? 0;
    // The cabin behind: a shallow recess with a lit back, a stool and, in one of
    // them, somebody who has been waiting a very long time.
    room.box('surface.block', [1.4, 1.6, 0.05], [bx, 0.97, 3.66], 0, { tile: 0.8, castShadow: false });
    room.geo('coldWash', quad(1.35, 1.5), poseMatrix([bx, 1.72, 3.6], Math.PI), { castShadow: false, receiveShadow: false });
    room.box('timberDark', [0.32, 0.42, 0.3], [bx, 0.97, 3.5], 0, { tile: 0.3, castShadow: false });
    if (i === 2) {
      // Two masses and a round head: what makes a silhouette a person is that it
      // is not a rectangle (docs/art/ROOM_REVIEW.md).
      room.geo('wool', ball(0.26, 8), tiltMatrix([bx, 1.62, 3.52], [0, 0.3, 0], [1.1, 1.35, 0.8]), { castShadow: false });
      room.geo('wax', ball(0.115, 8), poseMatrix([bx + 0.02, 2.0, 3.5]), { castShadow: false });
    }
    // The mullions and the mesh across each bay.
    for (const s of [-1, 1]) {
      room.box('ironBar', [0.09, ceilingHeight - 0.97, 0.16], [bx + s * 0.78, 0.97, 3.3], 0, { tile: 0.3, castShadow: false });
    }
    for (let k = 0; k < 7; k++) {
      room.geo('ironBar', cyl(0.011, 0.011, ceilingHeight - 1.06, 4), poseMatrix([bx - 0.6 + k * 0.2, 0.97 + (ceilingHeight - 1.06) / 2, 3.28]), {
        castShadow: false,
      });
    }
    for (let k = 0; k < 5; k++) {
      room.box('ironBar', [1.5, 0.014, 0.014], [bx, 1.15 + k * 0.5, 3.28], 0, { castShadow: false });
    }
    // The handset: a bakelite block on an armoured cord, on the hook except one.
    const hung = i === 1;
    const hx = bx + 0.5;
    room.box('itemTar', [0.09, 0.2, 0.07], [hx, hung ? 0.34 : 1.24, 3.16], 0, { castShadow: false });
    strut(room, 'ironBar', [hx, 1.42, 3.2], [hx, hung ? 0.54 : 1.28, 3.16], 0.012, 4, { castShadow: false, receiveShadow: false });
    room.box('itemEnamel', [0.14, 0.06, 0.02], [bx - 0.62, 0.99, 3.08], 0, { tile: 0.2, castShadow: false });
  }
  // The head rail across the whole screen, and the notice bolted to it.
  room.box('ironBar', [7.0, 0.1, 0.2], [0, ceilingHeight - 0.12, 3.3], 0, { tile: 0.5, castShadow: false });
  notice(room, 'south', 0, 2.55, 0.8, 0.3, 'surface.stencil');

  /* --- the near side ------------------------------------------------------------------ */
  // A stool at each bay, and a bench along the east wall for the queue.
  for (const bx of bays) chair(room, bx, 2.45, Math.PI, 'timberDark');
  room.solid('timber', [0.42, 0.45, 1.6], [3.3, 0, -2.5], 0, { tile: 0.4 });
  room.box('timber', [0.5, 0.05, 1.7], [3.3, 0.45, -2.5], 0, { tile: 0.4, castShadow: false });
  radiator(room, 'west', 1.2, 9);
  debris(room, -2.6, 0.9, 0.7, 5);
  wallStain(room, 'north', 2.4, 2.3, 0.5, 1.5, 'rust');
  wallSign(room, 'north', -2.5, 2.4, 'amber', 0.66);
  motes(room, 0, 1.6, 1.2, 3.0, 11, 'dust');

  /* --- light ------------------------------------------------------------------------- */
  // Two lamps of two temperatures, and it is the whole point of the room: the
  // cabins are lit cold from behind and the near side warm from above, so
  // anybody at the glass is a black shape from one side and a face from the
  // other. The cold lamp sits INSIDE the screen, which is the only place in the
  // pack a light is behind a piece of geometry on purpose.
  const behind = new THREE.PointLight(0xcaf0dc, 7, ctx.dims.cellSize * 0.9, 2);
  behind.position.set(0.2, 1.9, 3.58);
  room.light(behind);

  // The warm lamp hangs over the walking lane rather than on a wall: every wall
  // here is offered to the generator, so a fitting near the middle of one is a
  // fitting in a doorway.
  const overhead = pendantBulb(room, 0, 1.3, 0.9, true, 10);
  if (overhead) {
    room.bakeShadow(overhead, 512);
    sag(room, overhead, 10, 0.28, 0.85);
  }
  cagedLamp(room, 'east', 2.6, 2.45, false);
  room.geo('coldWash', disc(2.4, 18), tiltMatrix([0, 0.014, 2.7], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
