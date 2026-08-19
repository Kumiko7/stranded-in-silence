import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { balustrade, cobwebs, cyl, debris, lightShaft, longcaseClock, painting, rug, sconce, stairFlight } from '../kit/props';

/**
 * The Stair Hall (1x3) - twenty-four metres of corridor with a staircase in it.
 *
 * The manor's spine. A runner the whole length, a balustrade down one side of
 * the middle bay so the space reads as a landing over a stairwell, and a tall
 * window that puts a bar of moonlight across the floor exactly where you have to
 * cross it.
 */
export const landing: RoomBlueprint = {
  id: 'mansion.landing',
  nameKey: 'room.mansion.landing',
  footprint: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([0, 1], 'west'),
    ...wallsOn([0, 2], 'south', 'east'),
  ],
  weight: 5,
  maxPerMap: 1,
  tags: ['open', 'moonlit'],
  anchors: {
    playerSpawn: [
      { position: [-1.0, 0, 0.6], rotationY: Math.PI },
      { position: [1.0, 0, 0.6], rotationY: Math.PI },
      { position: [-1.0, 0, -0.6], rotationY: Math.PI },
      { position: [1.0, 0, -0.6], rotationY: Math.PI },
    ],
    chest: [{ position: [-3.15, 0, 17.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, 2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.2, 0.91, 5.6] },
      { position: [2.6, 0.0, 10.4] },
      { position: [-1.9, 0.0, 15.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [0, 0, 8.0] },
      { position: [0, 0, 15.4] },
    ],
    enemySpawn: [{ position: [2.7, 0, 17.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, landing);
  const { windowAnchors } = room.shell({
    floor: 'parquet',
    wall: 'damaskRed',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
    windows: [
      { cell: [0, 1], side: 'east', kind: 'glazed', light: true, tall: true },
      { cell: [0, 0], side: 'east', kind: 'boarded' },
    ],
  });
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.7, anchor.position[2]], [anchor.position[0] - 4.0, 0, anchor.position[2] + 0.6], 2.0);
  }

  rug(room, 0, 8.0, 2.6, 21.0);

  // The flight, at the north end, climbing into the dark.
  stairFlight(room, 'north', 2.4, 2.6, 9, [0, 0]);
  // And the landing rail along the middle bay, where the well would be.
  balustrade(room, -1.6, 8.0, 5.0, Math.PI / 2, 1.02);

  // A console table under the boarded window, and portraits the length of it.
  room.solid('wood', [1.6, 0.86, 0.46], [-3.2, 0, 5.6], -Math.PI / 2, { tile: 1.3 });
  room.box('woodDark', [1.7, 0.05, 0.52], [-3.2, 0.86, 5.6], -Math.PI / 2);
  room.geo('brass', cyl(0.05, 0.09, 0.3, 8), poseMatrix([-3.2, 0.98, 5.1]), {});

  painting(room, 'west', -2.2, 1.5, 0.8, 1.05, 0, [0, 0]);
  painting(room, 'west', 2.4, 1.62, 0.66, 0.86, 1, [0, 1]);
  painting(room, 'east', -2.6, 1.5, 0.9, 1.2, 2, [0, 2]);
  painting(room, 'east', 1.2, 1.58, 0.7, 0.95, 3, [0, 2]);
  painting(room, 'west', -1.4, 1.46, 1.0, 1.35, 1, [0, 2]);

  longcaseClock(room, 'west', -2.8, [0, 2]);

  // A runner rod on every step, half of them missing.
  for (let i = 0; i < 9; i++) {
    if (room.chance(0.4)) continue;
    room.geo('brass', cyl(0.014, 0.014, 2.3, 6), poseMatrix([2.4, 0.2 + i * 0.19, -3.5 + i * 0.27], Math.PI / 2), {
    });
  }

  // Somebody's suitcase, put down halfway and never picked up.
  room.solid('leather', [0.8, 0.24, 0.5], [2.6, 0, 10.4], 0.3, { tile: 1 });
  room.box('brass', [0.06, 0.1, 0.5], [2.6, 0.24, 10.4], 0.3);
  room.box('bookTan', [0.24, 0.05, 0.3], [-1.9, 0.0, 15.4], 0.7);

  // All three lit. A 1x3 has a budget of four and this hall spent two of them on
  // twenty-four metres of corridor: it was the darkest room in the pack by a
  // wide margin, and it is the one the manor is laid out around. The window
  // takes the fourth.
  sconce(room, 'west', 0.4, 2.1, true, [0, 0]);
  sconce(room, 'west', -1.6, 2.1, true, [0, 1]);
  sconce(room, 'east', 1.6, 2.1, true, [0, 2]);

  debris(room, 1.4, 12.6, 1.8, 12);
  debris(room, -1.6, 3.4, 1.4, 8);
  cobwebs(room, -3.2, -3.2, 0.8, 1.4);
  cobwebs(room, 3.2, 19.2, 3.9, 1.4);

  return room.finish();
}
