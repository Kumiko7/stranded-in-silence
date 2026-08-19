import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  bioMotes,
  bubbleColumn,
  debris,
  disc,
  encrust,
  glowShaft,
  ring,
  siltDrift,
  spike,
  swell,
  urchin,
} from '../kit/props';

/**
 * The Brine Pool - a lake at the bottom of the sea.
 *
 * Water so salty it will not mix, lying in a hollow with a shoreline and a
 * surface and small waves on it. There are mussels round the edge in a band a
 * metre wide and nothing at all inside, because anything that swims into a
 * brine pool dies in it and stays there.
 *
 * The pool is the light. It glows up out of the hollow, so every crystal on the
 * shore is lit from beneath and the whole room is upside down.
 */
export const brine: RoomBlueprint = {
  id: 'abyss.brine',
  nameKey: 'room.abyss.brine',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'west'),
  weight: 9,
  tags: ['abyss', 'quiet', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, -2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.9, 0.74, -1.4] },
      { position: [2.9, 0.52, -1.6] },
      { position: [0.4, 0, -2.2] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 0.2] },
      { position: [2.2, 0, 0.2] },
      { position: [0, 0, -2.6] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

const POOL_X = 0.2;
const POOL_Z = 2.55;
const POOL_R = 1.45;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, brine);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'salt',
    wall: 'rock',
    ceiling: 'rock',
    band: 'crust',
    bandHeight: 1.1,
    strip: 'bio',
    mouth: 'arch',
    ports: [{ side: 'north', kind: 'viewpane', scene: 'open', light: true }],
  });

  /* --- the pool ------------------------------------------------------------------- */
  /**
   * Depth is layers, exactly as in the moon pool: a black sheet down in the
   * hollow, a lit surface above it, and a hard bright rim where the brine meets
   * the salt. What makes it read as brine rather than as water is the RIM - a
   * brine pool has a visible shoreline with a lip on it, because the interface
   * is a real boundary between two liquids.
   */
  room.geo('waterDeep', disc(POOL_R * 1.02, 22), tiltMatrix([POOL_X, -0.32, POOL_Z], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });
  room.geo('brineSheen', disc(POOL_R, 24), tiltMatrix([POOL_X, -0.05, POOL_Z], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.6,
  });
  room.geo('lumenTeal', ring(POOL_R, 0.05, 26), tiltMatrix([POOL_X, -0.04, POOL_Z], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });
  // The lip: a bank of crystal all the way round, higher on the seaward side.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const lift = 0.12 + Math.max(0, Math.sin(a)) * 0.16;
    room.geo(
      'surface.salt',
      ball(room.range(0.16, 0.3), 7),
      tiltMatrix([POOL_X + Math.cos(a) * (POOL_R + 0.14), lift * 0.4, POOL_Z + Math.sin(a) * (POOL_R + 0.14)], [0, a, 0], [1, lift * 3.2, 1.5]),
      { tile: 0.6, castShadow: false },
    );
  }
  room.blockCircle(POOL_X, POOL_Z, POOL_R + 0.15);

  // Bladed crystal growing out of the shore, a shelf at a time.
  for (let i = 0; i < 22; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = POOL_R + 0.3 + Math.sqrt(room.rng()) * 1.3;
    const x = POOL_X + Math.cos(a) * r;
    const z = POOL_Z + Math.sin(a) * r;
    if (Math.abs(z) < 1.25) continue; // never in the east-west lane
    const len = room.range(0.14, 0.42);
    room.geo(
      'surface.salt',
      spike(len * 0.42, len, 4),
      tiltMatrix([x, len * 0.4, z], [room.range(-0.35, 0.35), room.range(0, 3), room.range(-0.35, 0.35)]),
      { tile: 0.4, castShadow: false },
    );
  }

  // The mussel bed: a dense band exactly on the shoreline, and nothing inside it.
  for (let i = 0; i < 40; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = POOL_R + room.range(0.18, 0.85);
    const size = room.range(0.05, 0.11);
    room.geo(
      'urchin',
      ball(size, 6),
      tiltMatrix([POOL_X + Math.cos(a) * r, size * 0.4, POOL_Z + Math.sin(a) * r], [0, a, room.range(-0.4, 0.4)], [1.7, 0.62, 1]),
      { tile: 0.3, castShadow: false },
    );
  }
  // And the ones that got it wrong: pale shells inside the rim, on the bottom.
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * (POOL_R - 0.25);
    room.geo('shellWhite', ball(room.range(0.05, 0.1), 6), tiltMatrix([POOL_X + Math.cos(a) * r, -0.26, POOL_Z + Math.sin(a) * r], [0, a, 0], [1.6, 0.5, 1]), {
      castShadow: false,
    });
  }
  bubbleColumn(room, POOL_X - 0.5, POOL_Z - 0.4, 0.02, ceilingHeight - 0.5, 13);
  bubbleColumn(room, POOL_X + 0.7, POOL_Z + 0.3, 0.02, ceilingHeight - 0.9, 9);

  /* --- the shore ------------------------------------------------------------------- */
  /**
   * Two salt shelves out of the side walls, low enough to put something on -
   * and both of them NORTH of the pool.
   *
   * Level with it they left a 0.85 m gap between shelf and shore, which sounds
   * like a corridor and is not one: a player is 0.64 m wide and the flood fill
   * could not get through, which stranded the whole southern half of the room.
   */
  room.solid('surface.salt', [1.2, 0.72, 0.9], [-2.9, 0, -1.4], 0.16, { tile: 0.9 });
  room.solid('surface.salt', [1.0, 0.5, 0.8], [2.9, 0, -1.6], -0.2, { tile: 0.9 });
  encrust(room, -2.9, 0.74, -1.4, 0.45, 8);
  encrust(room, 2.9, 0.52, -1.6, 0.4, 7);
  siltDrift(room, -2.4, -2.9, 1.4);
  siltDrift(room, 2.4, -3.0, 1.2);
  urchin(room, -1.4, 0.02, -2.4, 0.15);
  urchin(room, 1.8, 0.02, -3.0, 0.12);
  debris(room, 0.6, -2.4, 1.2, 9);
  debris(room, -2.9, 2.6, 0.8, 6);

  /* --- the light --------------------------------------------------------------------- */
  /**
   * The pool's lamp sits just ABOVE the surface rather than under it: sunk in
   * the brine it would light the inside of a hollow and nothing else, which is
   * the "light inside its own mesh" failure from ROOM_REVIEW.md §4. Fifteen
   * centimetres up, it throws the crystal shadows out across the whole floor.
   */
  const pool = new THREE.PointLight(0x50f0c0, 10, ctx.dims.cellSize * 1.8, 2);
  pool.position.set(POOL_X, 0.25, POOL_Z);
  room.light(pool);
  swell(room, pool, 10, 0.18, 0.3);

  glowShaft(room, [POOL_X, 0, POOL_Z], [POOL_X, ceilingHeight, POOL_Z], POOL_R * 1.7);
  bioMotes(room, POOL_X, 1.5, POOL_Z - 0.4, 1.8, 22);
  bioMotes(room, -1.6, 1.1, -1.4, 1.4, 12);

  // The ceiling over the pool, lit from below. Nothing else in the pack does
  // this, and it is the single cue that tells you which way up the room is.
  room.geo('surface.caustic', disc(2.2, 18), tiltMatrix([POOL_X, ceilingHeight - 0.5, POOL_Z], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 3.4,
  });

  const pane = room.lights[0];
  if (pane) swell(room, pane, 13, 0.12, 0.44);

  return room.finish();
}
