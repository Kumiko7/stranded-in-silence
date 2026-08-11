import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { beacon, controlDesk, debris, drum, gauge, glowShaft, pipeRun, quad, railing, stripLight, swell, valve, wallSign } from '../kit/props';

/**
 * The Core - the only thing on the station still doing what it was built for.
 *
 * A three-metre pressure vessel against the fore bulkhead, ringed with cooling
 * pipe and stitched into the ceiling by six risers. A slot window down its face
 * shows the light inside, and that light is the room: everything else here is
 * silhouette, and the shadows of the pipework fall across the whole deck.
 *
 * The one warm room in the map. It hums, and the hum is visible - the glow
 * swells and sinks on a slow cycle you can feel in the shadows before you notice
 * it in the light.
 */
export const reactor: RoomBlueprint = {
  id: 'abyss.reactor',
  nameKey: 'room.abyss.reactor',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 9,
  tags: ['station', 'machinery', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0.84, -2.05] },
      { position: [3.42, 1.36, -2.6] },
      { position: [2.4, 0.98, 3.05] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.6, 0, 0.4] },
      { position: [2.6, 0, -1.6] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -3.2] }],
  },
  build,
};

const CORE_Z = -2.35;
const CORE_R = 1.15;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, reactor);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'deck',
    wall: 'hull',
    ceiling: 'pipes',
    band: 'hazard',
    bandHeight: 0.6,
    rail: true,
    strip: 'amber',
    mouth: 'bulkhead',
  });

  /* --- the vessel ------------------------------------------------------------------ */
  // Plinth, barrel, dome, and the belly bands round it. Backed hard against the
  // fore bulkhead, which is the one wall this room never opens as a hatchway.
  room.geo('steelDark', new THREE.CylinderGeometry(CORE_R * 1.2, CORE_R * 1.3, 0.28, 20), poseMatrix([0, 0.14, CORE_Z]), {
    tile: 0.7,
    consume: true,
  });
  room.geo('steel', new THREE.CylinderGeometry(CORE_R, CORE_R, ceilingHeight - 0.9, 22), poseMatrix([0, 0.28 + (ceilingHeight - 0.9) / 2, CORE_Z]), {
    tile: 1.1,
    consume: true,
  });
  room.geo('steelPale', new THREE.SphereGeometry(CORE_R, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), poseMatrix([0, ceilingHeight - 0.62, CORE_Z]), {
    tile: 1.0,
    consume: true,
  });
  for (const y of [0.9, 1.9, 2.7]) {
    room.geo('steelDark', new THREE.TorusGeometry(CORE_R + 0.03, 0.075, 6, 22), tiltMatrix([0, y, CORE_Z], [Math.PI / 2, 0, 0]), {
      tile: 0.4,
      consume: true,
    });
  }
  // Bolt heads round the middle band, because a pressure vessel is bolted.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    room.geo('steelPale', new THREE.CylinderGeometry(0.045, 0.045, 0.07, 6), tiltMatrix([Math.sin(a) * (CORE_R + 0.1), 1.9, CORE_Z + Math.cos(a) * (CORE_R + 0.1)], [Math.PI / 2, a, 0]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
  }

  /**
   * The slot window. The lit part is a narrow emissive strip set INTO the shell
   * with a heavy bezel round it - a whole glowing face would read as a lamp, and
   * what this has to read as is a very small hole into something very bright.
   */
  room.box('steelDark', [0.62, 1.5, 0.24], [0, 0.95, CORE_Z + CORE_R - 0.02], 0, { tile: 0.4 });
  // Facing +Z, out into the room: a plane's front face is +Z at yaw 0, and the
  // deck is on the +Z side of the vessel.
  room.geo('lumenAmber', quad(0.34, 1.24), poseMatrix([0, 1.7, CORE_Z + CORE_R + 0.11], 0), { castShadow: false, receiveShadow: false });
  room.geo('glassPane', quad(0.42, 1.32), poseMatrix([0, 1.7, CORE_Z + CORE_R + 0.13], 0), { castShadow: false, receiveShadow: false });
  for (const s of [-1, 1]) {
    room.box('steelPale', [0.1, 1.44, 0.16], [s * 0.28, 0.98, CORE_Z + CORE_R + 0.06], 0, { tile: 0.3, castShadow: false });
  }
  glowShaft(room, [0, 1.7, CORE_Z + CORE_R + 0.2], [0, 1.1, CORE_Z + CORE_R + 2.4], 0.7, true);
  room.blockCircle(0, CORE_Z, CORE_R + 0.25);

  /* --- the plumbing ----------------------------------------------------------------- */
  // Six risers off the dome into the ceiling, and two heavy runs out to the side
  // walls at head height - kept above 2.3 m where they cross the door lanes.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const px = Math.sin(a) * CORE_R * 0.7;
    const pz = CORE_Z + Math.cos(a) * CORE_R * 0.7;
    pipeRun(room, [[px, ceilingHeight - 0.62, pz], [px, ceilingHeight - 0.1, pz]], 0.075, i % 2 ? 'copperPipe' : 'steel', false);
  }
  pipeRun(
    room,
    [
      [-CORE_R, 2.55, CORE_Z],
      [-2.6, 2.55, CORE_Z],
      [-3.4, 2.55, -0.4],
      [-3.4, 2.55, 3.2],
    ],
    0.13,
  );
  pipeRun(
    room,
    [
      [CORE_R, 2.35, CORE_Z],
      [2.7, 2.35, CORE_Z],
      [3.4, 2.35, -0.2],
      [3.4, 2.35, 3.0],
    ],
    0.11,
    'copperPipe',
  );
  valve(room, [-3.4, 1.75, 3.2], 0.22, 0, true);
  valve(room, [3.4, 1.6, 3.0], 0.2, 0, false);
  pipeRun(room, [[-3.4, 2.42, 3.2], [-3.4, 1.9, 3.2]], 0.1, 'steel', false);
  pipeRun(room, [[3.4, 2.24, 3.0], [3.4, 1.75, 3.0]], 0.09, 'copperPipe', false);

  /* --- the watch ---------------------------------------------------------------------- */
  // A desk facing the core, and a rail between the two so nobody walks into it.
  controlDesk(room, -2.2, -2.0, 1.7, 1.1, true);
  railing(room, [-1.7, 0, -0.95], [1.7, 0, -0.95], false, 1.05);
  gauge(room, 'west', -2.6, 1.9, 0.15);
  gauge(room, 'west', -2.15, 1.6, 0.1);
  wallSign(room, 'east', 0.6, 2.2);

  // A parts bench along the south-east and a pair of drums in the corner.
  room.solid('steelPale', [1.5, 0.9, 0.6], [2.4, 0, 3.3], 0, { tile: 0.8 });
  room.box('steelDark', [1.56, 0.06, 0.66], [2.4, 0.9, 3.3], 0, { tile: 0.4 });
  drum(room, 3.3, 1.4);
  drum(room, 2.7, 1.15, true);
  room.box('steelPale', [1.4, 0.05, 0.4], [3.5, 1.3, -2.6], Math.PI / 2, { tile: 0.6 });
  debris(room, -1.2, 2.4, 1.0, 9);
  debris(room, 1.6, -1.4, 0.7, 6);

  /**
   * Two lights, both warm, both off to the side of the core: a lamp INSIDE its
   * own glowing mesh lights the inside of a cylinder and nothing else
   * (ROOM_REVIEW.md §4). Placed beside it they rim the vessel instead, and the
   * pipework throws the long shadows the room is really made of.
   */
  const core = new THREE.PointLight(0xffa044, 15, ctx.dims.cellSize * 1.9, 2);
  core.position.set(0, 1.9, CORE_Z + CORE_R + 0.9);
  core.castShadow = true;
  core.shadow.mapSize.set(512, 512);
  core.shadow.autoUpdate = false;
  core.shadow.needsUpdate = true;
  room.light(core);
  swell(room, core, 15, 0.16, 0.45);

  stripLight(room, 1.4, 2.6, 2.0, 0, true, false, 7, false);
  beacon(room, -3.4, 2.7, -3.3, false, 0, true);

  return room.finish();
}
