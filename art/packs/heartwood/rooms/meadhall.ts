import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  bench,
  candles,
  chair,
  cupboard,
  cyl,
  disc,
  glowPool,
  hanging,
  litter,
  mothLantern,
  motes,
  pot,
  quad,
  ring,
  spike,
  strut,
  table,
} from '../kit/props';

/**
 * The Long Feast - a table laid for people who never got up from it.
 *
 * Six metres of trestle down the east band with horns and trenchers still on it,
 * chairs pushed back at odd angles, and honey over everything - poured down the
 * legs of the table, set in sheets on the boards, filling one of the cups to the
 * brim and past it. A comb has been built into the wall behind the high seat and
 * it is what lights the room.
 *
 * The wasps are the size of a thumb and there are five of them, which is exactly
 * four more than reads as an accident.
 */
export const meadHall: RoomBlueprint = {
  id: 'heartwood.meadhall',
  nameKey: 'room.heartwood.meadhall',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'west', 'south'),
  weight: 9,
  tags: ['bower'],
  anchors: {
    chest: [{ position: [-2.4, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [-3.3, 0, 2.9], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.5, 0.89, -1.2] },
      { position: [2.5, 0.89, 1.6] },
      { position: [-2.45, 0, 1.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.3] },
      { position: [-2.4, 0, -1.8] },
      { position: [0.7, 0, 3.0] },
    ],
    enemySpawn: [{ position: [3.3, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, meadHall);
  room.shell({
    floor: 'plank',
    wall: 'heart',
    ceiling: 'rafters',
    band: 'heart',
    bandHeight: 1.1,
    rail: true,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'east', kind: 'hive', light: true }],
  });

  /* --- the table -------------------------------------------------------------- */
  // Six metres of it, running north-south in the east band, which is the only
  // part of a three-walled room guaranteed to stay free floor.
  table(room, 2.5, 0, 5.6, 1.05, 0.82, Math.PI / 2);
  bench(room, 1.78, -0.4, 4.4, Math.PI / 2, 0.46);

  // The high seat at the north end, under the comb. Empty, and pulled out.
  chair(room, 2.5, -3.1, 0);
  room.box('weaveGreen', [0.5, 0.03, 0.42], [2.5, 0.5, -3.1], 0, { tile: 0.2 });

  // Four more chairs down the east side, none of them square to the table. A row
  // of tidy chairs is a refectory; a row of shoved-back ones is an interruption.
  for (let i = 0; i < 4; i++) {
    chair(room, 3.28, -1.8 + i * 1.35, Math.PI + room.range(-0.5, 0.5));
  }

  /* --- what is on it ---------------------------------------------------------- */
  for (let i = 0; i < 9; i++) {
    const tz = -2.6 + i * 0.62;
    const kind = i % 3;
    if (kind === 0) {
      // A drinking horn on a stand, which is the one silhouette on this table
      // that says feast from across the room.
      room.geo('bone', cyl(0.035, 0.075, 0.34, 8), tiltMatrix([2.55, 0.98, tz], [0.9, room.range(0, 3), 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
      room.geo('copper', ring(0.038, 0.012, 8), tiltMatrix([2.55, 1.1, tz], [0.9, 0, 0]), { tile: 0.1, castShadow: false, receiveShadow: false });
    } else if (kind === 1) {
      pot(room, 2.4 + room.range(-0.2, 0.2), 0.85, tz, 0.11, 0.2, 'pottery');
    } else {
      // A trencher with something on it that has gone to fur.
      room.geo('timberPale', cyl(0.14, 0.13, 0.03, 10), poseMatrix([2.6, 0.86, tz]), { tile: 0.1, castShadow: false, receiveShadow: false });
      room.geo('mycelium', ball(0.075, 6), tiltMatrix([2.6, 0.9, tz], [0, room.range(0, 3), 0], [1.2, 0.6, 1.1]), { tile: 0.1, castShadow: false, receiveShadow: false });
    }
  }
  // A great bowl at the middle, brim-full and over.
  room.geo('copper', cyl(0.3, 0.2, 0.2, 14), poseMatrix([2.45, 0.92, 0.3]), { tile: 0.25, castShadow: false });
  room.geo('surface.sapHot', disc(0.29, 14), tiltMatrix([2.45, 1.0, 0.3], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /**
   * The honey. Sheets of it set on the table top, runs down the legs, and a
   * pool on the boards - all of it the same material at three intensities, so
   * they read as one substance at different depths rather than as three props.
   */
  for (const [hx, hz, r] of [
    [2.45, 0.9, 0.55],
    [2.2, -1.4, 0.34],
    [2.7, 2.1, 0.42],
  ] as const) {
    room.geo('surface.sap', disc(r, 12), tiltMatrix([hx, 0.855, hz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  }
  for (let i = 0; i < 4; i++) {
    const dz = -1.9 + i * 1.3;
    room.geo('surface.sap', cyl(0.02, 0.035, room.range(0.3, 0.7), 5), poseMatrix([2.06, 0.5, dz]), { tile: 0.15, castShadow: false, receiveShadow: false });
    room.geo('surface.sap', spike(0.03, 0.1, 5), poseMatrix([2.06, 0.14, dz]), { castShadow: false, receiveShadow: false });
  }
  /**
   * The pools on the boards.
   *
   * Overlapping lobes rather than one disc each: a single circle of an emissive
   * material lying flat reads as an orange dot painted on the floor, which is
   * the first-pass version of this room and the same failure as an unmasked
   * additive wash one material family over (docs/art/ART_GUIDE.md 4).
   */
  for (const [px, pz, r] of [
    [2.1, 0.6, 0.5],
    [1.55, -1.9, 0.34],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const a = room.range(0, Math.PI * 2);
      const d = i === 0 ? 0 : room.range(r * 0.3, r * 0.8);
      room.geo(
        'surface.sap',
        disc(r * room.range(0.42, 0.78), 12),
        tiltMatrix([px + Math.cos(a) * d, 0.013 + i * 0.0006, pz + Math.sin(a) * d], [-Math.PI / 2, 0, 0]),
        { castShadow: false, receiveShadow: false },
      );
    }
  }

  /* --- the wasps -------------------------------------------------------------- */
  // Five, at chest height, and each one is the length of a thumb. Nothing else
  // in the room has to say anything.
  for (let i = 0; i < 5; i++) {
    const wx = room.range(1.5, 3.4);
    const wy = room.range(1.1, 2.3);
    const wz = room.range(-3.0, 3.0);
    const yaw = room.range(0, Math.PI * 2);
    room.geo('chitin', ball(0.05, 6), tiltMatrix([wx, wy, wz], [0, yaw, 0], [0.9, 0.9, 2.1]), { tile: 0.1, castShadow: false, receiveShadow: false });
    room.geo('lumenSap', ball(0.032, 5), tiltMatrix([wx, wy, wz + 0.05], [0, yaw, 0], [0.85, 0.85, 1.4]), { castShadow: false, receiveShadow: false });
    for (const s of [-1, 1]) {
      room.geo('silkProp', quad(0.13, 0.05), tiltMatrix([wx + s * 0.06, wy + 0.03, wz - 0.02], [1.2, yaw + s * 0.5, 0]), { castShadow: false, receiveShadow: false });
    }
  }

  /* --- the rest of the room ---------------------------------------------------- */
  // The west half is bare boards on purpose: this is a room you walk the length
  // of before you understand it.
  // Well clear of the west doorway: this room offers that wall, so the lane
  // |z| < 1.5 has to stay walkable whichever way the generator turns the room.
  cupboard(room, 'west', -2.4, 1.4, 1.9, 0.44);
  for (let i = 0; i < 4; i++) {
    room.geo('pottery', cyl(0.07, 0.055, 0.17, 8), poseMatrix([-3.42, 2.06, -3.0 + i * 0.34]), { tile: 0.1, castShadow: false, receiveShadow: false });
  }
  basket(room, -2.9, 1.7, 0.3, 0.44, false);
  basket(room, -3.3, -2.4, 0.22, 0.3, true);
  hanging(room, 'south', -1.2, 1.5, 1.6, 1.5, 'weaveGreen');
  litter(room, -1.6, 3.3, 0.9, 7);

  /* --- light -------------------------------------------------------------------- */
  // The comb in the wall is the room's warm source and the shell already spent
  // it. The second lamp is a candle branch on the table - low, so the honey and
  // the horns throw long across the boards rather than being lit from above.
  const branch = new THREE.PointLight(0xffbe6a, 8, ctx.dims.cellSize * 1.4, 2);
  branch.position.set(2.45, 1.25, -1.9);
  room.shadowLight(branch);
  const phase = room.range(0, 20);
  room.tick((t) => {
    branch.intensity = 8 * (1 + 0.14 * (Math.sin(t * 5.1 + phase) * 0.6 + Math.sin(t * 11.3 + phase) * 0.4));
  });
  // The branch itself, standing under its own lamp.
  room.geo('copper', cyl(0.05, 0.09, 0.3, 8), poseMatrix([2.45, 1.0, -1.9]), { tile: 0.2, castShadow: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    strut(room, 'copper', [2.45, 1.12, -1.9], [2.45 + Math.cos(a) * 0.22, 1.3, -1.9 + Math.sin(a) * 0.22], 0.014, 5, { castShadow: false, receiveShadow: false });
    candles(room, 2.45 + Math.cos(a) * 0.22, 1.3, -1.9 + Math.sin(a) * 0.22, 1, 0.02);
  }

  mothLantern(room, 'west', -2.2, 2.2, false);
  motes(room, 2.4, 0, 1.6, 2.4, 14, 'pollen');
  glowPool(room, 2.5, -1.9, 2.4);
  glowPool(room, 2.2, 1.0, 1.8);

  return room.finish();
}
