import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  cagedLamp,
  coalHeap,
  crate,
  cyl,
  debris,
  disc,
  furnace,
  gauge,
  ladder,
  motes,
  notice,
  pendantBulb,
  pipeRun,
  puddle,
  sag,
  steamPlume,
  strut,
  valve,
  wallStain,
} from '../kit/props';

/**
 * The Furnace - the only genuinely hot thing in the building, and the only room
 * where the light is coming from something other than a bulb.
 *
 * A lancashire boiler on two brick piers with the firebox door swung open and
 * the coke still in. Everything else in the room hangs off it: the flue, the
 * feed main, four gauges, the coal bunker, and a floor of ash that shows every
 * footprint anybody has left since.
 *
 * The fire is a DARK bed with incandescence between the lumps rather than a
 * glowing block. What makes a fire read as a fire is the black in it.
 */
export const boiler: RoomBlueprint = {
  id: 'prison.boiler',
  nameKey: 'room.prison.boiler',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [-3.25, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.1, 0.64, 2.2] },
      { position: [2.9, 0.62, -1.5] },
      { position: [1.0, 0, -2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, -0.4] },
      { position: [-2.2, 0, 0.6] },
      { position: [2.4, 0, -0.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -1.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, boiler);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'brick',
    band: 'none',
    ceiling: 'pipes',
    register: 'caged',
    mouth: 'arch',
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the boiler ---------------------------------------------------------------------- */
  // In the band against the wall the generator can never open, with its door
  // facing north so the fire lights the whole room from the far end. Its lamp is
  // the room's shadow caster: it is low, in front of the drum, and there is
  // nothing between it and any doorway.
  const fire = furnace(room, -0.4, 2.85, 0, true, 13);
  if (fire) room.bakeShadow(fire, 512);
  steamPlume(room, -0.4, 1.9, 0.4, 1.6, 1.2, 'smoke');

  // The flue and the feed main, run round the room at head height with a bracket
  // and a collar at every corner.
  pipeRun(
    room,
    [
      [0.1, 3.3, 3.2],
      [3.4, 3.3, 3.2],
      [3.4, 2.4, -3.3],
      [-3.4, 2.4, -3.4],
      [-3.4, 1.5, 1.2],
    ],
    0.09,
    'lead',
  );
  valve(room, [-3.35, 1.4, 1.4], 0.19, Math.PI / 2, true);
  strut(room, 'lead', [2.2, 2.4, -3.3], [2.2, 1.2, -3.3], 0.05, 5, { castShadow: false });
  valve(room, [2.2, 1.1, -3.3], 0.15, 0, false);
  gauge(room, 'north', -2.4, 1.9, 0.14);
  gauge(room, 'north', -1.95, 1.9, 0.1);
  gauge(room, 'east', 2.5, 1.85, 0.12);

  /* --- the bunker ------------------------------------------------------------------------ */
  coalHeap(room, 2.85, 2.5, 1.05, true);
  room.solid('surface.brick', [0.34, 0.72, 2.4], [1.85, 0, 2.6], 0, { tile: 0.8 });
  room.box('ironBar', [0.42, 0.06, 2.5], [1.85, 0.72, 2.6], 0, { tile: 0.4, castShadow: false });
  crate(room, 2.9, -1.5, -0.3, 0.78, 0.6, 0.6, false);
  ladder(room, 'east', -2.9);

  /* --- the works --------------------------------------------------------------------------- */
  // The water tank on a stand in the west corner, dripping, with a bucket under
  // it that has been there long enough to have a ring in it.
  room.solid('surface.rivet', [0.9, 0.62, 1.5], [-3.1, 0.62, 2.2], 0, { tile: 0.8 });
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      room.geo('ironBar', cyl(0.032, 0.032, 0.62, 5), poseMatrix([-3.1 + sx * 0.38, 0.31, 2.2 + sz * 0.6]), { castShadow: false });
    }
  }
  room.geo('water', disc(0.34, 12), tiltMatrix([-3.1, 1.2, 2.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('ironPale', cyl(0.16, 0.14, 0.28, 9), poseMatrix([-2.6, 0.14, 3.2]), { castShadow: false });
  puddle(room, -2.4, 3.1, 0.7);

  /* --- ash ---------------------------------------------------------------------------------- */
  room.geo('ash', disc(2.2, 16), tiltMatrix([-0.4, 0.012, 1.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  debris(room, -2.0, -2.4, 0.9, 7);
  debris(room, 1.4, 1.0, 0.7, 5);
  notice(room, 'north', 2.6, 2.05, 0.5, 0.36);
  wallStain(room, 'west', -2.6, 2.6, 0.6, 1.7, 'rust');
  wallStain(room, 'south', -2.8, 2.7, 0.5, 1.4, 'mould');
  motes(room, -0.4, 1.6, 1.2, 3.0, 14, 'dust');

  /* --- light ---------------------------------------------------------------------------------- */
  // The fire is one of the room's two lamps. The second is a pendant at the far
  // end - cold enough by comparison that the orange reads as heat rather than as
  // the colour of the room.
  const back = pendantBulb(room, 0.4, -2.4, ceilingHeight - 2.35, true, 7, true);
  if (back) sag(room, back, 7, 0.42, 1.3);
  cagedLamp(room, 'west', 2.4, 2.4, false);

  return room.finish();
}
