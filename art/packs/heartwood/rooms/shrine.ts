import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  candles,
  carvedPanel,
  cyl,
  disc,
  glowPool,
  hanging,
  limb,
  litter,
  mossPatch,
  motes,
  phial,
  pot,
  quad,
  ring,
  spike,
  strut,
} from '../kit/props';

/**
 * The Antler Shrine - a place somebody made offerings to something that was
 * already living in the wall.
 *
 * A stepped altar of stone and heartwood against the south wall, and standing on
 * it a rack of antlers the width of a doorway, bound to a post with cord and
 * grown into with moss. There are eleven bowls of set resin on the steps, and
 * every one of them was full once. The offerings in the lowest row are teeth.
 *
 * The room's whole lighting design is that the idol is lit from BELOW by the
 * votives, so the antlers throw upward across the vault and the shadow of the
 * rack is bigger than the rack.
 */
export const shrine: RoomBlueprint = {
  id: 'heartwood.shrine',
  nameKey: 'room.heartwood.shrine',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['bower', 'landmark'],
  anchors: {
    chest: [{ position: [3.3, 0, 1.9], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.7, 0.98, 3.1] },
      { position: [-1.5, 0.52, 3.42] },
      { position: [3.1, 0, 3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.5, 0, -1.4] },
      { position: [2.6, 0, 1.2] },
    ],
    enemySpawn: [{ position: [3.3, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, shrine);
  room.shell({
    floor: 'plank',
    wall: 'heart',
    ceiling: 'vault',
    band: 'clay',
    bandHeight: 0.72,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'south', kind: 'niche', light: true }],
  });

  /* --- the altar ------------------------------------------------------------- */
  // Three steps in the south band, which this room never opens. Each step is
  // narrower and each is a different material, so the stack reads as built
  // rather than as one block with lines on it.
  room.solid('stone', [4.4, 0.34, 1.1], [0, 0, 3.35], 0, { tile: 0.6, castShadow: true });
  room.solid('timberDark', [3.5, 0.3, 0.85], [0, 0.34, 3.4], 0, { tile: 0.5 });
  room.solid('surface.heart', [2.5, 0.34, 0.7], [0, 0.64, 3.45], 0, { tile: 0.5 });
  // The chamfer under each nosing: the one detail that stops a step being a slab.
  for (const [w, y, d] of [
    [4.5, 0.3, 1.16],
    [3.6, 0.6, 0.91],
    [2.6, 0.94, 0.76],
  ] as const) {
    room.box('timber', [w, 0.05, d], [0, y, 3.4], 0, { tile: 0.3 });
  }

  /**
   * The idol: a post, a rack of antlers bound to it, and a wrapping of cord and
   * cloth where a body would be.
   *
   * The antlers are the silhouette, so they are built thick enough to survive
   * being one - a rack of 2 cm tines is a black scribble from any doorway
   * (docs/art/ROOM_REVIEW.md).
   */
  const postX = 0;
  const baseY = 0.98;
  room.geo('timberDark', cyl(0.09, 0.14, 1.5, 9), poseMatrix([postX, baseY + 0.75, 3.45]), { tile: 0.4, castShadow: true });
  // The bindings, which is what says somebody put this here.
  for (let i = 0; i < 5; i++) {
    room.geo('weave', ring(0.11 + i * 0.005, 0.022, 9), tiltMatrix([postX, baseY + 0.35 + i * 0.2, 3.45], [Math.PI / 2 + room.range(-0.1, 0.1), 0, 0]), { tile: 0.15, castShadow: false });
  }
  // A shroud hung on the post, in folds. A smooth cylinder of cloth is a drum.
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + (i / 4) * 1.8;
    room.geo('linen', quad(0.24, 0.9), tiltMatrix([postX + Math.sin(a) * 0.18, baseY + 0.45, 3.45 - Math.cos(a) * 0.18], [0, a + Math.PI, (i % 2 ? 1 : -1) * 0.08]), { castShadow: false, receiveShadow: false });
  }
  // The rack: two beams with brow, bez and four tines each, thickened toward the
  // skull the way an antler really is.
  for (const s of [-1, 1]) {
    const tip = limb(room, 'bone', [postX + s * 0.06, baseY + 1.42, 3.45], [postX + s * 0.78, baseY + 2.0, 2.95], 0.055, 0.03, 0.09, s * 5, 5, { tile: 0.3, castShadow: true });
    for (let i = 0; i < 4; i++) {
      const t = 0.18 + i * 0.24;
      const from: [number, number, number] = [postX + s * (0.06 + 0.72 * t), baseY + 1.42 + 0.58 * t, 3.45 - 0.3 * t];
      limb(
        room,
        'bone',
        from,
        [from[0] + s * (0.14 + i * 0.05), from[1] + 0.3 + i * 0.09, from[2] - 0.16 - i * 0.06],
        0.032,
        0.014,
        0.05,
        s * 7 + i,
        4,
        { tile: 0.2, castShadow: true },
      );
    }
    // A palm at the end of each beam, which is what makes a rack read as huge.
    room.geo('bone', ball(0.16, 8), tiltMatrix([tip[0], tip[1], tip[2]], [0.3, s * 0.5, 0], [1.3, 0.28, 0.9]), { tile: 0.2, castShadow: true });
  }
  // Moss growing on the rack, and one green shoot out of it. Whatever this is,
  // it has been standing here a very long time.
  mossPatch(room, postX, baseY + 1.5, 3.45, 0.35, 5);
  for (let i = 0; i < 3; i++) {
    strut(room, 'vine', [postX + room.range(-0.3, 0.3), baseY + 1.4, 3.45], [postX + room.range(-0.5, 0.5), baseY + 1.9, 3.05], 0.012, 4, { castShadow: false, receiveShadow: false });
  }
  room.blockCircle(postX, 3.45, 0.3);

  /* --- the offerings ---------------------------------------------------------- */
  // Eleven bowls on the steps, most of them empty. A full row would read as
  // decoration; a row with three left in it reads as an ending.
  for (let i = 0; i < 7; i++) {
    const bx = -1.5 + i * 0.5;
    const lit = i === 1 || i === 4 || i === 5;
    room.geo('pottery', cyl(0.09, 0.06, 0.07, 9), poseMatrix([bx, 1.02, 3.2]), { tile: 0.1, castShadow: false });
    if (lit) {
      room.geo('surface.sapHot', disc(0.08, 9), tiltMatrix([bx, 1.06, 3.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
      room.geo('flame', spike(0.022, 0.07, 5), poseMatrix([bx, 1.1, 3.2]), { castShadow: false, receiveShadow: false });
    }
  }
  for (let i = 0; i < 4; i++) {
    const bx = -1.0 + i * 0.66;
    room.geo('pottery', cyl(0.11, 0.075, 0.08, 9), poseMatrix([bx, 0.68, 3.05]), { tile: 0.1, castShadow: false });
    // Teeth. Small, pale, and there is no other reading of a bowl of them.
    for (let k = 0; k < 5; k++) {
      room.geo('bone', spike(0.014, 0.045, 4), tiltMatrix([bx + room.range(-0.06, 0.06), 0.72, 3.05 + room.range(-0.05, 0.05)], [room.range(-1.4, 1.4), room.range(0, 3), room.range(-1.4, 1.4)]), { castShadow: false, receiveShadow: false });
    }
  }
  // Two candle stands flanking the altar, on the floor, which is where the light
  // has to come from for the antlers to throw upward.
  for (const s of [-1, 1]) {
    const cx = s * 1.45;
    room.geo('timberDark', disc(0.2, 10), tiltMatrix([cx, 0.02, 2.55], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    room.geo('timberDark', cyl(0.045, 0.075, 0.86, 7), poseMatrix([cx, 0.45, 2.55]), { tile: 0.2, castShadow: true });
    room.geo('copper', cyl(0.14, 0.09, 0.07, 10), poseMatrix([cx, 0.9, 2.55]), { tile: 0.1, castShadow: false });
    candles(room, cx, 0.93, 2.55, 4, 0.08);
    room.blockCircle(cx, 2.55, 0.16);
  }

  /* --- the rest of the room ---------------------------------------------------- */
  carvedPanel(room, 'east', 2.4, 1.35, 1.7, 1.2, 2);
  carvedPanel(room, 'north', -2.4, 1.35, 1.7, 1.2, 2);
  hanging(room, 'west', -2.6, 1.3, 1.2, 1.6, 'weaveGreen');
  pot(room, 3.1, 0, 3.25, 0.24, 0.46);
  pot(room, -3.35, 0, 0.6, 0.19, 0.34, 'verdigris');
  for (let i = 0; i < 5; i++) {
    phial(room, -1.5 + i * 0.28, 0.52, 3.42, 0.04, 0.13, i === 3);
  }
  // Cord strung across the room with knotted offerings on it - hair, teeth, a
  // ring - which is the detail that says people came here in numbers.
  for (const [z, sag] of [[-0.4, 0.2], [-1.6, 0.14]] as const) {
    for (let i = 0; i < 6; i++) {
      const t0 = -3.4 + i * 1.15;
      const t1 = t0 + 1.15;
      const y0 = 2.5 - Math.sin(((i + 0.0) / 6) * Math.PI) * sag;
      const y1 = 2.5 - Math.sin(((i + 1.0) / 6) * Math.PI) * sag;
      strut(room, 'strand', [t0, y0, z], [t1, y1, z], 0.008, 4, { castShadow: false, receiveShadow: false });
    }
    for (let i = 0; i < 5; i++) {
      const kx = room.range(-3.0, 3.0);
      const drop = room.range(0.15, 0.45);
      room.geo('strand', cyl(0.006, 0.006, drop, 4), poseMatrix([kx, 2.4 - drop / 2, z]), { castShadow: false, receiveShadow: false });
      room.geo(i % 2 ? 'bone' : 'weave', ball(room.range(0.03, 0.06), 5), tiltMatrix([kx, 2.4 - drop, z], [0, i, 0], [0.8, 1.5, 0.8]), { castShadow: false, receiveShadow: false });
    }
  }
  mossPatch(room, -3.3, 0.02, -2.6, 0.8, 6);
  litter(room, 2.8, -2.4, 0.9, 6);

  /* --- light -------------------------------------------------------------------- */
  // The shell's niche lamp is one. The second is low and in front of the altar,
  // under the antlers - lighting a set piece from below is the whole reason this
  // room works, and a lamp above it would flatten the rack into the vault.
  const votive = new THREE.PointLight(0xffa83c, 9, ctx.dims.cellSize * 1.5, 2);
  votive.position.set(0, 1.15, 2.75);
  room.shadowLight(votive);
  const phase = room.range(0, 20);
  room.tick((t) => {
    votive.intensity = 9 * (1 + 0.17 * (Math.sin(t * 4.7 + phase) * 0.55 + Math.sin(t * 9.1 + phase * 1.3) * 0.45));
  });

  motes(room, 0, 2.6, 2.0, 2.8, 16, 'pollen');
  glowPool(room, 0, 2.7, 3.0);
  glowPool(room, -1.45, 2.55, 1.2);
  glowPool(room, 1.45, 2.55, 1.2);
  // The wash the votives lay up the altar's back wall, which is what stops the
  // south wall going black behind the idol.
  room.geo('sapWash', quad(4.4, 2.6), poseMatrix([0, 1.9, 3.66], Math.PI), { castShadow: false, receiveShadow: false });

  return room.finish();
}
