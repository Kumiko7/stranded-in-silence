import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, canopic, coinHoard, cyl, debris, disc, dustMotes, funeraryBoat, lampStand, quad, ring, sandDrift, sarcophagus, shabtiRanks, statue, urn } from '../kit/props';

/**
 * The Gilded Chamber - what the robbers two rooms away were trying to reach.
 *
 * An L of three cells, and in the crook of it a gold anthropoid case on a plinth
 * under a painted star ceiling, with a canopic shrine at its head and four
 * hundred years of somebody's careful arrangements all round it. Two of the walls
 * cannot be opened, and both of them have somebody standing in them.
 *
 * Gold is the loudest material in the pack. This room is the ONE place it is
 * allowed to be the subject, and the whole design of the space is built round
 * making that one object the brightest thing in it - which is why the sarcophagus
 * is the only gilded object and the treasure is a low heap in the far arm.
 */
export const gilded: RoomBlueprint = {
  id: 'crypt.gilded',
  nameKey: 'room.crypt.gilded',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
    ...wallsOn([0, 1], 'south', 'west'),
  ],
  weight: 6,
  tags: ['necropolis', 'grand', 'treasure'],
  anchors: {
    chest: [
      // Offset along the wall rather than centred on it: the middle of cell
      // [1,0]'s south wall is the recess with the king in it.
      { position: [6.2, 0, 3.15], rotationY: 0 },
      { position: [-3.15, 0, 5.9], rotationY: -Math.PI / 2 },
    ],
    locker: [{ position: [11.15, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [4.0, 1.12, 2.5] },
      { position: [1.9, 0.68, 8.6] },
      { position: [10.4, 0.68, 1.6] },
      { position: [-2.4, 0, 10.4] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.4] },
      { position: [8.0, 0, 1.4] },
      { position: [0.4, 0, 8.0] },
      { position: [-2.0, 0, 3.0] },
    ],
    enemySpawn: [{ position: [10.8, 0, 2.6] }],
    treasure: [
      { position: [10.2, 0, -0.3] },
      { position: [1.4, 0, 10.6] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gilded);
  room.shell({
    floor: 'sandstone',
    wall: 'frieze',
    ceiling: 'stars',
    dado: 'gilt',
    dadoHeight: 0.85,
    lamps: 'oil',
    lampSpacing: 2.9,
    mouth: 'lintel',
    // The two walls the generator cannot open, and both of them are occupied: a
    // king in one and the door he is supposed to use in the other.
    niches: [
      { cell: [1, 0], side: 'south', kind: 'effigy', light: true },
      { cell: [0, 1], side: 'east', kind: 'stela' },
    ],
  });

  /* --- the case ---------------------------------------------------------------------- */
  // On a two-stage plinth in the crook of the L, aligned east-west so it is seen
  // end-on from the north doorway of cell [0,0] and side-on from everywhere else.
  // A raised paving slab UNDER the case rather than a plinth: `sarcophagus()`
  // builds from y = 0 up, so anything taller than a few centimetres beneath it
  // buries its own plinth. Six centimetres reads as set into the floor, and the
  // tomb brings its own collider.
  room.box('stoneWarmPale', [4.2, 0.06, 2.5], [4.0, 0, 1.5], 0, { tile: 1.0, castShadow: false });
  room.geo('goldDim', ring(1.9, 0.035, 22), tiltMatrix([4.0, 0.07, 1.5], [Math.PI / 2, 0, 0], [1.1, 0.66, 1]), { castShadow: false });
  sarcophagus(room, 4.0, 1.5, Math.PI / 2, { lid: 'anthropoid', gilt: true, length: 2.5 });
  // The pall it was found under, half dragged off the foot end and lying on the
  // plinth. One dark shape against the gold, which is what stops the case reading
  // as a solid yellow slab.
  room.geo('velvetDark', quad(1.5, 1.1), tiltMatrix([4.4, 1.02, 2.15], [1.1, 0.1, 0.06]), { tile: 0.7, castShadow: false, receiveShadow: false });
  room.geo('velvet', quad(1.2, 0.9), tiltMatrix([4.9, 0.62, 2.3], [0.9, 0.3, 0.2]), { tile: 0.7, castShadow: false, receiveShadow: false });
  // The four corner posts of the shrine that stood over it, still standing, with
  // the beams between them gone. It is the ABSENCE that dates the robbery.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      room.geo('timberDark', cyl(0.07, 0.09, 2.5, 7), poseMatrix([4.0 + sx * 1.65, 1.25, 1.5 + sz * 0.85]), { tile: 0.5 });
      room.geo('goldDim', ring(0.09, 0.02, 9), tiltMatrix([4.0 + sx * 1.65, 2.4, 1.5 + sz * 0.85], [Math.PI / 2, 0, 0]), { castShadow: false });
    }
  }

  /* --- the canopic shrine ------------------------------------------------------------- */
  // At the head end, in its own chest, with the four of them looking out of it.
  room.solid('surface.sandstone', [1.0, 0.9, 2.0], [1.5, 0, 1.5], 0, { tile: 0.8 });
  room.box('stoneWarmPale', [1.1, 0.07, 2.1], [1.5, 0.9, 1.5], 0, { tile: 0.6, castShadow: false });
  for (let i = 0; i < 4; i++) {
    canopic(room, 1.5, 0.97, 0.7 + i * 0.55, i as 0 | 1 | 2 | 3, -Math.PI / 2, 0.42);
  }
  room.geo('goldDim', ring(0.5, 0.03, 14), tiltMatrix([1.5, 2.0, 1.5], [Math.PI / 2, 0, 0]), { castShadow: false });

  /* --- the far arm ---------------------------------------------------------------------- */
  // Cell [1,0]: the store. A bench of jars and boats, and the hole in the wall the
  // robbers left with, at the far end where a player has to go and look.
  room.solid('surface.mudbrick', [1.6, 0.62, 1.1], [10.4, 0, 1.6], 0, { tile: 0.8 });
  room.box('stoneWarmPale', [1.7, 0.06, 1.2], [10.4, 0.62, 1.6], 0, { tile: 0.5, castShadow: false });
  urn(room, 10.0, 0.68, 1.3, 0.36, true);
  funeraryBoat(room, 10.6, 0.68, 1.9, Math.PI / 2, 0.95);
  coinHoard(room, 10.2, -0.3, 0.55);
  shabtiRanks(room, 7.4, 0, -2.9, 2, 6, Math.PI, 0.22);
  // Kept off the chest anchor's approach at (6.2, 3.15) - 1.6 m of clear floor in
  // front of a container is measured across its whole width.
  statue(room, 9.6, 2.6, -0.6, 'sentinel', 0.95);

  /* --- the south arm --------------------------------------------------------------------- */
  // Cell [0,1]: the offering hall, and the only part of the room with any floor
  // space in it. It is deliberately the emptiest place in the pack's biggest room.
  room.solid('surface.mudbrick', [2.2, 0.62, 1.0], [1.9, 0, 8.2], 0, { tile: 0.8 });
  room.box('stoneWarmPale', [2.3, 0.06, 1.1], [1.9, 0.62, 8.2], 0, { tile: 0.5, castShadow: false });
  shabtiRanks(room, 1.9, 0.68, 8.15, 2, 7, 0, 0.2);
  coinHoard(room, 1.4, 10.6, 0.42);
  urn(room, -2.6, 0, 8.6, 0.4, true);
  statue(room, 2.6, 5.4, 2.4, 'ka', 0.95);

  /* --- light ------------------------------------------------------------------------------ */
  // Four for three cells, and one of them is the recess. The two nearest the case
  // are placed BELOW its shoulders so the gold is underlit and the mask throws a
  // shadow up the wall behind it.
  // Pulled in to 1.4 m either side of the case rather than left against the north
  // wall four metres off: gold at half metalness needs a light ON it, and the whole
  // room is arranged to make this one object the brightest thing in it.
  lampStand(room, 2.0, -0.5, true, 9);
  lampStand(room, 6.0, -0.5, true, 9);
  lampStand(room, -2.9, 9.6, true, 8);

  /* --- the sand and the dust --------------------------------------------------------------- */
  sandDrift(room, 8.0, 2.4, 2.0, 0.4);
  sandDrift(room, -2.4, 1.4, 1.4, 1.9);
  sandDrift(room, 1.0, 5.0, 1.8, 0.7);
  debris(room, 6.6, -2.4, 0.7, 7, true);
  debris(room, -2.8, 3.4, 0.6, 6, true);
  debris(room, 2.8, 10.6, 0.7, 7, true);
  dustMotes(room, 4.0, 1.7, 1.5, 2.8, 22);
  dustMotes(room, 0.6, 1.5, 7.0, 2.4, 14);
  dustMotes(room, 9.6, 1.5, 0.6, 2.0, 12);
  // A gold wash on the ceiling over the case: the star vault above the brightest
  // thing in the room should not be flat black.
  room.geo('wash.gold', quad(3.6, 2.4), tiltMatrix([4.0, 3.3, 1.5], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
