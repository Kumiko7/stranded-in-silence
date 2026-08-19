import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  barShadow,
  cagedLamp,
  crate,
  cyl,
  debris,
  disc,
  motes,
  notice,
  puddle,
  quad,
  ring,
  sag,
  strut,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * The Airing Court - the yard, roofed over in wire, with the actual outside
 * behind a gate at the far end.
 *
 * This is the one room in the map with weather in it: cinder underfoot, standing
 * water in the ruts, and a tall barred gate onto a yard with a wall too high to
 * see over, wire above that, and a tower with a light in it that is looking
 * somewhere else. It is the only view out of the building in the whole pack and
 * it is deliberately not a way out.
 *
 * Everything is lit by two cold sources - the moon through the gate and a bulb
 * on a bracket that has gone blue with damp - so walking in here from a Blocks
 * corridor is a temperature change before it is anything else.
 */
export const yard: RoomBlueprint = {
  id: 'prison.yard',
  nameKey: 'room.prison.yard',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['blocks', 'entrance'],
  anchors: {
    chest: [{ position: [-3.25, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [3.05, 0.52, 2.4] },
      { position: [-2.6, 0.62, 2.9] },
      { position: [0.5, 0, -1.9] },
    ],
    playerSpawn: [
      { position: [-1.0, 0, -1.0], rotationY: Math.PI },
      { position: [1.0, 0, -1.0], rotationY: Math.PI },
      { position: [-2.0, 0, 0.2], rotationY: Math.PI },
      { position: [2.0, 0, 0.2], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 1.2] },
      { position: [-2.4, 0, -2.2] },
      { position: [2.4, 0, -2.2] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, yard);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'gravel',
    wall: 'brick',
    band: 'brick',
    bandHeight: 1.4,
    // Wire stretched over the whole court, with the dark above it. An exercise
    // yard with a lid on it is the single fastest way to say what this place
    // decided about the people in it.
    ceiling: 'mesh',
    register: 'caged',
    mouth: 'arch',
    ports: [{ side: 'south', kind: 'bars', tall: true, light: true }],
  });

  /* --- the standpipe ------------------------------------------------------------------- */
  // A pipe out of the ground with a trough under it and a tin cup on a chain.
  // The one place in the yard anybody had a reason to stand still.
  strut(room, 'lead', [-2.6, 0.02, 2.9], [-2.6, 1.55, 2.9], 0.035, 6, { castShadow: false });
  strut(room, 'lead', [-2.6, 1.55, 2.9], [-2.6, 1.42, 2.55], 0.03, 5, { castShadow: false });
  room.geo('brass', ring(0.075, 0.014, 8), tiltMatrix([-2.6, 1.3, 2.9], [Math.PI / 2, 0, 0]), { castShadow: false });
  room.solid('surface.rubble', [1.3, 0.62, 0.6], [-2.6, 0, 2.5], 0, { tile: 0.7 });
  room.geo('water', disc(0.42, 12), tiltMatrix([-2.6, 0.6, 2.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('enamel', cyl(0.055, 0.05, 0.1, 9), poseMatrix([-2.25, 0.67, 2.62]), { castShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('ironBar', ring(0.028, 0.008, 6), tiltMatrix([-2.3 + i * 0.06, 0.66 + i * 0.03, 2.72 + i * 0.03], [i % 2 ? 0 : Math.PI / 2, 0.5, 0]), { castShadow: false });
  }

  /* --- the bench ---------------------------------------------------------------------- */
  room.solid('timberPale', [0.44, 0.5, 1.8], [3.15, 0, 2.4], 0, { tile: 0.5 });
  for (const sz of [-1, 1]) {
    room.geo('ironBar', cyl(0.03, 0.035, 0.5, 5), poseMatrix([3.15, 0.25, 2.4 + sz * 0.7]), { castShadow: false });
  }
  room.box('surface.stencil', [0.02, 0.14, 0.5], [3.62, 1.55, 2.4], 0, { tile: 0.3, castShadow: false });

  /* --- the yard --------------------------------------------------------------------------- */
  // Two worn lanes rather than a ring: concentric anything on a floor reads as a
  // target painted on it, and a walking circle is exactly the shape that fails
  // (docs/art/ROOM_REVIEW.md).
  for (const [x, z, yaw, len] of [
    [-0.6, 0.4, 0.22, 5.4],
    [1.4, -1.0, -0.32, 4.2],
  ] as const) {
    room.geo('ash', quad(1.1, len), tiltMatrix([x, 0.012, z], [-Math.PI / 2, yaw, 0]), { castShadow: false, receiveShadow: false });
  }
  puddle(room, -1.4, -1.6, 1.0);
  puddle(room, 1.9, 1.8, 0.8);
  crate(room, -3.0, 1.7, 0.4, 0.72, 0.5, 0.58, false);

  // A coil of wire against the wall, and a bin that has been kicked over.
  for (let i = 0; i < 5; i++) {
    room.geo('ironBar', ring(0.32 - i * 0.02, 0.012, 11), tiltMatrix([2.6, 0.34 + i * 0.05, 3.2], [Math.PI / 2 + room.range(-0.16, 0.16), room.range(0, 3), 0]), {
      castShadow: false,
    });
  }
  room.geo('ironPale', cyl(0.3, 0.26, 0.72, 10, true), tiltMatrix([1.4, 0.3, -3.2], [0, 0.4, Math.PI / 2 - 0.2]), { tile: 0.4, castShadow: true });
  room.blockCircle(1.4, -3.2, 0.3);
  for (let i = 0; i < 6; i++) {
    room.geo('ash', ball(room.range(0.05, 0.12), 5), tiltMatrix([room.range(0.9, 2.2), 0.05, room.range(-3.1, -2.4)], [0, room.range(0, 3), 0], [1.3, 0.6, 1]), {
      castShadow: false,
    });
  }

  /* --- weather ------------------------------------------------------------------------------ */
  wallStain(room, 'east', -2.6, 2.4, 0.8, 2.4, 'mould');
  wallStain(room, 'west', 2.4, 2.5, 0.7, 2.2, 'mould');
  notice(room, 'north', 2.6, 2.0, 0.56, 0.4);
  wallSign(room, 'west', -2.5, 2.4, 'red', 0.66);
  debris(room, -1.0, 2.6, 1.0, 8);
  motes(room, 0, 1.8, 0, 3.4, 16, 'dust');

  /* --- light -------------------------------------------------------------------------------- */
  // Both lamps are cold and one of them is the gate. The bracket bulb is the
  // room's shadow caster because it stands under the wire, and the wire is the
  // one thing in the map worth a real shadow.
  const bracket = new THREE.PointLight(0xb8d4e0, 12, ceilingHeight * 2.4, 2);
  bracket.position.set(2.0, ceilingHeight - 0.55, -2.4);
  room.shadowLight(bracket, 512);
  sag(room, bracket, 12, 0.4, 1.4);
  strut(room, 'ironBar', [3.5, ceilingHeight - 0.25, -3.3], [2.0, ceilingHeight - 0.48, -2.4], 0.022, 5, { castShadow: false, receiveShadow: false });
  room.geo('bulbCold', ball(0.06, 6), poseMatrix([2.0, ceilingHeight - 0.55, -2.4]), { castShadow: false, receiveShadow: false });
  room.geo('coldWash', disc(2.6, 18), tiltMatrix([2.0, 0.013, -2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  // The gate throws its bars twelve feet across the cinder, which is the image
  // the room exists for.
  barShadow(room, 0, 1.0, 3.2, 5.2, 0, true);
  cagedLamp(room, 'north', -2.7, 2.4, false);

  return room.finish();
}
