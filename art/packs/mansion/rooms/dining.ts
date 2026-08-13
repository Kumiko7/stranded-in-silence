import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { ALL_WALLS, Room } from './common';
import { candelabra, chair, chandelier, cobwebs, curtains, debris, painting, rug, sideboard, table } from '../kit/props';

/**
 * The Dining Room - twelve places laid, and the soup never came.
 *
 * The long table is the room: it forces you round the outside, and the two
 * chandeliers over it mean whoever is at the far end is lit and visible. Half
 * the chairs are still pushed in.
 */
export const dining: RoomBlueprint = {
  id: 'mansion.dining',
  nameKey: 'room.mansion.dining',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['grand'],
  anchors: {
    chest: [{ position: [-3.0, 0, -2.9], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.2, 0, 2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.5, 0.79, 0.0] },
      { position: [1.7, 0.79, 0.0] },
      { position: [2.55, 0.88, -3.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.6] },
      { position: [0, 0, -2.6] },
      { position: [-2.7, 0, 0] },
      { position: [2.7, 0, 0] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, dining);
  room.shell({
    floor: 'parquet',
    wall: 'damaskRed',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
  });

  rug(room, 0, 0, 5.4, 3.2);
  table(room, 0, 0, 4.6, 1.5, 0.78, 0);

  // Laid for a dinner that never happened.
  //
  // The cloth has a drop over the edges rather than being a 2 cm slab laid on
  // the top. A flat white rectangle on a dark table is the brightest and the
  // flattest thing in the room at the same time - under two chandeliers it read
  // as a plank of white card floating on a black box. The overhang is what turns
  // it into linen: the sides catch the candles at a different angle from the top.
  room.box('linen', [4.7, 0.02, 1.62], [0, 0.78, 0], 0, { tile: 1.6 });
  for (const [w, d, dx, dz] of [
    [4.7, 0.04, 0, 0.81],
    [4.7, 0.04, 0, -0.81],
    [0.04, 1.62, 2.35, 0],
    [0.04, 1.62, -2.35, 0],
  ] as const) {
    room.box('linen', [w, 0.34, d], [dx, 0.46, dz], 0, { tile: 1.2 });
  }
  // Folds down the drop, so the hem is not four straight edges.
  for (let i = 0; i < 12; i++) {
    const x = -2.2 + i * 0.4;
    for (const z of [0.83, -0.83]) {
      room.box('linen', [0.06, 0.32, 0.05], [x, 0.46, z], 0, { tile: 0.8 });
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = -1.9 + i * 0.76;
    for (const z of [-0.44, 0.44]) {
      room.box('porcelain', [0.24, 0.02, 0.24], [x, 0.8, z]);
      room.box('silver', [0.02, 0.005, 0.14], [x - 0.19, 0.8, z]);
      room.box('silver', [0.02, 0.005, 0.14], [x + 0.19, 0.8, z]);
      if (room.chance(0.6)) room.box('glass', [0.06, 0.13, 0.06], [x + 0.11, 0.8, z - 0.24]);
    }
  }
  candelabra(room, [-1.5, 0.8, 0], 4);
  candelabra(room, [1.7, 0.8, 0], 4);

  // Six chairs still pushed in, two knocked over, four missing.
  for (let i = 0; i < 3; i++) {
    chair(room, -1.7 + i * 1.7, -1.35, 0.02);
    if (room.chance(0.7)) chair(room, -1.7 + i * 1.7, 1.35, Math.PI + 0.02);
  }
  chair(room, -2.9, 1.9, 1.2);
  chair(room, 2.6, -1.9, -0.6);

  chandelier(room, -1.5, 0, 0.6, true, 2);
  chandelier(room, 1.7, 0, 0.55, false, 1);

  sideboard(room, 'north', -2.55, 1.7);
  room.box('silver', [0.16, 0.3, 0.16], [2.2, 0.88, -3.4]);
  room.box('silver', [0.22, 0.06, 0.22], [2.9, 0.88, -3.35], 0.3);

  curtains(room, 'east', -2.6, 1.9, 2.7);
  painting(room, 'west', -1.9, 1.5, 1.1, 1.5, 3);

  debris(room, -2.6, 2.9, 1.0, 7);
  cobwebs(room, -3.2, -3.2, 0.8, 1.3);
  cobwebs(room, 3.2, 3.2, 3.9, 1.1);

  return room.finish();
}
