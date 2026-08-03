import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { armchair, bookcase, chair, cobwebs, fireplace, painting, rug, table } from '../kit/props';

/**
 * The Study - the last room anyone used.
 *
 * The desk lamp is on, the decanter is half empty, and the correspondence is
 * still spread out. Whatever went wrong in this house, the decision was taken
 * here. Warm, small, and the safest-feeling room in the manor, which is a lie.
 */
export const study: RoomBlueprint = {
  id: 'mansion.study',
  nameKey: 'room.mansion.study',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['quiet', 'warm'],
  anchors: {
    chest: [{ position: [3.05, 0, 2.7], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.9, 0.79, -2.2] },
      { position: [-2.7, 0.79, -2.6] },
      { position: [2.5, 1.51, -3.48] },
      { position: [3.42, 1.5, -2.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 1.9] },
      { position: [-1.6, 0, -0.6] },
      { position: [2.4, 0, 0.4] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, study);
  room.shell({ floor: 'parquet', wall: 'panel', ceiling: 'beams' });

  fireplace(room, 'north', -2.5, true);
  rug(room, -0.4, -0.6, 3.0, 2.4, -0.05);

  // The desk, at an angle, facing the door rather than the window.
  table(room, -2.2, -2.3, 1.9, 0.95, 0.78, 0.35);
  room.box('leather', [1.5, 0.02, 0.72], [-2.2, 0.78, -2.3], 0.35, { tile: 1.2 });
  chair(room, -1.6, -1.3, 0.35 + Math.PI);

  // Papers, an inkwell and a decanter that outlasted its owner.
  for (let i = 0; i < 6; i++) {
    room.geo(
      'paper',
      new THREE.BoxGeometry(room.range(0.2, 0.3), 0.006, room.range(0.24, 0.32)),
      poseMatrix([-2.2 + room.range(-0.6, 0.6), 0.79 + i * 0.006, -2.3 + room.range(-0.24, 0.24)], room.range(0, 1)),
      { consume: true },
    );
  }
  room.geo('glass', new THREE.CylinderGeometry(0.07, 0.09, 0.22, 10), poseMatrix([-2.7, 0.9, -2.6]), { consume: true });
  room.geo('glass', new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), poseMatrix([-2.55, 0.83, -2.3]), { consume: true });
  room.geo('ironBlack', new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8), poseMatrix([-1.7, 0.81, -2.5]), {
    consume: true,
  });

  // A green banker's lamp, still burning after all this time.
  room.geo('brass', new THREE.CylinderGeometry(0.05, 0.08, 0.28, 8), poseMatrix([-1.9, 0.92, -2.15]), { consume: true });
  room.geo('velvetGreen', new THREE.CylinderGeometry(0.13, 0.13, 0.12, 12, 1, true), poseMatrix([-1.9, 1.08, -2.15]), {
    consume: true,
  });
  room.geo('bulb', new THREE.SphereGeometry(0.05, 8, 6), poseMatrix([-1.9, 1.04, -2.15]), { consume: true });
  const lamp = new THREE.PointLight(0xffe0a8, 10, 6.5, 2);
  lamp.position.set(-1.9, 1.0, -2.15);
  room.light(lamp);

  bookcase(room, 'east', 2.4, 2.2, 4);
  bookcase(room, 'south', -2.5, 1.7, 3);

  // A globe on a stand, and the chair somebody sat in to look at it.
  room.geo('woodDark', new THREE.CylinderGeometry(0.04, 0.22, 0.6, 10), poseMatrix([1.3, 0.3, 1.6]), { consume: true });
  room.geo('paper', new THREE.SphereGeometry(0.26, 14, 10), poseMatrix([1.3, 0.88, 1.6]), { consume: true });
  room.geo('brass', new THREE.TorusGeometry(0.29, 0.014, 4, 16), tiltMatrix([1.3, 0.88, 1.6], [0, 0.4, 0.4]), {
    consume: true,
  });
  room.blockCircle(1.3, 1.6, 0.3);

  armchair(room, 1.5, 0.2, 2.4);
  painting(room, 'south', 1.9, 1.5, 0.8, 1.05, 1);

  cobwebs(room, -3.2, 3.2, 5.5);

  return room.finish();
}
