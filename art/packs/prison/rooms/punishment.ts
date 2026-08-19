import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cagedLamp,
  cyl,
  debris,
  disc,
  floggingFrame,
  floorGully,
  hangingChain,
  motes,
  notice,
  palePatch,
  puddle,
  sag,
  shackleWall,
  slab,
  strut,
  tallyWall,
  wallStain,
} from '../kit/props';

/**
 * The Correction Room - a triangle, a wall of rings, and a floor somebody has
 * scrubbed a very great many times.
 *
 * Everything in here is ordinary joinery and ordinary ironmongery, which is
 * exactly why it works: there is nothing in the room that could not be explained
 * as a piece of equipment, and the only thing that gives it away is how clean
 * one patch of the floor is.
 *
 * The rack of implements on the south wall is hung in the same way a workshop
 * hangs its tools - painted outlines behind each one, and two of the outlines
 * have nothing in front of them.
 */
export const punishment: RoomBlueprint = {
  id: 'prison.punishment',
  nameKey: 'room.prison.punishment',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 7,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [3.25, 0, -2.7], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.35, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.75, 0.86, 2.4] },
      { position: [2.9, 0.5, 2.9] },
      { position: [0.9, 0, -2.6] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.6, 0, -1.8] },
      { position: [2.5, 0, 1.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -1.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, punishment);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'brick',
    band: 'dado',
    bandHeight: 1.25,
    ceiling: 'joist',
    register: 'caged',
    mouth: 'arch',
    ports: [{ side: 'south', kind: 'judas' }],
  });

  /* --- the frame --------------------------------------------------------------------- */
  // In the band against the wall the generator can never open. It is bolted down
  // and it has been used: the timber is polished at the height a pair of hands
  // would be, which is the one thing about it that is not ordinary.
  floggingFrame(room, 0.2, 2.4, 0);
  // The scrubbed patch under it. Pale rather than dark, because what a floor
  // like this shows is not a stain but the absence of one.
  palePatch(room, 0.2, 2.3, 1.3);
  floorGully(room, 0.2, 1.1, 0.14);

  /* --- the wall of rings --------------------------------------------------------------- */
  shackleWall(room, 'south', -2.5, 3, 1.6);
  shackleWall(room, 'east', 2.7, 2, 1.85);
  hangingChain(room, 2.6, 2.7, 1.5, 'shackle');

  /* --- the rack ------------------------------------------------------------------------ */
  // A board on the west wall with painted outlines behind each hook. Two of the
  // outlines are empty, and that is the whole prop.
  room.box('timberDark', [0.1, 1.0, 1.7], [-3.62, 1.35, 2.4], 0, { tile: 0.5, castShadow: false });
  for (let i = 0; i < 5; i++) {
    const z = 1.72 + i * 0.34;
    room.box('surface.dado', [0.02, 0.62, 0.075], [-3.55, 1.36, z], 0, { tile: 0.3, castShadow: false });
    if (i === 1 || i === 3) continue;
    // A cane: a long thin taper, hung from a leather loop.
    room.geo('timberPale', cyl(0.012, 0.017, 0.82, 4), poseMatrix([-3.5, 1.36, z]), { castShadow: false });
    room.geo('leather', ball(0.02, 4), poseMatrix([-3.5, 1.78, z]), { castShadow: false });
  }
  room.geo('leather', cyl(0.016, 0.016, 0.5, 5), tiltMatrix([-3.48, 1.5, 1.4], [0.2, 0, 0.1]), { castShadow: false });
  for (let i = 0; i < 6; i++) {
    strut(room, 'leather', [-3.48, 1.26, 1.4], [-3.44 + room.range(-0.03, 0.03), 0.86 + room.range(-0.1, 0.1), 1.38 + room.range(-0.09, 0.09)], 0.008, 4, {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- the bath ------------------------------------------------------------------------- */
  // A plunge tub of caulked oak with a foot of cold water still in it, and a
  // hand pump over it. The water is a colour you can see: a near-black glossy
  // surface reads as a hole rather than as water (docs/art/ROOM_REVIEW.md).
  room.geo('timber', cyl(0.62, 0.58, 0.86, 12, true), poseMatrix([-2.75, 0.43, 2.5]), { tile: 0.5, castShadow: true });
  room.geo('timberDark', cyl(0.6, 0.6, 0.05, 12), poseMatrix([-2.75, 0.04, 2.5]), { castShadow: false });
  for (const y of [0.16, 0.7]) {
    room.geo('ironBar', cyl(0.63, 0.63, 0.05, 12, true), poseMatrix([-2.75, y, 2.5]), { castShadow: false });
  }
  room.geo('water', disc(0.57, 14), tiltMatrix([-2.75, 0.58, 2.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.blockCircle(-2.75, 2.5, 0.6);
  strut(room, 'lead', [-3.5, 0.1, 3.2], [-3.5, 1.55, 3.2], 0.035, 6, { castShadow: false });
  strut(room, 'lead', [-3.5, 1.55, 3.2], [-3.0, 1.42, 2.85], 0.03, 5, { castShadow: false });
  room.geo('ironBar', cyl(0.022, 0.022, 0.5, 5), tiltMatrix([-3.32, 1.68, 3.2], [0, 0, 0.7]), { castShadow: false });
  puddle(room, -2.2, 1.9, 0.7);

  /* --- the room --------------------------------------------------------------------------- */
  room.solid('timber', [0.4, 0.5, 0.4], [2.9, 0, 2.9], 0.3, { tile: 0.3 });
  tallyWall(room, 'east', -2.4, 1.4, 1.1, 0.8);
  notice(room, 'north', -2.7, 1.95, 0.56, 0.4, 'paper');
  wallStain(room, 'south', 2.6, 2.5, 0.6, 1.9, 'mould');
  wallStain(room, 'west', -2.9, 2.2, 0.5, 1.5, 'rust');
  debris(room, 1.9, -2.7, 0.8, 6);
  motes(room, 0.2, 1.5, 1.6, 2.8, 12, 'dust');

  /* --- light ------------------------------------------------------------------------------- */
  // One lamp, hung low and to the side, and the whole room is arranged so that
  // the frame stands between it and the largest blank wall. It is the shadow
  // caster and the shadow is the room.
  const lamp = new THREE.PointLight(0xffab5c, 9, ceilingHeight * 2.2, 2);
  lamp.position.set(2.4, 1.7, 1.0);
  room.shadowLight(lamp, 512);
  sag(room, lamp, 9, 0.36, 1.05);
  room.geo('warmWash', disc(2.2, 18), tiltMatrix([2.2, 0.013, 1.0], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  const back = cagedLamp(room, 'north', 2.6, 2.45, true, 5);
  if (back) sag(room, back, 5, 0.5, 1.5);
  // A dead fitting directly over the frame, which is where the light should be.
  cagedLamp(room, 'south', 0.2, 2.6, false);

  return room.finish();
}
