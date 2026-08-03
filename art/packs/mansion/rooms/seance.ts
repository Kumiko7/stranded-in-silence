import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { candleCluster, chair, cobwebs, curtains, debris, flicker, rug, sideboard } from '../kit/props';

/**
 * The Séance Parlour - the chairs are still pulled in and the glass is on the E.
 *
 * Somebody in this house went looking. The round table with its cloth, the
 * lettered board, the spirit cabinet with its curtain half drawn - and every
 * mirror in the room turned face to the wall or covered, which is the detail
 * that makes people stop walking.
 */
export const seance: RoomBlueprint = {
  id: 'mansion.seance',
  nameKey: 'room.mansion.seance',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 8,
  tags: ['wrong', 'quiet'],
  anchors: {
    chest: [{ position: [3.05, 0, 2.7], rotationY: Math.PI / 2 }],
    locker: [{ position: [1.6, 0, -3.25], rotationY: Math.PI }],
    itemSpawn: [
      { position: [0.24, 0.79, -0.2] },
      { position: [-2.6, 0.92, -3.44] },
      { position: [-2.9, 0.0, 2.6] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.4] },
      { position: [-2.4, 0, -0.4] },
      { position: [2.3, 0, -2.4] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, seance);
  room.shell({
    floor: 'carpet',
    wall: 'damaskRed',
    wainscot: 'panel',
    ceiling: 'plaster',
    pictureRail: true,
  });

  rug(room, 0, 0, 3.2, 3.2, 0.4);

  // The round table, its cloth to the floor.
  room.geo('velvetGold', new THREE.CylinderGeometry(0.86, 1.02, 0.78, 20), poseMatrix([0, 0.39, 0]), {
    tile: 1.4,
    consume: true,
  });
  room.geo('velvetGold', new THREE.CylinderGeometry(0.92, 0.92, 0.04, 20), poseMatrix([0, 0.79, 0]), {
    tile: 1.4,
    consume: true,
  });
  room.blockCircle(0, 0, 0.92);

  // The board, the planchette on E, and a ring of hand-worn candle wax.
  room.geo('bookTan', new THREE.BoxGeometry(0.62, 0.02, 0.44), poseMatrix([0, 0.81, 0], 0.12), { consume: true });
  room.geo('woodDark', new THREE.CylinderGeometry(0.06, 0.07, 0.03, 3), poseMatrix([0.24, 0.83, -0.2], 0.7), {
    consume: true,
  });
  candleCluster(room, [-0.5, 0.81, 0.35]);
  candleCluster(room, [0.45, 0.81, 0.45]);
  const seanceLight = new THREE.PointLight(0xffb473, 10, 7.5, 2);
  seanceLight.position.set(0, 1.15, 0.1);
  room.light(seanceLight);
  flicker(room, seanceLight, 10, 0.34, 5.8);

  // Five chairs pulled in. One is pushed back hard.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const r = i === 3 ? 2.2 : 1.35;
    chair(room, Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2 + (i === 3 ? 0.6 : 0));
  }

  // The spirit cabinet: a curtained box big enough for a person.
  room.solid('surface.panel', [1.5, 2.2, 0.7], [-2.9, 0, -2.4], -Math.PI / 2, { tile: 1.4 });
  room.box('woodDark', [1.62, 0.1, 0.8], [-2.9, 2.2, -2.4], -Math.PI / 2);
  room.box('velvetRed', [0.6, 2.0, 0.1], [-2.62, 0.05, -3.0], -Math.PI / 2, { tile: 1.2 });
  room.box('velvetRed', [0.42, 2.0, 0.1], [-2.62, 0.05, -1.9], -Math.PI / 2, { tile: 1.2 });
  room.box('ash', [1.3, 2.0, 0.06], [-2.9, 0.05, -2.4], -Math.PI / 2, { castShadow: false });

  // A gramophone with the needle still down.
  room.solid('wood', [0.7, 0.9, 0.62], [2.7, 0, -1.4], -Math.PI / 2, { tile: 1 });
  room.geo('brass', new THREE.CylinderGeometry(0.34, 0.06, 0.6, 14, 1, true), tiltMatrix([2.55, 1.32, -1.4], [-0.5, -0.4, 0]), {
    consume: true,
  });
  room.geo('ironBlack', new THREE.CylinderGeometry(0.24, 0.24, 0.012, 18), poseMatrix([2.7, 0.92, -1.4]), {
    consume: true,
  });

  // Every mirror covered. One sheet has slipped.
  room.box('gilt', [1.0, 1.6, 0.08], [1.9, 1.0, 3.62]);
  room.geo('dustSheet', new THREE.PlaneGeometry(1.2, 1.5), tiltMatrix([1.9, 1.75, 3.55], [0, 0, 0.06]), {
    tile: 1.2,
    castShadow: false,
    consume: true,
  });
  room.geo('mirror', new THREE.PlaneGeometry(0.9, 0.5), poseMatrix([1.9, 1.1, 3.57]), { castShadow: false, consume: true });

  sideboard(room, 'north', 2.6, 1.4);
  room.geo('glass', new THREE.SphereGeometry(0.16, 12, 10), poseMatrix([-2.6, 1.06, -3.44]), { consume: true });
  room.geo('woodDark', new THREE.CylinderGeometry(0.13, 0.16, 0.06, 12), poseMatrix([-2.6, 0.95, -3.44]), {
    consume: true,
  });
  room.box('bookRed', [0.24, 0.06, 0.3], [-2.9, 0.0, 2.6], 0.8);

  curtains(room, 'south', -2.4, 1.9, 2.8);

  debris(room, -1.8, 2.6, 1.2, 7);
  cobwebs(room, -3.2, 3.2, 5.5, 1.2);
  cobwebs(room, 3.2, -3.2, 2.4);

  return room.finish();
}
