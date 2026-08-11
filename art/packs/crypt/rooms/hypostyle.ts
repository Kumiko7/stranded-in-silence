import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { ball, cyl, debris, disc, dustMotes, dustShaft, lampStand, pillar, quad, sandDrift, shabtiRanks, skull, statue } from '../kit/props';

/**
 * The Hall of Columns - twenty-four metres of papyrus stems in the dark.
 *
 * Eight columns in two rows, a light well over each end, and sand drifted a foot
 * deep down the middle. The dynasty cut this out of the rock to be walked down in
 * procession, and it is the longest sightline in the map: you can see all the way
 * to the far door, and so can whatever is standing between the third and fourth
 * columns.
 *
 * A 1x3 is placed at most once per map, and the whole design is the RHYTHM -
 * column, gap, column, gap, with the two lit ends and a dark middle. The lamps are
 * deliberately at the ends rather than spread, because a corridor lit evenly stops
 * being frightening.
 */
export const hypostyle: RoomBlueprint = {
  id: 'crypt.hypostyle',
  nameKey: 'room.crypt.hypostyle',
  footprint: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([0, 1], 'east', 'west'),
    ...wallsOn([0, 2], 'south', 'east'),
  ],
  weight: 7,
  tags: ['necropolis', 'entrance', 'corridor'],
  anchors: {
    // The one stretch of the west wall with neither a doorway, a column row nor a
    // sphinx within 1.6 m of it - which in a hall this size is a narrow window.
    chest: [{ position: [-3.15, 0, 13.2], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.15, 0, 6.0], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.68, 13.4] },
      { position: [-2.6, 0, 6.2] },
      { position: [-1.6, 0, 18.6] },
      { position: [-2.8, 0.68, 2.2] },
    ],
    playerSpawn: [
      { position: [-1.7, 0, 17.4], rotationY: 0 },
      { position: [-0.6, 0, 18.1], rotationY: 0 },
      { position: [0.6, 0, 18.1], rotationY: 0 },
      { position: [1.7, 0, 17.4], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, -2.2] },
      { position: [0, 0, 5.0] },
      { position: [0, 0, 11.0] },
      { position: [0, 0, 18.2] },
    ],
    enemySpawn: [{ position: [1.4, 0, 6.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hypostyle);
  room.shell({
    floor: 'sand',
    wall: 'sandstone',
    ceiling: 'corbel',
    dado: 'glyph',
    dadoHeight: 1.3,
    lamps: 'oil',
    // Wider than the default: three cells of lamp course at 2.3 m is thirty
    // stations, and this room wants its darkness between the two lit ends.
    lampSpacing: 2.9,
    mouth: 'lintel',
    niches: [
      { cell: [0, 0], side: 'east', kind: 'stela' },
      { cell: [0, 2], side: 'west', kind: 'effigy' },
    ],
  });

  /* --- the columns ------------------------------------------------------------------- */
  // Two rows at x = +-1.95, which keeps them out of every door lane: the north and
  // south doorways want |x| < 1.1, and the four side doorways want x beyond 2.5.
  for (const z of [-1.0, 4.0, 10.0, 15.0]) {
    for (const s of [-1, 1]) {
      pillar(room, s * 1.95, z, 'papyrus', 0.46);
    }
  }
  // One has come down. The drum sections are lying where they rolled - in the
  // middle third of the hall, clear of the two end walls' doorways AND of the four
  // player spawns at the south end, which have to be standable.
  for (let i = 0; i < 4; i++) {
    room.geo('stoneWarm', cyl(0.44, 0.44, 0.85, 10), tiltMatrix([1.5 - i * 0.15, 0.44, 12.4 + i * 0.8], [Math.PI / 2, 0.1 + i * 0.06, 0.08]), {
      tile: 0.7,
    });
  }
  // Two colliders for four drums: a 1x3 shell already spends about twenty on its
  // own walls, and the budget is about twenty-five for a room.
  room.collider({ kind: 'box', center: [1.42, 13.2], halfExtents: [0.42, 1.24], rotationY: 0.06 });
  room.geo('stoneWarmPale', ball(0.9, 8), tiltMatrix([2.2, 0.2, 11.4], [0.1, 0.5, 0.14], [1.2, 0.3, 1.1]), { tile: 0.8 });

  /* --- the light wells ---------------------------------------------------------------- */
  // One over each end of the hall, and the reason this room has any light in the
  // middle of the day. Everything about the beams is thin: two crossed quads at
  // 0.035 opacity, and the patch they land on is additive.
  dustShaft(room, 0, 1.0, 3.3, 0.05, 1.5, true);
  dustShaft(room, 0, 15.6, 3.3, 0.05, 1.3, true);
  for (const [z, r] of [
    [1.0, 0.8],
    [15.6, 0.7],
  ] as const) {
    for (let i = 0; i < 3; i++) {
      room.geo('stoneDark', cyl(r + i * 0.1, r + i * 0.1, 0.07, 4), poseMatrix([0, 3.33 - i * 0.08, z]), { tile: 0.4, castShadow: false });
    }
  }

  /* --- the processional way ----------------------------------------------------------- */
  // Sand down the middle, deep enough to walk through, and a line of small
  // sphinxes flanking it that are only knee high. Scale is the joke: this hall was
  // built for something bigger than the things standing in it.
  sandDrift(room, 0, 7.4, 2.6, 0.2);
  sandDrift(room, 0, 12.6, 2.4, 1.7);
  sandDrift(room, -1.2, 2.4, 1.6, 0.9);
  // The z positions dodge all three side doorways: cell [0,1] can open east and
  // west (|z - 8| < 1.1), and cell [0,2] east (|z - 16| < 1.1). A sphinx in one of
  // those is a doorway a player cannot walk through.
  for (const z of [4.6, 11.4]) {
    for (const s of [-1, 1]) {
      const x = s * 2.6;
      room.box('surface.sandstone', [0.5, 0.34, 0.9], [x, 0, z], 0, { tile: 0.5 });
      room.geo('stoneWarm', cyl(0.14, 0.17, 0.4, 8), tiltMatrix([x, 0.5, z - 0.16], [1.4, 0, 0]), { tile: 0.4, castShadow: false });
      room.geo('stoneWarmPale', ball(0.13, 8), tiltMatrix([x, 0.62, z - 0.38], [0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0], [0.9, 1.05, 1]), {
        tile: 0.3,
        castShadow: false,
      });
      room.collider({ kind: 'box', center: [x, z], halfExtents: [0.22, 0.42] });
    }
  }

  /* --- the two ends -------------------------------------------------------------------- */
  // A shrine at the north end with a ka-statue in it, and a bench of shabti at the
  // south. The hall has to have somewhere to be going.
  // In the north-east corner rather than on the room's axis: the north wall is an
  // offered edge, and a 1.1-scale statue on the centre line stands squarely in
  // that doorway.
  statue(room, 2.6, -2.6, (Math.PI * 3) / 4, 'ka', 1.1);
  // Both benches are pushed a good 2 m off the middle of their own wall: a 1x3
  // offers six edges, and four of them are side doorways whose 1.2 m runs straight
  // through where a bench against the wall would naturally go.
  room.solid('surface.mudbrick', [1.4, 0.62, 0.9], [-2.8, 0, 2.2], 0, { tile: 0.7 });
  room.box('stoneWarmPale', [1.5, 0.06, 1.0], [-2.8, 0.62, 2.2], 0, { tile: 0.5, castShadow: false });
  shabtiRanks(room, -2.8, 0.68, 2.2, 2, 4, Math.PI / 2, 0.2);
  room.solid('surface.mudbrick', [1.3, 0.62, 0.9], [2.6, 0, 13.4], 0, { tile: 0.7 });
  room.box('stoneWarmPale', [1.4, 0.06, 1.0], [2.6, 0.62, 13.4], 0, { tile: 0.5, castShadow: false });

  /* --- light ---------------------------------------------------------------------------- */
  // Four cells' worth of budget, spent on the two ends and nothing in the middle.
  lampStand(room, -2.7, -2.2, true, 8);
  lampStand(room, 2.7, 0.8, true, 7);
  lampStand(room, -2.7, 15.4, true, 8);
  lampStand(room, 2.7, 18.4, true, 7);

  /* --- what is left --------------------------------------------------------------------- */
  debris(room, 2.9, 3.4, 0.7, 7, true);
  debris(room, -2.9, 8.8, 0.7, 7, true);
  debris(room, 1.4, 13.6, 0.6, 6, true);
  skull(room, -1.2, 0.02, 9.4, room.range(0, 6), 1.0, 'boneDark');
  dustMotes(room, 0, 1.6, 1.0, 2.2, 18);
  dustMotes(room, 0, 1.6, 15.6, 2.0, 16);
  dustMotes(room, 0, 1.4, 8.0, 3.0, 14);
  // The far end of a twenty-four metre hall wants something to close it: a very
  // thin haze across the last bay, which is what the fog does in a run and what it
  // cannot do in a single room.
  room.geo('hazeWarm', quad(7.4, 2.6), poseMatrix([0, 1.4, 19.2], 0), { castShadow: false, receiveShadow: false });

  return room.finish();
}
