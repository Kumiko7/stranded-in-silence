import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { ALL_WALLS, Room } from './common';
import {
  cagedLamp,
  crate,
  debris,
  laundryDrum,
  mangle,
  mopBucket,
  motes,
  notice,
  pendantBulb,
  pipeRun,
  puddle,
  sag,
  steamPlume,
  valve,
  wallStain,
  washingLine,
} from '../kit/props';

/**
 * The Laundry - two drums, a mangle, and a room full of hanging sheets.
 *
 * This is the pack's four-door room, and its layout follows from that: with
 * every wall offered to the generator there is no band of guaranteed floor
 * anywhere, so every solid thing in it stands in a corner and the middle is
 * given over to washing on lines - which carry no collider at all and are
 * therefore the one way to break a sight line in a room that cannot afford
 * furniture.
 *
 * The sheets are double-sided and faintly self-lit. A single-sided blade with a
 * lamp behind it goes black and reads as a hole cut in the room; real linen
 * backlit glows (docs/art/ROOM_REVIEW.md).
 */
export const laundry: RoomBlueprint = {
  id: 'prison.laundry',
  nameKey: 'room.prison.laundry',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [-3.3, 0, 1.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, 1.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.9, 0.64, -2.6] },
      { position: [2.4, 0.52, 3.1] },
      { position: [-1.8, 0, -1.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.4, 0, 0.6] },
      { position: [2.3, 0, 2.3] },
    ],
    enemySpawn: [{ position: [1.7, 0, -3.05] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, laundry);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'block',
    band: 'tile',
    bandHeight: 1.5,
    ceiling: 'pipes',
    register: 'caged',
    mouth: 'gate',
    damp: true,
  });

  /* --- the corners, because nothing may stand anywhere else ---------------------- */
  laundryDrum(room, -2.7, -2.7, 0.35, true);
  laundryDrum(room, 2.75, -2.6, -0.5, false);
  mangle(room, -2.8, 3.0, 0.14);
  crate(room, 2.9, -2.6, -0.3, 0.84, 0.62, 0.66, true);
  crate(room, 2.4, 3.1, 0.4, 0.72, 0.5, 0.6, false);
  mopBucket(room, -3.0, -1.5, 0.6);

  // The steam main, run round the north-west corner where the drums are fed
  // from, with its valve at the low end. Everything above head height, so the
  // door lanes never see it.
  pipeRun(
    room,
    [
      [-3.45, 2.5, 3.2],
      [-3.45, 2.5, -3.2],
      [-0.4, 2.5, -3.45],
      [3.2, 2.5, -3.45],
    ],
    0.07,
    'lead',
  );
  pipeRun(room, [[-3.45, 2.5, -1.4], [-3.2, 1.4, -1.4]], 0.05, 'lead', false);
  valve(room, [-3.2, 1.3, -1.4], 0.16, 0, true);
  steamPlume(room, -3.1, -1.3, 1.4, 1.4, 0.9);

  /* --- the washing --------------------------------------------------------------- */
  // Three lines across the room at two heights and two angles. They carry no
  // collider, so they break the sight line without costing a metre of floor -
  // which is the only tool a four-door room has.
  washingLine(room, [-3.4, 2.25, -0.6], [3.4, 2.25, 0.4], 3, 1.45);
  washingLine(room, [-0.4, 2.45, -3.4], [0.6, 2.45, 3.4], 3, 1.25);
  washingLine(room, [-3.4, 2.05, 2.4], [-0.2, 2.05, 3.4], 2, 1.15);

  /* --- damp ---------------------------------------------------------------------- */
  puddle(room, -1.9, -1.6, 0.9);
  puddle(room, 2.2, 1.4, 0.6);
  wallStain(room, 'north', -2.9, 2.3, 0.7, 1.6, 'mould');
  wallStain(room, 'west', 2.6, 2.5, 0.5, 1.3, 'rust');
  notice(room, 'south', 2.7, 1.9, 0.5, 0.36);
  debris(room, 1.6, -3.0, 0.7, 5);
  motes(room, 0, 1.7, 0, 3.2, 12, 'lime');

  /* --- light ----------------------------------------------------------------------- */
  // The pendant hangs dead centre and low, so the sheets are between it and
  // every doorway - which is the entire reason for hanging them.
  const overhead = pendantBulb(room, 0.3, 0.2, ceilingHeight - 2.05, true, 12, true);
  if (overhead) {
    room.bakeShadow(overhead, 512);
    sag(room, overhead, 12, 0.22, 0.65);
  }
  const corner = cagedLamp(room, 'north', 2.9, 2.4, true, 6);
  if (corner) sag(room, corner, 6, 0.45, 1.4);
  cagedLamp(room, 'south', -2.9, 2.4, false);

  return room.finish();
}
