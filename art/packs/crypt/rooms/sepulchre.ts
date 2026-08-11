import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, banner, boneHeap, brazier, candleStand, censer, cobweb, coronaLucis, cyl, debris, dustMotes, effigy, pillar, quad, ring, sarcophagus, sconce, skull, statue } from '../kit/props';

/**
 * The Sepulchre of the Nine - the room the whole hill was dug out for.
 *
 * Four clustered piers holding a quadripartite vault over a raised octagonal
 * platform, and on the platform the ninth tomb: an abbot in stone with his hands
 * folded and his feet on a hound. Eight more stand round the walls, one for each
 * of the others, and the corona of iron and bone hanging over the middle has been
 * lit continuously for six hundred years by somebody.
 *
 * A 2x2 is placed at most once per map, so it is a destination rather than a
 * room. Everything about it is symmetrical, which is the only place in this pack
 * that is true - and it is what makes the one open tomb read as a violation.
 */
export const sepulchre: RoomBlueprint = {
  id: 'crypt.sepulchre',
  nameKey: 'room.crypt.sepulchre',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
    ...wallsOn([1, 1], 'south', 'east'),
    ...wallsOn([0, 1], 'south'),
  ],
  weight: 6,
  tags: ['sanctum', 'grand'],
  anchors: {
    // Every container anchor is offset along its wall rather than centred on it:
    // the middle of each of these walls is either a doorway the generator may open
    // or a tomb chest that is already standing there.
    chest: [
      { position: [1.9, 0, -3.15], rotationY: Math.PI },
      { position: [-3.15, 0, 1.9], rotationY: -Math.PI / 2 },
    ],
    locker: [{ position: [11.15, 0, 1.9], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [4.0, 1.0, 5.1] },
      { position: [4.0, 1.0, 10.6] },
      { position: [10.9, 1.0, 4.6] },
      { position: [2.2, 0, 7.4] },
    ],
    patrolPoint: [
      { position: [4.0, 0, 0.6] },
      { position: [0.6, 0, 4.0] },
      { position: [7.4, 0, 4.0] },
      { position: [4.0, 0, 7.4] },
    ],
    enemySpawn: [{ position: [5.9, 0, 10.2] }],
    treasure: [{ position: [4.0, 0.4, 2.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, sepulchre);
  room.shell({
    floor: 'slab',
    wall: 'ashlar',
    ceiling: 'groin',
    dado: 'inscription',
    dadoHeight: 1.15,
    lamps: 'votive',
    lampSpacing: 2.7,
    mouth: 'gothic',
    // The one wall the generator cannot open holds the founder, in a recess deep
    // enough that his face is never lit.
    niches: [{ cell: [0, 1], side: 'east', kind: 'effigy' }],
  });

  const cx = 4.0;
  const cz = 4.0;

  /* --- the platform ----------------------------------------------------------------- */
  // Two octagonal steps. Low, and no collider: a 30 cm step you can see over
  // should never be an invisible wall, and collision here is a 2D floor test.
  room.geo('stonePale', cyl(2.9, 3.0, 0.16, 8), poseMatrix([cx, 0.08, cz]), { tile: 1.0 });
  room.geo('stone', cyl(2.35, 2.45, 0.16, 8), poseMatrix([cx, 0.24, cz]), { tile: 0.9, castShadow: false });
  // A moulded arris on each step, which is what makes two drums read as steps.
  for (const [r, y] of [
    [2.98, 0.16],
    [2.43, 0.32],
  ] as const) {
    room.geo('stoneDark', ring(r, 0.035, 24), tiltMatrix([cx, y, cz], [Math.PI / 2, 0, 0]), { castShadow: false });
  }
  // The brass inscription running round the top step: the nine names.
  room.geo('brass', ring(2.15, 0.045, 24), tiltMatrix([cx, 0.34, cz], [Math.PI / 2, 0, 0]), { castShadow: false });

  /* --- the ninth tomb ---------------------------------------------------------------- */
  // On the platform, aligned north-south, with the effigy on top of it. It is the
  // only object in the pack a player can walk all the way round.
  // `lid: 'effigy'` puts the figure on the lid at the lid's own height. Calling
  // `effigy()` separately means picking that height by hand, and picking it wrong
  // by 30 cm gives you an abbot hovering over his own tomb.
  sarcophagus(room, cx, cz, Math.PI / 2, { lid: 'effigy', length: 2.6 });
  // Four candle stands at the platform's corners. Only one is lit: four would
  // flatten the room, and the corona above is doing the real work.
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    candleStand(room, cx + Math.cos(a) * 2.05, cz + Math.sin(a) * 2.05, i === 0, 1.15, 6);
  }

  /* --- the piers ---------------------------------------------------------------------- */
  // At the quadrant centres, so the vault has something to spring from and the
  // room has four blind corners in it.
  for (const [px, pz] of [
    [1.0, 1.0],
    [7.0, 1.0],
    [1.0, 7.0],
    [7.0, 7.0],
  ] as const) {
    pillar(room, px, pz, 'cluster', 0.44);
  }

  /* --- the other eight ---------------------------------------------------------------- */
  // Round the walls, in the stretches between the door lanes. The generator can
  // open seven of the eight outer edges, so every one of these positions is chosen
  // against a doorway that may or may not be there.
  const wall: [number, number, number, 'flat' | 'gabled' | 'effigy'][] = [
    [4.0, -2.9, 0, 'gabled'],
    [4.0, 10.9, 0, 'effigy'],
    [-2.9, 4.0, Math.PI / 2, 'gabled'],
    [10.9, 4.0, Math.PI / 2, 'flat'],
    // Two on the diagonal rather than four. They sit at 45 degrees, which costs
    // them 6 cm of reach in each axis - hence 2.3 rather than 2.7 from the walls,
    // or a corner tomb pokes through the masonry behind it.
    //
    // A tomb chest is the most expensive object in this pack (about 1,400
    // triangles and one collider each), and nine of them plus four piers put this
    // room 80 % over the triangle budget and at the collider limit. Seven reads
    // as "one for each of them" exactly as well.
    [10.3, -2.3, Math.PI / 4, 'flat'],
    [10.3, 10.3, -Math.PI / 4, 'gabled'],
  ];
  for (const [x, z, rot, lid] of wall) {
    sarcophagus(room, x, z, rot + room.range(-0.02, 0.02), { lid, occupant: true });
  }
  // And the eighth, in the north-west corner, standing open with its lid slid
  // clear. The only asymmetry in the room, and the whole point of it.
  sarcophagus(room, -2.3, -2.3, -Math.PI / 4, { lid: 'flat', open: true, occupant: true });
  boneHeap(room, -1.4, -2.2, 0.55, 9);
  skull(room, -1.0, 0.03, -1.5, room.range(0, 6), 1.05, 'boneDark');

  /* --- light ------------------------------------------------------------------------- */
  // Four lights for four cells: the corona over the platform (the room's one
  // shadow caster), two braziers on the diagonal and the candle stand above.
  coronaLucis(room, cx, cz, 1.35, true, 13, true);
  brazier(room, 1.1, 10.6, true, 9);
  brazier(room, 10.6, 1.1, true, 9);
  censer(room, 6.6, 6.6, 1.5);

  /* --- the fabric --------------------------------------------------------------------- */
  // Banners on the piers' wall faces, and a statue in each of two corners: the
  // room is symmetrical, so its decoration has to be too.
  banner(room, 'north', 2.6, 2.7, 0.95, [0, 0]);
  banner(room, 'north', -2.6, 2.7, 0.95, [1, 0]);
  banner(room, 'south', 2.6, 2.7, 0.95, [0, 1]);
  banner(room, 'west', 2.6, 2.7, 0.95, [0, 1]);
  statue(room, 1.2, 6.4, -Math.PI / 4, 'saint', 1.0);
  statue(room, 6.6, 1.4, (Math.PI * 3) / 4, 'saint', 1.0);
  sconce(room, 'east', 2.6, 2.0, false, false, 0, [1, 0]);
  sconce(room, 'west', -2.6, 2.0, false, false, 0, [0, 0]);

  /* --- decay ---------------------------------------------------------------------------- */
  debris(room, 8.4, 8.4, 0.8, 8);
  debris(room, -0.6, 8.8, 0.7, 7);
  debris(room, 8.8, -0.6, 0.7, 7);
  cobweb(room, -3.2, 2.9, -3.2, 1.1, 0.4);
  cobweb(room, 11.4, 2.9, 11.4, 1.1, 2.3);
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + 0.5;
    room.geo('cobweb', quad(1.6, 1.1), tiltMatrix([cx + Math.cos(a) * 4.4, 2.6, cz + Math.sin(a) * 4.4], [0.6, a, 0.4]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  dustMotes(room, cx, 1.8, cz, 3.4, 26);
  dustMotes(room, 9.4, 1.6, 9.4, 2.4, 14);
  // A pale wash on the vault over the corona, so the ceiling is not simply black
  // above the one bright thing in the room.
  room.geo('wash.warm', quad(4.4, 4.4), tiltMatrix([cx, 3.3, cz], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
