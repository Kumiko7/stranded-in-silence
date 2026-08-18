import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  brackets,
  cyl,
  disc,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  quad,
  ring,
  wallEyes,
} from '../kit/props';

/**
 * The Gall - a swelling in the wood the size of a room, and something laid eggs
 * in it.
 *
 * A gall is what a tree grows when an insect makes it: the wood is tricked into
 * building a nursery, and the nursery is warm and soft and lined and has exactly
 * one occupant. This one is the size of a room, which means the thing it was
 * built for is not the size of an insect.
 *
 * The east wall is chambered - eleven cells in a comb of wet wood, nine of them
 * open and empty, one still capped, and one with a grub in it the length of an
 * arm. The floor is soft. The walls are warm enough that the mist coming off
 * them is the room's atmosphere rather than a decoration.
 */
export const gall: RoomBlueprint = {
  id: 'heartwood.gall',
  nameKey: 'room.heartwood.gall',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'west', 'south'),
  weight: 8,
  tags: ['thicket'],
  anchors: {
    chest: [{ position: [-2.9, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [-3.3, 0, 2.9], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.55, 1.02, -1.05] },
      { position: [2.3, 0, 3.2] },
      { position: [-2.2, 0, -1.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.4, 0, 1.9] },
      { position: [1.4, 0, -2.8] },
    ],
    enemySpawn: [{ position: [2.3, 0, 2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gall);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'pulp',
    wall: 'pulp',
    ceiling: 'knots',
    band: 'bark',
    bandHeight: 0.7,
    register: 'weep',
    mouth: 'grown',
    hot: true,
    // No port on the east wall: the comb IS the wall feature, and a burst
    // opening in the middle of it would put a hole through the one thing this
    // room is for.
  });

  /**
   * The chamber comb.
   *
   * Eleven cells in three rows against the east wall, each one a shallow bowl of
   * wet wood with a raised collar. What makes it read as a comb rather than as
   * dents is the COLLAR: a cell without a proud rim is a shadow on a wall.
   */
  const cell = (y: number, z: number, r: number, state: 'open' | 'capped' | 'full'): void => {
    const x = 3.4;
    // The bowl, back-faced so you see the far side of the hollow and not a dome.
    room.geo('rotProp', ball(r, 10), tiltMatrix([x + r * 0.5, y, z], [0, 0, 0], [0.7, 1, 1]), { tile: 0.3, castShadow: false });
    // The collar: a ring of proud, paler tissue.
    room.geo('pulpProp', ring(r * 0.92, r * 0.16, 12), tiltMatrix([x - 0.02, y, z], [0, Math.PI / 2, 0]), { tile: 0.2, castShadow: false });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      room.geo('pulpProp', ball(r * 0.2, 5), tiltMatrix([x - 0.04, y + Math.sin(a) * r * 0.92, z + Math.cos(a) * r * 0.92], [0, a, 0], [0.7, 1.2, 1]), { tile: 0.15, castShadow: false });
    }
    if (state === 'capped') {
      // A lid of dried froth, still on. Slightly domed and a shade paler.
      room.geo('mycelium', ball(r * 0.95, 10), tiltMatrix([x - 0.12, y, z], [0, 0, 0], [0.32, 1, 1]), { tile: 0.25, castShadow: false });
      for (let i = 0; i < 8; i++) {
        const a = room.range(0, Math.PI * 2);
        const d = Math.sqrt(room.rng()) * r * 0.8;
        room.geo('mycelium', ball(r * room.range(0.1, 0.2), 5), poseMatrix([x - 0.2, y + Math.sin(a) * d, z + Math.cos(a) * d]), { tile: 0.1, castShadow: false });
      }
    } else if (state === 'full') {
      /**
       * The grub. Segmented, pale and glossy, with the segments getting smaller
       * toward the head - a smooth capsule is a pill, and what makes a larva a
       * larva is the ring structure and the fact that one end is different.
       */
      const segments = 9;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const sr = r * (0.62 - Math.abs(t - 0.42) * 0.42);
        room.geo('grub', ball(sr, 8), poseMatrix([x - 0.35 - Math.sin(t * 2.2) * 0.18, y - 0.05 + Math.cos(t * 3.4) * 0.12, z - r * 0.6 + t * r * 1.2]), { tile: 0.2, castShadow: true });
      }
      // The head end: darker, harder, and it has jaws.
      room.geo('chitin', ball(r * 0.3, 8), poseMatrix([x - 0.5, y - 0.02, z + r * 0.66]), { tile: 0.15, castShadow: false });
      for (const s of [-1, 1]) {
        room.geo('chitin', cyl(0.012, 0.028, r * 0.32, 5), tiltMatrix([x - 0.56, y - 0.03, z + r * 0.76 + s * r * 0.12], [1.4, s * 0.5, 0]), { tile: 0.1, castShadow: false });
      }
      room.geo('surface.foxHot', disc(r * 0.7, 12), tiltMatrix([x - 0.08, y, z], [0, Math.PI / 2, 0]), { castShadow: false, receiveShadow: false });
    } else {
      // Empty, and the inside is dark. Two claw scores down the collar say how it
      // was left.
      for (const s of [-1, 1]) {
        room.geo('eyeDark', cyl(0.012, 0.012, r * 1.3, 4), tiltMatrix([x - 0.06, y + s * r * 0.2, z], [Math.PI / 2, 0, 0.2]), { castShadow: false, receiveShadow: false });
      }
    }
  };

  const cells: readonly [number, number, number, 'open' | 'capped' | 'full'][] = [
    [0.95, -2.5, 0.4, 'open'],
    [0.95, -1.05, 0.46, 'full'],
    [1.05, 0.5, 0.38, 'open'],
    [0.9, 1.9, 0.42, 'open'],
    [0.95, 3.15, 0.34, 'open'],
    [1.85, -2.0, 0.36, 'open'],
    [1.95, -0.6, 0.42, 'capped'],
    [1.8, 0.95, 0.34, 'open'],
    [1.9, 2.4, 0.38, 'open'],
    [2.7, -1.3, 0.3, 'open'],
    [2.65, 1.4, 0.32, 'open'],
  ];
  for (const [y, z, r, state] of cells) cell(y, z, r, state);
  // One collider across the whole comb, at the depth a player could reach it.
  room.collider({ kind: 'box', center: [3.45, 0], halfExtents: [0.35, 3.7] });

  /* --- the swelling ------------------------------------------------------------ */
  // The room is inside a lump, so the corners are rounded off with masses of the
  // same tissue and the ceiling comes down to meet them.
  // Only the two east corners get solid masses. The west ones are swellings high
  // on the wall with nothing at floor level, because both containers live over
  // there and a heap of tissue a metre from a chest is a chest nobody can open.
  for (const [px, pz] of [[3.3, -3.3], [3.3, 3.3]] as const) {
    for (let i = 0; i < 4; i++) {
      room.geo('surface.pulp', ball(room.range(0.8, 1.3), 8), tiltMatrix([px + room.range(-0.4, 0.4), room.range(0.4, 2.9), pz + room.range(-0.4, 0.4)], [0, i, 0], [1.2, 1.0, 1.1]), { tile: 0.8, castShadow: false });
    }
    room.blockCircle(px, pz, 0.6);
  }
  for (const [px, pz] of [[-3.4, -3.4], [-3.4, 3.4]] as const) {
    for (let i = 0; i < 3; i++) {
      room.geo('surface.pulp', ball(room.range(0.7, 1.1), 8), tiltMatrix([px + room.range(-0.3, 0.3), room.range(1.6, 3.0), pz + room.range(-0.3, 0.3)], [0, i, 0], [1.2, 1.0, 1.1]), { tile: 0.8, castShadow: false });
    }
  }
  // Veins running over the swelling, and the wet sheen where they cross.
  for (let i = 0; i < 10; i++) {
    const a = room.range(0, Math.PI * 2);
    limb(
      room,
      'tendril',
      [Math.cos(a) * 3.6, room.range(0.2, 1.2), Math.sin(a) * 3.6],
      [Math.cos(a + room.range(0.6, 1.6)) * 3.4, room.range(2.2, ceilingHeight - 0.2), Math.sin(a + room.range(0.6, 1.6)) * 3.4],
      room.range(0.04, 0.09),
      room.range(0.02, 0.05),
      0.35,
      i * 5,
      6,
      { tile: 0.4, castShadow: false },
    );
  }

  /* --- the floor ----------------------------------------------------------------- */
  // Frass: the chewings a grub packs behind itself. Flat, collider-free, and it
  // is what makes the floor of this room read as the inside of something.
  for (let i = 0; i < 22; i++) {
    const px = room.range(-2.6, 2.8);
    const pz = room.range(-3.2, 3.2);
    room.geo('rotProp', ball(room.range(0.06, 0.16), 5), tiltMatrix([px, 0.02, pz], [0, i, 0], [1.4, 0.35, 1.1]), { tile: 0.2, castShadow: false, receiveShadow: false });
  }
  for (const [px, pz, r] of [
    [1.9, -0.9, 0.85],
    [2.3, 2.2, 0.55],
    [-1.4, -2.4, 0.5],
  ] as const) {
    room.geo('slime', disc(r, 14), tiltMatrix([px, 0.014, pz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  }
  litter(room, -2.2, -1.4, 0.9, 7);
  brackets(room, 'north', 2.2, 1.2, 3);
  brackets(room, 'south', -2.4, 1.5, 3);
  foxfire(room, [-3.2, 0.35, 0.4], 0.8, 10);
  foxfire(room, [0.6, 0.3, 3.3], 0.6, 7);

  // Six eyes low on the north wall, half-closed. In this room they are the least
  // frightening thing present, which is the point of putting them here.
  wallEyes(room, 'north', -0.4, 1.2, 6, 1.1);

  // Mist off the warm walls. Additive and masked: alpha-blended vapour lays a
  // film over the very thing it is rising off (docs/art/ART_GUIDE.md §4).
  plume(room, 2.6, -1.0, 0.3, 2.2, 1.8, 'hazeMist');
  plume(room, -1.8, 2.2, 0.2, 1.7, 1.4, 'hazeMist');
  motes(room, 0.6, 0, 2.6, 2.6, 18, 'spore');

  /* --- light ---------------------------------------------------------------------- */
  // The grub's cell is lit from inside it, warm, and it is the only warm light in
  // the room - so the comb reads as one live cell among ten dead ones from every
  // doorway. The second lamp is cold, low and on the far wall.
  const brood = new THREE.PointLight(0xffa858, 8, ctx.dims.cellSize * 1.3, 2);
  brood.position.set(2.55, 1.0, -1.05);
  room.shadowLight(brood);
  const phase = room.range(0, 20);
  room.tick((t) => {
    brood.intensity = 8 * (1 + 0.14 * Math.sin(t * 0.44 + phase) + 0.05 * Math.sin(t * 1.7 + phase));
  });

  gillLamp(room, 'west', 1.6, 1.5, true, 7);

  glowPool(room, 2.5, -1.0, 2.6);
  glowPool(room, -2.6, 1.6, 2.0, 'foxWash');
  // The wash the brood cell lays back onto its own wall, which is what stops the
  // comb reading as a bright dot on a black slab.
  room.geo('sapWash', quad(3.0, 2.6), poseMatrix([3.62, 1.4, -1.05], -Math.PI / 2), { castShadow: false, receiveShadow: false });

  return room.finish();
}
