import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cobweb, cyl, debris, dustMotes, gibbet, graveShaft, quad, ring, sconce, skull, strut } from '../kit/props';

/**
 * The Grave Shaft - one door, and it is the way you came in.
 *
 * A stone-kerbed shaft in the middle of the floor with a windlass over it, cold
 * air coming up out of it, and an iron cage hanging beside it that somebody was
 * lowered in. Three niches in the three walls that cannot open: a corpse shelf, a
 * grille with nothing behind it a player can resolve, and a stack of skulls.
 *
 * The pack's true dead end. Nothing in here goes anywhere, which is exactly what
 * makes walking in feel like a decision - and the shaft is dead centre, so the
 * decision is whether to walk round it.
 */
export const shaft: RoomBlueprint = {
  id: 'crypt.shaft',
  nameKey: 'room.crypt.shaft',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 7,
  tags: ['sanctum', 'deadend'],
  anchors: {
    chest: [{ position: [-2.75, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [2.75, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.4, 0.9, -2.4] },
      { position: [1.9, 0, -2.9] },
      { position: [-1.5, 0, 2.9] },
    ],
    patrolPoint: [
      { position: [-2.7, 0, -0.6] },
      { position: [2.7, 0, -0.6] },
      { position: [0, 0, 2.7] },
    ],
    enemySpawn: [{ position: [0, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, shaft);
  room.shell({
    floor: 'flag',
    wall: 'ashlar',
    ceiling: 'ribs',
    dado: 'stone',
    dadoHeight: 1.0,
    lamps: 'votive',
    mouth: 'gothic',
    niches: [
      { side: 'north', kind: 'loculus' },
      { side: 'west', kind: 'ossuary' },
      // The only lit one. Three lamps would be over budget, and a grille that is
      // the brightest thing in the room is the one a player will walk up to.
      { side: 'east', kind: 'grate', light: true },
    ],
  });

  /* --- the shaft ------------------------------------------------------------------ */
  // Dead centre. It blocks, and it can: the room has one doorway, that doorway's
  // 1.2 m runs to z = 2.5, and there is 2.5 m of floor all the way round this.
  graveShaft(room, 0, 0, 1.05);

  // The cage, hanging beside it rather than over it, so the silhouette of the two
  // reads as separate objects from the doorway.
  gibbet(room, 1.9, 1.4, 0.8);

  /* --- the spoil ------------------------------------------------------------------ */
  // What came up out of the shaft, in a ring round the kerb: earth, bone and
  // three centuries of things nobody looked at twice.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    debris(room, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0.55, 6);
  }
  skull(room, -1.7, 0.03, 1.6, room.range(0, 6), 1.0, 'boneDark');
  skull(room, 1.5, 0.03, -1.9, room.range(0, 6), 0.95);

  /* --- the working gear ----------------------------------------------------------- */
  // A shelf of tackle on the west wall, and a coil of rope on the floor under it.
  // Pushed north of z = -1.75, clear of the skull stack's recess: everything on
  // this wall sits at x = -3.4, hard against the ashlar.
  room.box('timber', [1.2, 0.05, 0.32], [-3.52, 0.85, -2.4], -Math.PI / 2, { tile: 0.5, castShadow: false });
  room.geo('iron', cyl(0.05, 0.05, 0.16, 8), poseMatrix([-3.45, 0.9, -2.85]), { castShadow: false });
  room.geo('iron', ring(0.09, 0.02, 9), tiltMatrix([-3.45, 0.99, -2.0], [0.3, 0.4, 0]), { castShadow: false });
  for (let i = 0; i < 3; i++) {
    room.geo('rope', ring(0.28 - i * 0.03, 0.038, 12), tiltMatrix([-2.9, 0.04 + i * 0.07, -2.5], [Math.PI / 2, i * 0.4, 0]), {
      tile: 0.3,
      castShadow: false,
    });
  }
  // Two buckets, one on its side, and a broken ladder leaning in the corner - not
  // against a niche, where it would stand in front of the thing the niche is for.
  room.geo('timberDark', cyl(0.17, 0.14, 0.28, 9), poseMatrix([-2.5, 0.14, 1.9]), { tile: 0.3, castShadow: false });
  room.geo('timberDark', cyl(0.16, 0.13, 0.26, 9), tiltMatrix([2.4, 0.16, 2.9], [Math.PI / 2, 0.7, 0]), { tile: 0.3, castShadow: false });
  for (const s of [-1, 1]) {
    strut(room, 'timber', [3.35, 0.05, 2.55 + s * 0.24], [2.95, 2.35, 2.3 + s * 0.24], 0.035, 6, { castShadow: false });
  }
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    strut(
      room,
      'timber',
      [3.35 - t * 0.4, 0.2 + t * 2.1, 2.31 - t * 0.25],
      [3.35 - t * 0.4, 0.2 + t * 2.1, 2.79 - t * 0.25],
      0.02,
      5,
      { castShadow: false },
    );
  }

  /* --- light ---------------------------------------------------------------------- */
  // The grille is one of the two. The other is a single torch by the door, which
  // is what a player sees first and the only warm thing in the room.
  sconce(room, 'south', -1.6, 1.95, true, true, 6);

  /* --- the cold ------------------------------------------------------------------- */
  cobweb(room, -3.2, 2.7, 2.9, 1.0, 0.4);
  cobweb(room, 3.2, 2.8, -2.9, 0.9, 2.2);
  room.geo('cobweb', quad(1.1, 1.4), tiltMatrix([2.1, 2.4, 1.5], [0.6, 0.5, 0.4]), { castShadow: false, receiveShadow: false });
  // Motes, and nothing else: `graveShaft` already puts a thin crossed-quad column
  // of cold air over the hole, and a translucent SPHERE on top of that is the
  // grey blob that greyed out half of Kerberos Deep (docs/art/ROOM_REVIEW.md §4).
  dustMotes(room, 0, 1.5, 0, 1.9, 20);

  return room.finish();
}
