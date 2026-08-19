import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  ball,
  barShadow,
  cagedLamp,
  chair,
  crate,
  cyl,
  debris,
  disc,
  dutyDesk,
  motes,
  notice,
  pendantBulb,
  post,
  ring,
  sag,
  shelf,
  showerRow,
  slab,
  steamPlume,
  strut,
  tinStack,
  tubeLight,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * Reception - the hinge room, and the one place in Blackgate that is honestly
 * both halves of the building at once.
 *
 * A gaol counter and a key rack on one side; a delousing standard, a weighing
 * machine and a height chart on the other. The walls are the Ward's glazed tile
 * and the ironmongery is the Blocks': a barred gate frame round every opening,
 * a caged tungsten course along the skirting, and a strip of clinical cold over
 * the scales. Nothing else in the map mixes them, which is what makes the seam
 * read as deliberate rather than as an accident of the generator.
 *
 * It is where a person stopped being a prisoner and became a subject, and every
 * prop in it is a step in that process, laid out left to right.
 */
export const intake: RoomBlueprint = {
  id: 'prison.intake',
  nameKey: 'room.prison.intake',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['hinge', 'entrance'],
  anchors: {
    chest: [{ position: [-3.3, 0, 2.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.35, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.5, 0.8, -2.75] },
      { position: [2.6, 1.35, 2.9] },
      { position: [2.5, 0.32, -3.0] },
    ],
    playerSpawn: [
      { position: [-1.2, 0, 1.4], rotationY: 0 },
      { position: [1.2, 0, 1.4], rotationY: 0 },
      { position: [-1.2, 0, -1.4], rotationY: Math.PI },
      { position: [1.2, 0, -1.4], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.8, 0, 1.8] },
      { position: [1.8, 0, -1.8] },
    ],
    enemySpawn: [{ position: [-1.6, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, intake);
  room.shell({
    floor: 'terrazzo',
    // Glazed tile to shoulder height, painted block above - the Ward's surface
    // on the Blocks' wall, which is the whole idea of the room.
    wall: 'block',
    band: 'tile',
    bandHeight: 1.9,
    ceiling: 'joist',
    // And the Blocks' ironwork and warm night circuit on top of it.
    register: 'caged',
    mouth: 'gate',
    rail: true,
  });

  /* --- one: the counter --------------------------------------------------------------- */
  // Every wall is offered to the generator here, so nothing solid may stand near
  // the middle of one. The whole process therefore runs round the four corners.
  dutyDesk(room, -2.5, -2.75, 0, 1.5);
  chair(room, -1.7, -1.9, -0.7, 'timberDark');
  crate(room, -3.0, -1.5, 0.3, 0.7, 0.5, 0.58, true);

  /* --- two: the property ---------------------------------------------------------------- */
  // A rack of numbered pigeon holes with what people came in with still in them:
  // a shoe, a hat, a bundle tied with string.
  room.solid('timberDark', [0.42, 1.9, 2.2], [3.4, 0, -2.5], 0, { tile: 0.6 });
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      const y = 0.3 + r * 0.44;
      const z = -3.35 + k * 0.55;
      room.box('timberPale', [0.03, 0.42, 0.5], [3.2, y, z], 0, { tile: 0.3, castShadow: false });
      if (room.chance(0.55)) {
        room.geo(room.chance(0.5) ? 'itemCloth' : 'leather', ball(room.range(0.07, 0.13), 6), tiltMatrix([3.28, y + 0.12, z], [0, room.range(0, 3), 0], [1.3, 0.8, 1.1]), {
          castShadow: false,
        });
      }
      room.box('surface.stencil', [0.02, 0.06, 0.12], [3.18, y + 0.02, z], 0, { tile: 0.2, castShadow: false });
    }
  }

  /* --- three: the standard --------------------------------------------------------------- */
  // Delousing: one shower head over a tiled bay in the corner, with a drain and
  // the carbolic still in the air.
  showerRow(room, 'north', -2.7, 1, 0.1, 0);
  room.geo('surface.wardTile', cyl(1.05, 1.05, 0.05, 14), poseMatrix([2.7, 0.025, -3.0]), { tile: 0.9, castShadow: false });
  steamPlume(room, 2.7, -3.0, 0.1, 1.7, 1.0);

  /* --- four: the measure ------------------------------------------------------------------ */
  // A weighing machine with a brass beam, and the height chart painted on the
  // tile behind it. The chart is the image the room is remembered by.
  room.solid('enamel', [0.7, 0.16, 0.62], [2.6, 0, 2.9], 0, { tile: 0.4 });
  room.box('surgical', [0.62, 0.03, 0.54], [2.6, 0.16, 2.9], 0, { tile: 0.3, castShadow: false });
  post(room, 'surgical', 0.02, 0.026, 1.34, [2.28, 0.16, 2.9], 6, { castShadow: false, receiveShadow: false });
  room.box('brass', [0.5, 0.035, 0.05], [2.5, 1.48, 2.9], 0.04, { tile: 0.2, castShadow: false });
  room.geo('brass', cyl(0.05, 0.05, 0.03, 9), poseMatrix([2.74, 1.44, 2.9]), { castShadow: false });
  room.box('surface.stencil', [0.16, 1.9, 0.02], [3.66, 1.1, 2.9], 0, { tile: 1.1, castShadow: false });
  for (let i = 0; i < 9; i++) {
    room.box('lumenTungsten', [0.1, 0.012, 0.012], [3.6, 0.4 + i * 0.2, 2.9], 0, { castShadow: false });
  }
  shelf(room, 'east', -2.9, 1.35, 0.9, 0.28);
  tinStack(room, 3.44, 1.38, 2.9, 4, 0.09);

  /* --- five: what came next ---------------------------------------------------------------- */
  // A door-shaped patch of tile in the south-west corner where a sign used to be,
  // and one that is still there. Nobody in this building ever wrote down what
  // happened after Reception.
  notice(room, 'south', -2.7, 2.15, 0.6, 0.42, 'surface.cards');
  wallSign(room, 'west', 2.5, 2.4, 'green', 0.7);
  wallSign(room, 'east', 2.5, 2.4, 'red', 0.7);
  wallStain(room, 'north', 2.5, 2.5, 0.5, 1.2, 'rust');
  debris(room, -1.6, 2.6, 0.8, 5);
  motes(room, 0, 1.6, 0, 3.0, 12, 'dust');
  slab(room, 'paper', [0.24, 0.01, 0.3], [2.5, 0.32, -3.0], [0, 0.4, 0], { tile: 0.25 });

  /* --- light ------------------------------------------------------------------------------- */
  // Two lamps, one of each temperature, which is the room's whole thesis: a warm
  // tungsten pendant over the counter end and a cold clinical batten over the
  // scales. Walk from one to the other and the building changes underneath you.
  const warm = pendantBulb(room, -1.2, -1.0, 0.95, true, 10);
  if (warm) {
    room.bakeShadow(warm, 512);
    sag(room, warm, 10, 0.26, 0.8);
  }
  tubeLight(room, 2.2, 2.6, 1.9, Math.PI / 2, true, true, 7, 0.42);
  cagedLamp(room, 'south', 2.7, 2.45, false);
  barShadow(room, -1.4, -1.2, 2.4, 3.0, 0.4);
  room.geo('coldWash', disc(1.9, 16), tiltMatrix([2.4, 0.014, 2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
