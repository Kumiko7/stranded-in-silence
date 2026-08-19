import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { cobwebs, cyl, debris, flicker, pipeRun, sconce } from '../kit/props';

/**
 * The Boiler Room - the only thing in the house that is still working.
 *
 * Brick, soot, and a furnace door that glows. Pipes run every wall at head
 * height so the space feels lower than it is, and the coal heap in the corner is
 * the one soft thing in the room.
 */
export const boiler: RoomBlueprint = {
  id: 'mansion.boiler',
  nameKey: 'room.mansion.boiler',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['service', 'warm', 'cluttered'],
  anchors: {
    chest: [{ position: [-3.05, 0, -2.4], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 1.8], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.4, 0.94, 3.0] },
      { position: [0.4, 0.0, -1.6] },
      { position: [-2.9, 1.55, 3.5] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.2, 0, 0.6] },
      { position: [1.4, 0, 1.4] },
    ],
    enemySpawn: [{ position: [-2.0, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, boiler);
  room.shell({ floor: 'brick', wall: 'brick', ceiling: 'plaster', cornice: false, skirting: false });

  // The furnace: a riveted iron drum with a door that has never been shut.
  const fx = 2.4;
  const fz = -2.9;
  room.geo('ironBlack', cyl(1.0, 1.0, 2.4, 16), tiltMatrix([fx, 1.1, fz], [0, 0, Math.PI / 2]), {
    tile: 1.6,
  });
  for (const dx of [-1.15, 1.15]) {
    room.geo('rust', cyl(1.05, 1.05, 0.14, 16), tiltMatrix([fx + dx, 1.1, fz], [0, 0, Math.PI / 2]), {
    });
  }
  room.solid('ironBlack', [2.6, 0.4, 1.5], [fx, 0, fz]);
  room.collider({ kind: 'box', center: [fx, fz], halfExtents: [1.3, 0.95] });

  // The door, open, and what is behind it.
  room.geo('emberGlow', new THREE.CircleGeometry(0.42, 14), poseMatrix([fx, 1.1, fz + 0.98]), {
    castShadow: false,
    consume: true,
  });
  room.geo('ironBlack', new THREE.TorusGeometry(0.46, 0.07, 6, 16), poseMatrix([fx, 1.1, fz + 1.0]), { consume: true });
  room.geo('rust', new THREE.BoxGeometry(0.9, 0.9, 0.06), tiltMatrix([fx + 0.86, 1.1, fz + 1.3], [0, -1.1, 0]), {
    consume: true,
  });
  for (let i = 0; i < 5; i++) {
    room.box('emberGlow', [room.range(0.08, 0.16), 0.06, room.range(0.08, 0.14)], [fx + room.range(-0.5, 0.5), 0.42, fz + room.range(1.0, 1.5)], 0, {
      castShadow: false,
    });
  }
  const furnace = new THREE.PointLight(0xff7a30, 17, 10, 2);
  furnace.position.set(fx, 1.1, fz + 1.5);
  room.light(furnace);
  flicker(room, furnace, 17, 0.24, 3.6);

  // Flue and pressure gauges.
  room.geo('rust', cyl(0.24, 0.24, 1.2, 10), poseMatrix([fx, 2.8, fz]), {});
  for (const dx of [-0.6, -0.2, 0.2]) {
    room.geo('brass', cyl(0.11, 0.11, 0.06, 12), tiltMatrix([fx + dx, 1.95, fz + 0.9], [Math.PI / 2, 0, 0]), {
    });
    room.geo('ironBlack', new THREE.BoxGeometry(0.01, 0.07, 0.01), tiltMatrix([fx + dx, 1.98, fz + 0.94], [0, 0, room.range(-1, 1)]), {
      consume: true,
    });
  }

  pipeRun(room, 'east', 2.35);
  pipeRun(room, 'west', 2.5, 0.05);
  pipeRun(room, 'south', 2.2, 0.09);

  // Coal, shovelled at some point and never since.
  for (let i = 0; i < 34; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * 1.3;
    room.geo(
      'ash',
      new THREE.BoxGeometry(room.range(0.1, 0.24), room.range(0.08, 0.18), room.range(0.1, 0.22)),
      poseMatrix([2.4 + Math.cos(a) * r, room.range(0.04, 0.4) * (1 - r / 1.6), 2.6 + Math.sin(a) * r], room.range(0, Math.PI)),
      { tile: 0.5, consume: true },
    );
  }
  room.blockCircle(2.5, 2.7, 1.0);
  room.geo('woodPale', cyl(0.03, 0.03, 1.4, 6), tiltMatrix([1.2, 0.6, 1.9], [0.3, 0.8, 0.5]), {
  });
  room.box('iron', [0.3, 0.04, 0.36], [0.9, 0.02, 1.5], 0.8);

  // A workbench with a lamp on it, and a shelf of tins.
  room.solid('woodPale', [1.9, 0.9, 0.6], [-2.4, 0, 3.0], 0, { tile: 1.3 });
  room.box('iron', [1.8, 0.04, 0.56], [-2.4, 0.9, 3.0]);
  room.box('rust', [0.2, 0.28, 0.2], [-1.9, 0.94, 3.0], 0.3);
  room.box('woodPale', [2.0, 0.05, 0.3], [-2.4, 1.5, 3.5]);
  for (let i = 0; i < 5; i++) {
    room.geo('rust', cyl(0.08, 0.08, 0.2, 8), poseMatrix([-3.2 + i * 0.42, 1.65, 3.5]), {
    });
  }

  sconce(room, 'south', -2.4, 2.4, true);

  debris(room, -1.4, 1.0, 1.6, 10);
  cobwebs(room, -3.2, -3.2, 0.8, 1.4);

  return room.finish();
}
