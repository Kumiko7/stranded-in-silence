import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, breathe, carapacePlate, chitinShelf, gillSlits, lumenPod, resinFlow } from '../kit/props';

/**
 * The Armoury - the hardest room in the beast, and the only one that is dry.
 *
 * Overlapping shell plates on every wall, a floor of hexagonal chitin, and four
 * buttresses in the corners holding it all against something. It has the
 * cleanest sight lines in the pack, which makes it the safest room to cross and
 * the worst one to be caught in the middle of.
 */
export const carapace: RoomBlueprint = {
  id: 'viscera.carapace',
  nameKey: 'room.viscera.carapace',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['entrance', 'calcified', 'open'],
  anchors: {
    chest: [{ position: [-1.5, 0, -3.2], rotationY: Math.PI }],
    locker: [{ position: [1.5, 0, -3.25], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-3.2, 1.35, 1.8] },
      { position: [3.2, 1.35, -1.6] },
      { position: [2.9, 0.0, 2.9] },
    ],
    playerSpawn: [
      { position: [-1.3, 0, 1.3], rotationY: Math.PI },
      { position: [1.3, 0, 1.3], rotationY: Math.PI },
      { position: [-1.3, 0, -1.3], rotationY: 0 },
      { position: [1.3, 0, -1.3], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.4, 0, 1.6] },
      { position: [2.4, 0, -1.2] },
    ],
    enemySpawn: [{ position: [-2.0, 0, 2.5] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, carapace);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'chitin', wall: 'scute', ceiling: 'chitin', band: 'chitin', bandHeight: 1.15, mouth: 'mandible', ridge: true });

  /* --- the plating ------------------------------------------------------------ */
  // Overlapping armour on the four wall faces, always off the door lanes.
  for (const [side, along, y, w, h] of [
    ['north', -2.5, 1.3, 1.9, 1.5],
    ['north', 2.6, 1.6, 1.7, 1.3],
    ['east', -2.4, 1.2, 1.8, 1.6],
    ['east', 2.5, 1.5, 1.6, 1.2],
    ['south', -2.6, 1.4, 1.8, 1.4],
    ['south', 2.4, 1.2, 1.9, 1.5],
    ['west', -2.5, 1.5, 1.7, 1.3],
    ['west', 2.6, 1.3, 1.8, 1.5],
  ] as const) {
    carapacePlate(room, side, along, y, w, h);
  }

  /* --- the buttresses ---------------------------------------------------------- */
  // Four corner columns of stacked plates, each leaning into its corner. They
  // are the only cover in the room and the only thing breaking its symmetry.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const x = sx * 3.0;
    const z = sz * 3.0;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const w = 1.15 - t * 0.5;
      room.geo(
        'chitinPlate',
        new THREE.BoxGeometry(w, 0.5, w * 0.8),
        tiltMatrix([x - sx * t * 0.34, 0.28 + i * 0.55, z - sz * t * 0.34], [sz * t * 0.12, sx * sz * 0.5, -sx * t * 0.12]),
        { tile: 0.9, consume: true },
      );
      room.geo('chitinDark', ball(0.13, 7), poseMatrix([x - sx * t * 0.42, 0.5 + i * 0.55, z - sz * t * 0.42]), { tile: 0.3 });
    }
    room.geo('bonePale', ball(0.42, 10), tiltMatrix([x - sx * 0.42, ceilingHeight - 0.42, z - sz * 0.42], [0, 0, 0], [1.3, 0.7, 1.3]), {
      tile: 0.6,
    });
    room.blockCircle(x, z, 0.66);
  }

  /* --- the fittings ------------------------------------------------------------ */
  chitinShelf(room, 'west', 1.8, 1.35, 1.3, 0.44);
  chitinShelf(room, 'east', 1.6, 1.35, 1.3, 0.44);
  gillSlits(room, 'north', 0.4, 2.7, 5, 0.9);
  gillSlits(room, 'south', 0.0, 2.7, 5, 0.9);
  resinFlow(room, 'east', 2.6, 2.6, 0.8);
  boneDebris(room, 2.9, 2.9, 0.9, 9);
  boneDebris(room, -1.8, -2.0, 0.7, 6);

  // Seams of resin in the plating, which is the only warm colour in the room.
  for (const [x, y, z, len, yaw] of [
    [-3.5, 2.2, 0.4, 2.2, Math.PI / 2],
    [3.5, 1.9, -0.6, 1.9, Math.PI / 2],
    [0.6, 2.5, -3.5, 2.4, 0],
  ] as const) {
    room.geo('resin', new THREE.BoxGeometry(len, 0.09, 0.07), tiltMatrix([x, y, z], [0, yaw, 0.06]), {
      castShadow: false,
      tile: 0.4,
      consume: true,
    });
  }

  /**
   * Two cold pods, high in opposite corners. A dry room wants hard light and
   * long shadows off the plate edges - anything soft and the armour flattens
   * into wallpaper.
   */
  lumenPod(room, [-3.15, 2.45, -2.0], 0.19, true, false, 9);
  lumenPod(room, [3.15, 2.45, 2.0], 0.19, false, false);
  const glow = new THREE.PointLight(0x8ff0c4, 7, ctx.dims.cellSize * 1.4, 2);
  glow.position.set(3.05, 2.6, 2.0);
  room.light(glow);
  breathe(room, glow, 7, 0.14, 0.9);

  return room.finish();
}
