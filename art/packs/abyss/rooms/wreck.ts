import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { anemones, bioMotes, boulder, causticPatch, debris, disc, encrust, glowShaft, siltDrift, swell, urchin } from '../kit/props';

/**
 * The Prow - somebody else's boat, in your corridor.
 *
 * A survey launch came down on this section a long time before Kerberos did,
 * and it is lying across the compartment at an angle, buried to the gunwale in
 * silt and furred over with sixty years of barnacle. Its bow light is somehow
 * still lit, which is the detail the whole room hangs on.
 *
 * The pane in the aft wall shows more plating outside, so the thing in the room
 * reads as the near end of something much larger than the room.
 */
export const wreck: RoomBlueprint = {
  id: 'abyss.wreck',
  nameKey: 'room.abyss.wreck',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['abyss', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, 2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.9, 0.94, 0.2] },
      { position: [-3.0, 0.64, -2.2] },
      { position: [2.4, 0, 1.3] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 1.4] },
      { position: [-2.4, 0, 0.2] },
      { position: [2.8, 0, -2.6] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -3.2] }],
  },
  build,
};

/**
 * The hull lies diagonally, bow to the south-west. Everything about it is
 * measured in its own frame - `along` runs from the stem toward the stern,
 * `across` runs beam-wise - so the whole boat can be swung by changing one
 * number and nothing has to be re-derived by hand.
 */
const BOW_X = -0.8;
const BOW_Z = 1.9;
const HEADING = Math.PI / 4;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, wreck);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'silt',
    wall: 'rust',
    ceiling: 'rusticles',
    band: 'crust',
    bandHeight: 1.2,
    strip: 'bio',
    mouth: 'arch',
    ports: [{ side: 'south', kind: 'viewpane', scene: 'wreck', tall: true, light: true }],
  });

  const cos = Math.cos(HEADING);
  const sin = Math.sin(HEADING);
  const at = (along: number, across: number): [number, number] => [
    BOW_X + along * cos + across * sin,
    BOW_Z - along * sin + across * cos,
  ];

  /* --- the hull ------------------------------------------------------------------ */
  /**
   * A chine hull: five frames of increasing beam from the stem aft, with plating
   * stretched between them as tilted boxes. A boat built as one tapered box
   * reads as a wedge; what makes this read as a boat is the SHEER - the deck
   * line rising toward the stem - so every frame is a little lower than the one
   * in front of it.
   */
  const frames: readonly (readonly [number, number, number])[] = [
    // along (0 = stem), beam, deck height
    [0, 0.16, 1.15],
    [0.8, 0.62, 1.02],
    [1.8, 0.95, 0.92],
    [2.9, 1.12, 0.86],
    [4.1, 1.2, 0.84],
  ];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (!a || !b) continue;
    const mid = (a[0] + b[0]) / 2;
    const beam = (a[1] + b[1]) / 2;
    const height = (a[2] + b[2]) / 2;
    const length = b[0] - a[0];

    for (const s of [-1, 1]) {
      const p = at(mid, s * beam * 0.5);
      room.geo(
        'rust',
        new THREE.BoxGeometry(length + 0.06, height + 0.35, 0.11),
        tiltMatrix([p[0], height * 0.4, p[1]], [0, HEADING + s * 0.05, s * 0.22]),
        { tile: 1.2, consume: true },
      );
    }
    const deck = at(mid, 0);
    room.geo('rust', new THREE.BoxGeometry(length, 0.1, beam), tiltMatrix([deck[0], height, deck[1]], [0, HEADING, 0.02]), {
      tile: 1.0,
      consume: true,
    });
    for (const s of [-1, 1]) {
      const p = at(mid, s * beam * 0.5);
      room.geo('steelDark', new THREE.BoxGeometry(length, 0.08, 0.07), tiltMatrix([p[0], height + 0.08, p[1]], [0, HEADING, 0]), {
        tile: 0.4,
        consume: true,
      });
    }
  }

  // The stem: a blade of steel going up, with the bow light still burning on it.
  const stem = at(-0.15, 0);
  room.geo('rust', new THREE.BoxGeometry(0.5, 1.5, 0.16), tiltMatrix([stem[0], 0.75, stem[1]], [0, HEADING, -0.18]), {
    tile: 0.6,
    consume: true,
  });
  const lamp = at(0.15, 0);
  room.geo('steelDark', new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8), poseMatrix([lamp[0], 1.34, lamp[1]]), { tile: 0.3, consume: true });
  room.geo('lumenRed', new THREE.SphereGeometry(0.085, 8, 6), poseMatrix([lamp[0], 1.46, lamp[1]]), { castShadow: false, consume: true });
  room.geo('glassPane', new THREE.SphereGeometry(0.11, 9, 7), poseMatrix([lamp[0], 1.46, lamp[1]]), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });

  // The wheelhouse aft, its windows black, and the snapped mast over it.
  const house = at(3.5, 0);
  room.geo('rust', new THREE.BoxGeometry(1.3, 1.0, 1.05), tiltMatrix([house[0], 1.3, house[1]], [0, HEADING, 0.02]), {
    tile: 0.9,
    consume: true,
  });
  for (const s of [-1, 1]) {
    const w = at(3.5, s * 0.54);
    room.geo('waterDeep', new THREE.PlaneGeometry(0.9, 0.42), tiltMatrix([w[0], 1.5, w[1]], [0, HEADING + s * (Math.PI / 2), 0]), {
      castShadow: false,
      receiveShadow: false,
      consume: true,
    });
  }
  const mast = at(2.9, 0);
  room.geo('rust', new THREE.CylinderGeometry(0.055, 0.085, 1.6, 7), tiltMatrix([mast[0], 2.4, mast[1]], [0.24, HEADING, 0.14]), {
    tile: 0.4,
    consume: true,
  });
  for (let i = 0; i < 4; i++) {
    const end = at(1.4 + i * 0.4, room.range(-1.0, 1.0));
    room.geo(
      'cable',
      new THREE.CylinderGeometry(0.014, 0.014, room.range(1.1, 1.9), 4),
      tiltMatrix([(mast[0] + end[0]) / 2, room.range(1.6, 2.5), (mast[1] + end[1]) / 2], [room.range(0.6, 1.2), room.range(0, 3), 0]),
      { castShadow: false, consume: true },
    );
  }

  // Buried to the gunwale, and everything that has grown on it since.
  const bury1 = at(0.9, 0);
  const bury2 = at(2.8, 0);
  siltDrift(room, bury1[0], bury1[1], 1.5);
  siltDrift(room, bury2[0], bury2[1], 1.7);
  for (let i = 0; i < 8; i++) {
    const p = at(room.range(0.3, 4.0), room.range(-0.8, 0.8));
    encrust(room, p[0], room.range(0.5, 1.2), p[1], 0.35, 7);
  }
  const hull = at(1.9, 0);
  room.collider({ kind: 'box', center: [hull[0], hull[1]], halfExtents: [2.1, 0.72], rotationY: HEADING });

  /* --- the rest of the room --------------------------------------------------------- */
  boulder(room, -3.0, -2.2, 0.5, 0.75);
  anemones(room, -3.0, 0.66, -2.2, 3, 0.32);
  urchin(room, 2.6, 0.02, 2.4, 0.15);
  urchin(room, -1.6, 0.02, 3.0, 0.12);
  siltDrift(room, 2.9, -2.9, 1.2);
  debris(room, 1.4, 2.6, 1.2, 10);
  debris(room, -2.2, 0.6, 0.9, 7);

  /**
   * The pane is one light. The other is low and cold, off the starboard bow, so
   * the hull throws a shadow the length of the compartment and the stem reads as
   * a silhouette from the north hatch - which is the shot this room is for.
   */
  const cold = new THREE.PointLight(0x59c8e6, 10, ctx.dims.cellSize * 1.6, 2);
  cold.position.set(-2.2, 0.8, 0.4);
  room.light(cold);
  swell(room, cold, 10, 0.16, 0.4);

  causticPatch(room, -1.2, -1.0, 1.7);
  causticPatch(room, 2.4, 0.8, 1.2);
  glowShaft(room, [0, 2.6, 3.4], [0.4, 0.5, 0.6], 3.0);
  bioMotes(room, 0.6, 1.6, 0.6, 2.2, 24);
  room.geo('waterHaze', disc(2.4, 14), tiltMatrix([0, ceilingHeight - 0.5, 0.4], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  const pane = room.lights[0];
  if (pane) swell(room, pane, 13, 0.14, 0.3);

  return room.finish();
}
