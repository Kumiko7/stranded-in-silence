import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  arcLamp,
  disc,
  bench,
  bioSac,
  bioVeins,
  cocoon,
  containmentTank,
  debris,
  glowPool,
  monitorBank,
  motes,
  quad,
  shelf,
  specimenJar,
  strut,
  wallSign,
} from '../kit/props';

/**
 * The Vivarium - what the site was really for, and the reason none of this
 * matters any more.
 *
 * Three containment tanks along the west wall. Two of them still have something
 * in them. The third has been opened from the inside, and the wall behind it is
 * a blast door that somebody welded shut and that is now bulged out into the
 * room, which is the wrong way round.
 *
 * The green in here belongs to neither half of the map - not the Works' arc
 * white, not the Mountain's orange - and that is the whole point of it.
 */
export const vivarium: RoomBlueprint = {
  id: 'forge.vivarium',
  nameKey: 'room.forge.vivarium',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['works', 'bio', 'landmark'],
  anchors: {
    chest: [{ position: [2.6, 0, 3.35], rotationY: 0 }],
    itemSpawn: [
      { position: [3.3, 0.97, -2.4] },
      { position: [3.16, 1.52, -1.5] },
      { position: [-1.7, 0, 3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-1.6, 0, -2.4] },
      { position: [2.4, 0, 1.4] },
    ],
    enemySpawn: [{ position: [2.4, 0, -2.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, vivarium);
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'duct',
    band: 'panel',
    bandHeight: 1.2,
    register: 'bio',
    mouth: 'blast',
    ports: [{ side: 'west', kind: 'sealed' }],
  });

  /* --- the tanks ---------------------------------------------------------------- */
  // Three along the west band. The broken one is in the middle, so the sealed
  // door behind it and the trail leading away from it are on the same sight line
  // from every doorway.
  containmentTank(room, -2.85, -2.6, 0.52, 1.7, 'specimen', true, 7);
  containmentTank(room, -2.85, 0.2, 0.52, 1.7, 'broken', false);
  containmentTank(room, -2.85, 3.0, 0.52, 1.7, 'sludge', false);

  // What came out of the middle one, going up the wall and across the ceiling.
  bioVeins(room, 'north', 1.9, 3);
  bioVeins(room, 'south', -1.9, 2);
  for (let i = 0; i < 4; i++) {
    const z = -1.2 + i * 1.1;
    strut(room, 'sinew', [-2.6, 0.1, z], [-1.2 - i * 0.3, 2.9, z + 0.4], room.range(0.03, 0.06), 5, {
      castShadow: false,
      receiveShadow: false,
    });
  }
  bioSac(room, -1.3, 0, 1.9, 0.85, false);
  cocoon(room, 'north', -2.7, 0.35);

  /* --- the lab side --------------------------------------------------------------- */
  bench(room, 3.35, -2.4, 2.0, 0.6, 0.94, Math.PI / 2);
  shelf(room, 'east', 1.5, 1.48, 1.4, 0.36);
  for (let i = 0; i < 5; i++) {
    specimenJar(room, 3.16, 1.53, 0.9 + i * 0.28, 0.075, 0.22, i === 1 || i === 3);
  }
  for (let i = 0; i < 4; i++) {
    specimenJar(room, 3.3, 0.95, -3.0 + i * 0.38, 0.085, 0.26, i === 2);
  }
  monitorBank(room, 2.0, 1.35, -3.45, Math.PI, 2, 1, true);

  // The record of it: a wall of pinned notes gone brittle, and one chart with a
  // line that leaves the paper.
  for (let i = 0; i < 7; i++) {
    room.geo('canvasPale', quad(room.range(0.16, 0.26), room.range(0.2, 0.3)), poseMatrix([0.2 + room.range(-1.0, 1.0), 1.9 + room.range(-0.3, 0.4), -3.66], Math.PI), {
      receiveShadow: false,
    });
  }

  debris(room, 1.4, 2.6, 0.9, 7);
  motes(room, -1.6, 1.5, 0.6, 2.4, 14, 'spore');
  glowPool(room, -2.85, 0.2, 1.5);
  wallSign(room, 'south', 2.7, 2.3, true);
  wallSign(room, 'east', -2.7, 2.2, false);

  /* --- light ------------------------------------------------------------------------ */
  // One lamp is the surviving tank's, spent above. The second is a cold fitting
  // over the bench, so the two halves of the room are two different colours and
  // the boundary between them runs right through the broken tank.
  const lamp = arcLamp(room, 'east', 2.4, 2.5, true, 12);
  if (lamp) {
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }

  // What drained out of the broken tank, spreading toward the door. Overlapping
  // discs of a dark wet material, not one pale translucent rectangle: a sheet of
  // `membrane` lying flat is a green rug with four hard corners, which is exactly
  // what the first pass of this room had on its floor.
  for (const [px, pz, r] of [
    [-2.0, 0.4, 0.95],
    [-1.4, 1.1, 0.7],
    [-0.8, 1.7, 0.5],
    [-0.3, 2.2, 0.32],
  ] as const) {
    room.geo('bioSpill', disc(r, 14), tiltMatrix([px, 0.013, pz], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  }
  room.geo('bioWash', disc(2.0, 18), tiltMatrix([-1.7, 0.02, 0.9], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
