import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  bench,
  cageLamp,
  cyl,
  debris,
  disc,
  drain,
  dripLine,
  quad,
  shelf,
  specimenJar,
  stripLight,
  tankColumn,
} from '../kit/props';

/**
 * The Wet Lab - where whatever came up in the trawl was taken apart.
 *
 * White tile to shoulder height, a stainless table with a run-off channel down
 * the middle of it, and three hundred jars on the shelves. The jars are the
 * light: most of them are lit from within, so the room reads as a green wall of
 * specimens with a bright table in front of it and darkness in between.
 *
 * The north wall is a bank of monitors rather than a door, which is what makes
 * this the room where you find out there is something on the sonar.
 */
export const wetlab: RoomBlueprint = {
  id: 'abyss.wetlab',
  nameKey: 'room.abyss.wetlab',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 10,
  tags: ['station', 'clinical'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0, 0.96, -0.3] },
      { position: [-3.44, 2.04, -2.4] },
      { position: [2.5, 0.96, 2.62] },
    ],
    patrolPoint: [
      { position: [-2.3, 0, -0.4] },
      { position: [1.9, 0, 1.1] },
      { position: [0.2, 0, 2.9] },
    ],
    enemySpawn: [{ position: [-1.0, 0, -3.2] }],
  },
  build,
};

/** Shelf runs down the west wall: `[along, y, width]`. On a west wall `along` is z. */
const SHELVES: readonly (readonly [number, number, number])[] = [
  [-1.95, 1.42, 1.5],
  [-1.95, 1.98, 1.5],
  [2.4, 1.42, 1.6],
  [2.4, 1.98, 1.6],
  [-2.4, 2.5, 1.8],
];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, wetlab);
  room.shell({
    floor: 'tile',
    wall: 'tile',
    ceiling: 'panels',
    band: 'tile',
    bandHeight: 1.6,
    strip: 'amber',
    mouth: 'bulkhead',
    ports: [{ side: 'north', kind: 'monitors' }],
  });

  /* --- the table -------------------------------------------------------------- */
  // Dead centre, and far enough off every wall that all three doorways keep
  // their 1.2 m. A dissection table belongs in the middle of a room like this:
  // you are meant to walk round it and look at what is on it.
  bench(room, 0, -0.1, 2.0, 1.0, 0.94);
  room.box('steelDark', [1.7, 0.02, 0.15], [0, 0.93, -0.1], 0, { tile: 0.4, castShadow: false });
  room.geo('puddle', quad(1.66, 0.12), tiltMatrix([0, 0.951, -0.1], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  drain(room, 0, 1.1);
  // Instruments left where somebody dropped them, and a kidney dish.
  for (const [x, z, len] of [
    [-0.72, -0.42, 0.22],
    [-0.55, -0.28, 0.16],
    [0.62, -0.46, 0.28],
  ] as const) {
    room.box('steelPale', [len, 0.02, 0.035], [x, 0.94, z], room.range(0, 3), { tile: 0.3, castShadow: false });
  }
  room.geo('steelPale', cyl(0.16, 0.19, 0.06, 12), poseMatrix([0.74, 0.97, 0.22]), {
    tile: 0.3,
  });

  /* --- the jars --------------------------------------------------------------- */
  /**
   * Nothing crosses the west doorway's lane (|z| < 1.1) and nothing stands on
   * the two spots the item anchors claim - a jar and a key occupying the same
   * 12 cm of shelf looks exactly like a bug, because it is one.
   */
  const claimed: readonly (readonly [number, number])[] = [[2.04, -2.4]];
  for (const [along, y, width] of SHELVES) {
    shelf(room, 'west', along, y, width, 0.4);
    const count = Math.max(2, Math.round(width / 0.36));
    for (let i = 0; i < count; i++) {
      const z = along - width / 2 + (width * (i + 0.5)) / count;
      if (Math.abs(z) < 1.3) continue;
      if (claimed.some(([cy, cz]) => Math.abs(cy - y - 0.06) < 0.1 && Math.abs(cz - z) < 0.3)) continue;
      specimenJar(room, -3.44 + room.range(-0.04, 0.04), y + 0.05, z, room.range(0.075, 0.115), room.range(0.2, 0.34), room.chance(0.62));
    }
  }

  // A bench along the south-east, with the overflow from the shelves on it.
  bench(room, 2.5, 2.7, 2.0, 0.9, 0.94, Math.PI / 2);
  for (const z of [1.92, 2.24, 3.06, 3.38]) {
    specimenJar(room, 2.5 + room.range(-0.2, 0.2), 0.96, z, room.range(0.07, 0.1), room.range(0.18, 0.3), room.chance(0.45));
  }

  /* --- the tank ---------------------------------------------------------------- */
  // One column tank in the north-west corner, holding whatever the lab was
  // actually built for. It is the room's second light source.
  tankColumn(room, -2.5, -2.6, 0.62, 2.5, true, 'specimen', 9);

  /* --- the rest ---------------------------------------------------------------- */
  // A hose coiled on the east wall, a waste bin, and the mess nobody swept up.
  room.geo('rubber', new THREE.TorusGeometry(0.28, 0.045, 6, 16), tiltMatrix([3.5, 1.55, 1.9], [0, Math.PI / 2, 0]), {
    tile: 0.4,
    consume: true,
  });
  room.solid('steelDark', [0.5, 0.72, 0.5], [3.35, 0, 1.9], 0.2, { tile: 0.5 });
  room.geo('surface.algae', disc(0.34, 12), tiltMatrix([3.35, 0.735, 1.9], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  dripLine(room, 1.6, -2.4);
  dripLine(room, -1.2, 2.2);
  debris(room, -1.6, -3.0, 1.0, 9);
  debris(room, 2.9, -1.2, 0.7, 6);

  /**
   * Two real lights, which is the whole budget for a 1x1: the strip over the
   * table (the room's only shadow caster) and the specimen tank in the corner.
   * The caged lamp on the east wall is a fitting, not a lamp - the jars are
   * doing the rest, and they cost nothing. Two more strips are simply dead,
   * because a ceiling where everything still works does not read as a station
   * somebody left.
   */
  stripLight(room, 0, -0.4, 2.4, 0, true, false, 13);
  cageLamp(room, 'east', -1.9, 2.1, false, false);
  stripLight(room, -2.2, 1.9, 1.6, Math.PI / 2, false, true);
  stripLight(room, 2.4, -2.4, 1.6, 0, false, true);

  return room.finish();
}
