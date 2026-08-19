import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cardWall,
  chair,
  cyl,
  debris,
  disc,
  motes,
  notice,
  paperDrift,
  post,
  sag,
  slab,
  strut,
  trolley,
  tubeLight,
  wallStain,
} from '../kit/props';

/**
 * The Observation Gallery - three chairs, a table, and a pane of glass that is a
 * mirror on the other side.
 *
 * The strongest image in the pack and the cheapest one in it: the whole room is
 * a dark box with one lit picture in it, and the picture is a white cell with a
 * chair bolted to the floor and somebody sitting in it whose head is turned
 * toward a window they cannot see through.
 *
 * The one warm thing in the entire Ward is on the table under the glass - a
 * shaded reading lamp, because whoever sat here had to be able to write. That
 * one amber source against the cold coming through the pane is what makes the
 * room read as a job somebody did rather than as a set.
 */
export const gallery: RoomBlueprint = {
  id: 'prison.gallery',
  nameKey: 'room.prison.gallery',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['ward', 'landmark'],
  anchors: {
    chest: [{ position: [-3.25, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.9, 0.78, 2.5] },
      { position: [3.4, 1.44, 1.2] },
      { position: [2.4, 0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.6] },
      { position: [-2.6, 0, -1.8] },
      { position: [2.6, 0, -1.8] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gallery);
  room.shell({
    floor: 'lino',
    wall: 'distemper',
    band: 'tile',
    bandHeight: 1.45,
    ceiling: 'lath',
    register: 'strip',
    mouth: 'clinic',
    // The glass. It is on the one wall the generator can never open, it brings
    // its own lamp, and it is the only lit picture in the map.
    ports: [{ side: 'south', kind: 'mirror', light: true }],
  });

  /* --- the seats ------------------------------------------------------------------- */
  // Three chairs facing the glass, not quite in a row and not quite square to
  // it - a row of identical chairs reads as furniture, three at three angles
  // reads as three people who sat down at different times.
  chair(room, -1.5, 2.35, Math.PI + 0.12, 'timberDark');
  chair(room, 0.35, 2.45, Math.PI - 0.05, 'timberDark');
  chair(room, 2.15, 2.3, Math.PI + 0.2, 'timberDark');
  room.box('itemCloth', [0.36, 0.06, 0.3], [2.15, 0.48, 2.3], 0.2, { tile: 0.3, castShadow: false });

  /* --- the table ------------------------------------------------------------------- */
  // A small writing table beside the near chair, with the ledger open on it and a
  // pen laid across the page. It is the last thing anybody in this room did.
  room.solid('timberDark', [0.9, 0.74, 0.56], [-1.9, 0, 2.5], 0.1, { tile: 0.5 });
  room.box('timber', [0.96, 0.05, 0.62], [-1.9, 0.74, 2.5], 0.1, { tile: 0.4, castShadow: false });
  slab(room, 'paper', [0.4, 0.03, 0.3], [-2.0, 0.79, 2.46], [0, 0.28, 0], { tile: 0.3 });
  room.box('itemTar', [0.12, 0.012, 0.012], [-1.96, 0.82, 2.4], 0.5, { castShadow: false });
  room.geo('itemGlass', cyl(0.035, 0.04, 0.06, 8), poseMatrix([-1.55, 0.79, 2.62]), { castShadow: false });

  // The reading lamp: a brass stem and a green glass shade, and the one warm
  // light in the whole of the Ward.
  post(room, 'brass', 0.02, 0.06, 0.42, [-2.25, 0.79, 2.62], 8, { castShadow: false, receiveShadow: false });
  room.geo('brass', cyl(0.09, 0.2, 0.11, 10, true), tiltMatrix([-2.25, 1.18, 2.62], [Math.PI, 0, 0]), { castShadow: false });
  room.geo('bulb', ball(0.045, 6), poseMatrix([-2.25, 1.14, 2.62]), { castShadow: false, receiveShadow: false });
  room.geo('warmWash', disc(1.15, 14), tiltMatrix([-2.1, 0.79, 2.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- the record ------------------------------------------------------------------ */
  cardWall(room, 'east', -1.4, 1.55, 2.0, 1.4);
  notice(room, 'west', 1.6, 1.7, 0.5, 0.7, 'paper');
  notice(room, 'north', -2.6, 1.9, 0.5, 0.36, 'surface.cards');
  // A clock high on the north wall with the glass gone and the hands stopped.
  room.geo('timberDark', cyl(0.24, 0.24, 0.09, 12), tiltMatrix([1.9, 2.55, -3.62], [Math.PI / 2, 0, 0]), { castShadow: false });
  room.geo('itemEnamel', disc(0.2, 12), poseMatrix([1.9, 2.55, -3.56], Math.PI), { castShadow: false, receiveShadow: false });
  room.box('itemTar', [0.16, 0.012, 0.008], [1.86, 2.55, -3.54], 0, { castShadow: false });
  room.box('itemTar', [0.012, 0.11, 0.008], [1.9, 2.6, -3.54], 0, { castShadow: false });

  // A coat on a hook by the door, still there.
  strut(room, 'surgical', [-3.55, 1.9, -1.4], [-3.42, 1.86, -1.4], 0.014, 4, { castShadow: false, receiveShadow: false });
  room.geo('wool', ball(0.19, 8), tiltMatrix([-3.4, 1.5, -1.4], [0, 0.3, 0], [0.7, 2.1, 1.0]), { castShadow: false });
  room.geo('wool', ball(0.13, 7), tiltMatrix([-3.36, 1.02, -1.32], [0, 0.9, 0], [0.7, 1.6, 0.9]), { castShadow: false });

  trolley(room, 2.4, 3.1, 0.4, false);
  paperDrift(room, -0.6, -1.4, 0.9, 7);
  debris(room, 2.8, -2.4, 0.7, 4);
  wallStain(room, 'east', 2.6, 2.6, 0.5, 1.5, 'mould');
  wallStain(room, 'south', -3.0, 2.7, 0.5, 1.2, 'rust');
  motes(room, 0, 1.6, 1.4, 2.8, 12, 'dust');

  /* --- light --------------------------------------------------------------------------- */
  // Two lamps and two temperatures. The glass brings its own, cold, from behind -
  // spent by the shell - so the only lamp this room adds is the reading light,
  // and it is warm and very small. The gallery is meant to be darker than what it
  // is looking at.
  const desk = new THREE.PointLight(0xffbe78, 5.5, ctx.dims.cellSize * 0.9, 2);
  desk.position.set(-2.25, 1.06, 2.62);
  room.light(desk);
  sag(room, desk, 5.5, 0.2, 0.9);

  // A dead batten over the seats, so a player looking up finds no help there.
  tubeLight(room, 0.4, -0.6, 2.0, Math.PI / 2, false);

  return room.finish();
}
