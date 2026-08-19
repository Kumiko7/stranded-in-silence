import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  alarmBell,
  barShadow,
  cagedLamp,
  chair,
  cyl,
  debris,
  disc,
  dutyDesk,
  gauge,
  keyBoard,
  motes,
  notice,
  pendantBulb,
  post,
  ring,
  sag,
  strut,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * The Lodge - the gate office, where the keys were and where the levers are.
 *
 * Every barred gate on this side of the building was worked from the frame in
 * the south-east corner: five long iron arms in a quadrant, four of them thrown
 * and one still standing up. Above the counter, the key board with its door
 * hanging open and about a third of the hooks bare.
 *
 * It is an entrance room, and it is deliberately the most legible space in the
 * map: the brightest, the most orderly, and the only one where a player can see
 * every corner from the doorway. Everything after it is worse.
 */
export const gatehouse: RoomBlueprint = {
  id: 'prison.gatehouse',
  nameKey: 'room.prison.gatehouse',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['blocks', 'entrance'],
  anchors: {
    chest: [{ position: [-2.7, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [2.7, 0, -3.35], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-1.1, 1.05, 2.4] },
      { position: [3.0, 0.79, 1.9] },
      { position: [1.5, 0, 2.6] },
    ],
    playerSpawn: [
      { position: [-1.2, 0, -0.6], rotationY: Math.PI },
      { position: [1.2, 0, -0.6], rotationY: Math.PI },
      { position: [-2.0, 0, 0.6], rotationY: Math.PI },
      { position: [2.0, 0, 0.6], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 1.0] },
      { position: [-2.7, 0, -1.6] },
      { position: [2.7, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -1.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gatehouse);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'quarry',
    wall: 'block',
    band: 'dado',
    bandHeight: 1.15,
    ceiling: 'joist',
    register: 'caged',
    mouth: 'gate',
    rail: true,
  });

  /* --- the counter ---------------------------------------------------------------- */
  // A gate lodge is a counter with a screen on it. The screen is bars rather than
  // glass, which is the one detail that separates this from a ticket office.
  room.solid('timberDark', [4.6, 1.0, 0.66], [-1.1, 0, 2.6], 0, { tile: 0.7 });
  room.box('timber', [4.8, 0.06, 0.8], [-1.1, 1.0, 2.6], 0, { tile: 0.5, castShadow: false });
  room.box('timberDark', [4.7, 0.1, 0.1], [-1.1, 0.42, 2.29], 0, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 11; i++) {
    room.geo('ironBar', cyl(0.019, 0.019, ceilingHeight - 1.1, 5), poseMatrix([-3.3 + i * 0.44, 1.06 + (ceilingHeight - 1.1) / 2, 2.6]), {
      tile: 0.2,
      castShadow: false,
    });
  }
  for (const y of [1.1, ceilingHeight - 0.1]) {
    room.box('ironBar', [4.7, 0.06, 0.08], [-1.1, y, 2.6], 0, { tile: 0.3, castShadow: false });
  }
  // The pass slot: a gap in the bars at hand height with a brass tray under it.
  room.box('ironBar', [0.7, 0.06, 0.09], [-1.1, 1.34, 2.6], 0, { tile: 0.2, castShadow: false });
  room.box('brass', [0.62, 0.03, 0.3], [-1.1, 1.0, 2.4], 0, { tile: 0.2, castShadow: false });
  room.box('paper', [0.24, 0.02, 0.18], [-1.35, 1.03, 2.38], 0.3, { tile: 0.2, castShadow: false });

  /* --- the keys ------------------------------------------------------------------- */
  keyBoard(room, 'south', -2.4, 2.0);
  notice(room, 'south', -0.2, 2.25, 0.7, 0.5, 'surface.cards');

  /* --- the levers ----------------------------------------------------------------- */
  // Five arms in a quadrant frame, four thrown and one standing. The one that is
  // still up is the whole prop - a rack of identical levers reads as a machine,
  // and one out of line reads as a decision somebody made.
  const lx = 2.9;
  const lz = 3.1;
  room.solid('ironBar', [1.5, 0.26, 0.5], [lx, 0, lz], 0, { tile: 0.5 });
  room.geo('ironBar', ring(0.5, 0.035, 12), tiltMatrix([lx, 0.5, lz], [0, 0, 0]), { tile: 0.3, castShadow: false });
  for (let i = 0; i < 5; i++) {
    const ax = lx - 0.56 + i * 0.28;
    const thrown = i !== 3;
    const tilt = thrown ? 0.72 : -0.16;
    room.geo('ironBar', cyl(0.026, 0.032, 1.15, 5), tiltMatrix([ax + Math.sin(tilt) * 0.5, 0.3 + Math.cos(tilt) * 0.52, lz], [0, 0, tilt]), {
      tile: 0.3,
      castShadow: false,
    });
    room.geo(thrown ? 'ironPale' : 'paintRed', cyl(0.045, 0.038, 0.14, 7), tiltMatrix([ax + Math.sin(tilt) * 1.02, 0.3 + Math.cos(tilt) * 1.06, lz], [0, 0, tilt]), {
      castShadow: false,
    });
    room.box('surface.stencil', [0.2, 0.09, 0.02], [ax, 0.3, lz - 0.27], 0, { tile: 0.2, castShadow: false });
  }
  gauge(room, 'south', 3.4, 1.95, 0.13);

  /* --- the office ------------------------------------------------------------------- */
  // Every solid thing in this room is either in the band against the south wall
  // or in a corner. All three other walls are offered to the generator, so the
  // strip in front of each of them has to stay walkable for the whole run.
  dutyDesk(room, 3.0, 1.9, Math.PI / 2, 1.4);
  chair(room, 1.8, -2.2, -0.6, 'timberDark');
  // The stove: an iron drum on legs with a flue up through the ceiling, which is
  // the one thing in a lodge that is not about locking somebody up.
  room.geo('ironBar', cyl(0.28, 0.3, 0.8, 10), poseMatrix([-3.05, 0.62, 1.7]), { tile: 0.4, castShadow: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    post(room, 'ironBar', 0.02, 0.02, 0.22, [-3.05 + Math.cos(a) * 0.2, 0, 1.7 + Math.sin(a) * 0.2], 4, { castShadow: false, receiveShadow: false });
  }
  room.geo('firebox', disc(0.14, 9), poseMatrix([-3.05, 0.5, 1.4], Math.PI), { castShadow: false, receiveShadow: false });
  strut(room, 'lead', [-3.05, 1.02, 1.7], [-3.05, ceilingHeight, 1.7], 0.09, 6, { castShadow: false });
  room.blockCircle(-3.05, 1.7, 0.34);
  room.geo('warmWash', disc(1.3, 14), tiltMatrix([-3.05, 0.014, 1.35], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- signage and wear ----------------------------------------------------------- */
  alarmBell(room, 'north', -2.0, 2.5, false);
  wallSign(room, 'north', -2.7, 2.4, 'green', 0.72);
  wallStain(room, 'west', 2.8, 2.4, 0.5, 1.4, 'rust');
  debris(room, -2.4, -1.2, 0.6, 4);
  motes(room, 0, 1.6, 0, 3.0, 10, 'dust');

  /* --- light -------------------------------------------------------------------------- */
  // Two lamps, and the room is deliberately the best lit in the map. The pendant
  // over the counter is the shadow caster: it stands clear of the screen and
  // throws the bars of it across the whole floor, which is the image the room is
  // arranged around.
  const over = pendantBulb(room, -1.1, 1.5, 0.9, true, 13);
  if (over) {
    room.bakeShadow(over, 512);
    sag(room, over, 13, 0.16, 0.55);
  }
  const back = cagedLamp(room, 'north', 2.4, 2.4, true, 7);
  if (back) sag(room, back, 7, 0.36, 1.1);
  barShadow(room, -1.1, 0.4, 4.4, 3.0, 0);

  return room.finish();
}
