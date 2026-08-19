import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cyl, disc, floorGully, motes, quad, slab, strobe, strut, tubeLight, wallStain } from '../kit/props';

/**
 * The Soft Room - quilted canvas on every wall, a drain in the floor, and one
 * tray.
 *
 * The emptiest room in the map and the one that took the longest to get right,
 * because everything you put in it makes it less frightening. What is left is
 * the padding itself - buttoned on a diamond grid, split along one seam with the
 * horsehair coming out of it - a tray of food inside the door that has been
 * there long enough to have gone to nothing, and a jacket in the corner with
 * both sleeves still tied.
 *
 * The light is a single tube behind a mesh guard, which is the only fitting in
 * the pack a person could not reach, and it is failing.
 */
export const padded: RoomBlueprint = {
  id: 'prison.padded',
  nameKey: 'room.prison.padded',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north'),
  weight: 9,
  tags: ['ward', 'dead-end'],
  anchors: {
    chest: [{ position: [3.2, 0, 2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.6, 0.05, -2.4] },
      { position: [-2.9, 0.24, 2.6] },
      { position: [2.4, 0, -2.0] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.6] },
      { position: [-2.0, 0, 1.8] },
      { position: [1.8, 0, 1.4] },
    ],
    enemySpawn: [{ position: [-3.1, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, padded);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'rubber',
    wall: 'padded',
    band: 'none',
    ceiling: 'soffit',
    register: 'strip',
    mouth: 'clinic',
    // No kerb and no picture rail: a padded room has no edges anywhere, which is
    // the point of it, and it is the one room in the pack that turns both off.
    kick: false,
    seam: false,
    // An observation hatch on the wall opposite the door, at eye height, with a
    // dark cell behind it. It is not a light and it is not a way out.
    // The hatch brings a lamp of its own: light from the corridor through a hole
    // the size of a hand is the only other source this room gets, and it is what
    // stops a black box being a black box.
    ports: [{ side: 'south', kind: 'judas', light: true }],
  });

  /* --- the padding ------------------------------------------------------------------ */
  // The ceiling is padded too, as one soft slab over the whole cell. Nothing in
  // this room is hard except the floor and the drain in it.
  room.box('surface.padded', [7.4, 0.16, 7.4], [0, ceilingHeight - 0.18, 0], 0, { tile: 1.15, castShadow: false });
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      room.geo('leather', ball(0.045, 5), poseMatrix([-2.7 + i * 1.8, ceilingHeight - 0.2, -2.7 + k * 1.8]), { castShadow: false });
    }
  }
  // The split, in the corner where somebody worked at it: a dark slot with pale
  // stuffing coming out. Two lumps, not one, or it reads as a painted line.
  slab(room, 'itemTar', [0.1, 1.3, 0.2], [-3.55, 1.5, -2.4], [0, 0, 0.12], { tile: 0.3 });
  room.geo('canvas', ball(0.19, 7), tiltMatrix([-3.42, 1.15, -2.42], [0, 0.4, 0], [0.8, 1.1, 1.2]), { castShadow: false });
  room.geo('canvas', ball(0.13, 6), tiltMatrix([-3.38, 1.72, -2.3], [0, 1.1, 0], [0.9, 1.0, 1.1]), { castShadow: false });
  room.geo('canvas', ball(0.09, 6), poseMatrix([-3.2, 0.14, -2.5]), { castShadow: false });

  /* --- the tray -------------------------------------------------------------------- */
  // Inside the door, where it was pushed. An enamel plate, a tin cup on its side,
  // and a dark ring where whatever was on the plate went into the rubber.
  room.box('enamel', [0.34, 0.03, 0.26], [0.6, 0.02, -2.4], 0.18, { tile: 0.2, castShadow: false });
  room.geo('enamel', cyl(0.09, 0.085, 0.02, 9), poseMatrix([0.55, 0.06, -2.4]), { castShadow: false });
  room.geo('stain', disc(0.075, 9), tiltMatrix([0.55, 0.072, -2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('enamel', cyl(0.05, 0.045, 0.09, 8), tiltMatrix([0.92, 0.05, -2.28], [0, 0.3, Math.PI / 2]), { castShadow: false });
  room.geo('stain', disc(0.4, 12), tiltMatrix([0.9, 0.012, -2.15], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- the jacket ------------------------------------------------------------------- */
  // A heap in the far corner with two sleeves coming out of it and the ends still
  // knotted together. Arms that end in nothing are the whole prop - it is the
  // ghost's empty sleeves, one dimension down (docs/art/ROOM_REVIEW.md).
  room.geo('canvas', ball(0.34, 8), tiltMatrix([-2.9, 0.2, 2.6], [0, 0.7, 0], [1.3, 0.6, 1.1]), { castShadow: true });
  room.geo('canvas', ball(0.22, 7), tiltMatrix([-2.6, 0.16, 2.3], [0, 1.5, 0], [1.2, 0.55, 1.0]), { castShadow: false });
  const cuffA: readonly [number, number, number] = [-1.95, 0.11, 2.95];
  const cuffB: readonly [number, number, number] = [-2.1, 0.11, 2.0];
  strut(room, 'canvas', [-2.85, 0.19, 2.66], cuffA, 0.065, 6, { castShadow: false, receiveShadow: false });
  strut(room, 'canvas', [-2.8, 0.19, 2.5], cuffB, 0.062, 6, { castShadow: false, receiveShadow: false });
  // The knot: the two cuffs are tied to each other, which is the whole prop.
  strut(room, 'leather', cuffA, cuffB, 0.016, 4, { castShadow: false, receiveShadow: false });
  room.geo('leather', ball(0.05, 5), poseMatrix([-2.02, 0.11, 2.48]), { castShadow: false });

  /* --- the floor -------------------------------------------------------------------- */
  floorGully(room, 2.4, -2.0, 0.13);
  wallStain(room, 'west', 0.6, 1.5, 0.8, 2.4, 'stain');
  wallStain(room, 'east', -1.4, 1.1, 0.6, 1.6, 'stain');
  wallStain(room, 'south', -2.4, 1.7, 0.5, 1.4, 'stain');
  motes(room, 0, 1.5, 0, 2.8, 10, 'dust');

  /* --- light ------------------------------------------------------------------------- */
  // One fitting, sunk into the ceiling behind a mesh guard, and going. The
  // strobe is what makes a padded room unbearable rather than merely bare - a
  // tungsten sags and a fluorescent snaps, and this one snaps.
  const tube = tubeLight(room, 0.4, 0.2, 1.6, 0.4, true, true, 12, 0.24);
  if (tube) {
    room.bakeShadow(tube, 512);
    strobe(room, tube, 12, 0.72, 4.2);
  }
  for (let i = 0; i < 7; i++) {
    room.box('ironBar', [2.0, 0.014, 0.014], [0.4, ceilingHeight - 0.36, -0.32 + i * 0.18], 0.4, { castShadow: false });
  }
  room.geo('coldWash', disc(2.6, 18), tiltMatrix([0.4, 0.014, 0.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  // A second, dim source: the strip under the door, which is the only thing that
  // tells a player where the wall with the way out is.
  room.geo('coldWash', quad(1.6, 0.9), tiltMatrix([0, 0.013, -3.15], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
