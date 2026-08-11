import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, cyl, debris, disc, dustMotes, lampStand, quad, ring, sandDrift, shabtiRanks, statue } from '../kit/props';

/**
 * The Serdab - a sealed room with eyeholes, and a statue on the other side of
 * them.
 *
 * The dynasty walled its dead king's likeness into a chamber with no door and
 * cut two slots at eye height so he could watch the offerings. This is that
 * chamber's antechamber: one way in, one way out, and three walls with something
 * looking out of each.
 *
 * The set piece is the statue standing in the middle of the floor facing the
 * door. It is the only room in the pack where the first thing a player sees is a
 * figure at eye level, square to the way in - everything else in this crypt is
 * deliberately off-axis, which is what makes this one land.
 */
export const serdab: RoomBlueprint = {
  id: 'crypt.serdab',
  nameKey: 'room.crypt.serdab',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 6,
  tags: ['necropolis', 'deadend'],
  anchors: {
    chest: [{ position: [-2.8, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [2.75, 0.68, 2.9] },
      { position: [-1.4, 0, 2.7] },
      { position: [1.5, 0, -2.7] },
    ],
    patrolPoint: [
      { position: [-2.6, 0, -1.0] },
      { position: [2.6, 0, -1.0] },
      { position: [0, 0, 2.6] },
    ],
    enemySpawn: [{ position: [0, 0, -2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, serdab);
  room.shell({
    floor: 'sandstone',
    wall: 'sandstone',
    ceiling: 'corbel',
    dado: 'glyph',
    dadoHeight: 1.25,
    lamps: 'oil',
    lampSpacing: 3.0,
    mouth: 'lintel',
    niches: [
      // Two ka-statues in their own recesses, and between them the slot: a grille
      // with a picture of depth behind it and nothing a player can resolve.
      { side: 'west', kind: 'effigy' },
      { side: 'east', kind: 'effigy' },
      { side: 'north', kind: 'grate', light: true },
    ],
  });

  /* --- the one in the room --------------------------------------------------------- */
  // Square to the doorway, and the only thing in this pack that is. Off-centre by
  // 40 cm so a player still has a lane past it, because the room has one exit and
  // it is the one they came in by.
  statue(room, 0.45, -0.4, Math.PI, 'ka', 1.05);
  // The offering slab in front of it, with what is left of the offerings.
  room.box('surface.sandstone', [1.5, 0.16, 0.8], [0.45, 0, 0.85], 0.04, { tile: 0.8 });
  room.geo('stoneWarmPale', cyl(0.14, 0.11, 0.09, 10), poseMatrix([0.05, 0.16, 0.8]), { castShadow: false });
  room.geo('stoneWarmPale', cyl(0.11, 0.09, 0.07, 9), poseMatrix([0.45, 0.16, 0.95]), { castShadow: false });
  room.geo('bitumen', ball(0.06, 6), tiltMatrix([0.85, 0.17, 0.78], [0, 0.4, 0], [1.3, 0.6, 1]), { castShadow: false });
  room.geo('wash.gold', disc(1.3, 14), tiltMatrix([0.45, 0.015, 0.6], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- the ranks ------------------------------------------------------------------- */
  // A crowd of shabti on a low bench along the south-east, all facing the statue.
  // They read as a CROWD, which is the only reason they are in the pack.
  room.solid('surface.mudbrick', [1.4, 0.62, 1.0], [2.75, 0, 2.7], 0, { tile: 0.7 });
  room.box('stoneWarmPale', [1.5, 0.06, 1.1], [2.75, 0.62, 2.7], 0, { tile: 0.5, castShadow: false });
  shabtiRanks(room, 2.75, 0.68, 2.55, 3, 6, Math.PI, 0.2);
  shabtiRanks(room, -2.6, 0, -2.4, 2, 5, 0.4, 0.22);

  /* --- what is written on the walls ------------------------------------------------ */
  // A single tall column of glyphs either side of the slot, and the king's name in
  // a cartouche over it. Everything else on these walls is the shell's dado.
  for (const s of [-1, 1]) {
    room.geo('surface.glyph', quad(0.42, 1.5), poseMatrix([s * 1.5, 1.75, -3.66], 0), { tile: 0.85, castShadow: false });
  }
  room.geo('goldDim', ring(0.3, 0.045, 14), tiltMatrix([0, 2.85, -3.62], [0, 0, Math.PI / 2], [1.6, 1, 1]), { castShadow: false });

  /* --- light ----------------------------------------------------------------------- */
  // The slot is one. A single lamp by the door is the other, so the statue is lit
  // from BEHIND a player walking in and its shadow arrives before it does.
  // Well clear of the chest's approach: the validator walks a player across the
  // whole width of a container from 0.45 m out to 1.6 m, and a lamp stand in that
  // arc is a chest nobody can open.
  lampStand(room, -3.1, 0.7, true, 8);

  /* --- the dust ------------------------------------------------------------------- */
  sandDrift(room, 0, 3.0, 1.7, 0);
  sandDrift(room, -2.9, 0.4, 1.1, 1.4);
  debris(room, 2.9, -2.4, 0.6, 6, true);
  debris(room, -1.6, -2.9, 0.55, 5, true);
  dustMotes(room, 0.45, 1.6, -0.4, 2.2, 18);

  return room.finish();
}
