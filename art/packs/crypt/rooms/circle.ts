import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bookPile, cyl, debris, disc, dustMotes, lectern, quad, runeCircle, skull, soulFire, wrappedBody } from '../kit/props';

/**
 * The Circle - what the last of the Order were really doing down here.
 *
 * A ritual circle cut into the flagstones and inlaid with something that is
 * still lit, a body laid out in the middle of it with its wrappings opened, and
 * two bowls of witchfire that have been burning without fuel for a very long
 * time.
 *
 * This is the pack's one wholly COLD room: green light, no candles, no smoke, no
 * wax. Nothing here flickers, and that is the whole effect - a flame that does
 * not waver is the most obviously wrong thing in the crypt.
 *
 * A pass-through, north to south, so a team walks straight over the circle
 * without a choice about it.
 */
export const circle: RoomBlueprint = {
  id: 'crypt.circle',
  nameKey: 'room.crypt.circle',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south'),
  weight: 8,
  tags: ['sanctum', 'necromancy', 'cold'],
  anchors: {
    chest: [{ position: [-3.15, 0, -2.5], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0, 0.44, 0] },
      { position: [2.55, 0.92, 2.2] },
      { position: [-3.5, 1.21, 2.6] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.6] },
      { position: [0, 0, 2.7] },
      { position: [2.6, 0, -0.2] },
    ],
    enemySpawn: [{ position: [2.9, 0, -2.9] }],
    trap: [{ position: [0, 0, 1.7] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, circle);
  room.shell({
    floor: 'slab',
    wall: 'ashlar',
    ceiling: 'groin',
    dado: 'none',
    lamps: 'soul',
    lampSpacing: 2.6,
    mouth: 'gothic',
    niches: [
      // Somebody they were talking to, and somebody they were talking through.
      { side: 'east', kind: 'effigy' },
      { side: 'west', kind: 'grate' },
    ],
  });

  /* --- the circle ----------------------------------------------------------------- */
  // Flat, so it never blocks the walk between the two doors - and the reason the
  // room works is that a team has to cross it.
  runeCircle(room, 0, 0, 1.55, true);

  // The body: opened rather than wrapped, on a low bier of two grave slabs. It
  // blocks, and it can: the door lanes only run 1.2 m in from each wall, and
  // there is 2.5 m either side of this to walk round.
  room.box('surface.slab', [2.3, 0.28, 1.0], [0, 0, 0], 0.06, { tile: 0.9 });
  room.collider({ kind: 'box', center: [0, 0], halfExtents: [1.1, 0.46], rotationY: 0.06 });
  room.box('stoneDark', [2.0, 0.05, 0.76], [0, 0.28, 0], 0.06, { tile: 0.5, castShadow: false });
  wrappedBody(room, 0, 0.33, 0, 0.06, 1.8);
  // The wrappings cut open across the chest, and what is under them: this is the
  // one place in the pack where a shroud is not doing its job.
  room.geo('linen', quad(0.5, 0.62), tiltMatrix([-0.1, 0.62, 0.34], [1.2, 0.4, 0.2]), { tile: 0.5, castShadow: false, receiveShadow: false });
  room.geo('fleshDry', ball(0.16, 8), tiltMatrix([-0.1, 0.5, 0], [0, 0.06, 0], [1.5, 0.5, 0.8]), { castShadow: false });
  for (let i = 0; i < 4; i++) {
    // Ribs, spread. Curved, and pale against the linen rather than the other way
    // round, which is the only way this reads at the light level in here.
    room.geo('bonePale', cyl(0.016, 0.016, 0.4, 5), tiltMatrix([-0.32 + i * 0.16, 0.56, 0], [Math.PI / 2, 0.06, 0.5 - i * 0.12]), { castShadow: false });
  }
  // The knife, laid on the slab beside the hands.
  room.box('ironPale', [0.28, 0.012, 0.035], [0.5, 0.34, 0.4], 0.5, { castShadow: false });
  room.box('timberDark', [0.11, 0.03, 0.045], [0.68, 0.335, 0.49], 0.5, { castShadow: false });

  /* --- the fires ------------------------------------------------------------------- */
  // Two bowls on stone stumps, at the two ends of the circle's axis. Both are
  // real lights, and they are the room's whole budget.
  for (const s of [-1, 1]) {
    const x = s * 2.35;
    const z = s * -1.9;
    room.geo('stonePale', cyl(0.2, 0.26, 0.16, 10), poseMatrix([x, 0.08, z]), { tile: 0.4 });
    room.geo('stone', cyl(0.13, 0.17, 0.72, 9), poseMatrix([x, 0.16, z]), { tile: 0.4 });
    room.geo('stonePale', cyl(0.26, 0.15, 0.14, 10), poseMatrix([x, 0.88, z]), { tile: 0.3 });
    // A skull in the bowl, with the fire coming out of it. It is the skull that
    // makes the flame frightening rather than pretty.
    skull(room, x, 0.92, z, room.range(0, 6), 1.05, 'boneDark');
    soulFire(room, x, 1.14, z, 1.15, true, 6);
    room.blockCircle(x, z, 0.24);
  }

  /* --- the working end ------------------------------------------------------------ */
  // A lectern with the instructions on it, a desk of notes, and a box of chalk
  // and salt. Somebody was reading aloud from that.
  lectern(room, 2.5, 1.15, -1.9);
  room.solid('timberDark', [1.1, 0.92, 0.7], [2.6, 0, 2.5], -0.14, { tile: 0.5 });
  bookPile(room, 2.6, 0.92, 2.5, 3, -0.14);
  room.geo('natron', disc(0.3, 10), tiltMatrix([1.7, 0.013, 2.2], [-Math.PI / 2, 0.5, 0]), { castShadow: false, receiveShadow: false });

  // A shelf of jars on the west wall, beside the grate, where the ingredients
  // were. It and everything on it sit at x = -3.5, against the ashlar.
  room.box('timber', [1.6, 0.05, 0.3], [-3.53, 1.16, 2.0], -Math.PI / 2, { tile: 0.5, castShadow: false });
  for (let i = 0; i < 3; i++) {
    room.geo('lead', cyl(0.06, 0.05, 0.16, 8), poseMatrix([-3.5, 1.21, 1.35 + i * 0.42]), { castShadow: false });
  }

  /* --- what is left of the room --------------------------------------------------- */
  debris(room, -2.8, 2.8, 0.6, 6);
  debris(room, 3.0, 3.0, 0.55, 5);
  // Scratches on the flags outside the circle, radiating. Somebody was dragged.
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    room.box('stoneDark', [room.range(0.5, 1.1), 0.004, 0.025], [Math.cos(a) * 2.3, 0.013, Math.sin(a) * 2.3], -a, {
      castShadow: false,
      receiveShadow: false,
    });
  }
  dustMotes(room, 0, 1.5, 0, 2.0, 18, true);

  return room.finish();
}
