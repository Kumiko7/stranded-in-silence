import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import {
  alarmBeacon,
  arcLamp,
  bench,
  crate,
  cyl,
  debris,
  disc,
  gauge,
  glowPool,
  ladder,
  motes,
  pipeRun,
  quad,
  shelf,
  strut,
  suitRack,
  valve,
  wallSign,
} from '../kit/props';

/**
 * The Blast Airlock - the compartment everything and everybody comes through.
 *
 * A hard chevron floor, a wash-down bay with the rose still dripping, and a rack
 * of heat-proximity suits hanging where they were left. The suits are the whole
 * room: silvered cloth at a person's height catches every lamp, so from any of
 * the four doorways this reads as several people standing very still against the
 * wall, and it takes a second longer than it should to work out they are empty.
 *
 * The only room in the map that offers all four walls, so everything solid lives
 * in the corners and the cross through the middle is bare deck. Which corner
 * holds what is the whole layout: bench north-west, shower north-east, suits and
 * the case south-west, lockers south-east.
 */
export const airlock: RoomBlueprint = {
  id: 'forge.airlock',
  nameKey: 'room.forge.airlock',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 12,
  tags: ['works', 'entrance'],
  anchors: {
    chest: [{ position: [-2.6, 0, 3.35], rotationY: 0 }],
    locker: [
      { position: [3.4, 0, 2.3], rotationY: Math.PI / 2 },
      { position: [2.5, 0, 3.4], rotationY: 0 },
    ],
    itemSpawn: [
      { position: [-3.35, 0.94, -2.7] },
      { position: [-3.52, 1.45, -1.9] },
      { position: [1.5, 0, -3.3] },
    ],
    playerSpawn: [
      { position: [-1.7, 0, 1.7], rotationY: -Math.PI * 0.75 },
      { position: [1.7, 0, 1.7], rotationY: Math.PI * 0.75 },
      { position: [-1.7, 0, -1.7], rotationY: -Math.PI * 0.25 },
      { position: [1.7, 0, -1.7], rotationY: Math.PI * 0.25 },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.4, 0, 0.2] },
      { position: [2.4, 0, -0.2] },
    ],
    enemySpawn: [{ position: [3.3, 0, -3.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, airlock);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'duct',
    band: 'hazard',
    bandHeight: 1.15,
    register: 'vent',
    mouth: 'blast',
    rail: true,
  });

  /* --- north-west: the bench ------------------------------------------------- */
  // `along` on a west wall runs toward +Z, so a negative one is the NORTH end.
  // Getting that backwards is how a shelf ends up on top of a suit rack.
  bench(room, -3.35, -2.6, 1.8, 0.62, 0.94, Math.PI / 2);
  shelf(room, 'west', -1.9, 1.4, 1.3, 0.36);
  shelf(room, 'west', -1.9, 1.88, 1.3, 0.36);
  crate(room, -1.9, -3.25, 0.35, 0.8, 0.6, 0.62, true);

  /* --- north-east: the wash-down bay ------------------------------------------ */
  // A shower frame: four uprights, a header ring and a rose, with the pull chain
  // hanging off it and a drain under it. No colliders - it is an open frame and
  // a player who clips a leg through it never notices, where a player stopped
  // dead by an invisible box does.
  const sx = 2.5;
  const sz = -2.5;
  for (const [dx, dz] of [
    [-0.62, -0.62],
    [0.62, -0.62],
    [-0.62, 0.62],
    [0.62, 0.62],
  ] as const) {
    strut(room, 'steel', [sx + dx, 0, sz + dz], [sx + dx, 2.32, sz + dz], 0.036, 5);
  }
  for (const d of [-0.62, 0.62]) {
    room.geo('steel', cyl(0.03, 0.03, 1.24, 5), tiltMatrix([sx + d, 2.32, sz], [Math.PI / 2, 0, 0]));
    room.geo('steel', cyl(0.03, 0.03, 1.24, 5), tiltMatrix([sx, 2.32, sz + d], [Math.PI / 2, Math.PI / 2, 0]));
  }
  room.geo('steelPale', cyl(0.2, 0.15, 0.1, 10), poseMatrix([sx, 2.16, sz]), { tile: 0.2 });
  room.geo('steelDark', disc(0.19, 12), tiltMatrix([sx, 2.1, sz], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  strut(room, 'cable', [sx + 0.52, 2.3, sz], [sx + 0.52, 1.32, sz], 0.012, 4, { receiveShadow: false });
  room.geo('paintedRed', cyl(0.05, 0.05, 0.16, 6), poseMatrix([sx + 0.52, 1.24, sz]));
  // The drain: a wet square of deck with a grating in it, flat at deck level.
  room.geo('graphite', quad(1.0, 1.0), tiltMatrix([sx, 0.011, sz], [-Math.PI / 2, 0, 0]), { receiveShadow: false });
  room.geo('surface.grate', disc(0.32, 12), tiltMatrix([sx, 0.017, sz], [-Math.PI / 2, 0, 0]), { tile: 0.5 });
  // Hoses coiled on two hooks, on the wall behind the bay.
  for (const [y, r] of [
    [1.6, 0.26],
    [2.05, 0.2],
  ] as const) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      room.geo('rubber', cyl(0.028, 0.028, 0.4, 5), tiltMatrix([1.6 + Math.cos(a) * r, y + Math.sin(a) * r, -3.58], [Math.PI / 2, 0, 0]), {
        receiveShadow: false,
      });
    }
  }

  // Service riser and its valve, in the corner behind the bay.
  pipeRun(
    room,
    [
      [3.5, 0.3, -3.45],
      [3.5, 2.6, -3.45],
      [1.2, 2.6, -3.5],
    ],
    0.09,
    'steel',
    false,
  );
  valve(room, [3.5, 1.5, -3.45], 0.2, Math.PI / 4, true);

  /* --- south-west: the suits --------------------------------------------------- */
  suitRack(room, 'west', 1.8, 3);
  debris(room, -1.7, 3.2, 0.7, 5);

  /* --- signage, light and air --------------------------------------------------- */
  wallSign(room, 'south', 1.4, 2.35, true);
  wallSign(room, 'north', 2.2, 2.4, false);
  gauge(room, 'east', -1.7, 1.9, 0.14);
  ladder(room, 'east', 3.2);
  alarmBeacon(room, 3.5, 2.6, -1.2, false);
  motes(room, 0, 1.9, 0, 3.0, 10, 'ash');

  // Wall fittings never sit at `along` 0 on a wall the generator may open: the
  // blast mouth parks its shutter in a header box up to 2.6 m, so a lamp in the
  // middle of that wall ends up inside it.
  arcLamp(room, 'west', 2.9, 2.5, true, 14);
  arcLamp(room, 'east', 2.9, 2.5, false);

  // The one shadow caster, high and off centre, so the suits throw their
  // silhouettes across the deck rather than being lit flat.
  const overhead = new THREE.PointLight(0xc8e4ff, 11, ctx.dims.cellSize * 1.7, 2);
  overhead.position.set(0.6, ceilingHeight - 0.55, 0.6);
  room.shadowLight(overhead);

  glowPool(room, -3.0, 0.2, 1.2, true);

  return room.finish();
}
