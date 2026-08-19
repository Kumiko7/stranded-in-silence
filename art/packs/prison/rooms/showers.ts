import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  cagedLamp,
  cyl,
  disc,
  drainChannel,
  floorGully,
  hangingChain,
  mopBucket,
  motes,
  notice,
  pendantBulb,
  puddle,
  sag,
  shelf,
  showerRow,
  steamPlume,
  wallStain,
  washTrough,
} from '../kit/props';

/**
 * The Wash-house - tile to shoulder height, a fall to the channel, and one head
 * still running after however long.
 *
 * The room is a lesson in what a floor can do: the tile is laid to a cross-fall
 * so everything drains to a gutter down the middle, and the normal map carries
 * that fall, which is the whole reason it reads as a wash-house rather than as a
 * bathroom. The one running shower puts steam in the air and a wet ring on the
 * tile, and it is the only sound cue the art can offer without playing a sound.
 *
 * It is an entrance room: four spawns, facing in, and the first thing anybody
 * sees is a row of standards with nothing under them.
 */
export const showers: RoomBlueprint = {
  id: 'prison.showers',
  nameKey: 'room.prison.showers',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 10,
  tags: ['blocks', 'entrance'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.9], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.5, 1.06, 2.9] },
      { position: [3.4, 1.34, 1.3] },
      { position: [1.5, 0, 2.4] },
    ],
    playerSpawn: [
      { position: [-1.2, 0, -1.6], rotationY: Math.PI },
      { position: [1.2, 0, -1.6], rotationY: Math.PI },
      { position: [-1.9, 0, -0.4], rotationY: Math.PI },
      { position: [1.9, 0, -0.4], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 1.6] },
      { position: [-2.4, 0, -0.8] },
      { position: [2.4, 0, -0.8] },
    ],
    enemySpawn: [{ position: [3.1, 0, 3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, showers);
  room.shell({
    floor: 'drain',
    wall: 'block',
    // Tile to shoulder height and painted block above it, which is exactly how a
    // building like this was finished: glaze where it gets wet, paint where it
    // only gets damp.
    band: 'tile',
    bandHeight: 2.0,
    ceiling: 'pipes',
    register: 'caged',
    mouth: 'gate',
    damp: true,
  });

  /* --- the standards ------------------------------------------------------------ */
  // Five heads on one header along the south wall, which is the wall the
  // blueprint never offers - the only edge guaranteed solid for a whole run.
  showerRow(room, 'south', 0, 5, 4.6, 3);

  // The gutter down the middle of the room, running under the standards. No
  // collider: you step over a gutter.
  drainChannel(room, [-3.4, 2.5], [3.4, 2.5], 0.28);
  floorGully(room, -3.1, 2.5, 0.15);
  floorGully(room, 3.1, 2.5, 0.15);
  puddle(room, 0.6, 1.4, 1.1);
  puddle(room, -2.2, 2.1, 0.7);

  /* --- what a wash-house has in it ---------------------------------------------- */
  // A trough sink in the far corner of the south wall and a slatted duckboard
  // bench along it, both well outside every door lane.
  washTrough(room, 'south', -2.7, 1.5);
  room.solid('timberPale', [1.7, 0.44, 0.4], [-2.5, 0, 2.9], 0, { tile: 0.4 });
  for (let i = 0; i < 6; i++) {
    room.box('timberPale', [0.2, 0.03, 0.44], [-3.2 + i * 0.28, 0.44, 2.9], 0, { tile: 0.2, castShadow: false });
  }
  shelf(room, 'east', -1.3, 1.34, 1.0, 0.3);
  room.geo('enamel', cyl(0.09, 0.08, 0.06, 9), poseMatrix([3.42, 1.37, 1.6]), { castShadow: false });
  room.box('itemCloth', [0.28, 0.1, 0.24], [3.4, 1.36, 1.0], 0.2, { tile: 0.3, castShadow: false });

  // A rail of hooks with two towels still on it, and the pipes feeding it all.
  room.box('lead', [2.6, 0.05, 0.05], [-2.2, 1.86, -3.4], 0, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('brass', cyl(0.008, 0.008, 0.1, 4), tiltMatrix([-3.3 + i * 0.55, 1.83, -3.4], [0.5, 0, 0]), { castShadow: false });
  }
  room.box('linen', [0.42, 0.9, 0.02], [-3.0, 0.94, -3.34], 0.05, { tile: 0.5, castShadow: false });
  room.box('linen', [0.36, 0.7, 0.02], [-1.6, 1.12, -3.34], -0.07, { tile: 0.5, castShadow: false });
  mopBucket(room, 2.3, 3.2, -0.5);
  hangingChain(room, -0.9, -2.7, 0.9, 'hook');

  /* --- damp -------------------------------------------------------------------- */
  wallStain(room, 'east', 2.2, 2.5, 0.7, 1.4, 'mould');
  wallStain(room, 'west', -2.4, 2.6, 0.6, 1.2, 'mould');
  wallStain(room, 'north', 1.6, 2.7, 0.5, 1.0, 'rust');
  notice(room, 'north', -2.5, 1.85, 0.5, 0.36);
  steamPlume(room, 0.2, 2.0, 0.1, 2.4, 1.6);
  motes(room, 0, 1.6, 1.2, 3.0, 12, 'lime');

  /* --- light --------------------------------------------------------------------- */
  // Two warm lamps and a lot of wet tile to bounce them off. The pendant hangs
  // over the walking lane rather than on a wall, because a wall lamp lights the
  // wall it is bolted to.
  const overhead = pendantBulb(room, 0, 0.2, 1.0, true, 11, true);
  if (overhead) {
    room.bakeShadow(overhead, 512);
    sag(room, overhead, 11, 0.24, 0.7);
  }
  const side = cagedLamp(room, 'south', 3.0, 2.45, true, 7);
  if (side) sag(room, side, 7, 0.4, 1.2);

  // The wet floor under the running head catches everything the lamp throws.
  room.geo('warmWash', disc(1.5, 16), tiltMatrix([0.6, 0.015, 1.9], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
