import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { boxGeometry } from '../../../lib/build';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneHeap, brazier, cyl, debris, disc, dustMotes, ring, sconce, skull, sporeCluster, strut } from '../kit/props';

/**
 * The Pit - where the Order gave up on coffins.
 *
 * A trench cut down the middle of a room with an earth floor, half covered by
 * three great slabs and half not. What is in it went in by the cartload, with
 * quicklime shovelled over each layer, and the lime is the reason the bones are
 * white and the reason nothing grew here for two hundred years.
 *
 * The room is the opposite of the ossuary: nobody arranged any of this. Every
 * bone in it is lying where it landed.
 */
export const pit: RoomBlueprint = {
  id: 'crypt.pit',
  nameKey: 'room.crypt.pit',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['sanctum', 'bone'],
  anchors: {
    // Hard against the south-west corner: the trench lids reach x = -2.13, and a
    // chest needs its whole width approachable from 1.6 m out.
    chest: [{ position: [-3.0, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [1.35, 0.42, 2.4] },
      { position: [2.9, 0, -2.9] },
      { position: [-2.9, 0, -0.4] },
    ],
    patrolPoint: [
      { position: [-1.4, 0, -2.6] },
      { position: [2.9, 0, 1.4] },
      { position: [1.7, 0, -3.0] },
    ],
    enemySpawn: [{ position: [3.0, 0, 3.0] }],
    trap: [{ position: [0, 0, -2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, pit);
  room.shell({
    floor: 'earth',
    wall: 'ashlar',
    ceiling: 'ribs',
    dado: 'none',
    lamps: 'votive',
    lampSpacing: 3.2,
    mouth: 'gothic',
    plinth: false,
    // Something has come through the south wall from below, and the lime did not
    // stop it this time.
    niches: [{ side: 'south', kind: 'breach' }],
  });

  /* --- the trench ----------------------------------------------------------------- */
  // Runs east-west, south of centre, and stops 2.3 m short of each side wall:
  // this room offers the north, east and west walls, and a trench that reached
  // them would sit squarely in two of those doorways. The kerb is a course of
  // rough blocks; the pit itself is at floor level with the lime and the bones ON
  // it, because you cannot cut a hole in the deck (docs/art/ROOM_REVIEW.md §4).
  const pitZ = 1.2;
  const halfW = 1.3;
  const pitHalf = 2.3;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -pitHalf + 0.5 + i * 0.95;
      room.box('stonePale', [0.9, 0.22 + (i % 3) * 0.05, 0.34], [x, 0, pitZ + s * halfW], room.range(-0.04, 0.04), { tile: 0.5 });
    }
    // The ends of the trench, so it reads as a cut with a bottom rather than as a
    // strip painted across the floor.
    room.box('stonePale', [0.34, 0.26, halfW * 2 + 0.34], [s * pitHalf, 0, pitZ], 0, { tile: 0.5 });
  }
  // The lime bed, and the bones in it. Pale, so it is kept to ONE big patch
  // rather than a dozen - a pale surface is the loudest thing in a dark room.
  room.box('natron', [pitHalf * 2 - 0.3, 0.1, halfW * 2 - 0.3], [0, 0, pitZ], 0, { tile: 0.9, castShadow: false });
  room.box('fleshRot', [pitHalf * 2 - 0.8, 0.06, halfW * 2 - 0.6], [0, 0.1, pitZ], 0, { tile: 0.7, castShadow: false });
  for (let i = 0; i < 4; i++) {
    boneHeap(room, -1.6 + i * 1.1, pitZ + room.range(-0.45, 0.45), 0.5, 11);
  }
  // Two arms out of the lime, reaching for the kerb. Nothing else in the room
  // needed to be added after this.
  for (const [x, z, lean] of [
    [-1.5, pitZ - halfW + 0.3, 0.7],
    [1.6, pitZ + halfW - 0.4, -0.6],
  ] as const) {
    strut(room, 'bone', [x, 0.12, z], [x + lean * 0.3, 0.66, z - lean * 0.4], 0.032, 6, { castShadow: false });
    strut(room, 'bone', [x + lean * 0.3, 0.66, z - lean * 0.4], [x + lean * 0.5, 0.92, z - lean * 0.2], 0.026, 6, { castShadow: false });
    // A hand: a pad and four short bones. Enough at this size, and no more.
    room.geo('bonePale', ball(0.05, 6), poseMatrix([x + lean * 0.5, 0.94, z - lean * 0.2]), { castShadow: false });
    for (let k = 0; k < 4; k++) {
      room.geo('bonePale', cyl(0.011, 0.013, 0.11, 4), tiltMatrix([x + lean * 0.52, 1.0, z - lean * 0.2], [0.4, k * 0.5 - 0.7, 0.2]), { castShadow: false });
    }
  }

  /* --- the slabs ------------------------------------------------------------------ */
  // Three lids: two still on, with a 0.9 m gangway left between them, and one
  // levered off and dumped north of the trench - which is what tells you the pit
  // was opened AFTER it was closed.
  for (const x of [-1.3, 1.3]) {
    room.box('surface.slab', [1.75, 0.18, halfW * 2 + 0.4], [x, 0.22, pitZ], room.range(-0.02, 0.02), { tile: 1.0 });
    room.collider({ kind: 'box', center: [x, pitZ], halfExtents: [0.83, halfW + 0.16] });
    // The lifting eyes cast into each end of it.
    for (const s of [-1, 1]) {
      room.geo('iron', ring(0.075, 0.018, 9), tiltMatrix([x + s * 0.62, 0.44, pitZ], [0.2, 0.4, 0]), { castShadow: false });
    }
  }
  // Propped at an angle on a broken block, with the crowbar still under it. A box
  // leaning needs `tiltMatrix`: `room.box` only turns about Y, and a lid that
  // should be at 25 degrees comes out lying flat and floating.
  room.geo('surface.slab', boxGeometry(2.1, 0.16, 1.5), tiltMatrix([0, 0.34, -1.15], [0.44, 0.05, 0]), { tile: 1.0 });
  room.collider({ kind: 'box', center: [0, -1.2], halfExtents: [1.0, 0.66], rotationY: 0.05 });
  room.geo('stone', ball(0.3, 7), tiltMatrix([0.9, 0.12, -1.6], [0, 0.4, 0], [1.2, 0.8, 1]), { tile: 0.4, castShadow: false });
  room.geo('iron', cyl(0.028, 0.034, 1.3, 6), tiltMatrix([-1.1, 0.3, -1.0], [1.2, 0.7, 0]), { tile: 0.3, castShadow: false });

  /* --- the tools ------------------------------------------------------------------ */
  // Two shovels against the wall, a barrow on its side, and the lime bucket. The
  // work stopped in the middle of a shift.
  for (const s of [-1, 1]) {
    strut(room, 'timber', [-3.4 + s * 0.2, 0.1, -1.6 + s * 0.3], [-3.0 + s * 0.2, 1.5, -1.4 + s * 0.3], 0.032, 6, { castShadow: false });
    room.box('ironPale', [0.24, 0.32, 0.03], [-3.42 + s * 0.2, 0.02, -1.66 + s * 0.3], 0.3 * s, { tile: 0.3, castShadow: false });
  }
  room.geo('timberDark', cyl(0.34, 0.34, 0.42, 10), tiltMatrix([2.9, 0.34, -1.6], [Math.PI / 2, 0.6, 0]), { tile: 0.5, castShadow: false });
  room.geo('natron', disc(0.5, 12), tiltMatrix([2.6, 0.014, -1.2], [-Math.PI / 2, 0.4, 0]), { castShadow: false, receiveShadow: false });
  room.geo('lead', cyl(0.16, 0.13, 0.26, 9), poseMatrix([-2.9, 0.13, -0.4]), { castShadow: false });

  /* --- what the lime did not stop -------------------------------------------------- */
  // The one thing growing in here, and it is growing out of the breach rather
  // than out of the pit. Emissive only: the room's light is the brazier.
  // Small: a violet cluster in a room lit by a brazier is an ACCENT, and at 0.9
  // scale it was the loudest thing in the frame from two of the three doorways.
  sporeCluster(room, 1.4, 0, 3.0, 0.55, false, 0, false);
  room.geo('mycelium', disc(1.1, 12), tiltMatrix([0.6, 0.014, 3.1], [-Math.PI / 2, 0.7, 0]), { castShadow: false, receiveShadow: false });

  /* --- light ----------------------------------------------------------------------- */
  // Both lights are pushed harder than the pack's default. This room has an earth
  // floor, a lime bed and no plinth course, so it has almost no pale surface to
  // bounce off - the first pass was legal and very nearly unnavigable.
  brazier(room, -2.2, -2.0, true, 12, true);
  sconce(room, 'east', 2.5, 1.9, true, true, 8);

  /* --- the rest -------------------------------------------------------------------- */
  skull(room, -3.1, 0.02, 2.3, room.range(0, 6), 1.0, 'bonePale');
  skull(room, 1.6, 0.02, -2.9, room.range(0, 6), 0.95);
  debris(room, 0.4, -3.0, 0.8, 8);
  debris(room, 3.0, 0.4, 0.6, 6);
  // Lime dust hanging in the air over the trench. Warm, because the brazier is
  // the only thing lighting it.
  // Motes and nothing else. A 6.6 m haze quad lying along the trench was the third
  // time this pack hung a pane of fog in a room and the third time it read as a
  // sheet of glass from the doorway (docs/art/ROOM_REVIEW.md §4).
  dustMotes(room, 0, 1.1, pitZ, 3.0, 16);

  return room.finish();
}
