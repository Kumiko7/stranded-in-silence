import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, breathe, chitinShelf, drools, lumenPod, polyps, resinFlow } from '../kit/props';

/**
 * The Moult - where the beast sheds, and never clears up.
 *
 * Scutes the size of doors are heaped against three walls, stacked like slate
 * off a roof, dull side up and mother-of-pearl underneath. The drift is deep
 * enough to walk on and shifts under nothing: the shapes are hard, the edges
 * are sharp, and the whole room rattles in a way you can see.
 */
export const scales: RoomBlueprint = {
  id: 'viscera.scales',
  nameKey: 'room.viscera.scales',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['entrance', 'calcified', 'cluttered'],
  anchors: {
    chest: [{ position: [3.15, 0, 2.9], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.3, 0, 1.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [3.2, 1.32, -1.4] },
      { position: [1.6, 0.0, -2.9] },
      { position: [-1.4, 0.0, 2.9] },
    ],
    playerSpawn: [
      { position: [-1.3, 0, 1.4], rotationY: Math.PI },
      { position: [1.3, 0, 1.4], rotationY: Math.PI },
      { position: [-1.3, 0, -1.2], rotationY: 0 },
      { position: [1.3, 0, -1.2], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.2] },
      { position: [-1.5, 0, -1.5] },
      { position: [1.9, 0, 1.4] },
    ],
    enemySpawn: [{ position: [0.4, 0, -2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, scales);
  room.shell({ floor: 'scute', wall: 'scute', ceiling: 'sinew', band: 'scute', bandHeight: 1.0, mouth: 'mandible' });

  /**
   * The heaps. Each is a stack of leaning plates against one corner, and none
   * of them reaches a door lane - a drift you cannot walk round is a drift that
   * seals a doorway.
   */
  const heaps: readonly (readonly [number, number, number, number])[] = [
    [-2.9, -2.7, 0.7, 7],
    [2.9, -2.6, -0.9, 6],
    [-2.85, 2.85, 2.4, 7],
  ];
  for (const [x, z, yaw, count] of heaps) {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const w = 1.5 - t * 0.55;
      const lean = 0.35 + t * 0.5;
      room.geo(
        'scute',
        new THREE.BoxGeometry(w, 0.09, w * 0.72),
        tiltMatrix([x + Math.sin(yaw) * t * 0.5, 0.06 + i * 0.19, z + Math.cos(yaw) * t * 0.5], [lean * 0.5, yaw + t * 0.6, lean * 0.3]),
        { tile: 0.9, consume: true },
      );
      // The underside catches the light: a paler plate a hair below each scute.
      room.geo(
        'bonePale',
        new THREE.BoxGeometry(w * 0.9, 0.03, w * 0.64),
        tiltMatrix([x + Math.sin(yaw) * t * 0.5, 0.03 + i * 0.19, z + Math.cos(yaw) * t * 0.5], [lean * 0.5, yaw + t * 0.6, lean * 0.3]),
        { tile: 0.6, consume: true },
      );
    }
    room.blockCircle(x, z, 0.75);
  }

  // Two plates stood on edge against the walls, taller than a player.
  for (const [x, z, yaw] of [
    [-1.9, -3.25, 0.25],
    [-3.3, -2.2, 1.4],
  ] as const) {
    room.geo('scute', new THREE.BoxGeometry(1.5, 2.3, 0.14), tiltMatrix([x, 1.15, z], [0, yaw, 0.1]), { tile: 1.0, consume: true });
    room.geo('chitinDark', new THREE.BoxGeometry(1.6, 0.14, 0.2), tiltMatrix([x, 2.3, z], [0, yaw, 0.1]), { tile: 0.5, consume: true });
    room.collider({ kind: 'box', center: [x, z], halfExtents: [0.7, 0.16], rotationY: yaw });
  }

  // The floor between them: chips, shed grit and one plate half buried.
  for (let i = 0; i < 14; i++) {
    const x = room.range(-2.6, 2.6);
    const z = room.range(-2.6, 2.6);
    room.geo(
      'scute',
      new THREE.BoxGeometry(room.range(0.25, 0.6), 0.04, room.range(0.2, 0.5)),
      tiltMatrix([x, 0.022, z], [room.range(-0.06, 0.06), room.range(0, 3), room.range(-0.06, 0.06)]),
      { tile: 0.5, castShadow: false, consume: true },
    );
  }

  chitinShelf(room, 'east', 1.4, 1.32, 1.2, 0.42);
  resinFlow(room, 'north', 2.5, 2.2, 0.8);
  polyps(room, -0.8, 0, 3.1, 0.5, 6, true);
  drools(room, 1.4, -1.4, 1.6, 7);
  boneDebris(room, 2.6, -2.9, 0.9, 10);

  /**
   * Light raked low across the drift from one corner, so every plate edge gets
   * a highlight and the heaps read as stacks. Top-down light on a pile of flat
   * plates is the one thing guaranteed to turn it into a grey lump.
   */
  lumenPod(room, [-3.2, 0.4, 2.7], 0.24, true, true, 13);
  const rake = new THREE.PointLight(0x9fe8ff, 9, ctx.dims.cellSize * 1.4, 2);
  rake.position.set(3.2, 0.55, 2.6);
  room.light(rake);
  breathe(room, rake, 9, 0.16, 0.8);
  room.geo('lumenCold', ball(0.18, 10), poseMatrix([3.35, 0.5, 2.6]), { castShadow: false });

  return room.finish();
}
