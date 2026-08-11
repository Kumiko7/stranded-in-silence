import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bench, bioMotes, cageLamp, causticPatch, debris, disc, dripLine, pipeRun, quad, stripLight, swell } from '../kit/props';

/**
 * The Hatchery - forty small tanks, and something got out of one of them.
 *
 * Two benches of incubators flank the viewing pane, each tank a lit green
 * cylinder with a clutch of eggs in it and a feed line running down from the
 * ceiling. Thirty-nine are sealed. The one on the end has its lid off and its
 * water is on the floor.
 *
 * The room is lit by the tanks and by the reef outside the east pane, and by
 * nothing else warm at all - it is the coldest-looking room on the station side
 * of the map, which is the joke: it is the nursery.
 */
export const hatchery: RoomBlueprint = {
  id: 'abyss.hatchery',
  nameKey: 'room.abyss.hatchery',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south', 'west'),
  weight: 10,
  tags: ['station', 'aquarium', 'lit'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.7], rotationY: -Math.PI / 2 }],
    // The free end of each incubator bench, and the floor by the spill.
    itemSpawn: [
      { position: [2.2, 0.96, -3.4] },
      { position: [2.2, 0.96, 3.4] },
      { position: [0.4, 0, 2.7] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0] },
      { position: [-2.4, 0, 0.2] },
      { position: [1.1, 0, -2.9] },
    ],
    enemySpawn: [{ position: [-2.9, 0, -0.2] }],
  },
  build,
};

/** One incubator: a lit cylinder of water with a clutch in it and a feed line. */
function incubator(room: Room, x: number, z: number, y: number, radius: number, open: boolean): void {
  const height = 0.52;
  room.geo('steelDark', new THREE.CylinderGeometry(radius * 1.12, radius * 1.18, 0.05, 12), poseMatrix([x, y + 0.025, z]), {
    tile: 0.3,
    consume: true,
  });
  if (!open) {
    // The water first, then the glass over it: a lit volume never gets a
    // translucent film in front of it (ROOM_REVIEW.md §4), and the acrylic here
    // carries almost no opacity so the glow comes through clean.
    room.geo('tankGlow', new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, height * 0.86, 12), poseMatrix([x, y + height * 0.48, z]), {
      castShadow: false,
      consume: true,
    });
    for (let i = 0; i < 5; i++) {
      const a = room.range(0, Math.PI * 2);
      const r = Math.sqrt(room.rng()) * radius * 0.55;
      room.geo('canvasPale', new THREE.SphereGeometry(radius * room.range(0.13, 0.22), 6, 5), poseMatrix([x + Math.cos(a) * r, y + room.range(0.1, 0.4), z + Math.sin(a) * r]), {
        castShadow: false,
        consume: true,
      });
    }
  } else {
    room.geo('waterDeep', disc(radius * 0.9, 12), tiltMatrix([x, y + 0.06, z], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  }
  room.geo('glassPane', new THREE.CylinderGeometry(radius, radius, height, 14, 1, true), poseMatrix([x, y + height / 2, z]), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });
  if (!open) {
    room.geo('steelPale', new THREE.CylinderGeometry(radius * 1.06, radius * 1.02, 0.06, 12), poseMatrix([x, y + height, z]), {
      tile: 0.3,
      consume: true,
    });
  }
  // The feed line, dropping out of the ceiling into the lid.
  room.geo('rubber', new THREE.CylinderGeometry(0.012, 0.012, room.ctx.dims.ceilingHeight - y - height - 0.2, 4), poseMatrix([x, (room.ctx.dims.ceilingHeight + y + height) / 2 - 0.1, z]), {
    castShadow: false,
    consume: true,
  });
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, hatchery);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'tile',
    wall: 'paint',
    ceiling: 'conduit',
    band: 'tile',
    bandHeight: 1.35,
    strip: 'cyan',
    mouth: 'bulkhead',
    ports: [{ side: 'east', kind: 'viewpane', scene: 'coral', light: true }],
  });

  /* --- the incubator benches ------------------------------------------------------ */
  // Two runs flanking the pane, hard against the east side and well clear of the
  // north, south and west door lanes.
  for (const [z, sign] of [
    [-2.6, -1],
    [2.6, 1],
  ] as const) {
    bench(room, 2.2, z, 2.2, 1.0, 0.94, Math.PI / 2);
    // Three tanks, not four: the fourth slot on each bench is left empty so a
    // world item has somewhere to sit that is not inside a cylinder of glass.
    for (let i = 0; i < 3; i++) {
      const tz = z + sign * (-0.85 + i * 0.56);
      const open = sign > 0 && i === 2;
      incubator(room, 2.2 + room.range(-0.06, 0.06), tz, 0.94, 0.17, open);
    }
    // The manifold above them, and the drip tray under the bench.
    pipeRun(
      room,
      [
        [2.2, ceilingHeight - 0.45, z - 1.15],
        [2.2, ceilingHeight - 0.45, z + 1.15],
      ],
      0.05,
      'plastic',
      false,
    );
    room.box('steelDark', [2.0, 0.03, 0.7], [2.2, 0.26, z], Math.PI / 2, { tile: 0.5, castShadow: false });
  }
  // What came out of the open one, still on the tile.
  room.geo('puddle', disc(0.8, 14), tiltMatrix([1.8, 0.013, 3.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('puddle', disc(0.42, 12), tiltMatrix([1.2, 0.013, 2.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('canvasPale', new THREE.SphereGeometry(room.range(0.03, 0.055), 6, 5), poseMatrix([room.range(1.2, 2.4), 0.03, room.range(2.4, 3.4)]), {
      castShadow: false,
      consume: true,
    });
  }

  /* --- the record wall -------------------------------------------------------------- */
  /**
   * Clipboards on the north bulkhead and a tally board beside them - small pale
   * rectangles at chest height, so the room reads as somebody's job.
   *
   * Both runs stay outside |x| < 1.1. The north wall may become a doorway on any
   * given map, and a clipboard hanging in mid-air across an open hatch is the
   * one thing nothing in the validator will catch for you.
   */
  for (let i = 0; i < 5; i++) {
    const x = -2.9 + i * 0.36;
    room.geo('canvasPale', quad(0.24, 0.32), poseMatrix([x, 1.7 + room.range(-0.06, 0.06), -3.66], 0), { castShadow: false, receiveShadow: false });
    room.geo('steelDark', quad(0.24, 0.05), poseMatrix([x, 1.88, -3.655], 0), { castShadow: false, receiveShadow: false });
  }
  room.box('plastic', [1.3, 0.9, 0.05], [2.1, 1.35, -3.64], 0, { tile: 0.5, castShadow: false });
  for (let i = 0; i < 9; i++) {
    room.geo('steelDark', quad(room.range(0.15, 0.9), 0.025), poseMatrix([1.85 + room.range(-0.1, 0.3), 1.5 + i * 0.09, -3.61], 0), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- the rest --------------------------------------------------------------------- */
  causticPatch(room, 2.9, 0.3, 1.3);
  bioMotes(room, 2.6, 1.5, 0.2, 1.1, 14);
  dripLine(room, -0.9, -2.2);
  dripLine(room, 0.4, 1.6);
  debris(room, -2.4, -1.6, 0.9, 7);
  debris(room, -1.9, 3.0, 0.8, 6);

  /**
   * The pane is one real light. The other is a strip over the west half, kept
   * cold - all the warmth in here belongs to the incubators, and a warm ceiling
   * lamp would flatten them into green cans.
   */
  stripLight(room, -1.4, 0.6, 2.4, Math.PI / 2, true, false, 9);
  stripLight(room, 0.4, -2.4, 1.6, 0, false, true);
  cageLamp(room, 'north', -3.0, 2.15, false, true);
  const reef = room.lights[0];
  if (reef) swell(room, reef, 13, 0.12, 0.4);

  return room.finish();
}
