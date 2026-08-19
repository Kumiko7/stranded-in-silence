import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cageLamp, cyl, debris, dripLine, quad, shelf, stripLight } from '../kit/props';

/**
 * Crew Quarters - eight bunks, and nobody has slept in them for a long time.
 *
 * A through-room: doors east and west, a deadlight in each end wall, and four
 * bunk stacks pushed against the fore and aft bulkheads so the corridor down
 * the middle stays open. The bunks are made. That is the detail the room is
 * built around - somebody squared the blankets off before they left.
 *
 * Deliberately the quietest room in the pack. Negative space is scary
 * (ART_GUIDE.md §2), and a map of set pieces needs somewhere to breathe.
 */
export const quarters: RoomBlueprint = {
  id: 'abyss.quarters',
  nameKey: 'room.abyss.quarters',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'west'),
  weight: 9,
  tags: ['station', 'entrance', 'quiet'],
  anchors: {
    // Pulled forward of the aft bunks: they stand from z = 2.5, and a container
    // needs its approach measured from its own face, not from the wall.
    chest: [{ position: [-3.2, 0, 1.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, 1.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.6, 0.6, 2.95] },
      { position: [1.6, 1.5, -2.95] },
      { position: [-3.44, 1.56, -1.6] },
    ],
    playerSpawn: [
      { position: [-2.4, 0, -1.8], rotationY: -Math.PI / 2 },
      { position: [-0.8, 0, -1.6], rotationY: -Math.PI / 2 },
      { position: [0.8, 0, -1.6], rotationY: Math.PI / 2 },
      { position: [2.4, 0, -1.8], rotationY: Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.6, 0, -0.6] },
      { position: [2.6, 0, 0.6] },
    ],
    enemySpawn: [{ position: [0, 0, 3.2] }],
  },
  build,
};

/** Two tiers, a ladder at one end, and a curtain rail nobody drew. */
function bunkStack(room: Room, x: number, z: number, rotationY: number): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): readonly [number, number, number] => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  for (const y of [0.36, 1.26]) {
    // Frame, mattress and the blanket squared off on it.
    room.box('steelPale', [1.9, 0.07, 0.78], [x, y, z], rotationY, { tile: 0.8 });
    room.box('canvasPale', [1.78, 0.11, 0.66], [x, y + 0.07, z], rotationY, { tile: 0.5 });
    room.box('painted', [1.62, 0.05, 0.6], [x, y + 0.18, z], rotationY, { tile: 0.6 });
    // A pillow at one end, and the lip that stops you rolling out of the top one.
    const head = at(-0.68, 0);
    room.geo('canvasPale', ball(0.2, 8), tiltMatrix([head[0], y + 0.2, head[2]], [0, rotationY, 0], [1.5, 0.5, 1.1]), {
      tile: 0.4,
    });
    const front = at(0, -0.42);
    room.box('steelPale', [1.9, 0.16, 0.05], [front[0], y + 0.07, front[2]], rotationY, { tile: 0.4 });
  }
  // Corner posts and the ladder up the near end.
  for (const [lx, lz] of [
    [-0.93, -0.37],
    [0.93, -0.37],
    [-0.93, 0.37],
    [0.93, 0.37],
  ] as const) {
    const p = at(lx, lz);
    room.box('steel', [0.07, 2.0, 0.07], [p[0], 0, p[2]], rotationY, { tile: 0.3 });
  }
  for (let i = 0; i < 3; i++) {
    const p = at(0.93, 0);
    room.geo('steel', cyl(0.016, 0.016, 0.6, 5), tiltMatrix([p[0], 0.6 + i * 0.32, p[2]], [Math.PI / 2, rotationY, Math.PI / 2]), {
      tile: 0.2,
      castShadow: false,
    });
  }
  // A reading lamp over the lower bunk, dead, and a personal shelf above it.
  const back = at(-0.5, 0.36);
  room.geo('steelDark', cyl(0.04, 0.05, 0.12, 7), tiltMatrix([back[0], 0.85, back[2]], [Math.PI / 2, rotationY, 0]), {
    tile: 0.2,
  });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.93, 0.38], rotationY });
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, quarters);
  room.shell({
    floor: 'deck',
    wall: 'paint',
    ceiling: 'panels',
    band: 'steel',
    bandHeight: 0.72,
    rail: true,
    strip: 'amber',
    mouth: 'bulkhead',
    ports: [
      { side: 'north', kind: 'porthole', light: true },
      { side: 'south', kind: 'porthole' },
    ],
  });

  /* --- the bunks ------------------------------------------------------------------ */
  // Four stacks, two fore and two aft, leaving a 1.3 m gap on the centre line and
  // the whole east-west corridor clear. Every one of them is turned a degree or
  // two off square: nothing in this station was ever put back exactly straight.
  for (const [x, z] of [
    [-1.6, -2.9],
    [1.6, -2.9],
    [-1.6, 2.9],
    [1.6, 2.9],
  ] as const) {
    bunkStack(room, x, z, room.range(-0.03, 0.03));
  }

  /* --- what people left ------------------------------------------------------------ */
  // A shelf on each end wall, and boots under one bunk. `along` on a west wall
  // runs +z, so along -1.6 lands at z = -1.6 - which is where the item is.
  shelf(room, 'west', -1.6, 1.5, 1.2, 0.36);
  shelf(room, 'east', 1.6, 1.5, 1.2, 0.36);
  for (const [x, y, z] of [
    [-3.42, 1.56, -2.05],
    [-3.42, 1.56, -1.15],
    [3.42, 1.56, -1.5],
    [3.42, 1.56, -2.0],
  ] as const) {
    room.box('plastic', [0.16, 0.2, 0.12], [x, y, z], room.range(-0.3, 0.3), { tile: 0.3, castShadow: false });
  }
  for (const [x, z] of [
    [-2.55, -2.5],
    [-2.36, -2.42],
  ] as const) {
    room.box('rubber', [0.13, 0.16, 0.3], [x, 0.005, z], room.range(-0.4, 0.4), { tile: 0.3, castShadow: false });
  }

  /**
   * Photographs taped inside the bunk frames. `spin` here is the FINAL yaw, not
   * an offset: a plane's front face is +Z, so one on the fore bulkhead faces the
   * room at yaw 0 and one on the aft bulkhead needs the half turn.
   */
  for (const [x, y, z, spin] of [
    [-2.4, 0.72, -3.28, 0],
    [-2.28, 1.62, -3.28, 0],
    [2.45, 0.7, 3.28, Math.PI],
    [1.1, 1.6, 3.28, Math.PI],
  ] as const) {
    room.geo('canvasPale', quad(0.16, 0.12), poseMatrix([x, y, z], spin), { castShadow: false, receiveShadow: false });
  }

  /**
   * A row of hooks by the west door with wet-weather gear still on them. Boxes
   * rather than planes: a single-sided sheet of coat goes black the moment the
   * lamp is behind it, which is the hanging-laundry bug from ROOM_REVIEW.md §4.
   */
  for (let i = 0; i < 3; i++) {
    const z = 0.4 + i * 0.42;
    room.geo('steel', cyl(0.014, 0.014, 0.1, 5), tiltMatrix([-3.62, 1.86, z], [Math.PI / 2, Math.PI / 2, 0]), {
      tile: 0.2,
      castShadow: false,
    });
    room.box('canvasSuit', [0.34, 1.0, 0.11], [-3.52, 0.86, z], Math.PI / 2, { tile: 0.5, castShadow: false });
    room.box('canvasSuit', [0.22, 0.36, 0.14], [-3.5, 1.7, z], Math.PI / 2, { tile: 0.4, castShadow: false });
  }

  dripLine(room, 0.6, -1.4);
  debris(room, -0.4, 1.9, 1.0, 8);
  debris(room, 2.7, -2.4, 0.7, 5);

  /**
   * One live strip on the centre line, one dead, and the deadlight in the north
   * wall doing the rest. Two real lights total, and the room is still readable
   * end to end because the emergency strip runs the length of both bulkheads.
   */
  stripLight(room, -1.0, 0, 2.4, Math.PI / 2, true, false, 8);
  stripLight(room, 1.6, 0, 2.4, Math.PI / 2, false, true);
  cageLamp(room, 'south', 2.9, 2.05, false, false);

  return room.finish();
}
