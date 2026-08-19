import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cagedLamp,
  chair,
  cyl,
  debris,
  disc,
  gallows as gallowsProp,
  motes,
  notice,
  palePatch,
  pendantBulb,
  post,
  sag,
  slab,
  wallStain,
} from '../kit/props';

/**
 * The Drop - a beam, a rope, two leaves in the floor and the arm that works them.
 *
 * The heaviest room in the map and the one that needed the least in it. A trap
 * already sprung, so the leaves hang down into black and the rope stops at
 * shoulder height with nothing on the end of it; three chairs against the north
 * wall for whoever had to be there; a lime sack, a trestle, and a book on a
 * stand by the door with a line in it nobody finished.
 *
 * The lamp is deliberately NOT above the beam. A shadow-casting light behind a
 * set piece that size paints three views out of five solid black
 * (docs/art/ROOM_REVIEW.md); this one stands to the side and low, so what a
 * player gets is the rope's own shadow thrown twelve feet up the brick.
 */
export const gallows: RoomBlueprint = {
  id: 'prison.gallows',
  nameKey: 'room.prison.gallows',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 5,
  maxPerMap: 1,
  tags: ['blocks', 'landmark'],
  anchors: {
    chest: [{ position: [-3.3, 0, 1.3], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [3.15, 1.16, -1.5] },
      { position: [-2.7, 0.48, -2.9] },
      { position: [-2.9, 0.66, 2.6] },
    ],
    patrolPoint: [
      { position: [0, 0, -0.6] },
      { position: [-2.4, 0, -0.4] },
      { position: [2.6, 0, -2.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gallows);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'brick',
    band: 'none',
    ceiling: 'joist',
    register: 'caged',
    mouth: 'arch',
    // A judas hatch on the one wall the generator can never open, looking into a
    // dark cell. It is where they waited, and it is at eye height.
    ports: [{ side: 'south', kind: 'judas' }],
  });

  /* --- the drop ---------------------------------------------------------------------- */
  // In the band against the wall the blueprint never offers, which is where every
  // set piece in this pack goes. Already sprung.
  gallowsProp(room, 0, 2.35, 0, true);
  // The posts carry a collider each. They are 19 cm of oak and walking through
  // one would be the single most obvious mistake in the map.
  room.blockCircle(-1.25, 2.35, 0.13);
  room.blockCircle(1.25, 2.35, 0.13);

  /* --- whoever had to be there --------------------------------------------------------- */
  chair(room, -2.7, -2.9, 0.06, 'timberDark');
  chair(room, -1.95, -3.0, -0.1, 'timberDark');
  chair(room, 2.5, -2.95, 0.12, 'timberDark');
  room.box('paper', [0.2, 0.02, 0.15], [-2.7, 0.46, -2.9], 0.3, { tile: 0.2, castShadow: false });

  // A trestle and a plain box lid leaning on the wall beside it. Never a coffin
  // with a body in it - the emptiness is doing the work.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(room, 'timber', 0.03, 0.035, 0.62, [-2.9 + sx * 0.5, 0, 2.6 + sz * 0.2], 5, { castShadow: false, receiveShadow: false });
    }
  }
  room.box('timber', [1.5, 0.07, 0.44], [-2.9, 0.62, 2.6], 0.04, { tile: 0.4, castShadow: false });
  slab(room, 'timberPale', [1.7, 0.05, 0.52], [-3.35, 0.9, 3.2], [0, Math.PI / 2, 0.28], { tile: 0.5, castShadow: true });
  room.blockCircle(-2.9, 2.6, 0.46);

  // A sack of quicklime with the top rolled down, and the white it has spilled.
  room.geo('canvas', cyl(0.24, 0.28, 0.62, 9), poseMatrix([2.75, 0.31, 2.6]), { tile: 0.3, castShadow: true });
  room.geo('lime', ball(0.22, 7), tiltMatrix([2.75, 0.6, 2.6], [0, 0.4, 0], [1, 0.5, 1]), { castShadow: false });
  palePatch(room, 2.55, 2.3, 0.8);
  room.blockCircle(2.75, 2.6, 0.28);

  /* --- the book ------------------------------------------------------------------------ */
  // A ledger on an iron stand by the east wall: the last thing anybody did in
  // this room was write in it.
  post(room, 'ironBar', 0.026, 0.05, 1.1, [3.15, 0, -1.5], 6, { castShadow: false, receiveShadow: false });
  room.geo('ironBar', cyl(0.2, 0.24, 0.05, 10), poseMatrix([3.15, 0.02, -1.5]), { castShadow: false });
  slab(room, 'timberDark', [0.46, 0.04, 0.36], [3.15, 1.12, -1.5], [-0.4, Math.PI / 2, 0], { tile: 0.3 });
  slab(room, 'paper', [0.4, 0.03, 0.3], [3.1, 1.17, -1.5], [-0.4, Math.PI / 2, 0], { tile: 0.25 });
  room.blockCircle(3.15, -1.5, 0.2);

  /* --- the brick ------------------------------------------------------------------------ */
  notice(room, 'north', -2.6, 2.1, 0.56, 0.4);
  wallStain(room, 'south', 2.9, 2.4, 0.6, 2.0, 'mould');
  wallStain(room, 'west', -2.2, 2.6, 0.5, 1.6, 'rust');
  debris(room, 1.9, -1.4, 0.9, 6);
  motes(room, 0, 1.6, 1.6, 3.0, 12, 'dust');

  /* --- light ------------------------------------------------------------------------------ */
  // One lamp, low and to the side of the drop, and it is the room's shadow
  // caster. Standing where it does, the rope is between it and eight metres of
  // brick, which is the only image this room needs.
  const side = new THREE.PointLight(0xffab5c, 10, ceilingHeight * 2.4, 2);
  side.position.set(-2.4, 1.55, 0.9);
  room.shadowLight(side, 512);
  sag(room, side, 10, 0.4, 1.15);
  room.geo('warmWash', disc(2.4, 18), tiltMatrix([-2.2, 0.013, 0.9], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  // And a dead fitting over the beam itself, so a player looks up at the one
  // place in the room the light is not coming from.
  pendantBulb(room, 0, 2.35, 0.55, false, 0, true);
  // The far corner gets a working fitting, dim, so the drop is not the only
  // thing in the room a player can find.
  const far = cagedLamp(room, 'east', 2.6, 2.45, true, 5);
  if (far) sag(room, far, 5, 0.5, 1.5);

  return room.finish();
}
