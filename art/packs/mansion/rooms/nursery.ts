import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { cobwebs, debris, flicker, painting, rug, trunk } from '../kit/props';

/**
 * The Nursery - boarded up from the inside.
 *
 * A rocking horse facing the corner, an iron cot, and blocks on the floor
 * spelling nothing in particular. The window is nailed over with the good
 * panelling from downstairs, which is the detail that does the work.
 */
export const nursery: RoomBlueprint = {
  id: 'mansion.nursery',
  nameKey: 'room.mansion.nursery',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 8,
  tags: ['quiet', 'wrong'],
  anchors: {
    chest: [{ position: [1.5, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [-3.25, 0, -2.3], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.9, 0.84, -2.0] },
      { position: [-1.0, 0.5, 2.9] },
      { position: [0.4, 0.0, -1.0] },
    ],
    patrolPoint: [
      { position: [0, 0, 1.4] },
      { position: [-2.2, 0, 0.4] },
      { position: [2.2, 0, 1.2] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, nursery);
  room.shell({
    floor: 'boards',
    wall: 'damaskBlue',
    wainscot: 'panel',
    ceiling: 'plaster',
    pictureRail: true,
    windows: [{ side: 'north', kind: 'boarded', light: true }],
  });

  rug(room, 0.2, 0.6, 3.0, 2.4, 0.04);

  // The cot. Iron, high-sided, and turned to face the door.
  room.solid('iron', [1.4, 0.24, 0.82], [-2.2, 0.34, 2.5], 0.1);
  for (const [dx, dz] of [
    [-0.66, -0.38],
    [0.66, -0.38],
    [-0.66, 0.38],
    [0.66, 0.38],
  ] as const) {
    room.geo('iron', new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), poseMatrix([-2.2 + dx, 0.45, 2.5 + dz]), {
      consume: true,
    });
  }
  for (let i = 0; i < 9; i++) {
    const t = -0.62 + i * 0.155;
    room.geo('iron', new THREE.CylinderGeometry(0.014, 0.014, 0.52, 5), poseMatrix([-2.2 + t, 0.6, 2.09]), {
      consume: true,
    });
  }
  room.box('linen', [1.3, 0.1, 0.74], [-2.2, 0.3, 2.5], 0.1, { tile: 1 });

  // Rocking horse, facing the corner.
  const hx = 2.3;
  const hz = -2.1;
  room.geo('woodPale', new THREE.BoxGeometry(1.1, 0.06, 0.14), tiltMatrix([hx, 0.06, hz - 0.16], [0.16, 0.9, 0]), {
    consume: true,
  });
  room.geo('woodPale', new THREE.BoxGeometry(1.1, 0.06, 0.14), tiltMatrix([hx, 0.06, hz + 0.16], [0.16, 0.9, 0]), {
    consume: true,
  });
  room.box('woodPale', [0.9, 0.34, 0.22], [hx, 0.42, hz], 0.9);
  room.geo('woodPale', new THREE.BoxGeometry(0.34, 0.4, 0.2), tiltMatrix([hx - 0.3, 0.9, hz - 0.24], [0, 0.9, -0.5]), {
    consume: true,
  });
  room.geo('fur', new THREE.BoxGeometry(0.06, 0.3, 0.16), tiltMatrix([hx - 0.42, 1.0, hz - 0.34], [0, 0.9, -0.9]), {
    consume: true,
  });
  for (const [dx, dz] of [
    [-0.3, -0.12],
    [0.3, -0.12],
    [-0.3, 0.12],
    [0.3, 0.12],
  ] as const) {
    room.geo('woodPale', new THREE.CylinderGeometry(0.035, 0.035, 0.4, 6), poseMatrix([hx + dx * 0.8, 0.24, hz + dz]), {
      consume: true,
    });
  }
  room.blockCircle(hx, hz, 0.5);

  // A doll's house, opened, with nobody in it.
  room.solid('woodPale', [0.9, 0.84, 0.5], [2.9, 0, -2.0], -Math.PI / 2);
  room.box('woodDark', [0.86, 0.06, 0.46], [2.9, 0.84, -2.0], -Math.PI / 2);
  room.box('surface.damaskRed', [0.8, 0.6, 0.04], [2.9, 0.9, -2.0], -Math.PI / 2, { tile: 0.6 });
  room.box('woodPale', [0.8, 0.03, 0.4], [2.9, 1.2, -2.0], -Math.PI / 2);

  trunk(room, -1.0, 2.9, 0.2, true);

  // Alphabet blocks, scattered.
  for (let i = 0; i < 11; i++) {
    room.geo(
      room.pick(['bookRed', 'bookGreen', 'bookTan'] as const),
      new THREE.BoxGeometry(0.11, 0.11, 0.11),
      poseMatrix([room.range(-1.4, 2.0), 0.055, room.range(-1.6, 1.6)], room.range(0, Math.PI)),
      { tile: 0.2, consume: true },
    );
  }

  painting(room, 'west', -1.2, 1.7, 0.5, 0.62, 2);
  painting(room, 'west', -0.2, 1.75, 0.5, 0.62, 3);

  // A nightlight nobody lit, still lit.
  room.box('brass', [0.12, 0.1, 0.12], [0.4, 0.0, -3.3]);
  room.box('flame', [0.05, 0.09, 0.05], [0.4, 0.1, -3.3], 0, { castShadow: false });
  const night = new THREE.PointLight(0xffb070, 6, 6.5, 2);
  night.position.set(0.4, 0.2, -3.2);
  room.light(night);
  flicker(room, night, 6, 0.34, 5.5);

  debris(room, 1.0, 1.8, 1.4, 8);
  cobwebs(room, -3.2, -3.2, 0.8, 1.4);
  cobwebs(room, 3.2, 3.2, 3.9);

  return room.finish();
}
