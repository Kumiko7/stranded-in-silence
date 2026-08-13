import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  boringHead,
  boulders,
  crate,
  cyl,
  debris,
  drum,
  floorFissure,
  glowPool,
  heatShimmer,
  motes,
  pipeRun,
  post,
  quad,
  railing,
  rubble,
  strut,
  surge,
  wallSign,
  workLamp,
} from '../kit/props';

/**
 * The Drill Head - the hinge room, and the exact place the Works stopped and the
 * Mountain started.
 *
 * A five-metre cutter wheel jammed in the north face, with the muck it was
 * cutting still packed round its rim and a fissure open under it. Everything on
 * the floor is facility - ferrocrete, cable, a work lamp somebody dragged in -
 * and everything above waist height is rock. The steel collar round each doorway
 * is the only mouth style in the map that admits both at once.
 *
 * The machine is dead. The rock behind it is not, and you can see the light
 * coming through.
 */
export const drill: RoomBlueprint = {
  id: 'forge.drill',
  nameKey: 'room.forge.drill',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 8,
  tags: ['hinge', 'landmark'],
  anchors: {
    chest: [{ position: [-2.6, 0, 3.35], rotationY: 0 }],
    locker: [{ position: [2.6, 0, 3.4], rotationY: 0 }],
    itemSpawn: [
      { position: [3.2, 0, -2.6] },
      { position: [-3.2, 0, -2.2] },
      { position: [0.6, 0.66, 1.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 1.2] },
      { position: [-2.6, 0, 0.4] },
      { position: [2.6, 0, 0.4] },
    ],
    enemySpawn: [{ position: [3.3, 0, -3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, drill);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'ferro',
    wall: 'tuff',
    ceiling: 'beams',
    band: 'hazard',
    bandHeight: 0.45,
    register: 'fissure',
    hot: true,
    mouth: 'collar',
  });

  /* --- the head --------------------------------------------------------------------- */
  boringHead(room, 'north', 0, 2.0);

  // The heat coming past it: the fissure it opened, running out from under the
  // rim and away down the room, with the shimmer standing over it.
  floorFissure(room, -0.6, -1.5, 3.2, 1.35, true);
  floorFissure(room, 1.4, -0.8, 2.6, 0.5, true);
  heatShimmer(room, 0, 1.5, -1.4, 4.6, 2.6, 0);
  glowPool(room, 0, -1.6, 3.0);

  // Muck: what came through the cutter and was never carted away. Piled against
  // the machine, thinning out into the room.
  // Muck heaps use `rubble()`, which places no colliders: this room offers three
  // walls and a heap of `boulders()` scattering its own colliders from the seeded
  // RNG would seal one of them on some seeds and not on others.
  rubble(room, -2.9, -1.4, 1.1, 12);
  rubble(room, 2.9, -1.6, 1.1, 12);
  rubble(room, 0, -0.9, 2.4, 18);
  debris(room, -1.4, 1.6, 1.0, 7);

  /* --- the works side ----------------------------------------------------------------- */
  // A hydraulic set holding the machine's back end, and the umbilical off it.
  for (const s of [-1, 1]) {
    post(room, 'steel', 0.16, 0.2, 1.5, [s * 2.35, 0, -0.3], 8, { castShadow: true });
    // `steel`, not `steelPale`: at metalness 0.68 a two-metre ram catches every
    // lamp in the room down its whole length and reads as a glowing white stick.
    room.geo('steel', cyl(0.1, 0.1, 1.5, 8), tiltMatrix([s * 2.2, 1.4, -1.2], [0.7, 0, 0]), { tile: 0.4 });
    room.box('graphite', [0.56, 0.16, 0.56], [s * 2.35, 0, -0.3], 0, { tile: 0.3 });
  }
  pipeRun(
    room,
    [
      [-2.35, 1.5, -0.3],
      [-3.3, 1.5, 0.6],
      [-3.4, 1.5, 3.0],
    ],
    0.1,
    'steel',
  );
  for (let i = 0; i < 6; i++) {
    strut(room, 'cable', [room.range(-1.6, 1.6), 0.06, -0.4], [room.range(-3.2, 3.2), 0.06, room.range(1.6, 3.2)], room.range(0.03, 0.06), 5, {
      receiveShadow: false,
    });
  }

  // A control post facing the head, with the last readings still on it.
  room.solid('steelDark', [1.3, 0.62, 0.62], [0.6, 0, 1.9], 0, { tile: 0.4 });
  room.box('graphite', [1.2, 0.26, 0.2], [0.6, 0.62, 1.72], -0.5, { tile: 0.3 });
  room.geo('screenDead', quad(0.9, 0.24), tiltMatrix([0.6, 0.78, 1.62], [-0.5, Math.PI, 0]), { receiveShadow: false });
  // The rail leaves a three-metre gap in the middle rather than two narrow ones:
  // a 0.35 m slot between a rail end and a console is not a gap, because the
  // flood walks a 0.64 m circle and anything narrower than that is a wall.
  railing(room, [-2.9, 0, 1.3], [-1.5, 0, 1.3], true, 1.0);
  railing(room, [1.5, 0, 1.3], [2.9, 0, 1.3], true, 1.0);
  room.geo('paintedWarn', quad(7.0, 0.12), tiltMatrix([0, 0.012, 1.15], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  drum(room, -1.2, 3.2, false);
  crate(room, -3.2, -2.9, -0.3, 0.8, 0.6, 0.62, true);
  motes(room, 0, 1.6, -1.0, 3.2, 14, 'spark');
  wallSign(room, 'east', 2.6, 2.2, true);
  wallSign(room, 'south', -3.0, 2.3, false);

  /* --- light ------------------------------------------------------------------------- */
  // Cold from the room, warm from the rock, and the seam between them runs right
  // across the cutter face - which is the entire argument of this room.
  // `workLamp(room, x, z, rotationY, ...)` - the third argument is a YAW, not a
  // second coordinate. Passing one as the other parks a tripod with its own
  // collider exactly where a locker has to open, which validates as "the
  // approach is unreachable" and looks perfectly fine in the room.
  //
  // The COLD lamp is the shadow caster, not the warm one. The warm one stands two
  // metres from a four-metre cutter head, and a shadow-casting lamp that close to
  // a caster that big blacks out everything behind it.
  const cold = workLamp(room, 2.6, -2.4, -0.8, true, 14);
  if (cold) {
    cold.castShadow = true;
    cold.shadow.mapSize.set(512, 512);
    cold.shadow.autoUpdate = false;
    cold.shadow.needsUpdate = true;
  }

  // Low and just in front of the rock, so the head is rimmed from below and reads
  // as a disc standing in a hole rather than as a slab bolted to a wall.
  const heat = new THREE.PointLight(0xff6a1e, 11, ctx.dims.cellSize * 1.8, 2);
  heat.position.set(0.3, 0.5, -2.2);
  room.light(heat);
  surge(room, heat, 10, 0.22, 0.4);

  void ceilingHeight;
  return room.finish();
}
