import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, drools, glowShaft, lumenCluster, polyps, quad, sporeBloom } from '../kit/props';

/**
 * The Bloom - a wound the beast stopped healing, and something else moved in.
 *
 * It is the brightest room in the map and the only cheerful colour anywhere in
 * it: rot growing in green light, fruiting bodies knee-high across half the
 * floor and up two walls, and a haze of spores you can see the shafts in. Four
 * expeditions have started here, which is exactly why it is unnerving - the one
 * place that looks safe is the one place something is already living.
 */
export const bloom: RoomBlueprint = {
  id: 'viscera.bloom',
  nameKey: 'room.viscera.bloom',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['entrance', 'wet', 'bright'],
  anchors: {
    chest: [{ position: [3.05, 0, 2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.1, 0.88, -2.5] },
      { position: [2.6, 0.0, -2.9] },
      { position: [-2.7, 0.0, 2.9] },
    ],
    playerSpawn: [
      { position: [-1.4, 0, 1.4], rotationY: Math.PI },
      { position: [1.4, 0, 1.4], rotationY: Math.PI },
      { position: [-1.4, 0, -1.4], rotationY: 0 },
      { position: [1.4, 0, -1.4], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.2, 0, -0.4] },
      { position: [2.0, 0, 0.8] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, bloom);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'flesh', wall: 'gut', ceiling: 'flesh', mouth: 'sphincter' });

  // The mats. Corners and edges, never the door lanes: rot grows where nothing
  // walks, which is also where a player is least likely to trip over it.
  const beds: readonly (readonly [number, number, number, number])[] = [
    [-2.7, -2.6, 1.1, 10],
    [2.8, -2.4, 0.9, 8],
    [-2.6, 2.7, 1.0, 9],
    [2.5, 2.6, 0.7, 6],
    [-3.2, 0.2, 0.6, 5],
    [0.4, -3.2, 0.7, 6],
  ];
  for (const [x, z, spread, count] of beds) sporeBloom(room, x, 0, z, spread, count);

  // Growth climbing two walls, and a shelf of fruiting bodies at head height.
  for (const [side, along, y] of [
    ['north', -2.6, 1.9],
    ['north', 2.4, 2.5],
    ['west', 2.2, 2.2],
    ['west', -2.4, 1.4],
    ['east', 1.9, 2.6],
  ] as const) {
    const x = side === 'west' ? -3.5 : side === 'east' ? 3.5 : along;
    const z = side === 'north' ? -3.5 : along;
    const yaw = side === 'north' ? 0 : side === 'west' ? Math.PI / 2 : -Math.PI / 2;
    room.geo('fungus', quad(1.3, 1.5), tiltMatrix([x, y, z], [0, yaw, 0]), { castShadow: false, receiveShadow: false });
    for (let i = 0; i < 5; i++) {
      const off = room.range(-0.5, 0.5);
      room.geo(
        'lumen',
        ball(room.range(0.06, 0.13), 8),
        tiltMatrix(
          [x + Math.cos(yaw) * off + Math.sin(yaw) * 0.14, y + room.range(-0.6, 0.6), z - Math.sin(yaw) * off + Math.cos(yaw) * 0.14],
          [0, yaw, 0],
          [1.3, 0.7, 1.3],
        ),
        { castShadow: false },
      );
    }
  }

  // The one dead thing in the room: a rack of bone the rot is eating through.
  room.solid('bone', [1.0, 0.86, 0.9], [-3.1, 0, -2.5], -0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([-3.1, 0.88, -2.5], [0, -0.2, 0], [1.6, 0.3, 1.4]), { tile: 0.5 });
  sporeBloom(room, -3.1, 0.9, -2.5, 0.35, 4);

  // Spores in the air, and the shafts they hang in.
  for (let i = 0; i < 5; i++) {
    room.geo('haze', quad(5.2, 5.2), tiltMatrix([room.range(-0.8, 0.8), 0.4 + i * 0.5, room.range(-0.8, 0.8)], [-Math.PI / 2, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  glowShaft(room, [-2.7, ceilingHeight - 0.2, -2.6], [-2.4, 0.2, -2.2], 1.6);
  glowShaft(room, [2.5, ceilingHeight - 0.2, 2.5], [2.2, 0.2, 2.1], 1.3);

  polyps(room, 1.2, 0, 2.4, 0.6, 7, true);
  drools(room, -1.0, -1.4, 1.6, 7);
  boneDebris(room, 2.4, -2.8, 0.9, 9);

  // Two lights, both green, both high: the room is meant to look survivable.
  lumenCluster(room, -0.6, -0.4, true, false, true);
  lumenCluster(room, 1.6, 1.8, true, false, false);

  return room.finish();
}
