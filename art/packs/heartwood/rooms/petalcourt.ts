import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basin,
  bloomFlower,
  glowPool,
  mossPatch,
  motes,
  mothLantern,
  quad,
  ring,
  stool,
  strut,
  vineFall,
} from '../kit/props';

/**
 * The Petal Court - a garden the fae grew inside the wood, still growing.
 *
 * Raised beds of moss and pale bloom against the south wall, a stone basin in
 * the middle of them, and a tall leaded window over the whole thing looking out
 * at a forest that is a very long way down. The canopy overhead is real leaf
 * with two holes in it, and the light coming through those holes is the only
 * cold light in the Bower.
 *
 * The unease is arranged rather than built: every flower in the beds is turned
 * the same way, and it is not the way the light is.
 */
export const petalCourt: RoomBlueprint = {
  id: 'heartwood.petalcourt',
  nameKey: 'room.heartwood.petalcourt',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['bower', 'garden'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.4], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [1.15, 0.68, 2.5] },
      { position: [-0.6, 0.5, 3.4] },
      { position: [2.9, 0.52, 3.05] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.1] },
      { position: [-2.4, 0, 0.6] },
      { position: [2.6, 0, 0.6] },
    ],
    enemySpawn: [{ position: [-3.4, 0, -3.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, petalCourt);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'moss',
    wall: 'birch',
    ceiling: 'canopy',
    band: 'clay',
    bandHeight: 0.62,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'south', kind: 'pane', scene: 'forest', tall: true, light: true }],
  });

  /* --- the beds -------------------------------------------------------------- */
  // Two raised beds and a step between them, all of it in the south band, which
  // this room never opens - so the set piece is guaranteed to be here whichever
  // way the generator turns the room.
  const bed = (x: number, z: number, w: number, d: number, h: number): void => {
    // The kerb: four boards on edge with corner posts, not a box. A planter
    // without a visible wall thickness is a rug with plants on it.
    for (const [dx, dz, bw, bd] of [
      [0, -d / 2, w, 0.08],
      [0, d / 2, w, 0.08],
      [-w / 2, 0, 0.08, d],
      [w / 2, 0, 0.08, d],
    ] as const) {
      room.box('timber', [bw, h, bd], [x + dx, 0, z + dz], 0, { tile: 0.4 });
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      room.box('timberDark', [0.14, h + 0.09, 0.14], [x + sx * w * 0.5, 0, z + sz * d * 0.5], 0, { tile: 0.2 });
      room.geo('bone', ball(0.075, 7), poseMatrix([x + sx * w * 0.5, h + 0.13, z + sz * d * 0.5]), { tile: 0.1, castShadow: false, receiveShadow: false });
    }
    // The soil, and the moss over it.
    room.box('earth', [w - 0.12, h - 0.06, d - 0.12], [x, 0, z], 0, { tile: 0.5 });
    room.geo('surface.moss', quad(w - 0.14, d - 0.14), tiltMatrix([x, h - 0.05, z], [-Math.PI / 2, 0, 0]), { tile: 0.7, castShadow: false });
    room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, d / 2 - 0.05] });
  };

  bed(-1.9, 3.05, 3.0, 1.5, 0.5);
  bed(2.0, 3.05, 2.6, 1.5, 0.5);

  /**
   * What is growing in them.
   *
   * Every bloom is turned to face the same way - toward the middle of the room,
   * not toward the window - and that is the whole horror of this room. Nothing
   * about it is bloody; it is simply that flowers do not do this.
   */
  for (let i = 0; i < 26; i++) {
    const east = i > 13;
    const bx = east ? room.range(0.85, 3.15) : room.range(-3.3, -0.5);
    const bz = room.range(2.45, 3.65);
    const h = room.range(0.24, 0.72);
    // The stem, leaning toward the room rather than up.
    strut(room, 'vine', [bx, 0.46, bz], [bx * 0.94, 0.46 + h, bz - h * 0.42], 0.014, 4, { castShadow: false, receiveShadow: false });
    for (let k = 0; k < 2; k++) {
      room.geo('leaf', quad(room.range(0.1, 0.2), room.range(0.06, 0.1)), tiltMatrix([bx, 0.5 + h * room.range(0.2, 0.7), bz], [room.range(-0.8, 0.2), room.range(0, 3), room.range(-0.5, 0.5)]), { castShadow: false, receiveShadow: false });
    }
    // The head: six petals round a pale boss, all of them tipped the same way.
    const hx = bx * 0.94;
    const hy = 0.46 + h;
    const hz = bz - h * 0.42;
    const petals = 6;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      room.geo(
        i % 5 === 0 ? 'petalViolet' : 'petalPale',
        quad(0.07, 0.14),
        tiltMatrix([hx + Math.cos(a) * 0.055, hy + 0.03, hz + Math.sin(a) * 0.055], [-0.9, -a, 0]),
        { castShadow: false, receiveShadow: false },
      );
    }
    room.geo('lumenSap', ball(0.028, 5), poseMatrix([hx, hy + 0.04, hz]), { castShadow: false, receiveShadow: false });
  }

  // Seed heads and grasses at the back, which is what stops a bed of one flower
  // reading as a printed pattern.
  for (let i = 0; i < 18; i++) {
    const bx = room.range(-3.4, 3.4);
    const bz = room.range(3.2, 3.65);
    const h = room.range(0.4, 0.95);
    strut(room, 'vine', [bx, 0.44, bz], [bx + room.range(-0.1, 0.1), 0.44 + h, bz + room.range(-0.08, 0.08)], 0.01, 4, { castShadow: false, receiveShadow: false });
    room.geo('leafPale', quad(0.05, room.range(0.1, 0.2)), tiltMatrix([bx, 0.44 + h, bz], [0, room.range(0, 3), room.range(-0.4, 0.4)]), { castShadow: false, receiveShadow: false });
  }

  /* --- the basin ------------------------------------------------------------- */
  // At deck level with a raised rim, because the kit lays a solid floor slab and
  // nothing below y = 0 exists (docs/art/ROOM_FORMAT.md §5).
  basin(room, 1.15, 2.5, 0.42, 'water', 0.62);
  room.geo('lichen', ring(0.5, 0.05, 14), tiltMatrix([1.15, 0.06, 2.5], [Math.PI / 2, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  // A stone bird on the rim, worn past recognising.
  room.geo('stone', ball(0.11, 7), tiltMatrix([1.15, 0.7, 2.14], [0, 0.6, 0], [1, 1.3, 0.8]), { tile: 0.15, castShadow: false });
  room.geo('stone', ball(0.06, 6), poseMatrix([1.15, 0.86, 2.12]), { tile: 0.1, castShadow: false });

  /* --- the rest of the room -------------------------------------------------- */
  // Deliberately near-empty. A garden reads as a garden because of the floor it
  // stands on, and this one has eight metres of moss for the beds to sit at the
  // end of.
  // No toadstools and no fungus in here, deliberately: mushrooms are the
  // Thicket's vocabulary, and a garden the fae still tend is the one room in the
  // Bower that should have none of it. It also keeps the busiest 1x1 in the pack
  // two materials cheaper.
  stool(room, -2.6, 1.5, 0.44);
  mossPatch(room, 0.4, 0.02, -2.4, 1.5, 9);
  mossPatch(room, 2.6, 0.02, 0.9, 1.0, 6);
  mossPatch(room, -2.0, 0.02, -3.2, 0.9, 6);

  // Creeper coming down one corner of the window wall. Its own batcher and a slow
  // sway - anything animated stays out of the room's batch, but that does not
  // mean one mesh per leaf (docs/art/ROOM_REVIEW.md). One stand rather than two:
  // an animated stand is two draw calls whatever is in it, and this room is the
  // most material-hungry in the pack.
  vineFall(room, -3.3, 3.35, 0.65, 7);

  /* --- light ------------------------------------------------------------------ */
  // One warm lantern on the north wall and the cold shaft through the window,
  // which the shell's port already spent. Two lamps of different temperature at
  // opposite ends is what stops this reading as one green wash.
  const lantern = mothLantern(room, 'north', 2.5, 2.2, true, 9);
  if (lantern) {
    lantern.castShadow = true;
    lantern.shadow.mapSize.set(512, 512);
    lantern.shadow.autoUpdate = false;
    lantern.shadow.needsUpdate = true;
  }


  // Pollen in the air above the beds, and a cold shaft standing in the middle of
  // the room under the hole in the canopy.
  motes(room, -1.9, 3.0, 1.4, 2.3, 14, 'pollen');
  motes(room, 2.0, 3.0, 1.2, 2.1, 10, 'pollen');
  motes(room, 0, -1.0, 1.6, 2.8, 8, 'dust');
  for (let i = 0; i < 2; i++) {
    room.geo('shaftCold', quad(1.1, ceilingHeight - 0.4), tiltMatrix([-1.5, (ceilingHeight - 0.4) / 2, 1.4], [0, 0.5 + (i * Math.PI) / 2, 0]), { castShadow: false, receiveShadow: false });
  }
  glowPool(room, -1.5, 1.4, 1.4, 'moonWash');
  glowPool(room, -1.9, 2.6, 2.4);
  glowPool(room, 2.0, 2.6, 2.0);

  // One violet bloom among the pale ones, in the far bed. It is the only thing
  // in the Bower that belongs to the Bloom, and it is the size of a hand.
  bloomFlower(room, 2.85, 0.52, 3.3, 0.16);

  return room.finish();
}
