import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { armchair, ball, cobwebs, cyl, debris, fireplace, rug, sconce, table, wallWash } from '../kit/props';

/**
 * The Trophy Room - forty pairs of eyes and none of them blink.
 *
 * Mounted heads at exactly head height all round the walls, a gun cabinet with
 * the glass gone, and a skin on the floor. The one room where the decoration is
 * looking back at you, which is the whole idea.
 */
export const trophy: RoomBlueprint = {
  id: 'mansion.trophy',
  nameKey: 'room.mansion.trophy',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 8,
  tags: ['warm', 'wrong'],
  anchors: {
    chest: [{ position: [-3.0, 0, -2.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.79, -2.4] },
      { position: [2.9, 1.06, 2.4] },
      { position: [-2.4, 1.51, 3.48] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-1.9, 0, -1.4] },
      { position: [1.9, 0, 1.9] },
    ],
  },
  build,
};

/** A mounted head: shield, muzzle, antlers if it earned them. */
function trophyHead(room: Room, x: number, y: number, z: number, rotationY: number, antlers: boolean): void {
  const out = (d: number): [number, number, number] => [x - Math.sin(rotationY) * d, y, z - Math.cos(rotationY) * d];

  // Half again the size it was, and with ears. A head at 0.16 m was a fist on a
  // plaque from across a room, which is not what "forty pairs of eyes" means.
  room.geo('woodDark', new THREE.BoxGeometry(0.56, 0.64, 0.06), poseMatrix([x, y, z], rotationY), { tile: 0.4, consume: true });
  room.geo('gilt', new THREE.BoxGeometry(0.6, 0.68, 0.03), poseMatrix(out(0.02), rotationY), { tile: 0.4, consume: true });
  room.geo('fur', ball(0.22, 10), poseMatrix(out(0.18), rotationY), {});
  room.geo('fur', cyl(0.08, 0.15, 0.4, 8), tiltMatrix(out(0.4), [Math.PI / 2 - 0.2, rotationY, 0]), {
  });
  for (const s of [-1, 1]) {
    const ear = out(0.16);
    room.geo(
      'fur',
      new THREE.BoxGeometry(0.06, 0.16, 0.11),
      tiltMatrix([ear[0] + Math.cos(rotationY) * s * 0.21, y + 0.14, ear[2] - Math.sin(rotationY) * s * 0.21], [0, rotationY, s * 0.7]),
      { consume: true },
    );
  }
  const eyes = out(0.36);
  for (const s of [-0.1, 0.1]) {
    room.geo(
      'ironBlack',
      ball(0.035, 6),
      poseMatrix([eyes[0] + Math.cos(rotationY) * s, y + 0.08, eyes[2] - Math.sin(rotationY) * s]),
      {},
    );
  }
  if (!antlers) return;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const base = out(0.16);
      room.geo(
        'bone',
        cyl(0.014, 0.022, 0.3 - i * 0.06, 5),
        tiltMatrix(
          [base[0] + Math.cos(rotationY) * s * (0.09 + i * 0.07), y + 0.24 + i * 0.11, base[2] - Math.sin(rotationY) * s * (0.09 + i * 0.07)],
          [0, rotationY, s * (0.5 + i * 0.2)],
        ),
        {},
      );
    }
  }
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, trophy);
  room.shell({ floor: 'boards', wall: 'panel', wainscot: 'panel', ceiling: 'beams', pictureRail: true });

  fireplace(room, 'south', -2.4, true);
  rug(room, 0, -0.2, 3.6, 2.6, 0.12);

  // The skin on the rug: a head, four splayed limbs and a tail.
  room.geo('fur', ball(0.24, 10), poseMatrix([0, 0.04, -1.5]), {});
  for (const [dx, dz] of [
    [-0.8, -0.6],
    [0.8, -0.6],
    [-0.9, 0.7],
    [0.9, 0.7],
  ] as const) {
    room.geo('fur', new THREE.BoxGeometry(0.7, 0.03, 0.26), tiltMatrix([dx, 0.02, dz - 0.6], [0, Math.atan2(dx, dz), 0]), {
      consume: true,
    });
  }
  room.geo('fur', new THREE.BoxGeometry(1.5, 0.03, 1.1), poseMatrix([0, 0.02, -0.7]), { consume: true });

  // Heads all round, at eye level.
  trophyHead(room, -2.6, 1.75, -3.62, Math.PI, true);
  trophyHead(room, 2.4, 1.68, -3.62, Math.PI, false);
  trophyHead(room, -3.62, 1.72, -1.0, -Math.PI / 2, true);
  trophyHead(room, -3.62, 1.66, 1.6, -Math.PI / 2, false);
  trophyHead(room, 3.62, 1.74, 0.6, Math.PI / 2, true);
  trophyHead(room, 3.62, 1.64, -2.2, Math.PI / 2, false);

  // The gun cabinet: glass gone, three rifles left, one hook empty.
  room.solid('surface.panel', [1.6, 2.0, 0.45], [2.9, 0, 2.4], -Math.PI / 2, { tile: 1.4 });
  room.box('woodDark', [1.7, 0.08, 0.52], [2.9, 2.0, 2.4], -Math.PI / 2);
  room.box('woodDark', [1.5, 0.06, 0.42], [2.9, 1.06, 2.4], -Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    const z = 2.4 - 0.6 + i * 0.4;
    room.geo('woodDark', new THREE.BoxGeometry(0.06, 1.1, 0.09), poseMatrix([3.0, 1.14, z]), { consume: true });
    room.geo('ironBlack', cyl(0.016, 0.016, 0.7, 6), poseMatrix([3.0, 1.9, z]), {});
  }

  // A card table with the hunting log still on it.
  table(room, 2.6, -2.4, 1.1, 0.9, 0.79, 0.3);
  room.box('bookTan', [0.3, 0.05, 0.36], [2.6, 0.79, -2.4], 0.3);
  armchair(room, 1.4, -2.6, 2.4);
  armchair(room, -1.2, 2.4, Math.PI - 0.4, true);

  // Hunting horns and a pair of crossed sabres over the mantel.
  for (const s of [-1, 1]) {
    room.geo('silver', new THREE.BoxGeometry(0.9, 0.04, 0.02), tiltMatrix([-2.4, 2.05, 3.6], [0, 0, s * 0.5]), {
      consume: true,
    });
  }
  room.geo('brass', new THREE.TorusGeometry(0.17, 0.035, 6, 14), tiltMatrix([0.6, 2.0, 3.6], [0, 0, 0.3]), {
    consume: true,
  });
  room.box('silver', [0.2, 0.26, 0.2], [-2.4, 1.51, 3.48], 0.2);

  sconce(room, 'north', 0.6, 2.15, true);
  // Both real lights are spent (hearth + sconce), so the heads get washes rather
  // than lamps: additive, masked, and free of the light budget. Without them the
  // three walls the fire does not reach kept their trophies in the dark.
  wallWash(room, 'warmWash', 'west', -1.0, 1.72, 2.2);
  wallWash(room, 'warmWash', 'east', 0.6, 1.74, 2.2);
  wallWash(room, 'warmWash', 'south', -2.6, 1.75, 2.0);

  debris(room, -1.0, 2.6, 1.4, 8);
  cobwebs(room, 3.2, 3.2, 3.9, 1.2);
  cobwebs(room, -3.2, -3.2, 0.8);

  return room.finish();
}
