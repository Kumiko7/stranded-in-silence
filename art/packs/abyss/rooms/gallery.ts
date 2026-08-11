import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bioMotes, causticPatch, debris, dripLine, glowShaft, quad, railing, stripLight, swell } from '../kit/props';

/**
 * The Viewing Gallery - what the station was for, before it was for anything
 * else.
 *
 * A short hall with a wall of glass at each end: the open trench fore, a kelp
 * stand aft, and a bench and a brass rail in front of both. There is nothing in
 * this room. That is the design - it is the widest, emptiest, most beautiful
 * space in the map, and the only light in it comes from the water.
 *
 * It is also where four people start their run, which means the first thing
 * anybody sees on this map is the sea looking back at them.
 */
export const gallery: RoomBlueprint = {
  id: 'abyss.gallery',
  nameKey: 'room.abyss.gallery',
  footprint: [[0, 0]],
  doorWalls: wallsFor('east', 'west'),
  weight: 10,
  tags: ['abyss', 'entrance', 'open', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-1.4, 0.55, -2.0] },
      { position: [1.6, 0.55, 2.05] },
      { position: [3.3, 0, -2.9] },
    ],
    playerSpawn: [
      { position: [-2.2, 0, 0.9], rotationY: 0 },
      { position: [-0.8, 0, 0.9], rotationY: 0 },
      { position: [0.8, 0, 0.9], rotationY: 0 },
      { position: [2.2, 0, 0.9], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [-2.4, 0, -0.4] },
      { position: [2.4, 0, 0.4] },
      { position: [0, 0, 2.9] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

/** A viewing bench: a slab on two cast legs, facing the glass. */
function viewBench(room: Room, z: number, spin: number): void {
  room.box('rockPale', [3.0, 0.1, 0.62], [0, 0.44, z], 0, { tile: 1.0 });
  room.box('rockPale', [2.86, 0.06, 0.5], [0, 0.38, z], 0, { tile: 0.8 });
  for (const x of [-1.15, 1.15]) {
    room.box('steelDark', [0.14, 0.38, 0.5], [x, 0, z], 0, { tile: 0.4 });
    room.box('steelDark', [0.4, 0.05, 0.6], [x, 0, z], 0, { tile: 0.3 });
  }
  // A back rail so it reads as a bench rather than as a plinth.
  for (const x of [-1.1, 1.1]) {
    room.geo('steel', new THREE.CylinderGeometry(0.022, 0.022, 0.44, 6), poseMatrix([x, 0.72, z - spin * 0.26]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
  }
  room.geo('steel', new THREE.CylinderGeometry(0.024, 0.024, 2.3, 6), tiltMatrix([0, 0.92, z - spin * 0.26], [0, 0, Math.PI / 2]), {
    tile: 0.3,
    castShadow: false,
    consume: true,
  });
  room.collider({ kind: 'box', center: [0, z], halfExtents: [1.5, 0.3] });
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gallery);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'paint',
    ceiling: 'beams',
    band: 'steel',
    bandHeight: 0.55,
    strip: 'cyan',
    mouth: 'collar',
    ports: [
      { side: 'north', kind: 'viewpane', scene: 'open', tall: true, light: true },
      { side: 'south', kind: 'viewpane', scene: 'kelp', tall: true, light: true },
    ],
  });

  /* --- the two benches ------------------------------------------------------------- */
  // Set back far enough that the fore-and-aft lane between the east and west
  // hatches stays 1.1 m clear on both sides of the centre line.
  viewBench(room, -2.0, 1);
  viewBench(room, 2.05, -1);

  /* --- the water in the room -------------------------------------------------------- */
  /**
   * Both panes throw light into the hall, so the floor between them carries two
   * caustic nets at two colours and the air between carries the haze. This is
   * the whole room: there is deliberately nothing else in it.
   */
  causticPatch(room, -0.4, -1.1, 2.0);
  causticPatch(room, 0.6, 1.3, 1.9);
  causticPatch(room, -2.6, 1.9, 1.1);
  glowShaft(room, [0, 2.4, -3.4], [0, 0.3, -0.4], 3.4);
  glowShaft(room, [0, 2.2, 3.4], [0, 0.3, 0.6], 3.0);
  bioMotes(room, -1.2, 1.7, -1.8, 1.6, 16);
  bioMotes(room, 1.4, 1.5, 1.8, 1.6, 14);

  // Ceiling caustics: the same net thrown up onto the beams, which is the cue
  // that says "there is water over your head" without a drop of it being there.
  for (const [x, z, r] of [
    [-1.6, -1.4, 1.5],
    [1.4, 1.2, 1.3],
  ] as const) {
    room.geo('surface.caustic', new THREE.CircleGeometry(r, 18), tiltMatrix([x, ceilingHeight - 0.42, z], [Math.PI / 2, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
      tile: 3.4,
      consume: true,
    });
  }

  /* --- the fittings ----------------------------------------------------------------- */
  // A rail across each pane at hip height, and a dark interpretive plaque on it.
  for (const z of [-2.85, 2.9]) {
    // Stopped short of the side walls: a chest anchor sits in the north-west
    // corner and a rail run through it would look like a mistake in the sheet.
    railing(room, [-2.55, 0, z], [2.55, 0, z], false, 0.95);
    room.geo('steelDark', quad(0.5, 0.24), tiltMatrix([z < 0 ? -2.1 : 2.1, 0.86, z], [-0.9, z < 0 ? 0 : Math.PI, 0]), {
      castShadow: false,
      receiveShadow: false,
    });
    room.geo('steelDark', quad(0.5, 0.24), tiltMatrix([z < 0 ? 1.9 : -1.9, 0.86, z], [-0.9, z < 0 ? 0 : Math.PI, 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  // The only clutter in the room: a dropped case by the east hatch and the grit
  // that has blown into the corners.
  room.box('painted', [0.6, 0.34, 0.42], [3.3, 0, -2.9], 0.4, { tile: 0.5 });
  debris(room, -2.9, 2.6, 0.9, 7);
  debris(room, 3.0, 1.6, 0.7, 5);
  dripLine(room, -2.0, 0.6);
  dripLine(room, 2.4, -0.8);

  /**
   * Both real lights are the panes themselves, sitting a half metre inside the
   * water. There is no ceiling fitting that works in this room at all, and the
   * one strip that survives is dead - the point of the gallery is that it is lit
   * from outside the hull.
   */
  stripLight(room, 0, 0, 3.0, Math.PI / 2, false, true);
  for (const [index, lamp] of room.lights.entries()) {
    swell(room, lamp, 13, 0.15, index === 0 ? 0.36 : 0.52);
  }

  return room.finish();
}
