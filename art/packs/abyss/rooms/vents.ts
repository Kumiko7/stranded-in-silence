import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  ball,
  bioMotes,
  boulder,
  cyl,
  debris,
  disc,
  encrust,
  glowShaft,
  siltDrift,
  siltFall,
  smokerChimney,
  tubeWorms,
  urchin,
} from '../kit/props';

/**
 * The Smokers - the warm room, and the only one down here that is warm for a
 * good reason.
 *
 * Three sulphide chimneys have grown up through the deck of a flooded
 * compartment, and the water coming out of the tallest is four hundred degrees.
 * Riftia round every base, crabs on the flanges, and a haze of black smoke under
 * the ceiling that never quite clears.
 *
 * The only orange light in the abyss half of the map, which makes walking into
 * it out of a blue room feel like coming indoors - and that is a lie, because
 * this is the least survivable place on the station.
 *
 * Three chimneys, not four: every wall here can open, so the corners are the
 * only place a chest can go, and the south-west one is left empty for it.
 */
export const vents: RoomBlueprint = {
  id: 'abyss.vents',
  nameKey: 'room.abyss.vents',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['abyss', 'warm', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.25, 0.7, -1.5] },
      { position: [2.3, 0.64, 1.4] },
      { position: [0.9, 0, -2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.5, 0, 1.4] },
      { position: [1.4, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-1.6, 0, -2.9] }],
  },
  build,
};

const CHIMNEYS: readonly (readonly [number, number, number])[] = [
  [-2.6, -2.6, 2.55],
  [2.75, -2.45, 1.7],
  [2.6, 2.75, 2.1],
];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, vents);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'rock',
    wall: 'rock',
    ceiling: 'rock',
    band: 'crust',
    bandHeight: 1.2,
    strip: 'bio',
    mouth: 'arch',
  });

  /* --- the chimneys ---------------------------------------------------------------- */
  // Two of the three are lit, and they are the room's entire light budget. The
  // lamp sits at the mouth rather than inside the stack, so it rims the flanges
  // and underlights the smoke instead of lighting the inside of a cone.
  smokerChimney(room, -2.6, -2.6, 2.55, true, 19);
  smokerChimney(room, 2.6, 2.75, 2.1, true, 13);

  // Shimmer over each mouth: hot water refracting, as two small faint discs.
  for (const [x, z, h] of CHIMNEYS) {
    for (let i = 0; i < 2; i++) {
      room.geo('waterHazeWarm', disc(0.24 + i * 0.16, 12), tiltMatrix([x, h + 0.16 + i * 0.3, z], [-Math.PI / 2, room.range(0, 3), 0]), {
        castShadow: false,
        receiveShadow: false,
      });
    }
  }
  // The smoke layer, spread out where it has hit the rock. Kept up in the last
  // thirty centimetres and kept small: a big translucent sphere hanging in a
  // room is a grey blob over everything behind it, not an atmosphere.
  for (let i = 0; i < 4; i++) {
    room.geo(
      'smokePlume',
      ball(room.range(0.5, 0.85), 8),
      tiltMatrix([room.range(-2.4, 2.4), ceilingHeight - room.range(0.1, 0.3), room.range(-2.4, 2.4)], [0, room.range(0, 3), 0], [1.4, 0.3, 1.4]),
      { castShadow: false, receiveShadow: false },
    );
  }
  /**
   * A field of bacterial mat over the rock between the chimneys. It is the only
   * pale surface in the room and it is what stops the whole chamber reading as
   * one flat wash of amber mud - orange light on dark blue basalt has almost no
   * value range in it until something light is standing in the middle of it.
   */
  for (let i = 0; i < 5; i++) {
    room.geo(
      'bacterialMat',
      disc(room.range(0.24, 0.5), 11),
      tiltMatrix([room.range(-3.0, 3.0), 0.018, room.range(-3.0, 3.0)], [-Math.PI / 2, room.range(0, 3), 0]),
      { castShadow: false, receiveShadow: false, tile: 1.2 },
    );
  }
  for (let i = 0; i < 5; i++) {
    room.geo(
      'bacterialMat',
      ball(room.range(0.16, 0.34), 7),
      tiltMatrix([room.range(-3.2, 3.2), room.range(0.4, 1.9), room.chance(0.5) ? -3.5 : 3.5], [0, room.range(0, 3), 0], [1.4, 0.7, 0.6]),
      { castShadow: false, tile: 0.5 },
    );
  }

  /* --- what lives on them ------------------------------------------------------------ */
  // Fewer worms and a size up on each. A stand of these is read as a mass and
  // the count was set before the pack knew what a worm cost.
  tubeWorms(room, -1.9, -2.2, 8, 0.7, 1.3);
  tubeWorms(room, -2.95, -1.7, 5, 0.5, 0.95);
  tubeWorms(room, 2.2, -2.95, 5, 0.5, 0.9);
  tubeWorms(room, 2.1, 2.5, 6, 0.55, 1.0);

  /**
   * Crabs. Flat pale bodies on eight legs with the claws held forward - the one
   * animal down here a player will recognise on sight, which is what makes the
   * rest of the room read as alive rather than as geology.
   */
  for (const [x, y, z, size] of [
    [-2.15, 0.62, -1.95, 0.16],
    [-1.55, 0.02, -2.75, 0.13],
    [2.35, 0.02, 2.15, 0.14],
    [2.95, 0.5, -2.05, 0.11],
  ] as const) {
    const spin = room.range(0, Math.PI * 2);
    room.geo('shellWhite', ball(size, 8), tiltMatrix([x, y + size * 0.5, z], [0, spin, 0], [1.35, 0.5, 1]), {
      tile: 0.3,
      castShadow: false,
    });
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * Math.PI * 2;
      room.geo(
        'shellWhite',
        cyl(0.008, 0.012, size * 1.5, 4),
        tiltMatrix([x + Math.cos(a) * size, y + size * 0.36, z + Math.sin(a) * size], [1.15, Math.PI / 2 - a, 0]),
        { castShadow: false },
      );
    }
    for (const s of [-1, 1]) {
      room.geo(
        'shellWhite',
        ball(size * 0.42, 6),
        tiltMatrix([x + Math.cos(spin + s * 0.5) * size * 1.7, y + size * 0.4, z + Math.sin(spin + s * 0.5) * size * 1.7], [0, spin, 0], [1.5, 0.6, 0.8]),
        { castShadow: false },
      );
    }
  }

  /* --- the floor of it ---------------------------------------------------------------- */
  // Two shelves of sulphide crust to stand something on, and boulders where the
  // deck under all this finally gave up. None of it near the chest's corner.
  room.solid('rockPale', [1.0, 0.68, 0.8], [-3.25, 0, -1.5], 0.15, { tile: 0.9 });
  room.solid('rockDark', [0.9, 0.62, 0.7], [2.3, 0, 1.4], -0.3, { tile: 0.9 });
  encrust(room, -3.25, 0.7, -1.5, 0.4, 8);
  encrust(room, 2.3, 0.64, 1.4, 0.36, 7);
  boulder(room, 1.6, -3.1, 0.4, 0.55);
  boulder(room, -2.3, -3.3, 0.38, 0.6);
  siltDrift(room, 0.4, 2.6, 1.3);
  siltDrift(room, -0.9, -1.9, 1.1);
  siltFall(room, 1.1, 1.9);
  urchin(room, 0.2, 0.02, -3.1, 0.15);
  debris(room, 1.2, 1.6, 1.2, 9);
  debris(room, -1.4, -0.4, 0.9, 7);

  /* --- the light ------------------------------------------------------------------------ */
  glowShaft(room, [-2.6, 2.55, -2.6], [-2.6, ceilingHeight, -2.6], 0.8, true);
  glowShaft(room, [2.6, 2.1, 2.75], [2.6, ceilingHeight, 2.75], 0.7, true);
  bioMotes(room, -2.2, 1.6, -2.2, 1.6, 16, true);
  bioMotes(room, 2.2, 1.4, 2.2, 1.4, 12, true);
  bioMotes(room, 0.2, 1.8, 0.2, 2.2, 12);

  return room.finish();
}
