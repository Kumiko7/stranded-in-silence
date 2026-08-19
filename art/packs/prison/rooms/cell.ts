import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  barShadow,
  barShadowWall,
  bunk,
  cagedLamp,
  cyl,
  debris,
  motes,
  notice,
  sag,
  shelf,
  tallyWall,
  wallStain,
} from '../kit/props';

/**
 * A Cell - the double they put four in, with one door and one window.
 *
 * The room a player meets more often than any other, so nearly all of its work
 * is done by the window: a barred casement onto the airing court with the moon
 * somewhere behind the cloud, throwing the only cold light in the Blocks across
 * a floor of bunks. Everything else is a shelf, a pail, and fifty years of
 * somebody counting.
 *
 * One door. There is no second way out of this room and there never was.
 */
export const cell: RoomBlueprint = {
  id: 'prison.cell',
  nameKey: 'room.prison.cell',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 11,
  tags: ['blocks', 'dead-end'],
  anchors: {
    chest: [{ position: [3.25, 0, 2.6], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.35, 0, 2.8], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [3.5, 1.46, -1.3] },
      { position: [-2.6, 0.63, 0.9] },
      { position: [0.9, 0, 2.7] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.2] },
      { position: [1.5, 0, -1.4] },
      { position: [-1.4, 0, 0.4] },
    ],
    enemySpawn: [{ position: [-3.0, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cell);
  room.shell({
    floor: 'concrete',
    wall: 'block',
    ceiling: 'joist',
    band: 'dado',
    bandHeight: 1.1,
    register: 'caged',
    mouth: 'gate',
    // The window is on the north wall, which the blueprint never offers, so it
    // is the one edge guaranteed solid for a whole run (ROOM_FORMAT.md §6).
    ports: [{ side: 'north', kind: 'bars', light: true }],
  });

  /* --- what they slept on ------------------------------------------------------ */
  // Two stacked bunks along the west wall and a single under the window, all of
  // them well clear of the south door lane. The unmade one is nearest the door,
  // which is the first thing a player sees on the way in.
  bunk(room, -2.65, -1.5, Math.PI / 2, true, true);
  bunk(room, -2.65, 0.9, Math.PI / 2, false, false);
  bunk(room, 2.6, -1.4, Math.PI / 2, false, true);

  /* --- what they were issued ---------------------------------------------------- */
  // A shelf on the east wall. `along` runs along the prop's own +X, which on an
  // east wall is -z - so `along: 1.3` lands at z = -1.3, and the item anchor
  // above is written to match (ROOM_FORMAT.md §2.1.1).
  shelf(room, 'east', 1.3, 1.42, 1.0, 0.28);
  room.geo('enamel', cyl(0.06, 0.05, 0.1, 8), poseMatrix([3.48, 1.5, -0.98]), { castShadow: false });
  room.box('paper', [0.16, 0.05, 0.12], [3.5, 1.45, -1.62], 0.3, { tile: 0.2, castShadow: false });
  room.box('itemCloth', [0.3, 0.09, 0.24], [3.48, 1.45, -1.05], -0.2, { tile: 0.3, castShadow: false });

  // A slop pail and an enamel basin in the corner, and a stool nobody moved.
  room.geo('ironPale', cyl(0.16, 0.14, 0.34, 9), poseMatrix([3.15, 0.17, 1.2]), { castShadow: false });
  room.geo('ironBar', ball(0.17, 8), tiltMatrix([3.15, 0.35, 1.2], [0, 0, 0], [1, 0.1, 1]), { castShadow: false });
  room.geo('porcelain', cyl(0.19, 0.13, 0.13, 10), poseMatrix([-2.6, 0.56, 0.9]), { castShadow: false });
  room.box('timber', [0.34, 0.42, 0.34], [-0.9, 0, 2.5], 0.3, { tile: 0.3, castShadow: false });
  room.blockCircle(-0.9, 2.5, 0.2);

  /* --- fifty years of counting --------------------------------------------------- */
  tallyWall(room, 'east', -1.9, 1.5, 1.5, 1.1);
  tallyWall(room, 'north', 1.7, 1.15, 1.0, 0.7);
  wallStain(room, 'west', -2.6, 2.3, 0.6, 1.9, 'mould');
  wallStain(room, 'south', 2.7, 2.6, 0.4, 1.3, 'rust');
  notice(room, 'south', -2.6, 1.9, 0.44, 0.6, 'paper');
  debris(room, 0.6, -2.6, 0.7, 5);
  motes(room, 0, 1.5, 0, 2.6, 10, 'dust');

  /* --- light ---------------------------------------------------------------------- */
  // Two lamps, and they are different temperatures on purpose: the window is the
  // only cold light in the Blocks and the caged fitting over the door is the
  // only warm one, so a player standing in the middle of this room is lit from
  // two sides in two colours. The window's lamp is spent by the shell.
  // On the EAST wall rather than beside the door. A wall lamp lights the wall it
  // is bolted to, and one on the wall a player enters through lights the room
  // behind them - which is exactly how this room came back black on its first
  // sheet (docs/art/ROOM_REVIEW.md).
  const lamp = cagedLamp(room, 'east', 2.7, 2.4, true, 10);
  if (lamp) sag(room, lamp, 10, 0.3, 0.9);

  // What the window actually does to the room: bars across the floor and up the
  // far wall, painted rather than cast. It is the image the whole map is for.
  barShadow(room, 0.4, 0.9, 2.6, 3.4, 0, true);
  barShadowWall(room, 'south', 0.2, 1.5, 2.2, 2.4, true);

  return room.finish();
}
