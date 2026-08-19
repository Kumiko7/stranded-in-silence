import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  bioMotes,
  causticPatch,
  debris,
  disc,
  dripLine,
  glowShaft,
  quad,
  railing,
  stripLight,
  swell,
  wallSign,
} from '../kit/props';

/**
 * The Tunnel - twenty-four metres of walking through the sea.
 *
 * A three-cell corridor with glass down both sides and a barrel vault of it
 * overhead, so the trench is on your left, on your right and above your head at
 * the same time. There is one dead strip light in the middle of the run and
 * nothing else in it: everything you can see by comes through the acrylic.
 *
 * The longest sightline in the map and the worst place in it to meet anything -
 * there is nowhere to go except forward or back, and you can see all the way to
 * both ends.
 */
const FOOTPRINT = [
  [0, 0],
  [0, 1],
  [0, 2],
] as const;

export const tunnel: RoomBlueprint = {
  id: 'abyss.tunnel',
  nameKey: 'room.abyss.tunnel',
  footprint: FOOTPRINT,
  /**
   * Both ends, plus one side wall at each end. That leaves the middle cell's
   * two long walls and one side wall at each end free for glass - five panes,
   * which is the whole point of the room.
   */
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([0, 2], 'south', 'east'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['abyss', 'open', 'landmark'],
  anchors: {
    // Both well clear of their own cell's doorway lane: a 1x3 has an opening
    // every eight metres down each side, not one at each end.
    chest: [{ position: [3.2, 0, 13.6], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.3], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.6, 0.9, 3.4] },
      { position: [-2.6, 0.9, 12.6] },
      { position: [0.5, 0, 8.0] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.4] },
      { position: [0, 0, 8.0] },
      { position: [0, 0, 17.4] },
    ],
    enemySpawn: [{ position: [-2.9, 0, 17.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tunnel);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'paint',
    ceiling: 'beams',
    band: 'steel',
    bandHeight: 0.5,
    strip: 'cyan',
    mouth: 'collar',
    ports: [
      { cell: [0, 0], side: 'east', kind: 'viewpane', scene: 'coral', tall: true, light: true },
      { cell: [0, 1], side: 'west', kind: 'viewpane', scene: 'swarm', tall: true, light: true },
      { cell: [0, 1], side: 'east', kind: 'viewpane', scene: 'kelp', tall: true },
      { cell: [0, 2], side: 'west', kind: 'viewpane', scene: 'wreck', tall: true, light: true },
    ],
  });

  /* --- the vault ------------------------------------------------------------------- */
  /**
   * The overhead half of the tunnel: a run of glass arches from wall to wall,
   * with the water and its light above them. Built as eleven segments per arch
   * because a vault sampled any coarser reads as a row of planks - the same
   * lesson the manor's ribbed ceiling learnt (ROOM_REVIEW.md §4).
   *
   * The water above it is a single unlit mapped sheet at ceiling height, which
   * is what stops the arches reading as a skylight into an empty room.
   */
  for (let z = -3.4; z <= 19.4; z += 1.6) {
    const segments = 11;
    const span = 3.6;
    const rise = 0.62;
    const spring = ceilingHeight - 0.5 - rise;
    for (let s = 0; s < segments; s++) {
      const a0 = (Math.PI * s) / segments;
      const a1 = (Math.PI * (s + 1)) / segments;
      const x0 = Math.cos(a0) * span;
      const x1 = Math.cos(a1) * span;
      const y0 = spring + Math.sin(a0) * rise;
      const y1 = spring + Math.sin(a1) * rise;
      room.geo(
        'steel',
        new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.11, 0.12),
        tiltMatrix([(x0 + x1) / 2, (y0 + y1) / 2, z], [0, 0, Math.atan2(y1 - y0, x1 - x0)]),
        { tile: 0.5, castShadow: false, consume: true },
      );
    }
  }
  /**
   * The glazing between the ribs, and the water over all of it.
   *
   * No `consume` on any of these: `quad()` hands back a CACHED geometry, and
   * consuming one frees a buffer the next room built from this pack is still
   * using. `consume` is only ever for geometry made at the call site.
   */
  for (const s of [-1, 1]) {
    room.geo('glassPane', quad(23.6, 2.0), tiltMatrix([s * 2.5, ceilingHeight - 0.62, 8.0], [0, Math.PI / 2, s * 0.62]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  room.geo('glassPane', quad(23.6, 2.4), tiltMatrix([0, ceilingHeight - 0.12, 8.0], [Math.PI / 2, Math.PI / 2, 0]), {
    castShadow: false,
    receiveShadow: false,
  });
  room.geo('tankFluid', quad(23.6, 7.0), tiltMatrix([0, ceilingHeight + 0.16, 8.0], [Math.PI / 2, Math.PI / 2, 0]), {
    castShadow: false,
    receiveShadow: false,
  });
  // Silhouettes over the vault: bodies crossing the glass above your head.
  for (let i = 0; i < 14; i++) {
    const a = room.range(0, Math.PI * 2);
    room.geo(
      'rockDark',
      ball(room.range(0.09, 0.2), 6),
      tiltMatrix([room.range(-2.6, 2.6), ceilingHeight + room.range(0.3, 1.0), room.range(-3.0, 19.0)], [0, a, room.range(-0.2, 0.2)], [2.5, 0.75, 0.9]),
      { castShadow: false, receiveShadow: false },
    );
  }

  /* --- the walk --------------------------------------------------------------------- */
  // A rail down both sides, a plinth at each third, and nothing else at all.
  railing(room, [-2.75, 0, -2.6], [-2.75, 0, 18.6], false, 0.95);
  railing(room, [2.75, 0, -2.6], [2.75, 0, 18.6], false, 0.95);
  for (const [x, z, spin] of [
    [2.6, 3.4, Math.PI / 2],
    [-2.6, 12.6, -Math.PI / 2],
  ] as const) {
    room.solid('steelDark', [0.8, 0.88, 0.6], [x, 0, z], spin, { tile: 0.6 });
    room.geo('screenData', quad(0.58, 0.32), tiltMatrix([x, 1.0, z], [-0.9, spin + Math.PI, 0]), { castShadow: false, receiveShadow: false });
  }
  wallSign(room, 'north', 2.4, 2.1, 0.62, [0, 0]);
  wallSign(room, 'south', -2.4, 2.1, 0.62, [0, 2]);

  /* --- the light ---------------------------------------------------------------------- */
  // Three of the four panes carry a lamp; the fourth is dark, so the run has a
  // black stretch in the middle of it that you have to walk through.
  causticPatch(room, 0, 0.4, 2.4);
  causticPatch(room, -0.6, 6.4, 2.2);
  causticPatch(room, 0.8, 12.4, 2.2);
  causticPatch(room, 0, 17.4, 2.0);
  glowShaft(room, [3.2, 2.6, 0], [-0.6, 0.5, 1.4], 3.2);
  glowShaft(room, [-3.2, 2.6, 8.0], [0.6, 0.5, 9.4], 3.2);
  glowShaft(room, [-3.2, 2.6, 16.0], [0.6, 0.5, 17.0], 3.0);
  for (let i = 0; i < 7; i++) {
    bioMotes(room, room.range(-2.0, 2.0), room.range(1.0, 2.2), -2.4 + i * 3.6, 1.8, 14);
  }
  for (let i = 0; i < 5; i++) {
    room.geo('surface.caustic', disc(room.range(1.2, 2.0), 16), tiltMatrix([room.range(-1.6, 1.6), ceilingHeight - 0.72, room.range(-2.6, 18.6)], [Math.PI / 2, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
      tile: 3.4,
    });
  }

  stripLight(room, 0, 8.0, 2.4, Math.PI / 2, false, true);
  stripLight(room, 0, 2.0, 2.0, Math.PI / 2, false, true);
  stripLight(room, 0, 14.0, 2.0, Math.PI / 2, false, true);
  dripLine(room, 1.4, 5.2);
  dripLine(room, -1.2, 11.0);
  debris(room, 1.8, 9.6, 1.1, 8);
  debris(room, -1.6, 4.4, 0.9, 7);
  debris(room, 2.0, 16.4, 0.9, 7);

  for (const [index, lamp] of room.lights.entries()) {
    swell(room, lamp, 13, 0.13, 0.28 + index * 0.14);
  }

  return room.finish();
}
