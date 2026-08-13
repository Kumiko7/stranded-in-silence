import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  arcLamp,
  ball,
  boulders,
  crate,
  debris,
  floorFissure,
  glowPool,
  motes,
  post,
  quad,
  railTrack,
  rubble,
  spatterCone,
  strut,
  stutter,
  tramCar,
  wallSign,
} from '../kit/props';

/**
 * The Tramway - a 1x3 ore run, and the map's long sight line.
 *
 * Twenty-four metres of tuff with steel arches driven into it every few metres,
 * a track down one side and a fissure down the other. Both of them run the whole
 * length, which is the point: from either end you are looking down a tunnel with
 * a line of orange in it and no way of telling what is standing at the far end
 * until it moves.
 *
 * It is a hinge room. The arches, the track and the cable are the Works; the
 * walls, the fissure and the rubble are the Mountain, and neither of them is
 * winning.
 */
export const tramway: RoomBlueprint = {
  id: 'forge.tramway',
  nameKey: 'room.forge.tramway',
  footprint: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'east', 'west'),
    ...wallsOn([0, 1], 'east', 'west'),
    ...wallsOn([0, 2], 'south', 'east', 'west'),
  ],
  weight: 7,
  tags: ['hinge', 'mountain', 'corridor'],
  anchors: {
    chest: [{ position: [-3.35, 0, 12.4], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.4, 0, 1.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.2, 0.56, 4.6] },
      { position: [-2.9, 0, 5.6] },
      { position: [3.1, 0, 17.2] },
    ],
    playerSpawn: [
      { position: [-1.0, 0, 6.6], rotationY: Math.PI },
      { position: [1.0, 0, 6.6], rotationY: Math.PI },
      { position: [-1.0, 0, 9.4], rotationY: 0 },
      { position: [1.0, 0, 9.4], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, -1.6] },
      { position: [0, 0, 6.0] },
      { position: [0, 0, 10.0] },
      { position: [0, 0, 17.6] },
    ],
    enemySpawn: [{ position: [-1.4, 0, 15.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tramway);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'basalt',
    wall: 'tuff',
    ceiling: 'beams',
    band: 'basalt',
    bandHeight: 0.5,
    register: 'fissure',
    mouth: 'collar',
    kick: true,
  });

  /* --- the arches ------------------------------------------------------------------ */
  // Steel driven into rock every 2.7 m: two legs, a curved head sampled in five
  // pieces, and lagging boards behind it. This is the Works holding the Mountain
  // off, and it is the only straight line in the room.
  // Spaced by hand rather than by a stride, because a stride lands a leg in a
  // doorway: on a 1x3 the east and west openings are centred on EVERY cell, at
  // z = 0, 8 and 16, and an arch has to miss all three.
  for (const z of [-2.6, 2.4, 5.6, 10.4, 13.6, 18.4]) {
    for (const s of [-1, 1]) {
      post(room, 'tempered', 0.11, 0.14, 2.5, [s * 3.35, 0, z], 7, { castShadow: true });
      room.box('graphite', [0.4, 0.14, 0.4], [s * 3.35, 0, z], 0, { tile: 0.3 });
    }
    const segments = 5;
    for (let k = 0; k <= segments; k++) {
      const a = Math.PI * (k / segments);
      const x = -Math.cos(a) * 3.35;
      const y = 2.5 + Math.sin(a) * 0.68;
      room.geo('tempered', ball(0.14, 6), tiltMatrix([x, y, z], [0, 0, a], [1.5, 1.0, 1.1]), { tile: 0.3 });
    }
    // Lagging: the boards packed behind the arch, which is what a real one has.
    for (let k = 0; k < 4; k++) {
      room.box('itemWood', [0.5, 0.06, 0.34], [-2.4 + k * 1.6, 3.15, z + 0.25], 0, { tile: 0.4 });
    }
  }
  // The cable run and the pipe, following the crown the whole way.
  strut(room, 'cable', [-0.9, ceilingHeight - 0.5, -3.8], [-0.9, ceilingHeight - 0.5, 19.8], 0.05, 5);
  strut(room, 'steel', [0.9, ceilingHeight - 0.42, -3.8], [0.9, ceilingHeight - 0.42, 19.8], 0.08, 6);

  /* --- the track ------------------------------------------------------------------- */
  railTrack(room, [2.2, -3.8], [2.2, 19.8], 1.0);
  tramCar(room, 2.2, 4.6, Math.PI / 2, false);
  tramCar(room, 2.15, 14.2, Math.PI / 2 + 0.16, true);
  // A buffer at the south end, and the pile the second car spilled.
  room.solid('tempered', [1.4, 0.7, 0.4], [2.2, 0, 19.2], 0, { tile: 0.4, castShadow: true });
  rubble(room, 3.0, 15.4, 1.1, 12);

  /* --- the fissure ------------------------------------------------------------------ */
  // Down the west side the whole length, in four runs that do not quite line up.
  floorFissure(room, -2.6, 0.4, 4.2, 0.06, true);
  floorFissure(room, -2.9, 6.4, 4.6, -0.05, true);
  floorFissure(room, -2.5, 12.0, 3.8, 0.08, false);
  floorFissure(room, -2.8, 17.4, 3.4, -0.04, true);
  spatterCone(room, -3.1, 9.2, 0.8, true, 8);
  // Random colliders never go near an anchor or a doorway: `boulders()` scatters
  // its rocks from the seeded RNG, so a heap of them by a chest is fine on most
  // seeds and a chest nobody can open on the rest.
  boulders(room, -3.1, 4.6, 0.7, 3);
  boulders(room, -3.2, 19.2, 0.7, 3);

  /* --- the rest --------------------------------------------------------------------- */
  crate(room, 3.1, 8.6, 0.3, 0.8, 0.6, 0.62, true);
  crate(room, -3.0, 11.2, -0.3, 0.7, 0.55, 0.6, false);
  debris(room, 0.4, 2.0, 1.1, 8);
  debris(room, -0.4, 13.0, 1.2, 9);
  motes(room, 0, 1.7, 4.0, 3.0, 12, 'ash');
  motes(room, 0, 1.7, 13.0, 3.0, 12, 'ash');
  wallSign(room, 'east', -2.6, 2.3, false, 0.66, [0, 1]);
  wallSign(room, 'west', 2.6, 2.3, true, 0.66, [0, 2]);
  // Distance marks stencilled on the arch legs, counting away from you whichever
  // end you came in.
  for (let i = 0; i < 6; i++) {
    room.geo('signAmber', quad(0.18, 0.1), poseMatrix([-3.24, 1.5, -1.0 + i * 3.9], -Math.PI / 2), { receiveShadow: false });
  }

  /* --- light -------------------------------------------------------------------------- */
  // Four on a 1x3. Two are cold arc fittings on the arches, spaced so the middle
  // of the run is the darkest part of it; the third is the spatter cone's, spent
  // above; the fourth is a low warm wash off the fissure at the south end.
  const north = arcLamp(room, 'east', -1.8, 2.55, true, 12, false, [0, 0]);
  if (north) stutter(room, north, 12, 0.5, 6.8);
  arcLamp(room, 'west', 1.8, 2.55, true, 11, false, [0, 2]);

  const ember = new THREE.PointLight(0xff6a20, 7, ctx.dims.cellSize * 1.4, 2);
  ember.position.set(-2.8, 0.5, 17.4);
  room.light(ember);
  room.tick((t) => {
    ember.intensity = 7 * (1 + Math.sin(t * 0.55) * 0.2 + Math.sin(t * 1.4) * 0.1);
  });

  glowPool(room, -2.7, 0.6, 1.6);
  glowPool(room, -2.9, 6.6, 1.7);
  glowPool(room, -2.8, 17.4, 1.6);

  return room.finish();
}
