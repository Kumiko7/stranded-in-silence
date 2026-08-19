import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { candelabra, chair, chandelier, cobwebs, curtains, cyl, debris, rug, sconce, sideboard } from '../kit/props';

/**
 * The Music Room - the lid is up and the sheet music is on the floor.
 *
 * A grand piano takes a quarter of the space and blocks every diagonal, so
 * fights over sightlines happen here. Someone left a candelabra on the lid, and
 * the harp in the corner is missing exactly one string.
 */
export const musicRoom: RoomBlueprint = {
  id: 'mansion.music',
  nameKey: 'room.mansion.music',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['grand'],
  anchors: {
    chest: [{ position: [-3.0, 0, -2.8], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [1.5, 0.98, 1.9] },
      { position: [-2.1, 0.0, 2.6] },
      { position: [2.5, 0.92, 3.44] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.2] },
      { position: [-2.4, 0, 0.4] },
      { position: [2.7, 0, -1.6] },
    ],
    enemySpawn: [{ position: [-1.6, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, musicRoom);
  room.shell({
    floor: 'parquet',
    wall: 'damaskGreen',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
  });

  rug(room, 0.6, 1.4, 3.6, 3.0, 0.2);

  // The grand: body, curved bent-side suggested by two angled blocks, lid up.
  const px = 1.5;
  const pz = 1.9;
  room.solid('surface.panel', [2.3, 0.26, 1.5], [px, 0.72, pz], 0.2, { tile: 1.6 });
  room.geo('surface.panel', new THREE.BoxGeometry(1.3, 0.26, 1.0), tiltMatrix([px + 0.95, 0.85, pz + 0.5], [0, 0.72, 0]), {
    tile: 1.6,
    consume: true,
  });
  for (const [dx, dz] of [
    [-1.0, -0.6],
    [1.0, -0.5],
    [0.5, 0.62],
  ] as const) {
    room.geo(
      'woodDark',
      cyl(0.06, 0.075, 0.72, 8),
      poseMatrix([px + dx * Math.cos(0.2) + dz * Math.sin(0.2), 0.36, pz - dx * Math.sin(0.2) + dz * Math.cos(0.2)]),
      {},
    );
  }
  // Keys, and the fallboard nobody closed.
  room.box('bone', [1.5, 0.04, 0.2], [px - 0.25, 0.98, pz - 0.72], 0.2);
  for (let i = 0; i < 17; i++) {
    room.geo(
      'ironBlack',
      new THREE.BoxGeometry(0.03, 0.03, 0.12),
      poseMatrix([px - 0.95 + i * 0.087 + Math.sin(0.2) * 0.04, 1.02, pz - 0.74 + Math.cos(0.2) * 0.02], 0.2),
      { consume: true },
    );
  }
  // Lid, propped.
  room.geo('surface.panel', new THREE.BoxGeometry(2.2, 0.05, 1.4), tiltMatrix([px - 0.1, 1.5, pz + 0.62], [0.9, 0.2, 0]), {
    tile: 1.6,
    consume: true,
  });
  room.geo('woodDark', cyl(0.02, 0.02, 0.9, 6), tiltMatrix([px + 0.7, 1.35, pz + 0.2], [0.25, 0.2, 0]), {
  });
  candelabra(room, [px - 0.6, 0.98, pz + 0.2], 3);

  // Stool, pushed back in a hurry.
  room.box('woodDark', [0.56, 0.44, 0.36], [px - 0.9, 0, pz - 1.5], 0.5);
  room.box('velvetGold', [0.5, 0.07, 0.32], [px - 0.9, 0.44, pz - 1.5], 0.5, { tile: 0.6 });
  room.blockCircle(px - 0.9, pz - 1.5, 0.3);

  // The harp, in the corner, out of tune with everything.
  const hx = -2.9;
  const hz = 1.8;
  room.geo('gilt', new THREE.BoxGeometry(0.1, 1.5, 0.12), tiltMatrix([hx, 0.86, hz], [0, 0.6, -0.28]), { consume: true });
  room.geo('gilt', new THREE.BoxGeometry(0.16, 1.35, 0.14), tiltMatrix([hx + 0.42, 0.72, hz + 0.28], [0, 0.6, 0.34]), {
    consume: true,
  });
  room.geo('gilt', new THREE.BoxGeometry(0.7, 0.1, 0.12), tiltMatrix([hx + 0.18, 0.1, hz + 0.12], [0, 0.6, 0.1]), {
    consume: true,
  });
  for (let i = 0; i < 14; i++) {
    if (i === 6) continue; // the missing string
    const t = i / 14;
    room.geo(
      'silver',
      cyl(0.004, 0.004, 1.2 - t * 0.7, 4),
      tiltMatrix([hx + 0.06 + t * 0.42, 0.28 + (1.2 - t * 0.7) / 2, hz + t * 0.28], [0, 0.6, -0.1]),
      {},
    );
  }
  room.blockCircle(hx + 0.2, hz + 0.15, 0.42);

  // Sheet music, everywhere.
  for (let i = 0; i < 14; i++) {
    room.geo(
      'paper',
      new THREE.PlaneGeometry(0.24, 0.3),
      tiltMatrix([room.range(-3.0, 3.0), 0.012, room.range(-3.0, 3.2)], [-Math.PI / 2, room.range(0, Math.PI), 0]),
      { castShadow: false, consume: true },
    );
  }
  // A music stand, folded over.
  room.geo('ironBlack', cyl(0.015, 0.015, 1.2, 5), tiltMatrix([-1.4, 0.14, 2.4], [1.4, 0.9, 0]), {
  });
  room.box('ironBlack', [0.36, 0.02, 0.26], [-2.1, 0.02, 2.6], 0.9);

  chair(room, -2.2, 1.0, -1.1);
  chandelier(room, -0.6, -0.6, 0.66, true, 2);
  sconce(room, 'south', 2.5, 2.15, false);
  sideboard(room, 'south', 2.5, 1.3);
  room.geo('silver', cyl(0.09, 0.13, 0.3, 10), poseMatrix([2.1, 1.07, 3.44]), {});
  curtains(room, 'north', 2.5, 1.8, 2.6);

  debris(room, -2.6, 2.4, 1.2, 8);
  cobwebs(room, 3.2, -3.2, 2.4, 1.2);

  return room.finish();
}
