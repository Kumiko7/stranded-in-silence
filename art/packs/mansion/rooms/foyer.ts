import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { ALL_WALLS, Room } from './common';
import { bust, chandelier, cobwebs, debris, painting, rug, sideboard, stairFlight } from '../kit/props';

/**
 * The Grand Foyer - where the family greeted people they despised.
 *
 * Black-and-white marble, a coffered ceiling, and a staircase that climbs into a
 * dark you never get to walk into. It is the most open room in the pack on
 * purpose: the place four players naturally regroup, and the place that offers
 * the enemy the longest sightline in the manor.
 */
export const foyer: RoomBlueprint = {
  id: 'mansion.foyer',
  nameKey: 'room.mansion.foyer',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 7,
  maxPerMap: 1,
  tags: ['entrance', 'open', 'grand'],
  anchors: {
    playerSpawn: [
      { position: [-0.9, 0, 0.4], rotationY: Math.PI },
      { position: [0.9, 0, 0.4], rotationY: Math.PI },
      { position: [-0.9, 0, -0.7], rotationY: Math.PI },
      { position: [0.9, 0, -0.7], rotationY: Math.PI },
    ],
    // Backed against the west wall, facing east into the hall.
    chest: [{ position: [-3.05, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.15, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.91, 3.44] },
      { position: [1.9, 0.96, -3.45] },
      { position: [-2.9, 0.0, 0.2] },
    ],
    patrolPoint: [
      { position: [-2.4, 0, 0] },
      { position: [2.4, 0, 0] },
      { position: [0, 0, -2.6] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, foyer);
  room.shell({
    floor: 'marble',
    wall: 'damaskGreen',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
  });

  // The staircase, offset so it never stands in a doorway.
  stairFlight(room, 'south', -2.5, 2.4, 8);

  chandelier(room, 0.4, -0.6, 0.74, true, 2);

  bust(room, -1.9, -3.45, 0.5);
  bust(room, 1.9, -3.45, -0.5);
  sideboard(room, 'south', 2.6, 1.5);
  rug(room, 0.4, 0.2, 3.4, 2.6, 0.06);

  // Portraits of people who stopped writing letters in 1934.
  painting(room, 'east', -1.9, 1.55, 0.78, 1.02, 0);
  painting(room, 'east', 0.9, 1.62, 0.62, 0.84, 2);
  painting(room, 'west', 1.6, 1.5, 0.86, 1.14, 1);

  // A coat stand went over years ago and nobody picked it up.
  room.box('woodDark', [1.7, 0.09, 0.09], [2.7, 0.05, -1.7], 0.7);
  room.box('woodDark', [0.4, 0.06, 0.4], [3.3, 0.01, -2.2], 0.7);
  room.box('velvetGreen', [0.34, 0.1, 0.5], [2.2, 0.02, -1.3], 1.1);

  debris(room, 1.4, 2.2, 1.3, 9);
  debris(room, -3.0, -1.4, 0.9, 5);
  cobwebs(room, -3.2, -3.2, 0.8);
  cobwebs(room, 3.2, 3.2, 3.9);

  return room.finish();
}
