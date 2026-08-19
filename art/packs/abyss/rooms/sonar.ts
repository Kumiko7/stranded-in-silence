import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  beacon,
  cageLamp,
  controlDesk,
  cyl,
  debris,
  dripLine,
  gauge,
  monitorStack,
  pipeRun,
  quad,
  shelf,
  stripLight,
  wallSign,
} from '../kit/props';

/**
 * Sonar Control - the room that knows.
 *
 * A horseshoe of consoles round a swivel chair, a rack of repeaters on the west
 * wall, and every live screen in the station showing the same three returns.
 * Two of them are a long way out. The third is not.
 *
 * The room lights itself almost entirely on screen glow, which is the point: a
 * green face-light on whoever is standing at the desk, and black behind them.
 */
export const sonar: RoomBlueprint = {
  id: 'abyss.sonar',
  nameKey: 'room.abyss.sonar',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['station', 'lit'],
  anchors: {
    // Backed against the south wall, so it opens toward -Z: rotationY 0.
    chest: [{ position: [-2.0, 0, 3.2], rotationY: 0 }],
    itemSpawn: [
      { position: [-1.5, 0.84, -2.55] },
      { position: [1.95, 0.84, -2.85] },
      { position: [3.42, 1.56, 1.9] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.6] },
      { position: [-2.4, 0, 1.6] },
      { position: [2.2, 0, 2.4] },
    ],
    enemySpawn: [{ position: [-3.1, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, sonar);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'deck',
    wall: 'paint',
    ceiling: 'conduit',
    band: 'steel',
    bandHeight: 0.95,
    rail: true,
    strip: 'amber',
    mouth: 'bulkhead',
    ports: [{ side: 'west', kind: 'monitors', light: true }],
  });

  /* --- the horseshoe ------------------------------------------------------------ */
  // Three desks around the north-west quarter, angled at each other. All of it
  // sits outside the door lanes: the north, east and south openings each keep
  // their strip clear, which is why the horseshoe opens toward the middle
  // rather than being a ring in the centre of the floor.
  controlDesk(room, -1.5, -2.6, 2.0, 0.28, true);
  controlDesk(room, 2.0, -2.9, 1.6, -0.42, true);
  controlDesk(room, -3.0, 0.4, 1.9, -Math.PI / 2 + 0.1, true);

  // The chair, on a pedestal, turned away from the desk.
  const chair = -0.2;
  room.geo('steelDark', cyl(0.32, 0.4, 0.06, 12), poseMatrix([chair, 0.03, -1.1]), { tile: 0.4 });
  room.geo('steel', cyl(0.06, 0.07, 0.42, 8), poseMatrix([chair, 0.24, -1.1]), { tile: 0.3 });
  room.box('foam', [0.52, 0.1, 0.5], [chair, 0.44, -1.1], 0.7, { tile: 0.4 });
  room.box('foam', [0.5, 0.6, 0.12], [chair - 0.2, 0.5, -1.32], 0.7, { tile: 0.4 });
  room.blockCircle(chair, -1.1, 0.4);

  /* --- the repeaters ------------------------------------------------------------ */
  // A floor rack of CRTs beside the monitor port, and a shelf of tape spools
  // over it. `along` on an east wall runs -z, so along -1.9 lands at z = +1.9.
  monitorStack(room, -3.1, 2.6, -Math.PI / 2 + 0.2, 3);
  shelf(room, 'east', -1.9, 1.5, 1.5, 0.42);
  for (let i = 0; i < 4; i++) {
    const z = 1.28 + i * 0.36;
    if (Math.abs(z - 1.9) < 0.3) continue; // the item anchor's spot
    room.geo('plastic', cyl(0.13, 0.13, 0.05, 14), poseMatrix([3.35, 1.58, z]), { tile: 0.3 });
    room.geo('steelDark', cyl(0.04, 0.04, 0.06, 8), poseMatrix([3.35, 1.6, z]), { tile: 0.2 });
  }

  /* --- the fabric of it ---------------------------------------------------------- */
  // Cable trunking dropping out of the ceiling into the back of each desk, and
  // the gauges that tell you the hull is still holding.
  pipeRun(
    room,
    [
      [-3.4, ceilingHeight - 0.6, -3.2],
      [-1.6, ceilingHeight - 0.6, -3.3],
      [-1.5, 1.0, -3.3],
    ],
    0.07,
    'cable',
    false,
  );
  pipeRun(
    room,
    [
      [3.4, ceilingHeight - 0.6, -3.3],
      [2.1, ceilingHeight - 0.6, -3.4],
      [2.0, 1.0, -3.4],
    ],
    0.06,
    'cable',
    false,
  );
  gauge(room, 'north', 2.4, 2.0);
  gauge(room, 'north', 2.0, 1.6, 0.09);
  wallSign(room, 'south', -3.0, 2.05);

  // A wall chart, pinned up and curling: bars and a coastline of nothing.
  room.geo('plastic', quad(1.1, 0.8), poseMatrix([-1.4, 2.2, 3.66], Math.PI), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 7; i++) {
    room.geo(
      'steelDark',
      quad(room.range(0.2, 0.85), 0.02),
      poseMatrix([-1.7 + room.range(-0.1, 0.2), 2.5 - i * 0.09, 3.655], Math.PI),
      { castShadow: false, receiveShadow: false },
    );
  }

  dripLine(room, 1.2, 1.4);
  debris(room, -2.6, -1.4, 0.9, 8);
  debris(room, 2.9, -1.6, 0.7, 6);

  // One live strip over the horseshoe. Everything else in here is screen glow,
  // which is the whole look: a green face-light and black behind it.
  stripLight(room, -0.8, -2.2, 2.6, 0.28, true, false, 8);
  stripLight(room, 1.8, 1.8, 1.8, 0, false, true);
  cageLamp(room, 'south', 2.6, 2.15, false, false);
  beacon(room, 0, ceilingHeight - 0.34, 2.4, false, 0, true);

  return room.finish();
}
