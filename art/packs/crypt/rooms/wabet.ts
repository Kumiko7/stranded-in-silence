import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, canopic, cyl, debris, disc, dustMotes, lampStand, quad, ring, sandDrift, slabTable, specimenJar, strut, urn, wrappedBody } from '../kit/props';

/**
 * The House of Purification - where the dynasty's dead were made ready.
 *
 * A sloping stone table with a channel cut round it and a spout at the low end, a
 * jar under the spout, natron heaped along one wall, and a rack of hooks and
 * bronze tools that a player will recognise instantly and wish they had not.
 *
 * The most unpleasant room in the map, and none of it is gore: it is unpleasant
 * because every object in it is obviously a piece of professional equipment, laid
 * out by somebody who did this every day.
 */
export const wabet: RoomBlueprint = {
  id: 'crypt.wabet',
  nameKey: 'room.crypt.wabet',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['necropolis', 'clinical'],
  anchors: {
    // On the WEST wall, not the north: the north wall's west end is the natron bay,
    // and a chest anchored there is placed standing inside the heap. The validator
    // checks the floor a container opens ONTO and never the ground it stands on, so
    // this is a class of bug only a contact sheet catches.
    chest: [{ position: [-3.15, 0, -1.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.15, 0, 2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [1.9, 0.99, -0.9] },
      { position: [3.1, 0.67, 2.95] },
      { position: [-1.0, 0, -1.9] },
      { position: [3.35, 1.55, -2.3] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.4] },
      { position: [-1.6, 0, 1.6] },
      { position: [1.4, 0, 2.0] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 1.7] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, wabet);
  room.shell({
    floor: 'sandstone',
    wall: 'sandstone',
    ceiling: 'slabs',
    dado: 'glyph',
    dadoHeight: 0.9,
    lamps: 'oil',
    mouth: 'lintel',
    // The four sons of the god, in a recess above the bench: this room is where
    // what goes in them comes out.
    niches: [{ side: 'west', kind: 'urns' }],
  });

  /* --- the table -------------------------------------------------------------------- */
  // On the room's long axis, clear of all three door lanes, with the low end and
  // the spout toward the west wall where the jars are.
  slabTable(room, 1.9, -1.0, Math.PI / 2, 2.1);
  // And on it, half wrapped. The linen is stopped at the chest, which is where
  // the work had got to.
  wrappedBody(room, 1.9, 0.99, -1.0, Math.PI / 2, 1.7);
  room.geo('linen', quad(0.66, 0.5), tiltMatrix([1.9, 1.22, -1.55], [1.1, 0.4, 0.2]), { tile: 0.5, castShadow: false, receiveShadow: false });
  room.geo('fleshDry', ball(0.19, 8), tiltMatrix([1.9, 1.06, -1.75], [0, Math.PI / 2, 0], [0.8, 1.05, 1.15]), { castShadow: false });

  /* --- the tools -------------------------------------------------------------------- */
  // A rack on the east wall: a bar, hooks, and the bronze on the hooks. The
  // silhouette of a row of hooks is doing the whole job, so they are the one thing
  // in the room modelled at full size.
  room.geo('copper', cyl(0.02, 0.02, 2.0, 6), tiltMatrix([3.55, 1.9, -1.6], [0, 0, Math.PI / 2]), { tile: 0.4, castShadow: false });
  for (let i = 0; i < 6; i++) {
    const z = -2.5 + i * 0.36;
    room.geo('copper', ring(0.04, 0.008, 8), tiltMatrix([3.55, 1.86, z], [0, Math.PI / 2, 0]), { castShadow: false });
    const len = room.range(0.18, 0.4);
    room.geo('copper', cyl(0.008, 0.011, len, 5), poseMatrix([3.5, 1.82 - len / 2, z]), { castShadow: false });
    // A hooked point on half of them, which is what makes the rack read.
    if (i % 2 === 0) room.geo('copper', ring(0.035, 0.008, 7), tiltMatrix([3.5, 1.82 - len, z], [0, Math.PI / 2, 0.6]), { castShadow: false });
  }
  // A shelf under the rack with the small instruments laid out in a row.
  room.box('surface.sandstone', [1.6, 0.07, 0.34], [3.5, 1.48, -2.3], Math.PI / 2, { tile: 0.6, castShadow: false });
  for (let i = 0; i < 4; i++) {
    room.box('copper', [0.02, 0.012, room.range(0.14, 0.26)], [3.46, 1.55, -2.9 + i * 0.34], Math.PI / 2, { castShadow: false });
  }

  /* --- the natron ------------------------------------------------------------------- */
  // Heaped in a mudbrick bay in the north-west corner - not across the middle of
  // the north wall, which the generator may open. It is the one pale mass in the
  // room and it is deliberately a single heap.
  for (const s of [-1, 1]) {
    room.solid('surface.mudbrick', [0.34, 0.62, 1.3], [-2.4 + s * 0.9, 0, -3.0], 0, { tile: 0.7 });
  }
  room.box('surface.mudbrick', [2.1, 0.42, 0.28], [-2.4, 0, -2.4], 0, { tile: 0.7 });
  room.geo('natron', ball(1.0, 10), tiltMatrix([-2.4, 0.1, -3.0], [0, 0.3, 0], [0.85, 0.5, 0.55]), { tile: 0.8, castShadow: false });
  room.geo('copper', cyl(0.12, 0.09, 0.09, 9), tiltMatrix([-1.8, 0.66, -2.9], [0.5, 0.6, 0]), { castShadow: false });
  room.geo('timber', cyl(0.016, 0.02, 0.34, 5), tiltMatrix([-1.6, 0.76, -2.75], [1.1, 0.6, 0]), { castShadow: false });

  /* --- the jars --------------------------------------------------------------------- */
  // Under the recess, on a bench of their own. Four canopics with their four
  // heads, and two more that have not been filled yet.
  room.solid('surface.sandstone', [0.8, 0.9, 2.1], [-3.15, 0, 0], 0, { tile: 0.8 });
  room.box('stoneWarmPale', [0.9, 0.06, 2.2], [-3.15, 0.9, 0], 0, { tile: 0.6, castShadow: false });
  for (let i = 0; i < 4; i++) {
    canopic(room, -3.15, 0.96, -0.85 + i * 0.56, (i % 4) as 0 | 1 | 2 | 3, -Math.PI / 2, 0.4);
  }
  urn(room, -2.9, 0.96, 1.35, 0.3, true);

  // A side bench in the south-east corner for the wet work, kept out of both door
  // lanes. Nothing in this pack floats: if a jar is at 0.62 there is a bench top
  // at 0.62 underneath it.
  room.solid('surface.mudbrick', [0.9, 0.62, 1.2], [3.1, 0, 2.6], 0, { tile: 0.7 });
  room.box('stoneWarmPale', [1.0, 0.05, 1.3], [3.1, 0.62, 2.6], 0, { tile: 0.5, castShadow: false });
  specimenJar(room, 3.1, 0.67, 2.25, 0.3, 'fluidAmber');

  /* --- the resin -------------------------------------------------------------------- */
  // A pot of bitumen on a stand with the fire out under it, and the stain where it
  // boiled over. Black and glossy, which is the only sheen in a dry room.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    room.geo('copper', cyl(0.014, 0.014, 0.44, 5), poseMatrix([1.9 + Math.cos(a) * 0.16, 0.22, 2.6 + Math.sin(a) * 0.16]), { castShadow: false });
  }
  room.geo('copper', cyl(0.24, 0.18, 0.3, 10), poseMatrix([1.9, 0.66, 2.6]), { tile: 0.4, castShadow: false });
  room.geo('bitumen', cyl(0.22, 0.22, 0.06, 10), poseMatrix([1.9, 0.9, 2.6]), { castShadow: false, receiveShadow: false });
  room.geo('bitumen', disc(0.4, 12), tiltMatrix([1.7, 0.014, 2.3], [-Math.PI / 2, 0.4, 0]), { castShadow: false, receiveShadow: false });
  room.geo('ash', disc(0.3, 10), tiltMatrix([1.9, 0.013, 2.6], [-Math.PI / 2, 0.9, 0]), { castShadow: false, receiveShadow: false });

  /* --- light ------------------------------------------------------------------------ */
  lampStand(room, 0.4, -2.0, true, 8);
  lampStand(room, -1.2, 2.6, true, 7);

  /* --- the floor -------------------------------------------------------------------- */
  // Sand, a channel to the drain, and the stain that has been there since the last
  // one. Nothing about this floor is clean and none of it is red.
  sandDrift(room, 3.0, 0.6, 1.1, 1.6);
  debris(room, -2.4, -1.9, 0.6, 6, true);
  for (let i = 0; i < 3; i++) {
    room.box('stoneDark', [1.7, 0.005, 0.06], [0.9 - i * 0.2, 0.013, -0.2 + i * 0.5], 0.2 + i * 0.1, { castShadow: false, receiveShadow: false });
  }
  room.geo('bitumen', disc(0.34, 10), tiltMatrix([0.5, 0.014, 0.9], [-Math.PI / 2, 1.2, 0]), { castShadow: false, receiveShadow: false });
  dustMotes(room, 1.4, 1.5, -1.0, 2.0, 16);

  return room.finish();
}
