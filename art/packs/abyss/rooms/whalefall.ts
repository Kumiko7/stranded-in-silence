import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  anemones,
  ball,
  bioMotes,
  boulder,
  causticPatch,
  cyl,
  debris,
  disc,
  encrust,
  glowShaft,
  siltDrift,
  swell,
  tubeWorms,
  urchin,
  whaleSkeleton,
} from '../kit/props';

/**
 * The Whale Fall - eleven metres of dead animal, and everything that came to
 * eat it.
 *
 * A rib cage lying along the west side of the compartment, silhouetted against
 * the pane behind it, furred over in white bacterial mat. It reads as a nave:
 * arches down both sides of a spine, and you can walk between them.
 *
 * The mat is the light. It is the only near-white thing in the abyss half of
 * the map and it lights from underneath, so the ribs cast their shadows up the
 * walls and across the ceiling rather than down.
 */
export const whalefall: RoomBlueprint = {
  id: 'abyss.whalefall',
  nameKey: 'room.abyss.whalefall',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south', 'east'),
  weight: 9,
  tags: ['abyss', 'landmark'],
  anchors: {
    chest: [{ position: [2.4, 0, -3.2], rotationY: Math.PI }],
    locker: [{ position: [2.4, 0, 3.25], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.4, 0.44, 0.4] },
      { position: [3.3, 0.68, -1.4] },
      { position: [-0.6, 0, 2.6] },
    ],
    patrolPoint: [
      { position: [0.6, 0, 0] },
      { position: [-0.7, 0, -1.2] },
      { position: [2.6, 0, 1.2] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, whalefall);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'silt',
    wall: 'rock',
    ceiling: 'rock',
    band: 'crust',
    bandHeight: 1.3,
    strip: 'bio',
    mouth: 'arch',
    ports: [{ side: 'west', kind: 'viewpane', scene: 'open', tall: true, light: true }],
  });

  /* --- the carcass ----------------------------------------------------------------- */
  /**
   * The skeleton runs fore-and-aft down the west side, so it never crosses the
   * east doorway's lane and never blocks the fore or aft ones. It is built by
   * the kit; what this room adds is everything eating it.
   */
  const SPINE_X = -2.35;
  siltDrift(room, SPINE_X, -1.4, 1.4);
  siltDrift(room, SPINE_X + 0.3, 1.8, 1.2);
  // Turned a quarter so the length runs fore-and-aft: the kit builds it along
  // its own +X and the rotation carries the ribs, the mat and the collider.
  whaleSkeleton(room, SPINE_X, 0, 5.0, Math.PI / 2);

  // The skull, forward of the ribs and half turned: the one piece that tells you
  // what animal this was.
  room.geo('boneWhale', ball(0.85, 12), tiltMatrix([SPINE_X - 0.2, 0.5, -3.0], [0.1, 0.5, 0], [1.6, 0.62, 0.85]), {
    tile: 1.0,
  });
  for (const s of [-1, 1]) {
    room.geo('boneWhale', new THREE.BoxGeometry(1.9, 0.22, 0.16), tiltMatrix([SPINE_X - 0.35, 0.3, -3.0 + s * 0.34], [0.04, 0.5, s * 0.06]), {
      tile: 0.6,
      consume: true,
    });
  }
  room.geo('rockDark', ball(0.18, 8), poseMatrix([SPINE_X - 0.72, 0.66, -3.28]), { tile: 0.4 });
  room.blockCircle(SPINE_X - 0.2, -3.0, 0.7);

  // The mat: white shag over the bone and out across the silt for two metres.
  for (let i = 0; i < 6; i++) {
    const x = SPINE_X + room.range(-1.4, 1.4);
    const z = room.range(-2.4, 2.8);
    room.geo('bacterialMat', disc(room.range(0.2, 0.5), 12), tiltMatrix([x, 0.016, z], [-Math.PI / 2, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
      tile: 1.2,
    });
  }
  // Tufts of it standing up off the bone, which is what makes it read as growth
  // rather than as paint.
  for (let i = 0; i < 16; i++) {
    const x = SPINE_X + room.range(-1.2, 1.2);
    const z = room.range(-2.2, 2.4);
    room.geo('bacterialMat', cyl(0.02, 0.05, room.range(0.1, 0.26), 5), poseMatrix([x, room.range(0.05, 0.55), z]), {
      castShadow: false,
    });
  }

  /* --- the scavengers ---------------------------------------------------------------- */
  // Worms out of the bone itself, and a slick of them on the silt beside it.
  tubeWorms(room, SPINE_X + 0.9, -0.6, 9, 0.55, 0.75);
  tubeWorms(room, SPINE_X - 0.7, 1.4, 7, 0.45, 0.6);
  anemones(room, SPINE_X + 1.1, 0.02, 2.6, 4, 0.5);
  for (let i = 0; i < 11; i++) {
    // Hagfish: pale ropes lying across the bone, each one bent in the middle.
    const x = SPINE_X + room.range(-1.1, 1.1);
    const z = room.range(-2.0, 2.2);
    const a = room.range(0, Math.PI);
    room.geo('canvasPale', cyl(0.035, 0.045, room.range(0.5, 0.95), 5), tiltMatrix([x, room.range(0.08, 0.5), z], [Math.PI / 2 + room.range(-0.3, 0.3), a, 0]), {
      tile: 0.3,
      castShadow: false,
    });
    room.geo('canvasPale', ball(0.045, 6), poseMatrix([x + Math.sin(a) * 0.35, room.range(0.1, 0.5), z + Math.cos(a) * 0.35]), {
      castShadow: false,
    });
  }
  urchin(room, -0.9, 0.02, -1.4, 0.16);
  urchin(room, -0.6, 0.02, 2.6, 0.13);

  /* --- the room around it ------------------------------------------------------------ */
  // Out in the middle of the aisle rather than beside the east plate: at 0.57 m
  // of collider it would otherwise sit squarely in that hatchway's approach.
  boulder(room, 0.9, -2.4, 0.6, 0.8);
  room.solid('rockPale', [0.9, 0.66, 0.7], [3.3, 0, -1.4], -0.2, { tile: 0.9 });
  encrust(room, 3.3, 0.68, -1.4, 0.36, 8);
  encrust(room, 0.9, 0.62, -2.4, 0.5, 9);
  debris(room, 1.4, -2.4, 1.0, 8);
  debris(room, 0.9, 2.9, 0.9, 7);
  siltDrift(room, 1.9, 2.4, 1.2);

  /* --- the light ---------------------------------------------------------------------- */
  /**
   * One lamp is the pane behind the carcass. The other sits low, IN the mat,
   * east of the spine - under the ribs rather than over them, so the arches
   * throw their shadows up the walls and the ribcage reads as a vault.
   */
  const mat = new THREE.PointLight(0xc8e0b0, 13, ctx.dims.cellSize * 1.6, 2);
  mat.position.set(SPINE_X + 1.2, 0.45, 0.4);
  room.light(mat);
  swell(room, mat, 13, 0.15, 0.34);

  causticPatch(room, -0.4, 0.6, 1.8);
  causticPatch(room, 1.6, -1.6, 1.2);
  glowShaft(room, [-3.4, 2.5, 0], [-0.6, 0.6, 0.4], 2.8);
  bioMotes(room, -1.4, 1.5, 0.2, 2.2, 24);
  bioMotes(room, 1.8, 1.2, 2.0, 1.2, 10);
  room.geo('waterHaze', disc(2.6, 14), tiltMatrix([-1.0, ceilingHeight - 0.55, 0.2], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  const pane = room.lights[0];
  if (pane) swell(room, pane, 13, 0.12, 0.28);

  return room.finish();
}
