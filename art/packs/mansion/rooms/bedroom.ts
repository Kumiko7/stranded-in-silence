import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { armchair, cobwebs, debris, flicker, lightShaft, painting, rug, sideboard, wallMirror } from '../kit/props';

/**
 * The Master Bedroom - the bed is made and the drapes are drawn round it.
 *
 * A four-poster with the curtains closed on three sides is the single best hiding
 * silhouette in the manor, and the worst thing to have behind you. Moonlight
 * comes in over the vanity; the mirror is turned to the wall.
 */
export const bedroom: RoomBlueprint = {
  id: 'mansion.bedroom',
  nameKey: 'room.mansion.bedroom',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['quiet', 'moonlit'],
  anchors: {
    playerSpawn: [
      { position: [-0.8, 0, 1.6], rotationY: Math.PI },
      { position: [0.6, 0, 1.7], rotationY: Math.PI },
      { position: [-1.0, 0, 0.4], rotationY: Math.PI },
      { position: [0.8, 0, 0.5], rotationY: Math.PI },
    ],
    chest: [{ position: [1.4, 0, 3.1], rotationY: 0 }],
    locker: [{ position: [3.25, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.92, 3.44] },
      { position: [-2.6, 0.62, 0.9] },
      { position: [2.4, 0.0, -1.2] },
    ],
    patrolPoint: [
      { position: [0, 0, 1.6] },
      { position: [-2.0, 0, 2.6] },
      { position: [2.2, 0, 0.2] },
    ],
    enemySpawn: [{ position: [2.4, 0, -1.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, bedroom);
  const { windowAnchors } = room.shell({
    floor: 'parquet',
    wall: 'damaskBlue',
    wainscot: 'panel',
    ceiling: 'plaster',
    pictureRail: true,
    windows: [{ side: 'south', kind: 'glazed', light: true }],
  });
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.3, anchor.position[2]], [anchor.position[0] - 1.2, 0, 0.4], 1.5);
  }

  rug(room, 0, 0.6, 4.0, 3.0, 0.03);

  // The four-poster, drapes drawn on three sides.
  const bx = -1.4;
  const bz = -2.2;
  room.solid('woodDark', [2.1, 0.44, 2.3], [bx, 0.1, bz]);
  room.box('linen', [2.0, 0.24, 2.2], [bx, 0.54, bz], 0, { tile: 1.6 });
  room.box('linen', [1.9, 0.14, 0.5], [bx, 0.78, bz - 0.82], 0, { tile: 1 });
  room.box('dustSheet', [2.0, 0.06, 1.5], [bx, 0.78, bz + 0.34], 0, { tile: 1.4 });
  for (const [dx, dz] of [
    [-1.0, -1.1],
    [1.0, -1.1],
    [-1.0, 1.1],
    [1.0, 1.1],
  ] as const) {
    room.geo('woodDark', new THREE.CylinderGeometry(0.06, 0.08, 2.5, 8), poseMatrix([bx + dx, 1.25, bz + dz]), {
      consume: true,
    });
  }
  room.box('woodDark', [2.2, 0.1, 0.1], [bx, 2.5, bz - 1.1]);
  room.box('woodDark', [2.2, 0.1, 0.1], [bx, 2.5, bz + 1.1]);
  room.box('woodDark', [0.1, 0.1, 2.3], [bx - 1.0, 2.5, bz]);
  room.box('woodDark', [0.1, 0.1, 2.3], [bx + 1.0, 2.5, bz]);
  /*
   * Drapes, hung as separate falls off the four posts rather than as three solid
   * walls of velvet.
   *
   * Curtained right round, the bed came back on the contact sheet as a 2.2 x 2.5
   * metre red box standing in the middle of the room with no reading on it at
   * all - it was the largest single object in the manor and the least legible.
   * What makes a four-poster frightening is the *gap* between the hangings and
   * the fact that you cannot see all of what is behind them, which needs there
   * to be gaps. The head end stays closed; that is the half you cannot check.
   */
  room.box('velvetGold', [2.28, 0.32, 2.38], [bx, 2.18, bz], 0, { tile: 1.2 });
  // A scalloped pelmet under the tester, and the head curtain in four falls with
  // real gaps between them. Three panels at 6 cm apart is arithmetically a gap
  // and visually a wall: from the north doorway - which opens right beside the
  // bed head - the whole thing still read as one sheet of red.
  for (let i = 0; i < 6; i++) {
    room.geo('velvetGold', new THREE.SphereGeometry(0.2, 8, 6), poseMatrix([bx - 0.95 + i * 0.38, 2.16, bz - 1.16]), {
      tile: 0.8,
      consume: true,
    });
  }
  for (let i = 0; i < 4; i++) {
    const dx = -0.78 + i * 0.52;
    room.box('velvetRed', [0.4, 1.86, 0.1], [bx + dx, 0.28, bz - 1.1 + (i % 2) * 0.07], 0, { tile: 1.2 });
    room.box('velvetRed', [0.09, 1.8, 0.12], [bx + dx - 0.16, 0.32, bz - 1.03 + (i % 2) * 0.07], 0, { tile: 0.7 });
  }
  for (const dx of [-1.0, 1.0]) {
    for (const dz of [-0.86, 0.86]) {
      room.box('velvetRed', [0.22, 1.9, 0.36], [bx + dx, 0.26, bz + dz], 0, { tile: 1 });
      // Gathers down the leading edge, so a fall is not a flat slab either.
      for (let i = 0; i < 3; i++) {
        room.box('velvetRed', [0.08, 1.8, 0.1], [bx + dx - 0.08 + i * 0.08, 0.3, bz + dz + 0.2], 0, { tile: 0.7 });
      }
    }
  }

  // The vanity, mirror turned to the wall.
  room.solid('wood', [1.3, 0.62, 0.5], [-2.6, 0, 1.2], -Math.PI / 2, { tile: 1.2 });
  room.box('woodDark', [1.36, 0.05, 0.56], [-2.6, 0.62, 1.2], -Math.PI / 2);
  room.geo('woodDark', new THREE.BoxGeometry(0.9, 1.0, 0.05), tiltMatrix([-3.3, 1.1, 1.2], [0, -Math.PI / 2, 0.1]), {
    consume: true,
  });
  room.geo('brass', new THREE.CylinderGeometry(0.045, 0.06, 0.18, 8), poseMatrix([-2.6, 0.71, 0.9]), { consume: true });
  room.geo('glass', new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), poseMatrix([-2.6, 0.69, 1.5]), { consume: true });

  sideboard(room, 'south', 2.6, 1.4);
  wallMirror(room, 'east', 1.0, 1.2, 0.8, 1.4);
  painting(room, 'north', -2.4, 1.6, 0.7, 0.9, 3);
  armchair(room, 2.4, 2.6, Math.PI - 0.4, true);

  // A candle by the bed, guttering, and a book face down.
  room.box('brass', [0.14, 0.03, 0.14], [0.1, 0.0, -3.3]);
  room.box('wax', [0.06, 0.16, 0.06], [0.1, 0.03, -3.3]);
  room.box('flame', [0.05, 0.09, 0.05], [0.1, 0.19, -3.3], 0, { castShadow: false });
  const bedside = new THREE.PointLight(0xffc07a, 7, 6, 2);
  bedside.position.set(0.1, 0.34, -3.24);
  room.light(bedside);
  flicker(room, bedside, 7, 0.3, 6.2);
  room.box('bookRed', [0.22, 0.05, 0.3], [0.5, 0.0, -3.2], 0.4);

  debris(room, 2.2, -2.6, 1.2, 7);
  cobwebs(room, 3.2, -3.2, 2.4, 1.2);

  return room.finish();
}
