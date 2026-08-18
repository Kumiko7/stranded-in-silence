import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basin,
  brackets,
  candles,
  cyl,
  disc,
  foxfire,
  glowPool,
  limb,
  motes,
  mothLantern,
  phial,
  plume,
  quad,
  ring,
  strut,
} from '../kit/props';

/**
 * The Sap Well - a wound in the tree that somebody built a workshop around.
 *
 * This is the pack's hinge room, and it is honestly both halves of the map at
 * once. The south band is the wound: a pool of live amber two metres across,
 * lipped with hardened resin, going down further than the floor pretends to. The
 * rest is the Bower's answer to it - a plank deck laid over the raw floor, a
 * gantry of tapping spouts, a rack of phials, buckets, a ladle on a hook.
 *
 * The sap is the brightest thing in Heartwood and everything in the room is
 * balanced against it: no other lamp in here is more than half its strength, the
 * deck is lit from below by it, and the four shapes suspended just under its
 * surface are silhouettes, not details.
 */
export const sapWell: RoomBlueprint = {
  id: 'heartwood.sapwell',
  nameKey: 'room.heartwood.sapwell',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['thicket', 'bower', 'hinge', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.4], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.35, 1.0, 1.9] },
      { position: [3.45, 1.3, 0.9] },
      { position: [1.5, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [0, 0, -0.4] },
      { position: [-2.5, 0, 0.8] },
      { position: [2.6, 0, 1.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, sapWell);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'bark',
    wall: 'pulp',
    ceiling: 'knots',
    band: 'plank',
    bandHeight: 1.1,
    register: 'sapline',
    hot: true,
    mouth: 'grown',
    ports: [{ side: 'south', kind: 'knothole', scene: 'hollow' }],
  });

  /* --- the deck ---------------------------------------------------------------- */
  // Boards laid over the raw floor on sleepers, covering the north half only.
  // The seam where the decking stops is the room's whole thesis, so it is ragged
  // and the last three boards are missing.
  for (let i = 0; i < 12; i++) {
    const z = -3.6 + i * 0.42;
    const short = i > 8;
    if (i === 10) continue;
    room.box('surface.plank', [short ? room.range(3.0, 5.4) : 7.2, 0.07, 0.38], [short ? room.range(-1.2, 1.0) : 0, 0.05, z], 0, { tile: 0.9 });
  }
  for (const sz of [-3.2, -1.4, 0.4]) {
    room.box('timberDark', [7.4, 0.06, 0.14], [0, 0, sz], 0, { tile: 0.4 });
  }
  room.box('timberDark', [7.4, 0.05, 0.1], [0, 0.12, 0.85], 0, { tile: 0.4 });

  /* --- the well ----------------------------------------------------------------- */
  /**
   * At deck level with a raised rim, because the kit lays a solid floor slab per
   * cell and anything recessed below y = 0 is simply hidden behind it
   * (docs/art/ROOM_FORMAT.md §5). A pool with a coaming reads as a well; a hole
   * does not exist.
   */
  basin(room, 0.2, 2.7, 1.15, 'sap', 0.4);
  // The lip: hardened resin that has run over the rim and set in tongues.
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const len = room.range(0.12, 0.4);
    room.geo('surface.sap', cyl(0.05, 0.08, len, 5), poseMatrix([0.2 + Math.cos(a) * 1.3, 0.4 - len / 2, 2.7 + Math.sin(a) * 1.3]), { tile: 0.2, castShadow: false, receiveShadow: false });
    room.geo('surface.sap', ball(room.range(0.06, 0.11), 6), tiltMatrix([0.2 + Math.cos(a) * 1.3, 0.4 - len, 2.7 + Math.sin(a) * 1.3], [0, a, 0], [1, 1.4, 1]), { castShadow: false, receiveShadow: false });
  }
  // What is in it. Four shapes just under the surface, and they are outlines: at
  // this brightness a player is reading silhouettes and nothing else.
  for (const [ox, oz, r, sx] of [
    [-0.4, -0.3, 0.22, 1.5],
    [0.5, 0.35, 0.17, 1.1],
    [-0.1, 0.6, 0.13, 1.8],
    [0.65, -0.45, 0.1, 1.3],
  ] as const) {
    room.geo('eyeDark', ball(r, 7), tiltMatrix([0.2 + ox, 0.3, 2.7 + oz], [0, ox + oz, 0], [sx, 0.5, 1]), { tile: 0.2, castShadow: false, receiveShadow: false });
  }
  // Bubbles standing on the surface, which is what says the pool is still live.
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * 1.0;
    room.geo('lumenSap', ball(room.range(0.03, 0.07), 6), tiltMatrix([0.2 + Math.cos(a) * d, 0.33, 2.7 + Math.sin(a) * d], [0, 0, 0], [1, 0.6, 1]), { castShadow: false, receiveShadow: false });
  }

  /* --- the tapping rig ---------------------------------------------------------- */
  // A gantry over the well with four spouts on it, and the buckets under them.
  // This is the Bower half of the room and it is deliberately neat.
  for (const s of [-1, 1]) {
    room.box('timber', [0.14, 2.5, 0.14], [0.2 + s * 1.75, 0, 2.7], 0, { tile: 0.4, castShadow: true });
    room.blockCircle(0.2 + s * 1.75, 2.7, 0.14);
    // Knee braces, because a post with a brace reads as built and a post does not.
    strut(room, 'timber', [0.2 + s * 1.75, 1.9, 2.7], [0.2 + s * 1.2, 2.45, 2.7], 0.045, 5, { tile: 0.2, castShadow: false });
  }
  room.geo('timber', cyl(0.09, 0.09, 3.7, 8), tiltMatrix([0.2, 2.55, 2.7], [Math.PI / 2, Math.PI / 2, 0]), { tile: 0.4, castShadow: true });
  for (let i = 0; i < 4; i++) {
    const px = -1.15 + i * 0.9;
    // Spout, drip, and the pail hung under it.
    room.geo('copper', cyl(0.03, 0.035, 0.5, 7), tiltMatrix([px, 2.28, 2.7], [0.25, 0, 0]), { tile: 0.15, castShadow: false });
    room.geo('surface.sapHot', cyl(0.012, 0.018, room.range(0.3, 1.1), 4), poseMatrix([px + 0.06, 1.7, 2.75]), { castShadow: false, receiveShadow: false });
    room.geo('copper', cyl(0.13, 0.1, 0.22, 10, true), poseMatrix([px + 0.06, 1.3, 2.75]), { tile: 0.15, castShadow: false });
    room.geo('surface.sapHot', disc(0.115, 10), tiltMatrix([px + 0.06, 1.38, 2.75], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    room.geo('iron', ring(0.13, 0.008, 10), tiltMatrix([px + 0.06, 1.42, 2.75], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  }
  // A ladle on a hook, and a coil of rope on the gantry.
  room.geo('copper', cyl(0.08, 0.07, 0.06, 9), poseMatrix([1.55, 1.9, 2.4]), { tile: 0.1, castShadow: false });
  room.geo('timberDark', cyl(0.014, 0.014, 0.5, 5), tiltMatrix([1.55, 2.15, 2.4], [0.15, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 3; i++) {
    room.geo('weave', ring(0.16 - i * 0.02, 0.022, 10), tiltMatrix([-1.7, 2.44 - i * 0.05, 2.5], [Math.PI / 2 + 0.2, 0.4, 0]), { tile: 0.15, castShadow: false });
  }

  /* --- the workshop ------------------------------------------------------------- */
  // A bench with phials on it, a rack on the east wall, and a barrel. All of it
  // in the corners: this room offers three walls and the T has to stay clear.
  room.solid('timber', [1.5, 0.95, 0.55], [-2.9, 0, 1.9], 0, { tile: 0.5, castShadow: true });
  for (let i = 0; i < 5; i++) {
    phial(room, -2.9 + room.range(-0.5, 0.5), 0.95, 1.9 + room.range(-0.16, 0.16), 0.045, 0.16, i % 2 === 0);
  }
  room.box('timber', [0.34, 0.05, 1.7], [3.45, 1.28, 0.9], 0, { tile: 0.3 });
  for (let i = 0; i < 6; i++) {
    phial(room, 3.45, 1.33, 0.15 + i * 0.28, 0.042, 0.15, i === 1 || i === 4);
  }
  // The pack's usual clutter props are deliberately absent here: this room is
   // already carrying a deck, a gantry, four pails, a phial rack and a bench, and
   // every extra material is another draw call in the pack's busiest 1x1.
  candles(room, -2.9, 0.97, 1.45, 2, 0.09);

  /* --- the raw half --------------------------------------------------------------- */
  // Where the deck stops, the room stops being a workshop.
  for (const [rx, rz] of [[-3.4, 3.4], [3.4, 3.3]] as const) {
    limb(room, 'root', [rx, ceilingHeight, rz], [rx * 0.75, 0.1, rz * 0.7], 0.2, 0.1, 0.35, rx + rz, 6, { tile: 0.6, castShadow: true });
  }
  brackets(room, 'east', -2.5, 1.6, 3);
  brackets(room, 'west', 2.4, 1.4, 3);
  foxfire(room, [-3.2, 0.3, 3.0], 0.7, 8);
  foxfire(room, [2.9, 0.3, 3.4], 0.6, 7);
  plume(room, 0.2, 2.7, 0.5, 2.1, 2.0, 'hazePollen');
  motes(room, 0.2, 2.0, 2.2, 2.6, 20, 'pollen');

  /* --- light ---------------------------------------------------------------------- */
  /**
   * The well itself, from just above the surface and outside the resin so it
   * rims the rig and underlights the gantry. This is the brightest lamp in the
   * pack and it is the shadow caster, because the four posts and the ladle are
   * exactly what a player should see thrown across the deck.
   */
  const well = new THREE.PointLight(0xff9a3c, 13, ctx.dims.cellSize * 1.8, 2);
  well.position.set(0.2, 0.62, 2.7);
  room.shadowLight(well, 512);
  const phase = room.range(0, 20);
  room.tick((t) => {
    well.intensity = 13 * (1 + 0.16 * (Math.sin(t * 0.5 + phase) * 0.7 + Math.sin(t * 1.13 + phase * 1.4) * 0.3));
  });

  // The second is a moth lantern on the deck side, at half the well's strength,
  // so the workshop is legible without competing with the thing it was built for.
  mothLantern(room, 'north', 2.3, 2.15, true, 7);
  mothLantern(room, 'west', 2.6, 2.1, false);

  glowPool(room, 0.2, 2.7, 3.6);
  glowPool(room, 0.2, 0.6, 2.6);
  glowPool(room, -2.9, 1.9, 1.6);
  // The wash the well lays up the south wall, which is what stops the wound
  // reading as a bright disc in a black room.
  room.geo('sapWash', quad(5.4, 3.0), poseMatrix([0.2, 1.6, 3.66], Math.PI), { castShadow: false, receiveShadow: false });

  return room.finish();
}
