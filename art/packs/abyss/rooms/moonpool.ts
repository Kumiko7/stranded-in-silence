import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { beacon, bioMotes, bubbleColumn, cageLamp, causticPatch, crate, debris, disc, diveSuit, drum, glowShaft, puddle, railing, stripLight } from '../kit/props';

/**
 * The Moon Pool - a hole in the floor of the world.
 *
 * The deck opens on a three-metre well of open water held out by pressure
 * alone, coamed and railed all the way round, with an A-frame over one side and
 * two atmospheric suits hanging where their divers left them. The water is the
 * room's light: it comes up green through the well and throws a caustic net
 * across the trusses and the underside of everything standing near it.
 *
 * The room is a donut - the well takes the middle and you walk round it - which
 * is the one plan that lets a set piece sit dead centre in a chamber that has to
 * offer all four walls. It is the only place in the station where you can stand
 * at the edge of the open sea, and it is where four people start their run.
 */
export const moonpool: RoomBlueprint = {
  id: 'abyss.moonpool',
  nameKey: 'room.abyss.moonpool',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['station', 'entrance', 'hinge', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, -2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.8, 0.9, -2.7] },
      { position: [2.4, 1.47, -3.48] },
      { position: [2.6, 0, -2.9] },
    ],
    playerSpawn: [
      { position: [-2.2, 0, 2.7], rotationY: 0 },
      { position: [-0.8, 0, 3.0], rotationY: 0 },
      { position: [0.8, 0, 3.0], rotationY: 0 },
      { position: [2.2, 0, 2.7], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [-2.7, 0, 0.6] },
      { position: [2.7, 0, 1.4] },
      { position: [-1.4, 0, -2.4] },
    ],
    enemySpawn: [{ position: [1.8, 0, -3.2] }],
  },
  build,
};

/** Half-width of the well. Centred, so the walking ring is 1.8 m all the way round. */
const WELL = 1.55;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, moonpool);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'deck',
    wall: 'hull',
    ceiling: 'trusses',
    band: 'hazard',
    bandHeight: 0.62,
    strip: 'amber',
    mouth: 'bulkhead',
  });

  /* --- the well ----------------------------------------------------------------- */
  /**
   * The water surface sits just ABOVE the deck plate, not sunk into it.
   *
   * The kit lays a solid floor slab across every cell and there is no way to cut
   * a hole in it, so anything below y = 0 is simply behind the floor: the first
   * pass recessed this well half a metre and the set piece the whole room is
   * built around was invisible from all four doorways. A moon pool's water is
   * level with the deck anyway - that is what a moon pool IS - so the depth has
   * to be sold at the rim instead of underneath.
   *
   * Two layers, three centimetres apart: the lit surface and the caustic net
   * riding on it. The coaming is what gives the edge - a dark rim drawn inside
   * it only read as a cross painted on the water.
   */
  room.geo('brineSheen', disc(WELL * 0.99, 4), tiltMatrix([0, 0.02, 0], [-Math.PI / 2, Math.PI / 4, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.8,
  });
  room.geo('surface.caustic', disc(WELL * 0.9, 4), tiltMatrix([0, 0.035, 0], [-Math.PI / 2, Math.PI / 4, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.6,
  });
  // The coaming: a raised lip you cannot step over, with the hazard band painted
  // on the deck outside it. These four boxes are the only colliders in the room
  // that matter, and the ring they leave is 1.8 m wide.
  for (const [dx, dz, yaw] of [
    [0, -WELL - 0.16, 0],
    [0, WELL + 0.16, 0],
    [-WELL - 0.16, 0, Math.PI / 2],
    [WELL + 0.16, 0, Math.PI / 2],
  ] as const) {
    room.solid('steel', [WELL * 2 + 0.62, 0.22, 0.32], [dx, 0, dz], yaw, { tile: 0.5 });
    room.box('surface.hazard', [WELL * 2 + 0.62, 0.02, 0.46], [dx * 1.26, 0.006, dz * 1.26], yaw, {
      tile: 1.0,
      castShadow: false,
      receiveShadow: false,
    });
  }
  railing(room, [-WELL - 0.32, 0, -WELL - 0.3], [-WELL - 0.32, 0, WELL + 0.3], false, 1.02);
  railing(room, [WELL + 0.32, 0, -WELL - 0.3], [WELL + 0.32, 0, WELL + 0.3], false, 1.02);

  // What comes up out of it.
  bubbleColumn(room, -0.7, -0.6, 0.06, ceilingHeight - 0.4, 14);
  bubbleColumn(room, 0.8, 0.7, 0.06, ceilingHeight - 0.6, 11);
  glowShaft(room, [0, 0.05, 0], [0, ceilingHeight, 0], WELL * 1.7);
  bioMotes(room, 0, 1.3, 0, 1.6, 22);
  causticPatch(room, 0, 2.7, 1.5);
  causticPatch(room, -2.5, -0.4, 1.2);

  /* --- the gantry ---------------------------------------------------------------- */
  // An A-frame over the west side with the hoist block hanging off it. Nothing
  // about a moon pool works without a way to lift something out of it.
  for (const s of [-1, 1]) {
    room.geo('steel', new THREE.CylinderGeometry(0.075, 0.09, 3.0, 8), tiltMatrix([-2.55, 1.5, s * 1.9], [s * 0.26, 0, 0]), {
      tile: 0.5,
      consume: true,
    });
  }
  room.geo('steel', new THREE.CylinderGeometry(0.08, 0.08, 4.1, 8), tiltMatrix([-2.45, 2.95, 0], [Math.PI / 2, 0, 0]), {
    tile: 0.5,
    consume: true,
  });
  room.box('steelDark', [0.3, 0.34, 0.24], [-2.45, 2.5, 0.3], 0, { tile: 0.3, castShadow: false });
  room.geo('cable', new THREE.CylinderGeometry(0.018, 0.018, 1.5, 5), poseMatrix([-2.45, 1.78, 0.3]), {
    tile: 0.3,
    castShadow: false,
    consume: true,
  });
  room.geo('steel', new THREE.ConeGeometry(0.11, 0.36, 7), poseMatrix([-2.45, 0.95, 0.3]), { tile: 0.3, consume: true });

  /* --- the divers ---------------------------------------------------------------- */
  /**
   * Two suits hanging on the east side, facing the well. They are person-shaped
   * and person-sized, and that is the entire idea.
   *
   * Both stand well clear of |z| < 1.1. A suit carries a 0.42 m collider and the
   * east hatchway's lane is only 1.2 m wide, so one parked on the centre line
   * seals a door the generator may well decide to open.
   */
  diveSuit(room, 3.05, -1.6, -Math.PI / 2 - 0.18, false);
  diveSuit(room, 3.05, 2.1, -Math.PI / 2 + 0.1, true);

  /* --- the working deck ----------------------------------------------------------- */
  crate(room, -2.8, -2.7, 0.24, 1.05, 0.9, 0.7, false);
  crate(room, -1.6, -3.2, -0.3, 0.7, 0.55, 0.6, true);
  // Both over on the working side with the crates. A drum on its side carries a
  // 0.39 m collider, and one parked in a hatchway's lane stops the door dead -
  // which in a room offering all four walls rules out most of the perimeter.
  drum(room, -3.2, -1.3);
  drum(room, -1.0, -3.3, true);
  puddle(room, 1.4, 2.5, 0.9);
  puddle(room, -2.6, 1.8, 0.7);
  debris(room, 2.2, 2.9, 0.9, 8);
  debris(room, -2.9, -1.3, 0.7, 6);

  // A tool shelf on the fore bulkhead, with the spanners still racked on it.
  room.box('steelPale', [1.5, 0.05, 0.4], [2.4, 1.4, -3.48], 0, { tile: 0.7 });
  for (let i = 0; i < 4; i++) {
    room.geo('steelDark', new THREE.CylinderGeometry(0.02, 0.02, room.range(0.2, 0.42), 5), tiltMatrix([1.9 + i * 0.3, 1.62, -3.44], [0, 0, room.range(-0.2, 0.2)]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
  }

  /**
   * Two lights: a cold strip over the gantry, and the amber beacon above the
   * well - the one that says the hatch under your feet is open. Everything else
   * you can see by is emissive and free.
   */
  stripLight(room, -2.9, 2.2, 2.2, Math.PI / 2, true, false, 10);
  // Hung off the trusses on a stem, not floating: a beacon with no mount reads
  // as a yellow card stuck to the middle of the air.
  room.geo('steelDark', new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), poseMatrix([0, ceilingHeight - 0.34, 0]), {
    tile: 0.3,
    castShadow: false,
    consume: true,
  });
  beacon(room, 0, ceilingHeight - 0.95, 0, true, 12);
  cageLamp(room, 'north', 2.6, 2.2, false, false);
  cageLamp(room, 'south', -2.4, 2.2, false, true);

  return room.finish();
}
