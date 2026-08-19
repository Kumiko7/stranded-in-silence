import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cyl,
  debris,
  disc,
  floorGully,
  jarShelf,
  motes,
  mortuaryDrawers,
  notice,
  puddle,
  ring,
  slabTable,
  strobe,
  strut,
  trolley,
  tubeLight,
  wallStain,
  washTrough,
} from '../kit/props';

/**
 * The Mortuary - nine drawers, two slabs and a set of scales.
 *
 * A cold, square, entirely reasonable room, and that is what makes it the worst
 * one in the Ward. Everything is stainless and everything drains. The only
 * things in it that are not equipment are a folded sheet on the near slab, a
 * card in every drawer handle, and one drawer standing open with a tray pulled
 * half out and a rime of frost still on it.
 *
 * All three offered walls run a lane through the room, so the drawer bank is set
 * well down the west wall and both slabs are pushed into the far corners - the
 * layout is decided entirely by the doors before a single prop goes down.
 */
export const morgue: RoomBlueprint = {
  id: 'prison.morgue',
  nameKey: 'room.prison.morgue',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['ward'],
  anchors: {
    chest: [{ position: [-3.3, 0, 1.2], rotationY: -Math.PI / 2 }],
    locker: [{ position: [2.6, 0, -3.35], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.5, 0.92, 2.4] },
      { position: [2.6, 0.92, 2.5] },
      { position: [3.5, 1.47, 2.4] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.2] },
      { position: [-1.2, 0, 1.2] },
      { position: [1.4, 0, -1.4] },
    ],
    enemySpawn: [{ position: [3.1, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, morgue);
  room.shell({
    floor: 'wardTile',
    wall: 'wardTile',
    band: 'none',
    ceiling: 'soffit',
    register: 'strip',
    mouth: 'clinic',
    ports: [{ side: 'west', kind: 'grille' }],
  });

  /* --- the drawers ------------------------------------------------------------------ */
  // Three by three, set down the west wall clear of the east lane. One is open,
  // and it is empty - which is very much worse than the alternative.
  mortuaryDrawers(room, 'west', -2.45, 3, 3, Math.floor(room.range(0, 9)));
  room.geo('frost', disc(0.5, 12), tiltMatrix([-2.6, 0.014, -2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 8; i++) {
    room.geo('frost', ball(room.range(0.03, 0.07), 5), poseMatrix([room.range(-3.4, -2.6), room.range(2.4, 2.9), room.range(-3.4, -1.4)]), { castShadow: false });
  }

  /* --- the slabs --------------------------------------------------------------------- */
  // Both in the far corners, both draining toward the wall, and one with a sheet
  // folded on it that has been folded for a long time.
  slabTable(room, -2.5, 2.4, 0, 0, true);
  slabTable(room, 2.6, 2.5, 0, 1, true);
  room.box('linen', [0.7, 0.16, 0.5], [-2.5, 0.92, 2.4], 0.06, { tile: 0.4, castShadow: false });
  room.box('linen', [0.66, 0.08, 0.46], [-2.5, 1.08, 2.36], -0.1, { tile: 0.4, castShadow: false });

  /* --- the scales -------------------------------------------------------------------- */
  // A hanging balance over the near slab: a beam, a pan and a counterweight, and
  // the pan is not level.
  strut(room, 'surgical', [2.6, 3.28, 1.3], [2.6, 2.5, 1.3], 0.02, 5, { castShadow: false });
  room.box('surgical', [0.62, 0.05, 0.06], [2.6, 2.46, 1.3], 0.09, { tile: 0.2, castShadow: false });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      strut(room, 'surgical', [2.6 + s * 0.28, 2.44 + s * 0.024, 1.3], [2.6 + s * 0.28 + Math.cos((i / 3) * 6.28) * 0.14, 2.16 + s * 0.024, 1.3 + Math.sin((i / 3) * 6.28) * 0.14], 0.006, 4, {
        castShadow: false,
        receiveShadow: false,
      });
    }
    room.geo('surgical', cyl(0.16, 0.15, 0.035, 11), poseMatrix([2.6 + s * 0.28, 2.14 + s * 0.024, 1.3]), { castShadow: false });
  }
  room.geo('surgical', ring(0.05, 0.012, 8), tiltMatrix([2.6, 2.32, 1.3], [Math.PI / 2, 0, 0]), { castShadow: false });

  /* --- the sluice --------------------------------------------------------------------- */
  washTrough(room, 'south', -2.6, 1.4);
  trolley(room, 1.5, -2.6, 0.4, true);
  jarShelf(room, 'east', -2.4, 1.44, 4, 1.3, false);
  floorGully(room, 0.4, 1.8, 0.14);
  puddle(room, 1.1, 1.4, 0.7);

  /* --- the room ------------------------------------------------------------------------ */
  notice(room, 'north', 2.6, 1.9, 0.56, 0.42, 'surface.cards');
  notice(room, 'south', 2.7, 1.85, 0.5, 0.36, 'paper');
  wallStain(room, 'east', 2.4, 2.6, 0.5, 1.5, 'rust');
  wallStain(room, 'west', -0.6, 2.7, 0.6, 1.3, 'mould');
  debris(room, 2.9, -1.0, 0.6, 4);
  motes(room, 0, 1.6, 0, 3.0, 12, 'lime');

  /* --- light --------------------------------------------------------------------------- */
  // Two battens, both cold, both hard. There is nothing warm in this room and
  // nothing shaded: it is the only space in the map that was designed to be seen
  // clearly, and that is the horror of it.
  const over = tubeLight(room, -1.2, 1.4, 2.4, Math.PI / 2, true, true, 9, 0.4);
  if (over) {
    room.bakeShadow(over, 512);
    strobe(room, over, 9, 0.4, 8.5);
  }
  const far = tubeLight(room, 2.0, -1.4, 2.0, Math.PI / 2, true, true, 6, 0.4);
  if (far) strobe(room, far, 6, 0.75, 4.6);
  room.geo('coldWash', disc(2.4, 18), tiltMatrix([-1.2, 0.014, 1.6], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
