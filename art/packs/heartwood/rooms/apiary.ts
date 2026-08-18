import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  bench,
  candles,
  cyl,
  disc,
  glowPool,
  hanging,
  litter,
  mothLantern,
  motes,
  phial,
  quad,
  ring,
  shelf,
  stool,
  spike,
} from '../kit/props';

/**
 * The Comb Gallery - somebody kept bees in here, and then the bees kept the
 * gallery.
 *
 * Three straw skeps on a plank stand down the west wall, a rack of drawn frames
 * beside them, a smoker gone cold on the bench. Behind all of it the comb has
 * come out of the wall and built itself across two metres of gallery in slabs
 * the size of doors, lit from inside by what is still in the cells.
 *
 * The comb is the room's only real light and it is a light that hums. Nothing in
 * here is hostile and everything in here is the wrong size.
 */
export const apiary: RoomBlueprint = {
  id: 'heartwood.apiary',
  nameKey: 'room.heartwood.apiary',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['bower', 'landmark'],
  anchors: {
    chest: [{ position: [2.9, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [3.3, 0, 2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.42, 0.86, -2.2] },
      { position: [3.5, 1.26, -1.0] },
      { position: [-2.0, 0, 3.3] },
    ],
    patrolPoint: [
      { position: [0.3, 0, 0.2] },
      { position: [-1.9, 0, 2.9] },
      { position: [2.5, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, apiary);
  room.shell({
    floor: 'plank',
    wall: 'wicker',
    ceiling: 'rafters',
    band: 'plank',
    bandHeight: 1.0,
    register: 'comb',
    mouth: 'carved',
    ports: [{ side: 'west', kind: 'hive', light: true }],
  });

  /* --- the wild comb --------------------------------------------------------- */
  /**
   * Slabs of comb hanging off the wall like a set of curtains seen edge-on.
   *
   * They are the room's light source, so the geometry is deliberately simple and
   * the work is done by the material: the honey in the cells is emissive, the
   * wax around it is not, and the two together are what makes a slab read as
   * full rather than as a glowing board.
   */
  for (let i = 0; i < 5; i++) {
    const z = -1.7 + i * 0.86;
    const w = room.range(0.9, 1.5);
    const h = room.range(1.1, 2.0);
    const x = -3.3 + room.range(0, 0.5);
    const top = 2.9 - room.range(0, 0.3);
    // The slab: wax at the edges, comb in the middle, hung from a fillet of wax
    // stuck to the wall.
    room.box('wax', [0.16, 0.1, w + 0.12], [x, top, z], 0, { tile: 0.2 });
    room.box('comb', [0.13, h, w], [x, top - h, z], 0, { tile: 0.3 });
    room.box('wax', [0.16, h * 0.16, w + 0.08], [x, top - h, z], 0, { tile: 0.2 });
    // A ragged bottom edge, which is what stops a slab of comb being a plank.
    for (let k = 0; k < 5; k++) {
      const t = -w / 2 + (w * (k + 0.5)) / 5;
      room.geo('wax', ball(room.range(0.06, 0.12), 6), tiltMatrix([x, top - h - room.range(0, 0.12), z + t], [0, k, 0], [1, 1.3, 1]), { tile: 0.15, castShadow: false, receiveShadow: false });
    }
    // Bees on it, and the ones that have fallen off underneath.
    for (let k = 0; k < 4; k++) {
      const by = top - room.range(0.1, h);
      room.geo('chitin', ball(0.045, 5), tiltMatrix([x + 0.1, by, z + room.range(-w / 2, w / 2)], [0, room.range(0, 3), 0], [0.9, 0.9, 2.0]), { tile: 0.1, castShadow: false, receiveShadow: false });
    }
  }
  for (let i = 0; i < 12; i++) {
    room.geo('chitin', ball(0.04, 5), tiltMatrix([room.range(-3.5, -2.2), 0.03, room.range(-2.4, 2.6)], [0, room.range(0, 3), 0], [0.9, 0.5, 2.0]), { tile: 0.1, castShadow: false, receiveShadow: false });
  }
  // The honey that has run down the wall and pooled on the boards.
  for (let i = 0; i < 3; i++) {
    room.geo('surface.sap', cyl(0.03, 0.05, room.range(0.5, 1.3), 5), poseMatrix([-3.15, room.range(0.4, 0.9), -1.4 + i * 1.3]), { tile: 0.2, castShadow: false, receiveShadow: false });
  }
  room.geo('surface.sap', disc(0.9, 14), tiltMatrix([-3.0, 0.014, 0.3], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('surface.sap', disc(0.5, 12), tiltMatrix([-2.4, 0.014, 1.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- the beekeeping -------------------------------------------------------- */
  // Three skeps on a stand. A skep is a dome of coiled straw, so it is built as
  // stacked rings of decreasing radius - the coil is the whole silhouette.
  bench(room, -2.6, -2.6, 1.9, Math.PI / 2, 0.8);
  for (let i = 0; i < 3; i++) {
    const sz = -3.3 + i * 0.72;
    const sh = room.range(0.44, 0.6);
    for (let k = 0; k < 7; k++) {
      const t = k / 7;
      const r = 0.28 * Math.sqrt(1 - t * t * 0.85);
      room.geo('surface.wicker', cyl(r * 0.94, r, sh / 7 + 0.01, 12, true), poseMatrix([-2.6, 0.86 + t * sh, sz]), { tile: 0.2, castShadow: k === 0 });
    }
    room.geo('surface.wicker', ball(0.1, 7), tiltMatrix([-2.6, 0.86 + sh, sz], [0, 0, 0], [1, 0.8, 1]), { tile: 0.15, castShadow: false });
    // The flight hole, cut low, with two bees at it.
    room.box('timberDark', [0.05, 0.07, 0.14], [-2.35, 0.92, sz], 0, { tile: 0.1 });
  }
  // A frame rack on the east wall: drawn comb standing on edge in a slot rack.
  shelf(room, 'east', 1.0, 1.24, 1.7, 0.34);
  for (let i = 0; i < 6; i++) {
    const fz = -1.8 + i * 0.28;
    room.box('timber', [0.3, 0.5, 0.03], [3.5, 1.29, fz], 0, { tile: 0.2 });
    if (i !== 2) room.box(i % 2 ? 'comb' : 'wax', [0.24, 0.4, 0.02], [3.5, 1.33, fz], 0, { tile: 0.15 });
  }

  // The smoker, gone cold, and the veil hood over the bench end.
  room.geo('copper', cyl(0.09, 0.11, 0.24, 9), poseMatrix([-2.45, 0.92, -2.6]), { tile: 0.15, castShadow: false });
  room.geo('copper', spike(0.06, 0.14, 7), poseMatrix([-2.45, 1.1, -2.6]), { tile: 0.1, castShadow: false });
  room.geo('linen', quad(0.28, 0.3), tiltMatrix([-2.45, 1.06, -2.6], [0, 0.6, 0]), { castShadow: false, receiveShadow: false });
  hanging(room, 'north', 2.5, 1.5, 0.9, 1.4, 'linen');

  stool(room, -1.85, -1.5, 0.44);
  basket(room, -2.0, 3.3, 0.28, 0.42, false);
  basket(room, -2.6, 3.5, 0.2, 0.28, true);
  for (let i = 0; i < 4; i++) {
    phial(room, -3.4, 1.06, -1.0 + i * 0.3, 0.045, 0.15, i === 1 || i === 2);
  }
  litter(room, 2.6, 2.0, 0.9, 6);

  /* --- light ------------------------------------------------------------------- */
  // The hive port is one lamp and the shell spent it. The second sits in front of
  // the wild comb rather than behind it - a light inside a glowing slab lights
  // the inside of the slab and nothing else (docs/art/ROOM_REVIEW.md).
  const hum = new THREE.PointLight(0xffb452, 9, ctx.dims.cellSize * 1.5, 2);
  hum.position.set(-2.3, 1.7, 0.3);
  room.shadowLight(hum);
  const phase = room.range(0, 20);
  room.tick((t) => {
    hum.intensity = 9 * (1 + 0.07 * Math.sin(t * 0.9 + phase) + 0.03 * Math.sin(t * 14 + phase));
  });

  mothLantern(room, 'east', -2.4, 2.2, false);
  candles(room, -2.6, 0.84, -1.9, 2, 0.1);
  motes(room, -2.4, 0.2, 1.9, 2.5, 18, 'pollen');
  glowPool(room, -2.6, 0.3, 2.8);
  glowPool(room, -2.6, -2.9, 1.6);

  // Bees in the air. Nine of them, at head height, and they are the size of a
  // thumb - which is the room's only actual statement.
  for (let i = 0; i < 9; i++) {
    const bx = room.range(-3.2, 2.4);
    const by = room.range(1.2, 2.6);
    const bz = room.range(-3.0, 3.0);
    const yaw = room.range(0, Math.PI * 2);
    room.geo('chitin', ball(0.045, 5), tiltMatrix([bx, by, bz], [0, yaw, 0], [0.9, 0.9, 2.0]), { tile: 0.1, castShadow: false, receiveShadow: false });
    room.geo('lumenSap', ball(0.028, 4), tiltMatrix([bx, by, bz + 0.04], [0, yaw, 0], [0.85, 0.85, 1.3]), { castShadow: false, receiveShadow: false });
    for (const s of [-1, 1]) {
      room.geo('silkProp', quad(0.11, 0.045), tiltMatrix([bx + s * 0.05, by + 0.03, bz - 0.02], [1.2, yaw + s * 0.5, 0]), { castShadow: false, receiveShadow: false });
    }
  }

  // A ring of wax stuck to the ceiling where the swarm hung before it moved in.
  room.geo('wax', ring(0.55, 0.09, 14), tiltMatrix([-1.6, ctx.dims.ceilingHeight - 0.18, 0.6], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });

  return room.finish();
}
