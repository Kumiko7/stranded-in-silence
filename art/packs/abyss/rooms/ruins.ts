import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  anemones,
  ball,
  bioMotes,
  boulder,
  causticPatch,
  cyl,
  debris,
  encrust,
  glowShaft,
  siltDrift,
  swell,
  urchin,
} from '../kit/props';

/**
 * The Drowned Court - the thing the station was built on top of.
 *
 * Four fluted columns in the corners, a fifth broken off at knee height, a
 * pavement of cut slabs under two centuries of silt, and a figure at the north
 * end with its face gone. Nobody at eleven thousand metres builds anything out
 * of stone, and the survey report does not mention this room.
 *
 * Lit from a seep in the floor between the columns, so everything is
 * underlit - which is what makes carved stone frightening rather than pretty.
 */
export const ruins: RoomBlueprint = {
  id: 'abyss.ruins',
  nameKey: 'room.abyss.ruins',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['abyss', 'landmark', 'quiet'],
  anchors: {
    chest: [{ position: [-3.25, 0, -3.1], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.9, 0.54, 2.9] },
      { position: [1.4, 0.7, 3.3] },
      { position: [-2.2, 0, -0.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.2] },
      { position: [-1.2, 0, -1.2] },
      { position: [1.4, 0, 0.9] },
    ],
    enemySpawn: [{ position: [3.2, 0, -3.2] }],
  },
  build,
};

/**
 * The four standing columns. Set in from the corners rather than against them:
 * every wall here may become a hatchway, so the corners are the only wall space
 * a chest can use and a column standing in one would take it.
 */
const COLUMNS: readonly (readonly [number, number, number])[] = [
  [-1.95, -1.95, 0.42],
  [1.95, -1.95, 0.4],
  [-1.95, 1.95, 0.41],
  [1.95, 1.95, 0.44],
];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, ruins);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'rock',
    wall: 'rock',
    ceiling: 'rock',
    band: 'crust',
    bandHeight: 1.5,
    strip: 'bio',
    mouth: 'arch',
  });

  /* --- the pavement --------------------------------------------------------------- */
  // Cut slabs under the silt, lifted and tilted where the floor moved. Laid as a
  // sparse grid rather than a full one: half of it is buried, which is what
  // stops it reading as tiling and starts it reading as a ruin.
  for (let i = 0; i < 16; i++) {
    const x = -3.0 + (i % 4) * 2.0 + room.range(-0.3, 0.3);
    const z = -3.0 + Math.floor(i / 4) * 2.0 + room.range(-0.3, 0.3);
    if (room.chance(0.3)) continue;
    room.geo(
      'rockPale',
      new THREE.BoxGeometry(room.range(1.1, 1.7), 0.14, room.range(1.1, 1.7)),
      tiltMatrix([x, 0.02, z], [room.range(-0.05, 0.05), room.range(0, 3), room.range(-0.05, 0.05)]),
      { tile: 1.6, castShadow: false, consume: true },
    );
  }
  siltDrift(room, -1.4, 2.4, 1.3);
  siltDrift(room, 2.2, -1.6, 1.1);

  /* --- the columns ----------------------------------------------------------------- */
  for (const [x, z, r] of COLUMNS) {
    // Base, plinth, fluted shaft in drums, capital, and a stub of architrave.
    room.geo('rockPale', cyl(r * 1.35, r * 1.5, 0.2, 12), poseMatrix([x, 0.1, z]), { tile: 0.8 });
    room.geo('rockPale', new THREE.BoxGeometry(r * 2.9, 0.16, r * 2.9), poseMatrix([x, 0.28, z]), { tile: 0.8, consume: true });
    const drums = 5;
    for (let d = 0; d < drums; d++) {
      const h = (ceilingHeight - 0.9) / drums;
      const rr = r * (1 - d * 0.035);
      room.geo(
        'rockPale',
        cyl(rr * 0.96, rr, h * 0.97, 14),
        tiltMatrix([x + room.range(-0.03, 0.03), 0.36 + h * (d + 0.5), z + room.range(-0.03, 0.03)], [0, room.range(0, 3), 0]),
        { tile: 1.0 },
      );
    }
    // Flutes: eight shallow grooves, faked as pale ribs standing off the shaft.
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;
      room.geo(
        'rockDark',
        cyl(0.035, 0.035, ceilingHeight - 1.0, 4),
        poseMatrix([x + Math.cos(a) * r * 0.98, 0.36 + (ceilingHeight - 1.0) / 2, z + Math.sin(a) * r * 0.98]),
        { tile: 0.5, castShadow: false },
      );
    }
    room.geo('rockPale', cyl(r * 1.25, r * 0.95, 0.22, 14), poseMatrix([x, ceilingHeight - 0.5, z]), {
      tile: 0.6,
    });
    room.geo('rockPale', new THREE.BoxGeometry(r * 3.1, 0.28, r * 3.1), poseMatrix([x, ceilingHeight - 0.25, z]), { tile: 0.8, consume: true });
    encrust(room, x, 0.3, z, r * 1.4, 8);
    room.blockCircle(x, z, r + 0.12);
  }
  // The fifth, broken off at knee height, out in the open.
  room.geo('rockPale', cyl(0.4, 0.46, 0.52, 14), tiltMatrix([2.9, 0.26, 2.9], [0.06, 0.4, 0.03]), {
    tile: 0.8,
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    room.geo('rockPale', ball(room.range(0.08, 0.16), 6), poseMatrix([2.9 + Math.cos(a) * 0.4, 0.52, 2.9 + Math.sin(a) * 0.38]), {
      tile: 0.4,
    });
  }
  // Its drum, on the floor beside it, half sunk.
  room.geo('rockPale', cyl(0.42, 0.42, 0.6, 14), tiltMatrix([1.4, 0.36, 3.3], [Math.PI / 2, 0.7, 0.1]), {
    tile: 0.8,
  });

  /* --- the figure ------------------------------------------------------------------- */
  /**
   * A standing figure on a plinth, dead centre, facing the aft hatch.
   *
   * It stands in the middle because every wall in this room may become a
   * hatchway, and a set piece against a wall is a set piece in a doorway one map
   * in four. The doorway checks are 1.2 m in; this is 2.8 m from all of them.
   *
   * Built out of very few shapes and no face: the moment a statue has features
   * it becomes a model of a person, and what this needs to be is a person-shaped
   * absence.
   */
  room.solid('rockPale', [1.2, 0.62, 1.0], [0, 0, 0], 0.06, { tile: 0.9 });
  room.geo('rockPale', cyl(0.3, 0.42, 1.25, 12), tiltMatrix([0, 1.24, 0], [0, 0.3, 0.03]), {
    tile: 0.8,
  });
  // Drapery: three shallow folds down the front of the shaft.
  for (const s of [-0.18, 0.02, 0.2]) {
    room.geo('rockDark', cyl(0.05, 0.07, 1.1, 5), tiltMatrix([s, 1.22, 0.35], [0.04, 0, room.range(-0.05, 0.05)]), {
      tile: 0.4,
      castShadow: false,
    });
  }
  // Shoulders, and a head that is mostly gone.
  room.geo('rockPale', ball(0.36, 10), tiltMatrix([0, 1.88, 0], [0, 0.3, 0], [1.35, 0.6, 0.9]), {
    tile: 0.6,
  });
  room.geo('rockPale', ball(0.19, 9), tiltMatrix([0.02, 2.16, 0.03], [0.1, 0.4, 0.08], [1, 1.15, 0.95]), {
    tile: 0.5,
  });
  room.geo('rockDark', ball(0.14, 8), tiltMatrix([0.03, 2.2, 0.19], [0, 0, 0], [1, 1, 0.5]), {
    tile: 0.4,
    castShadow: false,
  });
  // One arm still attached, hanging; the other broken at the shoulder.
  room.geo('rockPale', cyl(0.08, 0.1, 0.9, 7), tiltMatrix([-0.34, 1.4, 0.13], [0.1, 0, 0.14]), {
    tile: 0.4,
  });
  encrust(room, 0, 0.64, 0, 0.55, 9);

  /* --- the seep --------------------------------------------------------------------- */
  /**
   * A crack in the pavement with something luminous coming out of it. It is the
   * room's only light source and it is in the FLOOR, so every column is lit from
   * below and every one of them throws a shadow up the wall behind it.
   */
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const x = -1.6 + t * 3.2 + room.range(-0.2, 0.2);
    const z = 1.45 + Math.sin(t * Math.PI) * 0.45 + room.range(-0.15, 0.15);
    // Water, not neon: `brineSheen` is glossy and emissive at about a third of
    // `lumenTeal`, which is the difference between a seep and a strip light let
    // into the floor.
    room.geo('brineSheen', new THREE.BoxGeometry(room.range(0.3, 0.7), 0.02, room.range(0.05, 0.14)), tiltMatrix([x, 0.025, z], [0, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
      consume: true,
    });
    room.geo('rockDark', new THREE.BoxGeometry(room.range(0.4, 0.8), 0.06, 0.26), tiltMatrix([x, 0, z], [0, room.range(0, 3), 0]), {
      tile: 0.4,
      castShadow: false,
      consume: true,
    });
  }
  causticPatch(room, -1.4, 1.4, 1.6);
  glowShaft(room, [0, 0.1, 1.6], [0, ceilingHeight, 1.6], 2.0);
  bioMotes(room, 0, 1.4, 1.5, 2.0, 22);

  boulder(room, -3.15, 1.9, 0.45, 0.6);
  anemones(room, 2.9, 0.56, 2.9, 3, 0.3);
  urchin(room, -2.2, 0.02, -0.4, 0.14);
  urchin(room, 1.2, 0.02, -3.2, 0.12);
  debris(room, 1.0, -1.0, 1.2, 9);
  debris(room, -2.6, 0.9, 0.9, 7);

  const seep = new THREE.PointLight(0x3fe0c0, 11, ctx.dims.cellSize * 1.7, 2);
  seep.position.set(0, 0.35, 1.6);
  room.light(seep);
  swell(room, seep, 11, 0.2, 0.42);

  /**
   * A second, dimmer one high and behind the figure, so it has a rim from the
   * fore hatch. Without it the statue is a black column against a black wall
   * from three of the four doorways, which is the "black lump in a black
   * chamber" failure from ROOM_REVIEW.md §4.
   */
  const behind = new THREE.PointLight(0x2f7fd0, 6, ctx.dims.cellSize * 1.2, 2);
  behind.position.set(0.5, 2.6, -1.9);
  room.light(behind);
  swell(room, behind, 6, 0.14, 0.66);

  return room.finish();
}
