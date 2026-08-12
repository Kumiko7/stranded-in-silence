import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, boneHeap, candleStand, cobweb, cyl, debris, dustMotes, hangingLamp, quad, sarcophagus, sconce, skull } from '../kit/props';

/**
 * The Loculi - sixteen metres of other people's shelves.
 *
 * The pack's corridor: a long barrel-vaulted run with tomb chests down both
 * sides, a corpse shelf cut into each of the two walls the generator cannot open,
 * and a clear metre and a half down the middle so a team can move - which is
 * exactly what makes it frightening, because so can something else.
 *
 * A 2x1 is placed at most once per map, so this is a set piece rather than
 * filler, and its whole point is the SIGHTLINE. Everything solid is kept off the
 * centre line, and the lit lamps are staggered so there is always a dark stretch
 * between two of them.
 */
export const catacomb: RoomBlueprint = {
  id: 'crypt.catacomb',
  nameKey: 'room.crypt.catacomb',
  footprint: [
    [0, 0],
    [1, 0],
  ],
  doorWalls: [...wallsOn([0, 0], 'north', 'west'), ...wallsOn([1, 0], 'south', 'east')],
  weight: 9,
  tags: ['sanctum', 'corridor'],
  anchors: {
    chest: [{ position: [-3.15, 0, 2.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [11.15, 0, 2.5], rotationY: Math.PI / 2 }],
    // Both raised anchors are on the FOOT end of an effigy tomb's lid, clear of the
    // carved figure lying on it. The second one used to be at x = 8.2, which stopped
    // being a tomb when the north row was thinned from four chests to three - and an
    // item anchor whose furniture has moved is an item floating at chest height.
    itemSpawn: [
      { position: [4.2, 1.0, 2.5] },
      { position: [10.2, 1.0, -2.5] },
      { position: [6.2, 0, 0.5] },
      { position: [-1.6, 0, -2.8] },
    ],
    patrolPoint: [
      { position: [-2.0, 0, 0.2] },
      { position: [4.0, 0, -0.2] },
      { position: [8.0, 0, 0.2] },
      { position: [11.0, 0, -0.2] },
    ],
    enemySpawn: [{ position: [9.6, 0, 0.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, catacomb);
  room.shell({
    floor: 'slab',
    wall: 'ashlar',
    ceiling: 'barrel',
    dado: 'inscription',
    dadoHeight: 1.1,
    lamps: 'votive',
    lampSpacing: 2.6,
    mouth: 'gothic',
    niches: [
      { cell: [0, 0], side: 'south', kind: 'loculus' },
      { cell: [1, 0], side: 'north', kind: 'loculus' },
    ],
  });

  /* --- the tombs ------------------------------------------------------------------- */
  // Down both sides at z = +-2.5, and every position is chosen against the door
  // lanes: cell [0,0] may open north and west, cell [1,0] south and east, so the
  // gaps in the two rows are not symmetrical and they are not meant to be.
  const north: [number, 'flat' | 'gabled' | 'effigy'][] = [
    [2.6, 'gabled'],
    [6.0, 'flat'],
    [9.4, 'effigy'],
  ];
  const south: [number, 'flat' | 'gabled' | 'effigy'][] = [
    [0.7, 'flat'],
    [3.4, 'effigy'],
  ];
  for (const [x, lid] of north) {
    sarcophagus(room, x, -2.5, room.range(-0.03, 0.03), { lid, occupant: true });
  }
  for (const [x, lid] of south) {
    sarcophagus(room, x, 2.5, Math.PI + room.range(-0.03, 0.03), { lid, occupant: true });
  }
  // One of them stands open, halfway down, where a team walking the corridor will
  // pass it twice before anybody looks in.
  //
  // At x = 5.4 and NOT 8.4: cell [1,0] offers its south wall, so its doorway is
  // centred on x = 8, and a 2.4 m tomb chest sitting there is a door that is a wall
  // on the one seed where it is the only door the generator opened.
  sarcophagus(room, 5.4, 2.5, Math.PI, { lid: 'flat', open: true, occupant: false });
  boneHeap(room, 5.4, 1.7, 0.5, 8);
  skull(room, 4.4, 0.03, 1.6, room.range(0, 6), 1.0, 'boneDark');

  /* --- the walls between them ------------------------------------------------------ */
  // Blind arcading in the gaps, so the two long walls read as a designed run
  // rather than as eight metres of the same ashlar.
  // The x positions are chosen against BOTH the doorways and the two niches: a
  // plaque half over a corpse shelf is the sort of thing no collider check sees.
  for (const x of [1.6, 4.0, 6.4, 9.6]) {
    for (const s of [-1, 1]) {
      const z = s * 3.66;
      const yaw = s < 0 ? 0 : Math.PI;
      room.geo('surface.inscription', quad(0.72, 0.5), poseMatrix([x, 1.86, z], yaw), { tile: 0.55, castShadow: false });
      room.geo('stonePale', ball(0.07, 6), poseMatrix([x - 0.44, 2.16, z]), { castShadow: false });
      room.geo('stonePale', ball(0.07, 6), poseMatrix([x + 0.44, 2.16, z]), { castShadow: false });
      // The arch over the plaque: three voussoirs, each rolled to its own tangent.
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * ((i + 0.5) / 3);
        room.geo(
          'stone',
          cyl(0.055, 0.055, 0.3, 4),
          tiltMatrix([x - Math.cos(a) * 0.46, 2.2 + Math.sin(a) * 0.3, z - s * 0.05], [Math.PI / 2, 0, a - Math.PI / 2]),
          { tile: 0.3, castShadow: false },
        );
      }
    }
  }

  /* --- light ----------------------------------------------------------------------- */
  // Three real lights for a two-cell room, and they are staggered rather than
  // spaced: two pools with a dark stretch between them is a corridor, three even
  // ones is a lit hall.
  hangingLamp(room, 1.4, 0, 1.1, true, 7);
  hangingLamp(room, 9.0, 0, 1.1, true, 7);
  candleStand(room, 5.6, 0.6, true, 1.2, 6);
  sconce(room, 'north', -2.6, 1.95, false, false, 0, [1, 0]);
  sconce(room, 'south', 2.6, 1.95, false, false, 0, [0, 0]);

  /* --- decay ----------------------------------------------------------------------- */
  debris(room, 0.2, -3.0, 0.7, 7);
  debris(room, 7.4, 3.0, 0.7, 7);
  debris(room, 11.2, -0.4, 0.6, 6);
  cobweb(room, -3.2, 2.7, -3.2, 1.0, 0.4);
  cobweb(room, 11.4, 2.8, 3.2, 0.9, 2.3);
  for (let i = 0; i < 4; i++) {
    room.geo('cobweb', quad(1.4, 1.0), tiltMatrix([1.2 + i * 3.0, 2.5, room.range(-1.2, 1.2)], [0.7, room.range(0, 3), 0.4]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  dustMotes(room, 4.0, 1.5, 0, 3.4, 16);
  dustMotes(room, 9.0, 1.5, 0, 2.4, 10);

  return room.finish();
}
