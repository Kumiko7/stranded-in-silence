import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { alembic, ball, bench, bookPile, brazier, candleStand, cyl, debris, dustMotes, ring, sconce, skull, specimenJar, urn, wallShelf } from '../kit/props';

/**
 * The Apothecary - the room where the Order stopped being a religious order.
 *
 * A working bench down one side with a still on it, a wall of specimen jars, a
 * furnace built into the corner, and a great deal of somebody's research. What
 * they were distilling is in the jars and none of it came out of a plant.
 *
 * The room's temperature is deliberately warm - the furnace is its light - with
 * exactly ONE cold accent: the flame under the retort, which is green, and is
 * emissive only. A second real light of the wrong colour would make the room read
 * as broken rather than as wrong.
 */
export const apothecary: RoomBlueprint = {
  id: 'crypt.apothecary',
  nameKey: 'room.crypt.apothecary',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['sanctum', 'cluttered', 'alchemy'],
  anchors: {
    chest: [{ position: [1.45, 0, -3.15], rotationY: Math.PI }],
    locker: [{ position: [-2.6, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.4, 0.92, 0.85] },
      { position: [-2.4, 0.92, -1.0] },
      { position: [-3.42, 2.13, -1.5] },
      { position: [1.9, 0.62, 2.4] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.2] },
      { position: [-1.2, 0, -2.4] },
      { position: [0.6, 0, 1.6] },
    ],
    enemySpawn: [{ position: [-3.1, 0, 1.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, apothecary);
  room.shell({
    floor: 'flag',
    wall: 'plaster',
    ceiling: 'beams',
    dado: 'ashlar',
    dadoHeight: 1.0,
    lamps: 'votive',
    mouth: 'gothic',
    niches: [{ side: 'west', kind: 'urns' }],
  });

  /* --- the bench ----------------------------------------------------------------- */
  // Down the west side, clear of every lane the generator can open.
  bench(room, -2.4, 0, Math.PI / 2, 3.0, 0.8);
  alembic(room, -2.4, 0.92, -0.1, Math.PI / 2, true, 'fluidGreen');
  alembic(room, -2.5, 0.92, 1.25, Math.PI / 2 + 0.3, false, 'fluidRed');
  specimenJar(room, -2.35, 0.92, -1.35, 0.3, 'fluidAmber');
  // A mortar, a balance and a bundle of tools: three shapes, and the bench reads
  // as somebody's job rather than as a table with props on it.
  room.geo('stoneDark', cyl(0.09, 0.07, 0.1, 9), poseMatrix([-2.2, 0.97, 0.5]), { castShadow: false });
  room.geo('stonePale', cyl(0.02, 0.028, 0.16, 6), tiltMatrix([-2.16, 1.0, 0.52], [0.5, 0.6, 0]), { castShadow: false });
  // The balance sits at z = -1.15, not -1.9: the bench runs from z = -1.46 to 1.46,
  // and at -1.9 the beam and both pans were hanging in the air off the end of it.
  room.geo('brass', cyl(0.012, 0.012, 0.34, 5), tiltMatrix([-2.6, 1.15, -1.15], [Math.PI / 2, 0, 0]), { castShadow: false });
  for (const s of [-1, 1]) {
    room.geo('brass', cyl(0.06, 0.06, 0.01, 10), poseMatrix([-2.6, 1.02, -1.15 + s * 0.15]), { castShadow: false });
    room.geo('brass', cyl(0.004, 0.004, 0.13, 4), poseMatrix([-2.6, 1.08, -1.15 + s * 0.15]), { castShadow: false });
  }

  /* --- the jars ------------------------------------------------------------------ */
  // Two tiers over the bench, kept off the middle of the wall so the niche keeps
  // its own light. Everything on a shelf sits at x = -3.42 (ROOM_FORMAT.md §2.1.1).
  for (let i = 0; i < 2; i++) {
    wallShelf(room, 'west', -2.15, 1.46 + i * 0.62, 1.5);
  }
  const fluids = ['fluidAmber', 'fluidGreen', 'fluidRed'] as const;
  for (let k = 0; k < 3; k++) {
    specimenJar(room, -3.42, 1.51, -2.8 + k * 0.55, room.range(0.24, 0.32), room.pick(fluids));
  }
  // The upper shelf is left one place short, and that gap is where the room's
  // item anchor sits: an item wants a spot that reads as intentional.
  for (let k = 0; k < 2; k++) {
    specimenJar(room, -3.42, 2.13, -2.8 + k * 0.6, room.range(0.26, 0.32), room.pick(fluids));
  }
  urn(room, -3.42, 1.51, -1.6, 0.26);

  /* --- the furnace ---------------------------------------------------------------- */
  // An athanor in the corner: a brick stack with a fire door in it, the flue going
  // up through the vault, and the room's only real warmth.
  room.solid('surface.brick', [1.3, 1.5, 1.1], [2.75, 0, -2.7], 0.12, { tile: 0.8 });
  room.box('stonePale', [1.42, 0.1, 1.22], [2.75, 1.5, -2.7], 0.12, { tile: 0.5, castShadow: false });
  room.geo('surface.brick', cyl(0.24, 0.3, 1.75, 9), poseMatrix([2.9, 1.6, -2.9]), { tile: 0.6, castShadow: false });
  room.geo('iron', ring(0.28, 0.03, 10), tiltMatrix([2.9, 2.2, -2.9], [Math.PI / 2, 0, 0]), { castShadow: false });
  // The fire door, standing open, with the coals inside it.
  room.box('ironDark', [0.52, 0.46, 0.06], [2.4, 0.45, -2.12], 0.12, { tile: 0.3, castShadow: false });
  room.box('ember', [0.44, 0.34, 0.04], [2.42, 0.5, -2.16], 0.12, { castShadow: false, receiveShadow: false });
  room.box('iron', [0.16, 0.5, 0.05], [2.05, 0.44, -2.28], 0.9, { tile: 0.3, castShadow: false });
  // Crucibles cooling on top of it.
  for (let i = 0; i < 3; i++) {
    room.geo('stoneDark', cyl(0.07, 0.05, 0.1, 8), poseMatrix([2.4 + i * 0.34, 1.6, -2.5 - (i % 2) * 0.3]), { castShadow: false });
  }
  // Well clear of the chest anchor: a container wants 1.6 m in front of it, and a
  // brazier standing in that is a chest nobody can open.
  brazier(room, 0.5, -0.7, true, 8, true);

  /* --- the reading end ----------------------------------------------------------- */
  room.solid('timberDark', [1.0, 0.62, 0.8], [1.9, 0, 2.5], -0.2, { tile: 0.5 });
  bookPile(room, 1.9, 0.62, 2.5, 4, -0.2);
  skull(room, 1.35, 0.62, 2.2, 1.4, 0.95, 'boneDark');
  candleStand(room, 0.2, 2.4, true, 1.1, 6);
  sconce(room, 'north', 2.6, 1.95, false);

  /* --- decay --------------------------------------------------------------------- */
  // A jar that went over, and what came out of it. The stain is the room's story.
  room.geo('fluidGreen', ball(0.34, 10), tiltMatrix([-1.6, 0.012, 2.9], [0, 0.4, 0], [1.6, 0.06, 1.1]), { castShadow: false, receiveShadow: false });
  room.geo('glassVessel', cyl(0.1, 0.1, 0.28, 9), tiltMatrix([-1.2, 0.1, 2.75], [Math.PI / 2, 0.7, 0]), { castShadow: false, receiveShadow: false });
  debris(room, -0.4, 3.05, 0.6, 6);
  debris(room, 3.0, 0.2, 0.55, 5);
  dustMotes(room, -1.4, 1.5, 0.4, 2.2, 16);

  return room.finish();
}
