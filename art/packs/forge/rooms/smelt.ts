import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  alarmBeacon,
  ring,
  bench,
  catwalk,
  crate,
  crucible,
  cyl,
  debris,
  drum,
  glowPool,
  hangingHook,
  heatShimmer,
  lavaRunnel,
  motes,
  pipeRun,
  post,
  quad,
  railing,
  sparkFall,
  suitRack,
  valve,
  wallSign,
} from '../kit/props';

/**
 * The Smeltery - a 2x1 casting hall, and the one room in the Works that is
 * genuinely, currently hot.
 *
 * A graphite crucible in a tilting yoke at the west end, a runnel of melt going
 * east along the north wall, and a mould bed at the far end where the last pour
 * set and was never lifted. Above all of it, a crane rail with the ladle still
 * hanging off it.
 *
 * Everything solid is in the north band and between the two cells' centres,
 * because on a 2x1 the doorways march along the wall one per cell: there are
 * lanes at x = 0 AND x = 8, not one down the middle.
 */
export const smelt: RoomBlueprint = {
  id: 'forge.smelt',
  nameKey: 'room.forge.smelt',
  footprint: [
    [0, 0],
    [1, 0],
  ],
  doorWalls: [...wallsOn([0, 0], 'north', 'west', 'south'), ...wallsOn([1, 0], 'north', 'east', 'south')],
  weight: 7,
  tags: ['works', 'machinery', 'landmark'],
  anchors: {
    chest: [{ position: [4.0, 0, 3.35], rotationY: 0 }],
    locker: [{ position: [6.6, 0, 3.4], rotationY: 0 }],
    itemSpawn: [
      { position: [4.0, 0.97, 0.4] },
      { position: [5.9, 1.02, -2.8] },
      { position: [1.4, 0, 2.6] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0.6] },
      { position: [4.0, 0, 1.4] },
      { position: [7.8, 0, 0.6] },
      { position: [4.4, 0, -1.75] },
    ],
    enemySpawn: [{ position: [9.4, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, smelt);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'scorch',
    wall: 'ferro',
    ceiling: 'trusses',
    band: 'hazard',
    bandHeight: 0.6,
    register: 'vent',
    hot: true,
    mouth: 'blast',
  });

  /* --- the crucible ---------------------------------------------------------------- */
  crucible(room, 2.6, -2.6, 0.85, true, 15);
  // The pot's melt is down inside it where it belongs, so from three metres away
  // there is nothing saying the thing is full. A lit lip, a shimmer over it and a
  // wash on the deck are what carry that at a distance.
  room.geo('lumenMolten', ring(0.87, 0.045, 16), tiltMatrix([2.6, 1.22, -2.6], [Math.PI / 2, 0, 0]), { receiveShadow: false });
  heatShimmer(room, 2.6, 2.0, -2.6, 2.0, 1.8, 0);
  heatShimmer(room, 2.6, 2.0, -2.6, 2.0, 1.8, Math.PI / 2);
  glowPool(room, 2.6, -2.6, 2.2);
  // The furnace shell behind it: a firebrick arch it was pulled out of, with the
  // door hanging open and the lining glowing well down inside.
  room.box('firebrick', [2.4, 2.4, 0.6], [2.6, 0, -3.5], 0, { tile: 0.7, castShadow: true });
  room.box('graphite', [1.5, 1.6, 0.3], [2.6, 0.25, -3.34], 0, { tile: 0.5 });
  room.geo('surface.crustHot', quad(1.2, 1.3), poseMatrix([2.6, 0.9, -3.16], 0), { receiveShadow: false });
  room.geo('tempered', quad(1.5, 1.7), tiltMatrix([1.5, 1.1, -3.0], [0, -0.9, 0]), { receiveShadow: false });
  heatShimmer(room, 2.6, 1.4, -2.9, 2.0, 2.2, 0);

  /* --- the pour ---------------------------------------------------------------------- */
  // The runnel runs east along the north band, well clear of both cells' door
  // lanes, and ends in a mould bed that is still full.
  lavaRunnel(room, [3.6, -2.6], [5.0, -2.6], 0.5);
  room.solid('firebrick', [1.4, 0.55, 1.3], [5.9, 0, -2.7], 0, { tile: 0.6, castShadow: true });
  room.box('surface.magma', [1.0, 0.06, 0.9], [5.9, 0.55, -2.7], 0, { tile: 0.7 });
  room.box('graphite', [1.1, 0.05, 1.0], [5.9, 0.61, -2.7], 0, { tile: 0.4 });
  glowPool(room, 5.9, -2.7, 1.6);
  sparkFall(room, 4.3, -2.6, 1.1, 10);

  // Ingots, stacked where the last shift left them.
  for (let i = 0; i < 6; i++) {
    room.box(i < 4 ? 'steelPale' : 'graphite', [0.62, 0.13, 0.26], [7.3 + (i % 2) * 0.05, (i >> 1) * 0.13, -2.6 + (i % 2) * 0.3], room.range(-0.08, 0.08), { tile: 0.3 });
  }

  /* --- the crane -------------------------------------------------------------------- */
  const railY = ceilingHeight - 0.95;
  room.geo('steel', cyl(0.11, 0.11, 15.0, 8), tiltMatrix([4.0, railY, -1.4], [Math.PI / 2, Math.PI / 2, 0]), { tile: 0.7 });
  room.box('graphite', [15.0, 0.28, 0.24], [4.0, railY - 0.3, -1.4], 0, { tile: 0.8 });
  room.box('steelPale', [1.1, 0.5, 0.7], [4.6, railY - 0.82, -1.4], 0, { tile: 0.4, castShadow: true });
  hangingHook(room, 4.6, -1.4, 1.4);
  catwalk(room, [0.0, 2.62, 3.1], [8.0, 2.62, 3.1], 1.0);

  /* --- the floor of the hall ---------------------------------------------------------- */
  // A rail between the walkway and the melt. It stops short at both ends, so the
  // north band is still reachable rather than a sealed strip.
  railing(room, [1.3, 0, -1.4], [3.9, 0, -1.4], true, 1.05);
  railing(room, [5.0, 0, -1.4], [7.0, 0, -1.4], true, 1.05);
  room.geo('paintedWarn', quad(9.0, 0.12), tiltMatrix([4.0, 0.012, -1.15], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  // South of the rail gap, not north of it: a bench 0.47 m from the rail turns
  // the only way into the north band into a wall, because the flood walks a
  // 0.64 m circle and anything narrower than that is not a gap.
  bench(room, 4.0, 0.4, 2.2, 0.62, 0.97, 0);
  suitRack(room, 'south', -3.0, 2, [0, 0]);
  drum(room, 0.6, 1.9, false);
  drum(room, 1.2, 2.4, true);
  crate(room, 10.6, 2.9, 0.3, 0.9, 0.7, 0.7, true);
  crate(room, 10.9, 1.0, -0.4, 0.8, 0.6, 0.6, false);
  debris(room, 2.0, 1.2, 1.2, 9);
  debris(room, 6.6, 0.8, 1.0, 7);
  motes(room, 4.0, 1.9, -1.4, 4.0, 16, 'spark');

  pipeRun(room, [
    [0.4, 2.5, -3.5],
    [8.0, 2.5, -3.5],
    [9.4, 2.5, -2.4],
    [9.4, 2.5, 2.0],
  ], 0.12);
  valve(room, [9.4, 1.6, 2.0], 0.22, 0, true);
  post(room, 'steel', 0.1, 0.13, 2.2, [8.0, 0, -3.4], 7);

  wallSign(room, 'north', -1.6, 2.4, true, 0.66, [0, 0]);
  wallSign(room, 'south', 2.6, 2.35, false, 0.66, [1, 0]);
  alarmBeacon(room, 9.4, 2.6, -3.4, false);

  /* --- light -------------------------------------------------------------------------- */
  // Three lights on a 2x1. The crucible has one, spent above; a second sits over
  // the mould bed so the ingots have a silhouette, and the third is a cold arc
  // at the east end so the hall has a far wall you can read.
  const pour = new THREE.PointLight(0xff7a28, 11, ctx.dims.cellSize * 1.7, 2);
  pour.position.set(5.9, 1.5, -2.2);
  room.light(pour);
  room.tick((t) => {
    pour.intensity = 11 * (1 + Math.sin(t * 0.7) * 0.14 + Math.sin(t * 1.9) * 0.06);
  });

  const arc = new THREE.PointLight(0xc8e4ff, 11, ctx.dims.cellSize * 1.5, 2);
  arc.position.set(8.4, ceilingHeight - 0.7, 1.2);
  room.shadowLight(arc);

  return room.finish();
}
