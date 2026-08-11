import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { beacon, cageLamp, cyl, debris, drum, dripLine, gauge, ladder, pipeRun, puddle, quad, valve, wallSign } from '../kit/props';

/**
 * The Pump Room - the machine that keeps the sea on the outside.
 *
 * Two ballast pumps the size of cars in opposite corners, a manifold of six
 * pipes crossing the ceiling between them, and every one of those pipes weeping
 * from a joint. The floor is under two centimetres of water that nobody is
 * pumping out, which tells you everything about how this is going.
 *
 * Lit almost entirely amber, from a beacon that has been running on the
 * emergency circuit for a very long time.
 */
export const pumps: RoomBlueprint = {
  id: 'abyss.pumps',
  nameKey: 'room.abyss.pumps',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['station', 'machinery'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    // Two on the pumps' own parts shelves, one on top of a drum.
    itemSpawn: [
      { position: [-2.83, 1.34, -3.34] },
      { position: [2.79, 1.34, 1.84] },
      { position: [1.9, 0.88, -3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [2.6, 0, -2.4] },
      { position: [-2.5, 0, 1.6] },
    ],
    enemySpawn: [{ position: [-3.25, 0, -0.7] }],
  },
  build,
};

/** The two pump blocks, in opposite corners so the door cross stays open. */
const PUMPS: readonly (readonly [number, number, number])[] = [
  [-2.6, -2.6, 0.3],
  [2.6, 2.6, -0.24],
];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, pumps);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'deck',
    wall: 'hull',
    ceiling: 'pipes',
    band: 'rust',
    bandHeight: 0.85,
    rail: true,
    strip: 'amber',
    mouth: 'bulkhead',
  });

  /* --- the pumps ----------------------------------------------------------------- */
  for (const [x, z, spin] of PUMPS) {
    // A bedplate, a casing, and the volute: a cylinder lying on its side with
    // the drive motor bolted to the end of it. A pump that is only a box reads
    // as a crate, and the volute is what stops that happening.
    room.solid('steelDark', [2.0, 0.26, 1.5], [x, 0, z], spin, { tile: 0.7 });
    room.box('painted', [1.7, 0.95, 1.15], [x, 0.26, z], spin, { tile: 1.0 });
    room.geo('steel', new THREE.CylinderGeometry(0.56, 0.56, 0.9, 16), tiltMatrix([x - Math.cos(spin) * 0.35, 0.9, z + Math.sin(spin) * 0.35], [0, spin, Math.PI / 2]), {
      tile: 0.7,
      consume: true,
    });
    room.geo('steelDark', new THREE.TorusGeometry(0.58, 0.06, 6, 18), tiltMatrix([x - Math.cos(spin) * 0.8, 0.9, z + Math.sin(spin) * 0.8], [0, spin, Math.PI / 2]), {
      tile: 0.3,
      consume: true,
    });
    // Drive motor and its cooling fins.
    room.geo('painted', new THREE.CylinderGeometry(0.34, 0.34, 0.86, 14), tiltMatrix([x + Math.cos(spin) * 0.72, 0.86, z - Math.sin(spin) * 0.72], [0, spin, Math.PI / 2]), {
      tile: 0.6,
      consume: true,
    });
    for (let i = 0; i < 7; i++) {
      room.geo('steelDark', new THREE.CylinderGeometry(0.38, 0.38, 0.03, 14), tiltMatrix([x + Math.cos(spin) * (0.4 + i * 0.1), 0.86, z - Math.sin(spin) * (0.4 + i * 0.1)], [0, spin, Math.PI / 2]), {
        tile: 0.2,
        castShadow: false,
        consume: true,
      });
    }
    // The suction and discharge branches, going up into the ceiling manifold.
    pipeRun(
      room,
      [
        [x - Math.cos(spin) * 0.35, 1.35, z + Math.sin(spin) * 0.35],
        [x - Math.cos(spin) * 0.35, ceilingHeight - 0.75, z + Math.sin(spin) * 0.35],
      ],
      0.17,
      'steel',
      false,
    );
    valve(room, [x + Math.cos(spin) * 0.2, 1.28, z - Math.sin(spin) * 0.2], 0.2, spin, true);
    room.box('steelPale', [0.9, 0.05, 0.5], [x - Math.sin(spin) * 0.78, 1.28, z - Math.cos(spin) * 0.78], spin, { tile: 0.4 });
    // A running light and a gauge lamp on the casing. Emissive, so the machine
    // has an edge on it from across the room without spending a light budget -
    // a dark green box in a dark corner is a crate, not a pump.
    for (const [dx, colour] of [
      [-0.45, 'lumenRed'],
      [-0.2, 'lumenAmber'],
      [0.05, 'lumenTeal'],
    ] as const) {
      room.geo(
        colour,
        cyl(0.035, 0.035, 0.05, 8),
        tiltMatrix([x + Math.cos(spin) * dx - Math.sin(spin) * 0.6, 1.06, z - Math.sin(spin) * dx - Math.cos(spin) * 0.6], [Math.PI / 2, spin, 0]),
        { castShadow: false },
      );
    }
    room.box('lumenAmber', [1.4, 0.035, 0.04], [x - Math.sin(spin) * 0.6, 0.3, z - Math.cos(spin) * 0.6], spin, {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- the manifold --------------------------------------------------------------- */
  // Six runs crossing the room between the two pumps, at three heights, so the
  // ceiling has depth rather than being one flat plane of pipe.
  for (let i = 0; i < 4; i++) {
    const y = ceilingHeight - 0.62 - (i % 2) * 0.22;
    const off = -1.5 + i * 1.0;
    pipeRun(
      room,
      [
        [-3.6, y, off - 1.1],
        [-1.1, y, off - 1.1],
        [1.1, y, off + 1.1],
        [3.6, y, off + 1.1],
      ],
      0.09 + (i % 3) * 0.035,
      i % 3 === 0 ? 'copperPipe' : 'steel',
    );
  }
  // Two more running down a wall and along the floor line, out of the door lanes.
  pipeRun(
    room,
    [
      [-3.5, ceilingHeight - 0.7, -3.4],
      [-3.5, 0.45, -3.4],
      [-3.5, 0.45, -1.5],
    ],
    0.12,
  );
  pipeRun(
    room,
    [
      [3.5, ceilingHeight - 0.7, 3.4],
      [3.5, 0.45, 3.4],
      [3.5, 0.45, 1.6],
    ],
    0.12,
  );

  /* --- the leak -------------------------------------------------------------------- */
  // Standing water across most of the floor, and the seams it is coming out of.
  for (const [x, z, r] of [
    [0.4, 1.4, 1.1],
    [-1.6, 0.6, 0.8],
    [1.9, -1.5, 0.7],
    [-2.2, 2.6, 0.6],
  ] as const) {
    puddle(room, x, z, r);
  }
  for (let i = 0; i < 5; i++) {
    dripLine(room, room.range(-2.6, 2.6), room.range(-2.6, 2.6));
  }
  // A jet from a split joint, caught mid-spray: a thin pale wedge, unlit.
  room.geo('waterHaze', quad(0.5, 1.9), tiltMatrix([-3.3, 1.5, -1.7], [0, 0.6, 0.9]), { castShadow: false, receiveShadow: false });
  room.geo('waterHaze', quad(0.28, 1.9), tiltMatrix([-3.3, 1.5, -1.7], [0, 0.6 + Math.PI / 2, 0.9]), { castShadow: false, receiveShadow: false });

  /* --- the rest --------------------------------------------------------------------- */
  gauge(room, 'north', -1.9, 2.1, 0.16);
  gauge(room, 'north', -1.45, 1.75, 0.1);
  gauge(room, 'south', 1.9, 2.1, 0.14);
  // Both hand wheels sit ON the vertical wall runs rather than floating beside
  // them - a valve with no pipe through it is the fastest way to look wrong.
  valve(room, [-3.5, 1.5, -3.4], 0.24, 0.3, false);
  valve(room, [3.5, 1.5, 3.4], 0.22, -0.2, true);
  wallSign(room, 'east', 2.4, 2.1);
  ladder(room, 'south', -2.6);
  drum(room, 1.9, -3.1, false);
  drum(room, 2.5, -3.3, true);
  debris(room, -1.2, -2.6, 0.9, 8);
  debris(room, 1.4, 3.0, 0.8, 7);

  /**
   * One beacon high on the north wall and one caged lamp low by the leak. Both
   * amber: nothing on the station's emergency circuit is any other colour, and
   * the contrast against the map's cold blue ambient is what makes a machine
   * space feel hot even when it is eleven kilometres down and freezing.
   */
  beacon(room, -0.2, 2.5, -3.55, true, 11);
  cageLamp(room, 'east', 0.4, 1.5, true, false, 8);

  return room.finish();
}
