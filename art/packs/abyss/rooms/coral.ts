import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { anemones, bioMotes, boulder, coralHead, debris, encrust, glowShaft, siltDrift, swell, urchin } from '../kit/props';

/**
 * The Cold Reef - a thousand years of coral, growing in a corridor.
 *
 * Lophelia does not need light, so when this section flooded it simply carried
 * on. The heads have come up through the deck and out of the bulkheads, four
 * big thickets in the four corners with an aisle crossing between them, and the
 * living tips of every branch are lit.
 *
 * The one room in the pack with no man-made light in it at all: the coral is
 * the lamp, and it is a colour nothing on the station side ever is.
 */
export const coral: RoomBlueprint = {
  id: 'abyss.coral',
  nameKey: 'room.abyss.coral',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['abyss', 'cluttered'],
  anchors: {
    // The south-west corner is deliberately the one with no thicket in it: a
    // chest needs 1.6 m of clear floor to open into, and coral does not move.
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.7, 0.88, -2.5] },
      { position: [-3.2, 0.88, -2.2] },
      { position: [1.6, 0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.0, 0, 0.4] },
      { position: [1.2, 0, -2.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -1.3] }],
  },
  build,
};

/** Three thickets, in three of the corners, so the door cross stays open. */
const THICKETS: readonly (readonly [number, number, number, boolean])[] = [
  [-2.7, -2.7, 1.0, false],
  [2.7, -2.5, 0.85, true],
  [2.8, 2.8, 1.05, false],
];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, coral);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'silt',
    wall: 'crust',
    ceiling: 'rock',
    band: 'crust',
    bandHeight: 1.4,
    strip: 'bio',
    mouth: 'arch',
  });

  /* --- the thickets ---------------------------------------------------------------- */
  for (const [x, z, scale, warm] of THICKETS) {
    // A mound for it to stand on, then two or three heads at different heights,
    // so the thicket has a skyline rather than being a hedge.
    siltDrift(room, x, z, scale * 1.3);
    coralHead(room, x, 0.05, z, scale, warm);
    coralHead(room, x + room.range(-0.7, 0.7), 0.3, z + room.range(-0.7, 0.7), scale * 0.7, !warm);
    if (scale > 0.9) coralHead(room, x + room.range(-0.5, 0.5), 0.9, z + room.range(-0.5, 0.5), scale * 0.5, warm);
    encrust(room, x, 0.02, z, scale * 1.2, 12);
    room.blockCircle(x, z, scale * 0.62);
  }

  /* --- what grew on the walls --------------------------------------------------------- */
  // Fans and whips out of the plate, up high where nothing walks. They read as
  // a ceiling of branches from the doorways, which is what closes the room in.
  for (let i = 0; i < 10; i++) {
    const side = i % 4;
    const along = room.range(-3.0, 3.0);
    const y = room.range(1.5, ceilingHeight - 0.5);
    const x = side === 0 ? -3.5 : side === 1 ? 3.5 : along;
    const z = side === 2 ? -3.5 : side === 3 ? 3.5 : along;
    // Never over a doorway: any wall here may open, and a fan hanging in a
    // hatchway is the one thing the validator cannot see.
    if (Math.abs(side <= 1 ? z : x) < 1.4) continue;
    const yaw = side === 0 ? -Math.PI / 2 : side === 1 ? Math.PI / 2 : side === 2 ? 0 : Math.PI;
    const size = room.range(0.3, 0.62);
    room.geo('coralDead', new THREE.CylinderGeometry(0.03, 0.06, size, 5), tiltMatrix([x, y, z], [Math.PI / 2.4, yaw, 0]), {
      tile: 0.3,
      castShadow: false,
      consume: true,
    });
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI - Math.PI / 2;
      room.geo(
        'coralDead',
        new THREE.CylinderGeometry(0.014, 0.028, size * 0.8, 4),
        tiltMatrix([x - Math.sin(yaw) * size * 0.7, y + Math.sin(a) * size * 0.4, z - Math.cos(yaw) * size * 0.7], [Math.PI / 2.6, yaw, a * 0.8]),
        { tile: 0.2, castShadow: false, consume: true },
      );
      room.geo(
        i % 3 === 0 ? 'coralPink' : 'coralBlue',
        new THREE.SphereGeometry(0.035, 5, 4),
        poseMatrix([x - Math.sin(yaw) * size * 1.1, y + Math.sin(a) * size * 0.62, z - Math.cos(yaw) * size * 1.1]),
        { castShadow: false, consume: true },
      );
    }
  }

  /* --- the rest of the reef ------------------------------------------------------------ */
  // A shelf of rock out of the west plate, low enough to put something on.
  room.solid('rockPale', [1.0, 0.86, 0.7], [-3.2, 0, -2.2], 0.18, { tile: 0.9 });
  encrust(room, -3.2, 0.88, -2.2, 0.4, 7);
  // Both out in the middle, where they break a sightline without standing in
  // anything's approach: every wall here opens, so the edges belong to doors.
  boulder(room, 0.8, 1.8, 0.55, 0.7);
  boulder(room, 1.6, -1.5, 0.42, 0.6);
  anemones(room, 2.7, 0.62, -2.5, 4, 0.42);
  anemones(room, -1.5, 0.16, 3.2, 3, 0.34);
  coralHead(room, -1.2, 0.04, 3.35, 0.55, true);
  urchin(room, 0.8, 0.74, 1.8, 0.17);
  urchin(room, 0.7, 0.02, 2.9, 0.14);
  urchin(room, -0.6, 0.02, -3.1, 0.12);
  debris(room, 0.6, 1.4, 1.1, 8);
  siltDrift(room, 0.9, -0.9, 0.9);

  /**
   * Both real lights are down IN the reef, under the branch line and off to one
   * side of the heads they light. A lamp inside a coral head lights the inside
   * of a coral head; beside and below one, it rims every branch and throws the
   * thicket's shadow up the wall, which is the whole reason this room works.
   */
  const cold = new THREE.PointLight(0x46b0ff, 10, ctx.dims.cellSize * 1.5, 2);
  cold.position.set(-2.0, 0.65, -2.0);
  room.light(cold);
  swell(room, cold, 10, 0.2, 0.42);

  const warm = new THREE.PointLight(0xff5a8c, 8, ctx.dims.cellSize * 1.35, 2);
  warm.position.set(2.1, 0.5, 2.2);
  room.light(warm);
  swell(room, warm, 8, 0.24, 0.6);

  glowShaft(room, [-2.4, 2.6, -2.4], [-1.2, 0.6, -1.0], 1.6);
  bioMotes(room, -1.6, 1.4, -1.6, 1.6, 18);
  bioMotes(room, 2.0, 1.2, 2.0, 1.4, 16);
  bioMotes(room, 0.2, 1.9, 0.4, 2.2, 14);

  return room.finish();
}
