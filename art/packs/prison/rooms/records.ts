import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  cagedLamp,
  cardWall,
  cyl,
  disc,
  filingCabinet,
  ladder,
  motes,
  notice,
  paperDrift,
  pendantBulb,
  sag,
  slab,
  wallStain,
} from '../kit/props';

/**
 * Records - four corners of filing and a ceiling that has started to come down.
 *
 * The second of the pack's two four-door rooms, and it is laid out the way that
 * forces: with every wall offered to the generator there is no guaranteed band
 * anywhere, so every cabinet stands in a corner, every card rack is hung well
 * clear of the middle of its wall, and the floor between them is ankle deep in
 * paper that carries no collider at all.
 *
 * The patch of lath and plaster missing from the ceiling is the room's one
 * vertical event, and everything under it is soaked.
 */
export const records: RoomBlueprint = {
  id: 'prison.records',
  nameKey: 'room.prison.records',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [-3.3, 0, 1.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.4, 0.8, 3.0] },
      { position: [2.5, 1.52, 3.2] },
      { position: [0.6, 0, 2.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.8, 0, -1.8] },
      { position: [1.8, 0, 1.8] },
    ],
    enemySpawn: [{ position: [2.0, 0, -2.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, records);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'block',
    band: 'dado',
    bandHeight: 1.0,
    // The failed patch. A ceiling with a hole in it is worth four ceilings
    // without one, and this is the only room in the Blocks that gets it.
    ceiling: 'lath',
    register: 'caged',
    mouth: 'gate',
  });

  /* --- the corners ------------------------------------------------------------------ */
  // Three cabinets to a corner, in two of the four; the other two take a table
  // and the containers. One drawer open per corner, at a different height each
  // time, which is what stops a bank of them reading as a wall.
  filingCabinet(room, -3.2, -2.5, -Math.PI / 2, 2, 4);
  filingCabinet(room, -3.2, -1.85, -Math.PI / 2, -1, 4);
  filingCabinet(room, -2.5, -3.2, Math.PI, -1, 4);
  filingCabinet(room, 1.9, -3.2, Math.PI, -1, 4);
  filingCabinet(room, 3.2, 2.5, Math.PI / 2, 0, 4);
  filingCabinet(room, 3.2, 1.85, Math.PI / 2, -1, 4);
  filingCabinet(room, 2.5, 3.2, 0, 3, 4);

  // A sorting table in the fourth corner, buried. It is the one flat surface in
  // the room and there is nothing on it that anybody filed.
  room.solid('timber', [1.3, 0.75, 0.7], [-2.4, 0, 3.0], 0.2, { tile: 0.5 });
  room.box('timber', [1.4, 0.05, 0.78], [-2.4, 0.75, 3.0], 0.2, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 5; i++) {
    slab(room, 'paper', [0.28, 0.05, 0.36], [-2.65 + i * 0.14, 0.8 + i * 0.02, 2.9 + room.range(-0.12, 0.12)], [0, room.range(0, 3), 0], { tile: 0.3 });
  }
  room.geo('brass', cyl(0.05, 0.06, 0.1, 9), poseMatrix([-2.0, 0.8, 3.2]), { castShadow: false });

  /* --- the racks --------------------------------------------------------------------- */
  // Card walls hung well off the middle of each wall, so a doorway can open
  // anywhere without one landing across it.
  cardWall(room, 'north', -2.5, 1.7, 2.0, 1.5);
  cardWall(room, 'east', 2.5, 1.6, 2.0, 1.5);
  cardWall(room, 'south', 0.4, 1.7, 2.0, 1.5);
  cardWall(room, 'west', -0.2, 1.65, 2.0, 1.4);
  ladder(room, 'south', -3.1);

  /* --- the paper --------------------------------------------------------------------- */
  // It carries no collider, which is the whole reason there can be this much of
  // it in a room where nothing else may stand.
  paperDrift(room, 0.4, -0.6, 1.9, 16);
  paperDrift(room, -1.4, 1.9, 1.3, 10);
  paperDrift(room, 2.2, -1.4, 1.1, 8);
  notice(room, 'north', 2.6, 2.1, 0.5, 0.36);
  wallStain(room, 'east', -2.4, 2.5, 0.7, 1.7, 'mould');
  wallStain(room, 'west', 2.6, 2.6, 0.6, 1.5, 'mould');
  motes(room, 0, 1.7, 0, 3.2, 14, 'dust');

  /* --- light ---------------------------------------------------------------------------- */
  // The pendant hangs in the middle of the room with no shade, directly under the
  // hole in the ceiling, so what a player sees first from any doorway is a bare
  // filament with a black square of joists behind it.
  const bare = pendantBulb(room, 0.2, -0.4, ceilingHeight - 2.1, true, 12, false);
  if (bare) {
    room.bakeShadow(bare, 512);
    sag(room, bare, 12, 0.3, 0.9);
  }
  const corner = cagedLamp(room, 'west', -2.9, 2.4, true, 6);
  if (corner) sag(room, corner, 6, 0.42, 1.3);
  room.geo('warmWash', disc(2.6, 18), tiltMatrix([0.2, 0.013, -0.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
