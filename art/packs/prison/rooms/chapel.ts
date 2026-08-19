import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cagedLamp,
  candleRow,
  cyl,
  debris,
  disc,
  motes,
  notice,
  pew,
  post,
  ring,
  sag,
  slab,
  wallStain,
} from '../kit/props';

/**
 * The Chapel - the oldest room in the gaol, and the only saturated colour in it.
 *
 * Three lancets of stained glass on the one wall the generator can never open,
 * with a brick barrel vault over the room and quarry tile underfoot. The window
 * is a PICTURE and not a light: it is unlit, so it survives the dark and never
 * becomes the room's lamp. What lights the chapel is the candle bank under it,
 * which is both correct and the only arrangement in which a stained window reads
 * as stained glass rather than as a lamp with a pattern on it.
 *
 * The figures in the outer lights are holding keys. The one in the middle is
 * holding something else.
 */
export const chapel: RoomBlueprint = {
  id: 'prison.chapel',
  nameKey: 'room.prison.chapel',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['blocks'],
  anchors: {
    chest: [{ position: [-3.25, 0, 2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [0.9, 1.0, 2.78] },
      { position: [-2.5, 0.5, -2.2] },
      { position: [3.2, 1.19, 1.5] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.6] },
      { position: [-2.6, 0, 0.2] },
      { position: [2.6, 0, 0.2] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, chapel);
  room.shell({
    floor: 'quarry',
    wall: 'brick',
    band: 'none',
    ceiling: 'vault',
    register: 'caged',
    mouth: 'arch',
    ports: [{ side: 'south', kind: 'lancet' }],
  });

  /* --- the altar -------------------------------------------------------------------- */
  // Under the window, in the band against the wall the blueprint never offers -
  // the layout rule this whole pack is written to, and it puts the set piece and
  // the view on the same wall for free.
  room.solid('timberDark', [1.9, 0.96, 0.62], [0.3, 0, 2.9], 0, { tile: 0.6 });
  room.box('timber', [2.05, 0.05, 0.72], [0.3, 0.96, 2.9], 0, { tile: 0.5, castShadow: false });
  room.box('linen', [1.8, 0.34, 0.66], [0.3, 0.66, 2.88], 0, { tile: 0.6, castShadow: false });
  // A fall of cloth with a roll in it. A smooth cloth under a lamp is a plank
  // (docs/art/ROOM_REVIEW.md).
  room.geo('linen', cyl(0.05, 0.05, 1.7, 6), tiltMatrix([0.3, 0.64, 2.56], [0, 0, Math.PI / 2]), { castShadow: false });
  candleRow(room, 0.3, 1.01, 2.78, 5, 1.3);

  // A plain cross of two timbers, leaning against the wall rather than hung: the
  // fixing came out of the brick years ago and nobody has been up a ladder since.
  room.geo('timberDark', cyl(0.05, 0.05, 1.4, 6), tiltMatrix([-1.6, 1.55, 3.42], [0.12, 0, 0.14]), { tile: 0.3, castShadow: true });
  room.geo('timberDark', cyl(0.045, 0.045, 0.66, 6), tiltMatrix([-1.53, 1.8, 3.38], [0.12, 0, Math.PI / 2 + 0.14]), { tile: 0.3, castShadow: false });

  /* --- the congregation -------------------------------------------------------------- */
  // Three pews, all of them back in the north corners facing the altar, and the
  // eight metres between them and it left empty. Every wall but the south one is
  // offered to the generator, so the band against the window is the only
  // guaranteed floor in the room - and an altar with nothing in front of it is
  // worth more than a room full of seating anyway.
  pew(room, -2.6, -2.2, 0, 2.0);
  pew(room, 2.6, -2.2, 0, 2.0);
  pew(room, 2.6, -3.15, 0, 2.0);
  room.box('paper', [0.16, 0.03, 0.12], [-2.5, 0.47, -2.2], 0.4, { tile: 0.2, castShadow: false });
  room.box('paper', [0.15, 0.03, 0.11], [2.9, 0.47, -3.15], -0.2, { tile: 0.2, castShadow: false });

  /* --- the lectern and the harmonium --------------------------------------------------- */
  // A reading desk on a turned stem, with the register still open on it.
  post(room, 'timberDark', 0.05, 0.13, 1.05, [3.2, 0, 1.5], 8, { castShadow: false });
  room.geo('timberDark', cyl(0.24, 0.28, 0.07, 10), poseMatrix([3.2, 0.05, 1.5]), { castShadow: false });
  room.geo('timberDark', ball(0.11, 8), poseMatrix([3.2, 1.02, 1.5]), { castShadow: false });
  room.geo('timberDark', ring(0.09, 0.02, 9), tiltMatrix([3.2, 0.6, 1.5], [Math.PI / 2, 0, 0]), { castShadow: false });
  slab(room, 'timber', [0.52, 0.04, 0.4], [3.2, 1.14, 1.5], [-0.42, -Math.PI / 2, 0], { tile: 0.3 });
  slab(room, 'paper', [0.44, 0.02, 0.32], [3.16, 1.19, 1.5], [-0.42, -Math.PI / 2, 0], { tile: 0.25 });
  room.blockCircle(3.2, 1.5, 0.24);

  // The harmonium against the north wall, lid up and half its stops pulled out.
  // It was in the west doorway for one build, which is the single most common way
  // to lose a room in this pack: an offered wall has a lane in front of it.
  room.solid('timberDark', [1.2, 0.92, 0.58], [-2.0, 0, -3.35], 0, { tile: 0.5 });
  room.box('timber', [1.26, 0.05, 0.64], [-2.0, 0.92, -3.35], 0, { tile: 0.4, castShadow: false });
  room.box('itemEnamel', [0.92, 0.03, 0.2], [-2.0, 0.94, -3.1], 0, { tile: 0.3, castShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('brass', cyl(0.018, 0.018, 0.09, 6), tiltMatrix([-2.46 + i * 0.19, 1.08, -3.04], [Math.PI / 2, 0, 0]), { castShadow: false });
  }
  slab(room, 'timber', [1.2, 0.04, 0.5], [-2.0, 1.22, -3.57], [0.55, 0, 0], { tile: 0.4 });

  /* --- age ------------------------------------------------------------------------- */
  notice(room, 'east', -2.6, 2.0, 0.6, 0.8, 'paper');
  notice(room, 'west', 2.6, 2.1, 0.55, 0.75, 'paper');
  wallStain(room, 'north', -3.0, 2.4, 0.6, 1.8, 'mould');
  wallStain(room, 'south', -3.2, 2.6, 0.5, 1.4, 'rust');
  debris(room, -1.4, -3.1, 0.8, 5);
  motes(room, 0.3, 1.5, 1.6, 2.6, 12, 'dust');

  /* --- light -------------------------------------------------------------------------- */
  // Two lamps. The candle bank is emissive only and costs nothing; the real warm
  // light sits just in front of the altar and LOW, so the vault above is lit from
  // underneath and the window stays a dark shape with colour in it. The second is
  // a caged fitting at the back, failing hard.
  const altarLight = new THREE.PointLight(0xffb468, 9, ctx.dims.cellSize * 1.5, 2);
  altarLight.position.set(0.3, 1.4, 2.3);
  room.shadowLight(altarLight, 512);
  sag(room, altarLight, 9, 0.34, 1.3);

  const back = cagedLamp(room, 'north', 2.8, 2.5, true, 5);
  if (back) sag(room, back, 5, 0.5, 1.6);

  room.geo('warmWash', disc(2.3, 18), tiltMatrix([0.3, 0.014, 2.1], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
