import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, boneDebris, breathe, cyl, drools, glowShaft, lumenPod, polyps, strut } from '../kit/props';

/**
 * The Windpipe - twenty-four metres of airway, and the longest sight line in
 * the map.
 *
 * Cartilage hoops hold it open the whole way, open at the back the way a real
 * trachea is, with the membrane between them lit from behind. At the south end
 * are the folds: two shelves of tissue nearly meeting across the tube, still
 * wet, and the warm air coming through them is the only thing moving in here.
 */
const FOOTPRINT = [
  [0, 0],
  [0, 1],
  [0, 2],
] as const;

export const windpipe: RoomBlueprint = {
  id: 'viscera.windpipe',
  nameKey: 'room.viscera.windpipe',
  footprint: FOOTPRINT,
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'east', 'west'),
    ...wallsOn([0, 1], 'east', 'west'),
    ...wallsOn([0, 2], 'south', 'east', 'west'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['wet', 'corridor', 'open'],
  anchors: {
    // Off the cell's midpoint on purpose: every outer wall of this corridor is in
    // `doorWalls`, and a doorway is centred on its cell (z = 0, 8 and 16 down the
    // west side), so anything backed against a wall at z = 8 is standing in one.
    chest: [{ position: [-3.05, 0, 6.0], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, 10.4], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.9, 0.94, -2.6] },
      { position: [-2.8, 0.0, 4.6] },
      { position: [2.7, 0.86, 12.9] },
    ],
    patrolPoint: [
      { position: [0.4, 0, -1.6] },
      { position: [-0.4, 0, 6.6] },
      { position: [0.6, 0, 12.4] },
      { position: [-0.6, 0, 16.2] },
    ],
    enemySpawn: [{ position: [2.8, 0, 18.8] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, windpipe);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'mucosa', wall: 'membrane', ceiling: 'flesh', mouth: 'sphincter' });

  /**
   * The hoops. One every 0.85 m for the whole length, each open at the back -
   * a real tracheal ring is a C, not an O, and the gap is what tells a player
   * at a glance that this is an airway and not a sewer.
   */
  for (let i = 0; i < 28; i++) {
    const z = -3.4 + i * 0.86;
    const r = 3.3 + Math.sin(i * 0.4) * 0.06;
    const y = 1.75;
    // Three arcs leaving a gap at the top-east: cheap, and unmistakable.
    for (const [start, sweep] of [
      [0.35, 1.5],
      [2.0, 2.1],
      [4.3, 1.6],
    ] as const) {
      const segments = 7;
      for (let s = 0; s < segments; s++) {
        const a0 = start + (sweep * s) / segments;
        const a1 = start + (sweep * (s + 1)) / segments;
        const p0: readonly [number, number, number] = [Math.cos(a0) * r, y + Math.sin(a0) * r, z];
        const p1: readonly [number, number, number] = [Math.cos(a1) * r, y + Math.sin(a1) * r, z];
        if (p0[1] < 0.1 && p1[1] < 0.1) continue;
        strut(room, 'cartilage', p0, p1, 0.17, 6, { tile: 0.6, castShadow: false });
      }
    }
    // The muscle strip closing the gap in each hoop, up in the roof.
    if (i % 2 === 0) {
      room.geo('meatDark', new THREE.BoxGeometry(1.0, 0.12, 0.5), poseMatrix([0.4, ceilingHeight - 0.24, z + 0.43]), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
    }
  }

  /* --- the folds ---------------------------------------------------------------- */
  // Two shelves of tissue nearly meeting across the tube at the far end. They
  // are the room's landmark, and its narrowest point.
  // Clear of every door lane on the end cell: |z - 16| < 1.1 is where the east
  // and west openings of cell [0,2] land.
  const foldZ = 18.1;
  for (const s of [-1, 1]) {
    room.geo('meat', ball(1.9, 14), tiltMatrix([s * 2.5, 1.15, foldZ], [0, 0, 0], [1, 0.62, 0.42]), { tile: 1.1 });
    room.geo('meatPale', ball(1.5, 12), tiltMatrix([s * 3.1, 1.15, foldZ], [0, 0, 0], [1, 0.5, 0.34]), { tile: 0.8 });
    room.geo('meatDark', new THREE.BoxGeometry(1.4, 0.16, 0.4), tiltMatrix([s * 2.0, 1.15, foldZ], [0, 0, s * 0.1]), {
      tile: 0.5,
      consume: true,
    });
    room.collider({ kind: 'box', center: [s * 2.7, foldZ], halfExtents: [1.05, 0.4] });
    // Cords running back from each fold into the wall.
    for (let i = 0; i < 4; i++) {
      strut(room, 'tendon', [s * 2.6, 0.7 + i * 0.5, foldZ], [s * 3.6, 0.5 + i * 0.6, foldZ + 1.4], 0.05, 5, { tile: 0.4 });
    }
  }
  glowShaft(room, [0, 1.2, 19.2], [0, 1.0, 13.0], 1.4, true);

  /* --- the length ----------------------------------------------------------------- */
  // No curtains across this one. The whole point of a 24 m room is the sight
  // line down it, and a full-width sheet of caul both kills that and reads as a
  // pane of fog hanging in mid-air from either end.

  room.solid('cartilage', [1.1, 0.94, 0.9], [2.9, 0, -2.6], 0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([2.9, 0.96, -2.6], [0, 0.2, 0], [1.6, 0.3, 1.3]), { tile: 0.5 });
  room.solid('cartilage', [1.0, 0.86, 0.9], [2.7, 0, 12.9], -0.2, { tile: 0.9 });
  room.geo('bonePale', ball(0.28, 9), tiltMatrix([2.7, 0.88, 12.9], [0, -0.2, 0], [1.6, 0.3, 1.3]), { tile: 0.5 });

  polyps(room, -2.8, 0, 4.6, 0.7, 8, true);
  polyps(room, 2.6, 0, 9.4, 0.6, 7, false);
  polyps(room, -2.4, 0, 14.6, 0.6, 7, true);
  drools(room, 0.6, 2.0, 2.0, 10);
  drools(room, -0.4, 10.0, 2.2, 11);
  drools(room, 0.8, 18.0, 1.8, 9);
  boneDebris(room, -2.6, 1.4, 1.0, 9);
  boneDebris(room, 2.4, 12.6, 1.1, 10);

  /**
   * One pod at each end of the run. A corridor this long lit from the middle
   * has two black ends; lit from the ends it has a dark middle you have to walk
   * into, which is the better half of the trade.
   */
  const lamps: readonly (readonly [number, number, number, boolean, number])[] = [
    [-3.2, 1.5, -1.0, false, 11],
    [3.2, 1.45, 5.4, false, 11],
    [-3.2, 1.45, 12.2, false, 11],
    [3.2, 1.4, 18.8, true, 12],
  ];
  for (const [x, y, z, warm, power] of lamps) {
    lumenPod(room, [x, y, z], 0.23, true, warm, power);
    room.geo('meatPale', cyl(0.13, 0.23, y, 8), poseMatrix([x + Math.sign(x) * 0.2, y / 2, z]), {
      tile: 0.6,
    });
  }
  for (const [index, lamp] of room.lights.entries()) breathe(room, lamp, lamps[index]?.[4] ?? 11, 0.16, 0.5 + index * 0.15);

  return room.finish();
}
