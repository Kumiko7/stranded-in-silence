import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { candle, candleCluster, cobwebs, debris, flicker, lightShaft } from '../kit/props';

/**
 * The Private Chapel - somebody has been keeping the candles lit.
 *
 * Stone, ribbed vaulting and a stained window that glows without a light behind
 * it, which is the point: the emissive glass carries the whole east end for free
 * and leaves the budget for the altar. The pews face away from the door.
 */
export const chapel: RoomBlueprint = {
  id: 'mansion.chapel',
  nameKey: 'room.mansion.chapel',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 7,
  tags: ['quiet', 'cold'],
  anchors: {
    chest: [{ position: [-3.0, 0, 2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0.0, 1.02, -2.6] },
      { position: [2.7, 0.5, -2.4] },
      { position: [-1.9, 0.48, 1.1] },
    ],
    patrolPoint: [
      { position: [2.9, 0, 0.4] },
      { position: [-2.9, 0, 0.4] },
      { position: [0, 0, 2.8] },
    ],
    enemySpawn: [{ position: [3.0, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, chapel);
  const { windowAnchors } = room.shell({
    floor: 'stone',
    wall: 'stone',
    wainscot: 'stone',
    ceiling: 'ribs',
    cornice: false,
    skirting: false,
    windows: [{ side: 'north', kind: 'stained', light: true, tall: true }],
  });
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.6, anchor.position[2]], [anchor.position[0], 0, 1.6], 2.1, true);
  }

  // The altar, under the window, with a step up to it.
  room.solid('surface.stone', [3.4, 0.16, 1.0], [0, 0, -3.0], 0, { tile: 1.8 });
  room.solid('marbleWhite', [1.9, 0.94, 0.62], [0, 0.16, -2.6], 0, { tile: 1.4 });
  room.box('linen', [2.06, 0.04, 0.76], [0, 1.1, -2.6], 0, { tile: 1.2 });
  room.box('linen', [1.9, 0.5, 0.04], [0, 0.6, -2.28], 0, { tile: 1 });

  // A cross, and the candles that should have gone out decades ago.
  room.box('brass', [0.07, 0.66, 0.07], [0, 1.14, -2.7]);
  room.box('brass', [0.36, 0.07, 0.07], [0, 1.56, -2.7]);
  for (const x of [-0.66, 0.66]) {
    room.geo('brass', new THREE.CylinderGeometry(0.03, 0.09, 0.3, 8), poseMatrix([x, 1.29, -2.66]), { consume: true });
    candle(room, [x, 1.44, -2.66], 0.3);
  }
  const altar = new THREE.PointLight(0xffc078, 11, 8, 2);
  altar.position.set(0, 1.7, -2.4);
  room.light(altar);
  flicker(room, altar, 11, 0.22, 5.4);

  // Four pews, facing the altar, one shoved out of line.
  for (let i = 0; i < 4; i++) {
    const z = -1.2 + i * 0.95;
    const skew = i === 2 ? 0.16 : 0;
    room.geo('woodDark', new THREE.BoxGeometry(4.4, 0.1, 0.42), tiltMatrix([0, 0.46, z], [0, skew, 0]), {
      tile: 1.6,
      consume: true,
    });
    room.geo('woodDark', new THREE.BoxGeometry(4.4, 0.66, 0.09), tiltMatrix([0, 0.8, z + 0.2], [0, skew, 0]), {
      tile: 1.6,
      consume: true,
    });
    for (const dx of [-1.95, 1.95]) {
      room.geo('woodDark', new THREE.BoxGeometry(0.12, 0.46, 0.42), tiltMatrix([dx, 0.23, z], [0, skew, 0]), {
        consume: true,
      });
    }
    room.collider({ kind: 'box', center: [0, z + 0.1], halfExtents: [2.2, 0.3], rotationY: skew });
  }

  // A prayer book left open on the back pew, and a votive stand by the door.
  room.box('bookTan', [0.26, 0.05, 0.34], [-1.9, 0.46, 1.1], 0.2);
  room.geo('ironBlack', new THREE.CylinderGeometry(0.22, 0.3, 0.5, 10), poseMatrix([2.7, 0.25, -2.4]), { consume: true });
  room.box('ash', [0.44, 0.06, 0.44], [2.7, 0.5, -2.4]);
  candleCluster(room, [2.7, 0.5, -2.4]);
  room.blockCircle(2.7, -2.4, 0.32);

  // Fallen masonry from the vault.
  debris(room, -2.6, -1.4, 1.1, 8);
  debris(room, 2.4, 2.4, 1.3, 9);
  cobwebs(room, -3.2, -3.2, 0.8, 1.5);
  cobwebs(room, 3.2, -3.2, 2.4, 1.3);

  return room.finish();
}
