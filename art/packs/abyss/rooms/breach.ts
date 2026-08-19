import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  anemones,
  ball,
  beacon,
  bioMotes,
  boulder,
  cageLamp,
  causticPatch,
  coralHead,
  cyl,
  debris,
  disc,
  drum,
  encrust,
  glowShaft,
  kelpStand,
  pipeRun,
  puddle,
  siltDrift,
  siltFall,
  spike,
  stripLight,
  swell,
  tubeWorms,
  urchin,
  wallSign,
} from '../kit/props';

/**
 * The Breach - where the station stops and the trench starts.
 *
 * Three cells in an L. Two of them are still Kerberos: deck plate, an amber
 * circuit, a bulkhead. The third is a hole. The plate has torn along a seam and
 * peeled back in sheets two metres high, and behind it there is basalt, silt,
 * coral and a great deal of nothing.
 *
 * This is the pack's hinge room, and everything about it is deliberately half
 * and half: the floor changes material along a ragged line, the emergency strip
 * runs out at the tear, and the amber light and the blue light meet in the
 * middle of the corner cell and fight there.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [0, 1],
] as const;

export const breach: RoomBlueprint = {
  id: 'abyss.breach',
  nameKey: 'room.abyss.breach',
  footprint: FOOTPRINT,
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'east', 'south'),
    ...wallsOn([0, 1], 'south'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['hinge', 'landmark'],
  anchors: {
    chest: [{ position: [4.8, 0, -3.2], rotationY: Math.PI }],
    locker: [{ position: [-3.25, 0, -2.6], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.9, 0.94, -1.6] },
      { position: [9.4, 0.7, 1.6] },
      { position: [0.4, 0.62, 9.6] },
    ],
    patrolPoint: [
      { position: [0, 0, -2.4] },
      { position: [6.4, 0, 0.6] },
      { position: [-0.6, 0, 6.4] },
      { position: [1.4, 0, 1.6] },
    ],
    enemySpawn: [{ position: [3.2, 0, 9.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, breach);
  const { ceilingHeight } = ctx.dims;
  /**
   * The shell is the station one throughout: plate walls, a deck, an amber
   * circuit. The trench does not get its own shell - it is something that has
   * happened TO this one, and it is built on top by hand below. A room that
   * changed shell style halfway would have a seam down the middle of every
   * surface, and the whole point is that the seam is a tear.
   */
  room.shell({
    floor: 'deck',
    wall: 'hull',
    ceiling: 'pipes',
    band: 'hazard',
    bandHeight: 0.62,
    strip: 'amber',
    mouth: 'bulkhead',
    ports: [
      { cell: [1, 0], side: 'north', kind: 'grille', light: false },
      { cell: [0, 1], side: 'east', kind: 'viewpane', scene: 'coral', tall: true, light: true },
    ],
  });

  /* --- the tear ------------------------------------------------------------------------ */
  /**
   * A ragged diagonal from the north-east of the corner cell down to the
   * south-west, expressed three ways: the floor material changes across it, a
   * line of torn plate stands up along it, and the emergency strip stops at it.
   *
   * `t` runs 0..1 along the tear; everything is placed off that one parameter so
   * the three layers cannot drift apart.
   */
  const tearAt = (t: number): [number, number] => [-3.8 + t * 7.6, 0.6 + t * 4.8];

  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    const [x, z] = tearAt(t);
    const jitterX = room.range(-0.35, 0.35);
    const jitterZ = room.range(-0.35, 0.35);
    // Torn plate, curled up out of the deck along the line.
    const lean = room.range(0.5, 1.15);
    room.geo(
      'rust',
      new THREE.BoxGeometry(room.range(0.7, 1.5), room.range(0.5, 1.9), 0.09),
      tiltMatrix([x + jitterX, room.range(0.2, 0.7), z + jitterZ], [0, room.range(0.4, 1.0), lean * (i % 2 ? 1 : -1) * 0.3]),
      { tile: 1.1, consume: true },
    );
    // Fangs of steel where it parted.
    room.geo(
      'steelDark',
      spike(room.range(0.07, 0.16), room.range(0.3, 0.75), 4),
      tiltMatrix([x + jitterX * 1.6, room.range(0.4, 1.0), z + jitterZ * 1.6], [room.range(-0.5, 0.5), room.range(0, 3), room.range(-0.6, 0.6)]),
      { tile: 0.3, castShadow: false },
    );
    // The silt coming through.
    if (i % 2 === 0) siltDrift(room, x + room.range(-0.8, 0.8), z + room.range(-0.8, 0.8), room.range(0.7, 1.4));
  }

  /**
   * The trench floor, laid over the deck on the seaward side of the tear as a
   * scatter of overlapping silt and basalt slabs rather than one clean polygon.
   * A hard edge here would read as a decal; the overlap is what makes it read as
   * something that has drifted in.
   */
  for (let i = 0; i < 22; i++) {
    const t = room.range(0, 1);
    const [tx, tz] = tearAt(t);
    const push = room.range(0.4, 4.0);
    const x = tx - push * 0.5;
    const z = tz + push * 0.86;
    if (x < -3.4 || x > 3.4 || z > 11.4) continue;
    room.geo(
      room.chance(0.55) ? 'surface.silt' : 'surface.basalt',
      disc(room.range(0.8, 1.9), 9),
      tiltMatrix([x, room.range(0.02, 0.05), z], [-Math.PI / 2, room.range(0, 3), 0]),
      { tile: 2.4, castShadow: false },
    );
  }

  /* --- the trench side ------------------------------------------------------------------- */
  // Rock coming through the corner cell's outer walls, and everything on it.
  for (let i = 0; i < 7; i++) {
    const x = room.range(-3.4, -1.2);
    const z = room.range(2.0, 10.6);
    room.geo(
      'rockDark',
      ball(room.range(0.6, 1.35), 8),
      tiltMatrix([x - 1.0, room.range(0.2, 1.6), z], [0, room.range(0, 3), 0], [1.3, 1.0, 1.2]),
      { tile: 1.3, castShadow: false },
    );
  }
  boulder(room, -2.2, 8.6, 0.85, 0.95);
  boulder(room, -1.2, 2.4, 0.6, 0.8);
  boulder(room, 1.8, 9.4, 0.7, 0.85);
  coralHead(room, -2.6, 0.1, 6.6, 0.95, false);
  coralHead(room, 0.6, 0.05, 10.4, 0.8, true);
  coralHead(room, -0.8, 0.05, 3.2, 0.6, false);
  kelpStand(room, -2.8, 2.6, 4, 2.3, 0.6);
  kelpStand(room, 1.2, 7.4, 3, 2.0, 0.5);
  tubeWorms(room, -1.9, 10.6, 8, 0.55, 0.85);
  anemones(room, -2.2, 0.85, 8.6, 4, 0.45);
  urchin(room, 0.4, 0.02, 5.6, 0.16);
  urchin(room, -2.6, 0.02, 11.0, 0.13);
  encrust(room, -1.2, 0.6, 2.4, 0.6, 10);
  siltFall(room, -1.0, 8.0);
  siltFall(room, 2.4, 10.6);

  // A shelf of rock in the corner cell to stand something on.
  room.solid('rockPale', [1.1, 0.6, 0.85], [0.4, 0, 9.6], 0.25, { tile: 0.9 });
  encrust(room, 0.4, 0.62, 9.6, 0.42, 8);

  /* --- the station side -------------------------------------------------------------------- */
  // Two benches, a service run and the housekeeping. All of it forward of the
  // tear, and all of it out of the four door lanes.
  room.solid('steelPale', [1.6, 0.88, 0.7], [-2.9, 0, -1.6], 0.1, { tile: 0.8 });
  room.box('steelDark', [1.66, 0.06, 0.76], [-2.9, 0.88, -1.6], 0.1, { tile: 0.4 });
  room.solid('steelPale', [1.4, 0.62, 0.7], [9.4, 0, 1.6], -0.15, { tile: 0.8 });
  room.box('steelDark', [1.46, 0.06, 0.76], [9.4, 0.62, 1.6], -0.15, { tile: 0.4 });
  pipeRun(
    room,
    [
      [-3.5, 2.7, -3.4],
      [3.6, 2.7, -3.4],
      [8.0, 2.7, -2.6],
      [11.5, 2.7, -2.4],
    ],
    0.12,
  );
  pipeRun(
    room,
    [
      [3.6, 2.7, -3.4],
      [3.9, 1.4, -1.1],
    ],
    0.09,
    'copperPipe',
    false,
  );
  // The pipe run ends where the plate tore. It is snapped off, and it is dripping.
  room.geo('rust', cyl(0.11, 0.09, 0.3, 8), tiltMatrix([4.0, 1.25, -0.9], [0.9, 0.4, 0]), { tile: 0.3 });
  for (let i = 0; i < 4; i++) {
    room.geo('puddle', cyl(0.006, 0.005, 1.1, 4), poseMatrix([4.1 + room.range(-0.1, 0.1), 0.6, -0.75 + room.range(-0.1, 0.1)]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  puddle(room, 4.3, -0.4, 1.0);
  puddle(room, 1.0, -2.6, 0.8);
  drum(room, 6.6, -3.2);
  drum(room, 7.4, -3.3, true);
  wallSign(room, 'north', 2.4, 2.15, 0.62, [0, 0]);
  wallSign(room, 'south', 3.0, 2.15, 0.62, [1, 0]);
  debris(room, 2.4, -2.2, 1.2, 10);
  debris(room, 8.4, 2.4, 1.1, 9);
  debris(room, -1.4, 1.0, 1.0, 8);

  /* --- the two lights, meeting ---------------------------------------------------------- */
  /**
   * Four lamps for three cells. Two of them are the station's - amber, hard,
   * from fittings - and two are the trench's: the pane in the corner cell and a
   * cold seep down in the rock. They overlap in the middle of the corner cell,
   * which is the one place in the map where a wall is lit from both sides at
   * once, and it is the whole reason this room exists.
   */
  stripLight(room, 0.6, -2.6, 2.6, 0, true, false, 11);
  beacon(room, 8.6, 2.5, -3.5, true, 9);
  stripLight(room, 6.0, 1.0, 2.0, Math.PI / 2, false, true);
  cageLamp(room, 'east', -1.6, 2.2, false, false, 0, [1, 0]);
  cageLamp(room, 'west', -1.4, 2.2, false, false, 0, [0, 0]);

  const seep = new THREE.PointLight(0x3fc8e0, 10, ctx.dims.cellSize * 1.7, 2);
  seep.position.set(-1.6, 0.6, 7.0);
  room.light(seep);
  swell(room, seep, 10, 0.2, 0.4);

  causticPatch(room, -0.6, 6.0, 2.2);
  causticPatch(room, 1.6, 9.4, 1.8);
  causticPatch(room, 1.4, 4.4, 1.4);
  glowShaft(room, [-3.0, 2.8, 4.6], [0.2, 0.6, 6.4], 3.0);
  bioMotes(room, -0.8, 1.6, 6.6, 2.4, 26);
  bioMotes(room, 1.6, 1.3, 9.4, 1.6, 14);
  bioMotes(room, 3.0, 1.4, 1.4, 1.4, 10);
  room.geo('waterHaze', disc(3.4, 16), tiltMatrix([-0.6, ceilingHeight - 0.5, 6.4], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  const pane = room.lights[0];
  if (pane) swell(room, pane, 13, 0.13, 0.3);

  return room.finish();
}
