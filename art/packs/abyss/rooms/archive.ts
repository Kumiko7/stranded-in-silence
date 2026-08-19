import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { cageLamp, cyl, debris, dripLine, quad, specimenJar, stripLight } from '../kit/props';

/**
 * The Sample Archive - everything the station ever caught, in a jar, in order.
 *
 * Four bays of racking, floor to ceiling, and a jar every twenty centimetres.
 * Most of them are lit; the ones that are not are the ones you look at longest.
 * There is an aisle down the middle and a card index against the west wall, and
 * the whole room is a green wall of specimens with black between the bays.
 *
 * One of the best rooms in the map to be chased through, because the racks are
 * exactly tall enough that you cannot see over them.
 */
export const archive: RoomBlueprint = {
  id: 'abyss.archive',
  nameKey: 'room.abyss.archive',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['station', 'entrance', 'cluttered'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.6], rotationY: -Math.PI / 2 }],
    // Three shelf slots the jar loop is told to leave empty - see `claimed`.
    itemSpawn: [
      { position: [2.03, 1.32, -2.6] },
      { position: [-2.2, 1.32, -3.38] },
      { position: [2.67, 0.66, 2.6] },
    ],
    // Facing east, down the aisle at the two lit bays: the camera looks along
    // `(-sin y, ·, -cos y)`, so +X wants `-PI/2` and not `+PI/2`.
    playerSpawn: [
      { position: [-1.4, 0, -0.9], rotationY: -Math.PI / 2 },
      { position: [-1.4, 0, 0.9], rotationY: -Math.PI / 2 },
      { position: [0.3, 0, -0.9], rotationY: -Math.PI / 2 },
      { position: [0.3, 0, 0.9], rotationY: -Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [1.8, 0, 0.2] },
      { position: [-2.4, 0, -0.4] },
      { position: [0.2, 0, 2.0] },
    ],
    enemySpawn: [{ position: [3.15, 0, -3.25] }],
  },
  build,
};

/**
 * One bay of racking: uprights, four shelves and the jars on them. `spin` turns
 * the whole bay, and the jar loop skips any shelf slot the room has claimed for
 * an item anchor - a key sharing 12 cm of shelf with a jar looks like a bug.
 */
function rackBay(
  room: Room,
  x: number,
  z: number,
  length: number,
  depth: number,
  spin: number,
  claimed: readonly (readonly [number, number])[] = [],
): void {
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const at = (lx: number, lz: number): readonly [number, number, number] => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];
  const levels = [0.62, 1.28, 1.94, 2.56];

  for (const y of levels) {
    room.box('steelPale', [length, 0.04, depth], [x, y, z], spin, { tile: 0.9 });
    room.box('steelDark', [length, 0.05, 0.035], [at(0, -depth / 2 + 0.02)[0], y + 0.04, at(0, -depth / 2 + 0.02)[2]], spin, { tile: 0.3 });
  }
  for (const lx of [-length / 2 + 0.06, 0, length / 2 - 0.06]) {
    for (const lz of [-depth / 2 + 0.05, depth / 2 - 0.05]) {
      const p = at(lx, lz);
      room.box('steelDark', [0.06, 3.0, 0.06], [p[0], 0, p[2]], spin, { tile: 0.4 });
    }
  }
  // Diagonal bracing on the back of the bay: the detail that reads as racking.
  for (const s of [-1, 1]) {
    const a = at(s * length * 0.25, depth / 2 - 0.06);
    room.geo('steelDark', cyl(0.016, 0.016, 1.5, 4), tiltMatrix([a[0], 1.6, a[2]], [0, spin, s * 0.62]), {
      tile: 0.3,
      castShadow: false,
    });
  }

  for (const y of levels) {
    // A jar every 34 cm rather than every 26. The shelves are the room and a
    // rack still reads as full at this pitch - the archive was placing ninety-six
    // of the dearest prop in the pack, which is two thirds of the room.
    const count = Math.max(3, Math.round(length / 0.46));
    for (let i = 0; i < count; i++) {
      const lx = -length / 2 + 0.12 + ((length - 0.24) * i) / (count - 1);
      if (claimed.some(([cy, cx]) => Math.abs(cy - y) < 0.1 && Math.abs(cx - lx) < 0.3)) continue;
      if (room.chance(0.12)) continue; // gaps, so it is not a wall of tins
      const p = at(lx, room.range(-0.05, 0.05));
      specimenJar(room, p[0], y + 0.04, p[2], room.range(0.095, 0.13), room.range(0.16, 0.28), room.chance(0.58));
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length / 2 - 0.04, depth / 2 - 0.04], rotationY: spin });
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, archive);
  room.shell({
    floor: 'tile',
    wall: 'paint',
    ceiling: 'conduit',
    band: 'steel',
    bandHeight: 0.7,
    strip: 'cyan',
    mouth: 'bulkhead',
  });

  /* --- the bays ------------------------------------------------------------------- */
  // Two islands on the east side and two backed against the end walls. Every one
  // of them stays clear of the north, east and south door lanes, which is what
  // decides the whole plan of the room before a single jar goes on a shelf.
  rackBay(room, 2.35, -2.6, 2.0, 0.55, 0, [[1.28, -0.32]]);
  rackBay(room, 2.35, 2.6, 2.0, 0.55, 0, [[0.62, 0.32]]);
  rackBay(room, -2.2, -3.38, 1.8, 0.5, 0, [[1.28, 0]]);
  rackBay(room, -2.2, 3.38, 1.8, 0.5, 0);

  /* --- the index ------------------------------------------------------------------- */
  // A bank of card drawers against the west wall, between the two containers.
  for (let i = 0; i < 3; i++) {
    const z = -0.8 + i * 0.8;
    room.solid('steelDark', [0.5, 1.32, 0.74], [-3.42, 0, z], 0, { tile: 0.7 });
    for (let d = 0; d < 4; d++) {
      room.box('steelPale', [0.06, 0.28, 0.66], [-3.18, 0.06 + d * 0.32, z], 0, { tile: 0.3, castShadow: false });
      room.geo('steel', cyl(0.018, 0.018, 0.14, 5), tiltMatrix([-3.14, 0.2 + d * 0.32, z], [Math.PI / 2, Math.PI / 2, Math.PI / 2]), {
        tile: 0.2,
        castShadow: false,
      });
    }
  }
  // One drawer left open, with cards spilling out of it.
  room.box('steelPale', [0.34, 0.26, 0.62], [-3.02, 0.7, 0.0], 0, { tile: 0.3, castShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('canvasPale', quad(0.1, 0.14), tiltMatrix([room.range(-2.9, -2.2), 0.004, room.range(-0.5, 0.5)], [-Math.PI / 2, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- the ledger wall -------------------------------------------------------------- */
  // Index labels down the end of each bay: a strip of pale card at eye height,
  // which is the one thing that makes racking read as an archive.
  for (const [x, z, spin] of [
    [2.35, -2.29, 0],
    [2.35, 2.29, Math.PI],
  ] as const) {
    for (const y of [0.66, 1.32, 1.98]) {
      room.geo('canvasPale', quad(0.34, 0.1), poseMatrix([x, y, z], spin), { castShadow: false, receiveShadow: false });
    }
  }

  dripLine(room, -0.6, -1.8);
  debris(room, 1.0, -3.0, 0.8, 7);
  debris(room, -0.8, 2.6, 0.9, 8);

  /**
   * One strip down the central aisle and one caged lamp at the far end. The rest
   * of the light in here is three hundred jars, which is a great deal of it -
   * but all of it is at shelf height, so the ceiling and the floor stay black
   * and the aisle reads as a slot rather than as a corridor.
   */
  stripLight(room, -0.6, 0, 2.6, Math.PI / 2, true, false, 9);
  stripLight(room, 1.4, -1.9, 1.6, 0, false, true);
  cageLamp(room, 'east', 2.6, 2.2, true, true, 6);

  return room.finish();
}
