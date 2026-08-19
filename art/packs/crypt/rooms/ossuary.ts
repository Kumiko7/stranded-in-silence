import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneHeap, boneStack, coronaLucis, cyl, debris, dustMotes, sconce, skull, spike } from '../kit/props';

/**
 * The Bone Chapel - forty thousand people, used as a building material.
 *
 * Every wall is faced in the dead: courses of femurs laid end-on with a row of
 * skulls every third, and a chandelier of the same made by whoever thought that
 * was a reasonable way to spend a winter. A door on all four walls, so it is met
 * from every direction, and every one of those meetings is the same: a wall of
 * ivory holes at eye height.
 *
 * The horror is in the GAPS. A solid field of bone reads as gravel, so the
 * stacks stand proud of a dark ground and the skulls are pushed forward of the
 * courses they sit between.
 */
export const ossuary: RoomBlueprint = {
  id: 'crypt.ossuary',
  nameKey: 'room.crypt.ossuary',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['sanctum', 'bone', 'open'],
  anchors: {
    chest: [{ position: [2.6, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [-2.6, 0, -3.15], rotationY: Math.PI }],
    // Two of them are the corbel brackets in the corners, which exist so this room
    // has somewhere intentional to put an item: it is faced in bone from the floor
    // to the vault and has no other flat surface in it at all.
    itemSpawn: [
      { position: [-3.24, 1.2, 2.9] },
      { position: [0, 0.36, 0] },
      { position: [3.24, 1.2, -2.9] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 2.2] },
      { position: [2.2, 0, -2.2] },
      { position: [2.2, 0, 2.2] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 1.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, ossuary);
  room.shell({
    floor: 'flag',
    wall: 'bone',
    ceiling: 'groin',
    dado: 'bone',
    dadoHeight: 0.9,
    lamps: 'votive',
    lampSpacing: 3.6,
    mouth: 'gothic',
  });

  /* --- the revetment ---------------------------------------------------------- */
  // Two stacks per wall, one either side of where the doorway may open, so the
  // ivory reads all the way round the room whichever walls the generator picks.
  //
  // Chest high rather than head high, and 2.1 m wide rather than 2.4: eight stacks
  // of the full height was 30,000 triangles in a room whose budget is 25,000, and
  // the wall behind them is bone-textured anyway, so the courses simply continue
  // in two dimensions where they stop in three.
  for (const side of ['north', 'east', 'south', 'west'] as const) {
    for (const s of [-1, 1]) {
      boneStack(room, side, s * 2.45, 2.0, room.range(1.1, 1.3));
    }
  }

  /* --- the pile in the middle -------------------------------------------------- */
  // A low cairn of skulls on a flagstone, with a cross of femurs laid over it.
  // Low, because the room's own walls are doing the work at eye height and a
  // second pale mass at chest height would fight them.
  // No collider: it is 16 cm tall, collision is a 2D floor test, and a step you
  // can see over should never be an invisible wall (ROOM_FORMAT.md §5).
  room.box('stonePale', [1.5, 0.16, 1.5], [0, 0, 0], 0.3, { tile: 0.7 });
  boneHeap(room, 0, 0, 0.66, 7);
  // Five round the base and one on top, all of them larger than life: a skull only
  // reads as a skull if its two sockets are resolvable, and at 1.0 scale from four
  // metres away a cairn of them is a pile of potatoes.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    skull(room, Math.cos(a) * 0.38, 0.16, Math.sin(a) * 0.38, a + Math.PI, 1.45, i % 3 === 0 ? 'boneDark' : 'bone');
  }
  skull(room, 0, 0.42, 0, room.range(0, 6), 1.5);
  for (const a of [0.4, 1.97]) {
    room.geo('bonePale', cyl(0.032, 0.038, 1.15, 6), tiltMatrix([0, 0.2, 0], [Math.PI / 2, a, 0]), { tile: 0.3, castShadow: false });
    for (const s of [-1, 1]) {
      room.geo('bonePale', ball(0.048, 6), poseMatrix([Math.sin(a) * s * 0.57, 0.2, Math.cos(a) * s * 0.57]), { castShadow: false });
    }
  }

  /* --- light ------------------------------------------------------------------ */
  // The corona: iron, long bones and forty candles, hung over the cairn. The one
  // shadow-casting light in the room, and it is throwing the shadow of a wheel of
  // femurs across a floor of flagstones.
  coronaLucis(room, 0, 0, 1.0, true, 11, true);
  sconce(room, 'west', -2.5, 1.95, true, false, 5);

  /* --- the corbels -------------------------------------------------------------- */
  // Two brackets, in diagonally opposite corners, each with a candle stub and a
  // skull on it. They are where the room's item anchors live: everything else in
  // here is a wall of bone or a heap on the floor.
  for (const [x, z, yaw] of [
    [-3.24, 2.9, Math.PI / 4],
    [3.24, -2.9, (-Math.PI * 3) / 4],
  ] as const) {
    room.box('stonePale', [0.62, 0.09, 0.44], [x, 1.11, z], yaw, { tile: 0.4, castShadow: false });
    room.box('stone', [0.44, 0.16, 0.3], [x, 0.95, z], yaw, { tile: 0.3, castShadow: false });
    room.geo('stone', spike(0.16, 0.34, 5), tiltMatrix([x, 0.86, z], [Math.PI, yaw, 0]), { tile: 0.3, castShadow: false });
    skull(room, x - Math.sin(yaw) * 0.13, 1.2, z - Math.cos(yaw) * 0.13, yaw + Math.PI, 0.95, 'boneDark');
    room.geo('wax', cyl(0.024, 0.03, 0.16, 6), poseMatrix([x + Math.sin(yaw) * 0.16, 1.28, z + Math.cos(yaw) * 0.16]), { tile: 0.2, castShadow: false });
    room.geo('lumenTallow', ball(0.021, 7), tiltMatrix([x + Math.sin(yaw) * 0.16, 1.37, z + Math.cos(yaw) * 0.16], [0, 0, 0], [1, 1.4, 1]), {
      castShadow: false,
      receiveShadow: false,
    });
    room.geo('flame', ball(0.016, 6), tiltMatrix([x + Math.sin(yaw) * 0.16, 1.41, z + Math.cos(yaw) * 0.16], [0, 0, 0], [0.7, 2.4, 0.7]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  // A course of skulls high on two walls, above the stacks and above every
  // doorway, where a mason put the ones with something wrong with them.
  for (let i = 0; i < 2; i++) {
    skull(room, -3.2 + i * 0.5, 2.66, -3.48, Math.PI + room.range(-0.3, 0.3), 1.15, i === 1 ? 'boneDark' : 'bone');
    skull(room, 3.48, 2.66, 2.1 + i * 0.5, Math.PI / 2 + room.range(-0.3, 0.3), 1.15, i === 0 ? 'boneDark' : 'bone');
  }

  debris(room, -2.0, -3.0, 0.75, 4);
  debris(room, 3.0, 1.8, 0.65, 4);
  dustMotes(room, 0, 1.7, 0, 2.2, 16);

  return room.finish();
}
