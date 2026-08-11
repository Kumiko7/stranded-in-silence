import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { beacon, cageLamp, causticPatch, crate, debris, disc, diveSuit, drum, glowShaft, ladder, pipeRun, puddle, quad, railing, stripLight, valve, wallSign } from '../kit/props';

/**
 * The Submersible Bay - two cells of hangar with a three-person boat in the
 * cradle and the hatch under it welded shut.
 *
 * A yellow hull the size of a car, nose toward the doors, sitting on a steel
 * cradle with its sail open and its manipulator arm still extended. Gantry
 * overhead, hoses everywhere, and a floor that has been under water more than
 * once.
 *
 * The only piece of machinery in the map that reads as a way OUT, which is the
 * cruelty of it: it has not been in the water for six years.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
] as const;

export const drydock: RoomBlueprint = {
  id: 'abyss.drydock',
  nameKey: 'room.abyss.drydock',
  footprint: FOOTPRINT,
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['station', 'entrance', 'landmark', 'machinery'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [11.25, 0, -2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.9, 0.96, 1.4] },
      { position: [6.0, 0.92, -3.0] },
      { position: [2.4, 0.84, -3.1] },
      { position: [5.0, 0, 2.9] },
    ],
    /**
     * Facing matters: `Game` points the camera along `(-sin y, ·, -cos y)`, so
     * `-PI/2` looks toward +X and `+PI/2` toward -X. The west pair look east up
     * the bay at the boat and the east pair look west at it - get the sign the
     * wrong way round and four people open their run staring at a bulkhead.
     */
    playerSpawn: [
      { position: [-1.4, 0, -2.4], rotationY: -Math.PI / 2 },
      { position: [-1.4, 0, -1.0], rotationY: -Math.PI / 2 },
      { position: [9.4, 0, -2.4], rotationY: Math.PI / 2 },
      { position: [9.4, 0, -1.0], rotationY: Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [0, 0, -2.6] },
      { position: [4.4, 0, -2.9] },
      { position: [8.6, 0, -2.4] },
      { position: [4.0, 0, 2.9] },
    ],
    enemySpawn: [{ position: [11.0, 0, 2.0] }],
  },
  build,
};

/**
 * The boat sits just aft of the centre line. Far enough back that the fore lanes
 * of both cells stay open, and far enough forward that the strip behind it is
 * still a metre wide - a gangway narrower than 0.64 m is a wall, and the aft
 * half of the bay would simply be unreachable.
 */
const SUB_X = 4.2;
const SUB_Z = 1.0;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, drydock);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'deck',
    wall: 'hull',
    ceiling: 'trusses',
    band: 'hazard',
    bandHeight: 0.6,
    strip: 'amber',
    mouth: 'bulkhead',
    ports: [
      { cell: [0, 0], side: 'south', kind: 'viewpane', scene: 'open', tall: true, light: true },
      { cell: [1, 0], side: 'south', kind: 'grille' },
    ],
  });

  /* --- the cradle -------------------------------------------------------------------- */
  // Four A-frames of steel with rubber saddles, and a walk-round platform.
  for (const dx of [-2.1, -0.7, 0.7, 2.1]) {
    for (const s of [-1, 1]) {
      room.geo('steelDark', new THREE.BoxGeometry(0.14, 1.0, 0.14), tiltMatrix([SUB_X + dx, 0.5, SUB_Z + s * 1.0], [s * 0.22, 0, 0]), {
        tile: 0.4,
        consume: true,
      });
      room.geo('rubber', new THREE.BoxGeometry(0.3, 0.14, 0.5), tiltMatrix([SUB_X + dx, 1.02, SUB_Z + s * 0.82], [s * 0.4, 0, 0]), {
        tile: 0.3,
        consume: true,
      });
    }
    room.box('steelDark', [0.16, 0.16, 2.4], [SUB_X + dx, 0, SUB_Z], 0, { tile: 0.4 });
  }
  room.box('surface.hazard', [6.4, 0.02, 3.4], [SUB_X, 0.006, SUB_Z], 0, { tile: 1.0, castShadow: false, receiveShadow: false });

  /* --- the boat ---------------------------------------------------------------------- */
  /**
   * A pressure sphere in a fairing. The fairing is what you read at distance -
   * a long yellow body with a blunt nose and a tail fin - and the sphere is what
   * you read up close, through the ports. Built along +X, nose to the west.
   */
  const body = ctx.materials.get('paintedWarn');
  room.geo(body, new THREE.CylinderGeometry(0.86, 0.98, 4.2, 18), tiltMatrix([SUB_X, 1.68, SUB_Z], [0, 0, Math.PI / 2]), {
    tile: 1.2,
    consume: true,
  });
  room.geo(body, new THREE.SphereGeometry(0.86, 16, 12), poseMatrix([SUB_X - 2.1, 1.68, SUB_Z]), { tile: 0.9, consume: true });
  room.geo(body, new THREE.ConeGeometry(0.98, 1.5, 16), tiltMatrix([SUB_X + 2.85, 1.68, SUB_Z], [0, 0, -Math.PI / 2]), {
    tile: 0.8,
    consume: true,
  });
  // Belly keel and hazard band, so the hull is not one uninterrupted tube.
  room.geo('steelDark', new THREE.BoxGeometry(4.6, 0.2, 0.5), poseMatrix([SUB_X, 0.9, SUB_Z]), { tile: 0.6, consume: true });
  room.geo('steelDark', new THREE.CylinderGeometry(0.99, 0.99, 0.24, 18), tiltMatrix([SUB_X + 1.3, 1.68, SUB_Z], [0, 0, Math.PI / 2]), {
    tile: 0.4,
    consume: true,
  });

  // The forward dome: three ports in a bolted ring, the middle one big.
  room.geo('steelPale', new THREE.SphereGeometry(0.68, 14, 10), poseMatrix([SUB_X - 2.3, 1.68, SUB_Z]), { tile: 0.7, consume: true });
  for (const [dz, dy, r] of [
    [0, 0, 0.3],
    [-0.5, -0.06, 0.17],
    [0.5, -0.06, 0.17],
  ] as const) {
    room.geo('waterDeep', disc(r, 14), poseMatrix([SUB_X - 2.94, 1.68 + dy, SUB_Z + dz], -Math.PI / 2), { castShadow: false, receiveShadow: false });
    room.geo('glassPane', disc(r * 1.02, 14), poseMatrix([SUB_X - 2.97, 1.68 + dy, SUB_Z + dz], -Math.PI / 2), { castShadow: false, receiveShadow: false });
    room.geo('steelDark', new THREE.TorusGeometry(r * 1.15, 0.05, 5, 16), poseMatrix([SUB_X - 2.92, 1.68 + dy, SUB_Z + dz], -Math.PI / 2), {
      tile: 0.3,
      castShadow: false,
      consume: true,
    });
  }
  // Lamp pods on the nose. Both dead, which is worse than both lit.
  for (const s of [-1, 1]) {
    room.geo('steelDark', new THREE.CylinderGeometry(0.12, 0.14, 0.22, 9), tiltMatrix([SUB_X - 2.5, 2.24, SUB_Z + s * 0.5], [Math.PI / 2, 0, 0]), {
      tile: 0.3,
      consume: true,
    });
    room.geo('plastic', disc(0.1, 10), poseMatrix([SUB_X - 2.63, 2.24, SUB_Z + s * 0.5], -Math.PI / 2), { castShadow: false, receiveShadow: false });
  }

  // The sail, open, with the ladder still hooked over the coaming.
  room.geo(body, new THREE.BoxGeometry(1.3, 0.7, 0.9), poseMatrix([SUB_X + 0.2, 2.6, SUB_Z]), { tile: 0.6, consume: true });
  room.geo('steelDark', new THREE.TorusGeometry(0.34, 0.06, 5, 14), tiltMatrix([SUB_X + 0.2, 2.96, SUB_Z], [Math.PI / 2, 0, 0]), {
    tile: 0.3,
    consume: true,
  });
  room.geo('steelPale', new THREE.CircleGeometry(0.32, 14), tiltMatrix([SUB_X + 0.2, 2.94, SUB_Z], [0.9, 0.4, 0]), { tile: 0.3, consume: true });
  for (let i = 0; i < 5; i++) {
    room.geo('steel', new THREE.CylinderGeometry(0.02, 0.02, 0.44, 5), tiltMatrix([SUB_X - 0.55, 2.72 - i * 0.36, SUB_Z], [Math.PI / 2, 0, Math.PI / 2]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
  }

  /**
   * The manipulator arm, still extended, with the claw open a foot off the deck.
   * Three segments and a wrist, sloped steeply at every joint - a near-horizontal
   * cylinder at this scale reads as a fan blade (ROOM_REVIEW.md §4).
   */
  const joints: readonly (readonly [number, number, number])[] = [
    [SUB_X - 1.9, 1.15, SUB_Z - 0.75],
    [SUB_X - 2.7, 0.95, SUB_Z - 1.45],
    [SUB_X - 2.4, 0.5, SUB_Z - 2.2],
    [SUB_X - 2.6, 0.22, SUB_Z - 2.75],
  ];
  for (let i = 1; i < joints.length; i++) {
    const a = joints[i - 1];
    const b = joints[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    room.geo(
      'steelPale',
      new THREE.CylinderGeometry(0.09, 0.11, len, 8),
      tiltMatrix([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.acos((b[1] - a[1]) / len), Math.atan2(b[0] - a[0], b[2] - a[2]), 0]),
      { tile: 0.4, consume: true },
    );
    room.geo('steelDark', new THREE.SphereGeometry(0.13, 8, 6), poseMatrix([b[0], b[1], b[2]]), { tile: 0.3, consume: true });
  }
  for (const s of [-1, 1]) {
    room.geo('steelPale', new THREE.BoxGeometry(0.34, 0.07, 0.09), tiltMatrix([SUB_X - 2.72, 0.16, SUB_Z - 3.0 + s * 0.1], [0, s * 0.5, -0.3]), {
      tile: 0.2,
      consume: true,
    });
  }

  room.collider({ kind: 'box', center: [SUB_X, SUB_Z], halfExtents: [3.3, 1.35] });

  /* --- the gantry and the services ----------------------------------------------------- */
  // A crane beam the length of the bay with a block over the sail.
  room.geo('steel', new THREE.BoxGeometry(13.0, 0.28, 0.36), poseMatrix([4.0, ceilingHeight - 0.62, SUB_Z - 0.2]), { tile: 0.9, consume: true });
  for (const x of [-2.8, 4.0, 10.8]) {
    room.geo('steel', new THREE.BoxGeometry(0.22, 0.7, 0.3), poseMatrix([x, ceilingHeight - 0.3, SUB_Z - 0.2]), { tile: 0.4, consume: true });
  }
  room.box('steelDark', [0.44, 0.4, 0.4], [SUB_X + 0.2, ceilingHeight - 1.18, SUB_Z - 0.2], 0, { tile: 0.3, castShadow: false });
  room.geo('cable', new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), poseMatrix([SUB_X + 0.2, ceilingHeight - 1.45, SUB_Z - 0.2]), {
    castShadow: false,
    consume: true,
  });

  pipeRun(
    room,
    [
      [-3.5, 2.7, 3.4],
      [3.0, 2.7, 3.4],
      [10.6, 2.7, 3.3],
    ],
    0.12,
  );
  pipeRun(
    room,
    [
      [-3.5, 2.42, 3.6],
      [10.6, 2.42, 3.6],
    ],
    0.08,
    'copperPipe',
  );
  valve(room, [10.6, 1.9, 3.3], 0.22, 0, true);
  pipeRun(room, [[10.6, 2.6, 3.3], [10.6, 2.05, 3.3]], 0.1, 'steel', false);

  // Hoses coiled on the wall, an umbilical run to the boat, and the trolley.
  room.geo('rubber', new THREE.TorusGeometry(0.36, 0.06, 6, 18), tiltMatrix([-3.5, 1.7, 0.6], [0, Math.PI / 2, 0]), {
    tile: 0.4,
    consume: true,
  });
  room.geo('rubber', new THREE.TorusGeometry(0.3, 0.055, 6, 18), tiltMatrix([-3.5, 1.1, -0.4], [0, Math.PI / 2, 0]), {
    tile: 0.4,
    consume: true,
  });
  pipeRun(room, [[8.4, 0.2, 2.4], [6.6, 0.35, 2.0], [SUB_X + 2.6, 1.3, SUB_Z + 0.6]], 0.055, 'cable', false);

  /* --- the deck ------------------------------------------------------------------------ */
  room.solid('steelPale', [1.7, 0.9, 0.7], [-2.9, 0, 1.4], 0.1, { tile: 0.8 });
  room.box('steelDark', [1.76, 0.06, 0.76], [-2.9, 0.9, 1.4], 0.1, { tile: 0.4 });
  // Between the two fore hatchways, not in front of one: each cell has its own
  // opening centred on it, so on a 2x1 the safe wall is the middle of the run.
  room.solid('steelPale', [1.5, 0.86, 0.7], [6.0, 0, -3.0], 0, { tile: 0.8 });
  room.box('steelDark', [1.56, 0.06, 0.76], [6.0, 0.86, -3.0], 0, { tile: 0.4 });
  // Clear of the aft cell's east hatchway lane, for the same reason.
  diveSuit(room, 10.6, -1.7, -Math.PI / 2, false);
  // All of the loose deck cargo lives forward, where the bay is eight metres
  // wide. Nothing goes in the gangway behind the boat: it is a metre across and
  // one crate in it would seal off a quarter of the room.
  crate(room, 2.4, -3.1, 0.2, 1.0, 0.82, 0.7, false);
  crate(room, 3.3, -3.2, -0.3, 0.8, 0.6, 0.62, true);
  drum(room, 9.6, 3.2);
  drum(room, 10.3, 3.3, true);
  railing(room, [-3.2, 0, 3.5], [-1.2, 0, 3.5], false, 1.0);
  ladder(room, 'north', 3.2, 0, [1, 0]);
  wallSign(room, 'north', -2.6, 2.15, 0.62, [0, 0]);
  wallSign(room, 'east', 2.4, 2.15, 0.62, [1, 0]);
  puddle(room, 2.0, -2.4, 1.1);
  puddle(room, 6.6, -1.6, 0.9);
  debris(room, 9.4, 1.4, 1.2, 10);
  debris(room, -1.0, 0.4, 1.0, 8);

  /* --- the light -------------------------------------------------------------------------- */
  /**
   * Three real lights for three cells' worth of budget: the pane in the aft wall,
   * a cold strip over the cradle, and an amber beacon at the far end. The boat is
   * yellow, which is the only saturated colour in the station half of the map, so
   * it is worth putting a cold light on it and letting the hull do the rest.
   */
  stripLight(room, SUB_X, SUB_Z - 2.4, 3.2, 0, true, false, 11);
  beacon(room, 10.4, 2.6, -3.5, true, 9);
  stripLight(room, -1.2, -2.6, 2.2, 0, false, true);
  cageLamp(room, 'west', -1.6, 2.2, false, false, 0, [0, 0]);
  cageLamp(room, 'east', 1.6, 2.2, false, true, 0, [1, 0]);

  causticPatch(room, 1.4, -1.2, 1.6);
  causticPatch(room, -1.6, 2.4, 1.3);
  glowShaft(room, [0, 2.6, 3.4], [1.0, 0.5, 0.4], 3.4);
  room.geo('waterHaze', quad(3.0, 2.0), poseMatrix([0, 1.6, 3.2], 0), { castShadow: false, receiveShadow: false });

  return room.finish();
}
