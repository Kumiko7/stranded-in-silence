import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, caulCurtain, drools, glowShaft, lumenPod, organSac, quad, strut } from '../kit/props';

/**
 * The Bellows - a lung, and the only chamber in the beast with moving air.
 *
 * A bronchial trunk comes down through the ceiling and branches four ways into
 * sacs the size of a car, packed floor to roof. The vent in the east wall is
 * breathing warm air out of somewhere deeper, which is what the haze is: this
 * is the one room where you can see the air.
 */
export const lungs: RoomBlueprint = {
  id: 'viscera.lungs',
  nameKey: 'room.viscera.lungs',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south', 'west'),
  weight: 8,
  tags: ['wet', 'cluttered'],
  anchors: {
    locker: [{ position: [1.0, 0, 3.3], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.9, 0.88, 2.6] },
      { position: [-3.2, 0.0, -1.4] },
      { position: [1.2, 0.0, -3.2] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.6] },
      { position: [-3.1, 0, 0.2] },
      { position: [0.8, 0, -3.0] },
    ],
    enemySpawn: [{ position: [3.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, lungs);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'cartilage',
    wall: 'membrane',
    ceiling: 'sacs',
    band: 'cartilage',
    bandHeight: 0.9,
    mouth: 'sphincter',
    pores: [{ side: 'east', kind: 'vent', light: true }],
  });

  /* --- the tree -------------------------------------------------------------- */
  // Trunk down through the roof, then two generations of branching. Each fork
  // gets a cartilage collar, which is what a real airway has and what stops
  // this reading as a dead tree.
  const trunkTop: readonly [number, number, number] = [-0.4, ceilingHeight, -0.6];
  const carina: readonly [number, number, number] = [-0.2, 2.9, -0.2];
  strut(room, 'meatPale', trunkTop, carina, 0.3, 10, { tile: 1.0 });
  room.geo('cartilage', new THREE.TorusGeometry(0.33, 0.06, 6, 14), tiltMatrix([-0.3, 2.95, -0.4], [Math.PI / 2, 0, 0.3]), {
    tile: 0.4,
    consume: true,
  });

  /**
   * The forks sit LOW and close in, so every branch runs down at roughly 45
   * degrees. Splayed out near the ceiling - which is anatomically the obvious
   * layout - four smooth cylinders lit from above read as the blades of a
   * ceiling fan from every doorway in the room. Slope is what makes them pipes.
   */
  const forks: readonly (readonly [number, number, number])[] = [
    [-1.9, 1.15, -1.6],
    [1.7, 1.25, -1.4],
    [-2.0, 1.05, 1.2],
    [1.9, 1.1, 1.5],
  ];
  for (const fork of forks) {
    strut(room, 'meatPale', carina, fork, 0.17, 8, { tile: 0.8 });
    // Rings down each branch. Without them a smooth cylinder run out to the
    // side is lit edge-on and reads as a propeller blade, which is exactly what
    // the first pass of this room looked like from the doorway.
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const p: readonly [number, number, number] = [
        carina[0] + (fork[0] - carina[0]) * t,
        carina[1] + (fork[1] - carina[1]) * t,
        carina[2] + (fork[2] - carina[2]) * t,
      ];
      const yaw = Math.atan2(fork[0] - carina[0], fork[2] - carina[2]);
      room.geo('cartilage', new THREE.TorusGeometry(0.19, 0.045, 5, 12), tiltMatrix(p, [Math.PI / 2 - 0.35, yaw, 0]), {
        tile: 0.3,
        consume: true,
      });
    }
    room.geo('cartilage', ball(0.2, 9), poseMatrix(fork), { tile: 0.4 });
    // The sac at the end of it, and two smaller ones budding off.
    organSac(room, fork[0], fork[1] - 0.55, fork[2], 0.72);
    organSac(room, fork[0] + room.range(-0.9, 0.9), fork[1] - 1.0, fork[2] + room.range(-0.8, 0.8), 0.42);
    room.blockCircle(fork[0], fork[2], 0.62);
  }

  // Cartilage rings down the trunk: the airway is held open by hoops.
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    room.geo(
      'cartilage',
      new THREE.TorusGeometry(0.32 - t * 0.03, 0.045, 6, 14),
      tiltMatrix(
        [trunkTop[0] + (carina[0] - trunkTop[0]) * t, trunkTop[1] + (carina[1] - trunkTop[1]) * t, trunkTop[2] + (carina[2] - trunkTop[2]) * t],
        [Math.PI / 2 + 0.16, 0, 0.2],
      ),
      { tile: 0.3, consume: true },
    );
  }

  /* --- the air --------------------------------------------------------------- */
  // Haze, low and flat. Four planes at ankle height read as ground mist far
  // better than a fog volume nobody can afford.
  for (let i = 0; i < 3; i++) {
    room.geo('hazeWarm', quad(5.6, 5.6), tiltMatrix([room.range(-0.5, 0.5), 0.2 + i * 0.13, room.range(-0.5, 0.5)], [-Math.PI / 2, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  glowShaft(room, [3.5, 1.9, 0], [0.4, 0.5, 0.9], 1.3, true);

  // A curtain of caul across the south-west, breaking the sightline from the
  // west door to the locker.
  caulCurtain(room, 2.5, 2.2, 2.3, 2.4, -0.5);

  // A shelf of cartilage in the south-west corner.
  room.solid('cartilage', [1.1, 0.86, 0.9], [-2.9, 0, 2.6], 0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.28, 9), tiltMatrix([-2.9, 0.88, 2.6], [0, 0.2, 0], [1.8, 0.28, 1.4]), { tile: 0.5 });

  drools(room, 0.4, -1.6, 1.8, 8);
  drools(room, -2.8, -2.6, 1.0, 5);
  boneDebris(room, 1.4, -3.0, 0.9, 7);

  // One cold pod up in the branches, so the tree is lit from inside it.
  lumenPod(room, [-0.2, 2.05, -0.2], 0.24, true, false, 8);

  return room.finish();
}
