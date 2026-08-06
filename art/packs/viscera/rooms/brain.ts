import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, breathe, drools, glowShaft, nerveRun, organSac, polyps, strut } from '../kit/props';

/**
 * The Ganglion - a chamber whose walls are folded like a cortex, with the thing
 * that does the folding hanging in the middle of it.
 *
 * Every other room in the beast is red. This one is blue: nerve runs cross the
 * ceiling and drop down all four walls into the mass, and the light comes off
 * the cord itself. Standing here, a player is inside something's thinking, and
 * the temperature change on walking in is the whole point.
 */
export const brain: RoomBlueprint = {
  id: 'viscera.brain',
  nameKey: 'room.viscera.brain',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  maxPerMap: 1,
  tags: ['wet', 'cold', 'landmark'],
  anchors: {
    chest: [{ position: [-3.0, 0, -2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.1, 1.06, 1.6] },
      { position: [2.9, 0.0, 3.0] },
      { position: [1.4, 0.9, -3.0] },
    ],
    patrolPoint: [
      { position: [-1.9, 0, 0.2] },
      { position: [2.4, 0, -1.6] },
      { position: [1.0, 0, 2.6] },
    ],
    enemySpawn: [{ position: [3.3, 0, 0.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, brain);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'cartilage',
    wall: 'cortex',
    ceiling: 'flesh',
    mouth: 'sphincter',
    ridge: true,
    pores: [{ side: 'west', kind: 'ossified', light: true }],
  });

  /* --- the mass -------------------------------------------------------------- */
  // Hung, not stood: three lobes on a stalk, low enough to duck under and high
  // enough not to be furniture.
  const cx = 0.3;
  const cz = -0.4;
  strut(room, 'meatPale', [cx, ceilingHeight, cz], [cx, 2.55, cz], 0.16, 8, { tile: 0.6 });
  organSac(room, cx, 2.1, cz, 0.78);
  organSac(room, cx - 0.72, 1.85, cz + 0.5, 0.5);
  organSac(room, cx + 0.66, 1.9, cz - 0.45, 0.46);
  // Sulci scored across the lobes.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    room.geo(
      'meatDark',
      new THREE.TorusGeometry(0.62 - (i % 3) * 0.1, 0.05, 5, 14),
      tiltMatrix([cx, 2.1 + (i % 3) * 0.16 - 0.16, cz], [1.3 + (i % 2) * 0.3, a, 0]),
      { tile: 0.3, consume: true },
    );
  }

  /**
   * The cord. Every run ends on the mass, so the room reads as wired to it -
   * and because `nerve` is emissive, this lattice is most of the room's light
   * for nothing.
   */
  const hub: readonly [number, number, number] = [cx, 1.55, cz];
  for (const end of [
    [-3.5, 2.4, -2.6],
    [3.5, 2.6, -1.4],
    [-3.4, 2.2, 2.6],
    [3.4, 2.3, 2.8],
    [0.2, 1.1, 3.5],
  ] as const) {
    nerveRun(room, [hub, [(hub[0] + end[0]) / 2, ceilingHeight - 0.6, (hub[2] + end[2]) / 2], end]);
  }
  nerveRun(room, [
    [-3.5, 2.4, -2.6],
    [-3.5, 1.2, -1.0],
    [-3.4, 0.35, 0.6],
  ]);
  nerveRun(room, [
    [3.5, 2.6, -1.4],
    [3.5, 1.4, -2.6],
  ]);

  /* --- the room -------------------------------------------------------------- */
  // Two plinths of cartilage, grown rather than built, each holding an item.
  room.solid('cartilage', [0.9, 1.02, 1.0], [-3.2, 0, 1.6], 0.2, { tile: 0.9 });
  room.geo('cartilage', ball(0.34, 10), tiltMatrix([-3.2, 1.04, 1.6], [0, 0.2, 0], [1.5, 0.3, 1.4]), { tile: 0.5 });
  room.solid('cartilage', [1.0, 0.86, 0.85], [1.4, 0, -3.1], 0, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([1.4, 0.88, -3.1], [0, 0.4, 0], [1.6, 0.3, 1.3]), { tile: 0.5 });

  // Folds of cortex bulging off the walls, so the room's surfaces are not flat
  // where the texture says they should be gyri.
  for (const [x, y, z, s] of [
    [-2.2, 1.4, -3.3, 1.0],
    [2.6, 1.8, -3.3, 0.8],
    [3.3, 1.2, 1.4, 0.9],
    [-1.2, 2.2, 3.3, 0.7],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      room.geo(
        'meatPale',
        ball(0.34 * s, 9),
        tiltMatrix([x + i * 0.34 * s, y + Math.sin(i * 1.7) * 0.3, z], [0, 0.4, 0], [1, 1.1, 0.55]),
        { tile: 0.6 },
      );
    }
  }

  glowShaft(room, [-3.6, 1.8, 0], [-0.6, 0.9, -0.2], 1.4);
  polyps(room, 2.6, 0, 2.2, 0.6, 7, true);
  drools(room, -1.6, -2.2, 1.4, 6);

  // Cold, and slow. Hung UNDER the mass rather than in it - a point light
  // inside a sac lights the inside of the sac and leaves the room black.
  const mind = new THREE.PointLight(0x5aa8ff, 10, ctx.dims.cellSize * 1.7, 2);
  mind.position.set(cx, 1.32, cz);
  room.light(mind);
  breathe(room, mind, 10, 0.24, 0.5);

  room.geo('nerve', ball(0.26, 10), poseMatrix([cx, 1.55, cz]), { castShadow: false });

  return room.finish();
}
