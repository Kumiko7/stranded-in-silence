import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  candelabra,
  chair,
  chandelier,
  cobwebs,
  column,
  curtains,
  cyl,
  debris,
  lightShaft,
  oilLamp,
  rug,
  sheetedShape,
} from '../kit/props';

/**
 * The Ballroom (2x2) - two hundred and fifty square metres of nothing.
 *
 * The negative space IS the room. Everything is pushed to the edges under dust
 * sheets, the floor is bare parquet, and one of the two chandeliers came down
 * years ago and is lying in the middle of it. There is nowhere to hide here and
 * every footstep carries.
 */
export const ballroom: RoomBlueprint = {
  id: 'mansion.ballroom',
  nameKey: 'room.mansion.ballroom',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  // One door per compass direction; the remaining outer walls carry the windows.
  doorWalls: [
    ...wallsOn([0, 0], 'west'),
    ...wallsOn([1, 0], 'north'),
    ...wallsOn([0, 1], 'south'),
    ...wallsOn([1, 1], 'east'),
  ],
  weight: 4,
  maxPerMap: 1,
  tags: ['open', 'grand', 'moonlit'],
  anchors: {
    playerSpawn: [
      { position: [3.4, 0, 8.4], rotationY: Math.PI },
      { position: [4.6, 0, 8.4], rotationY: Math.PI },
      { position: [3.4, 0, 7.2], rotationY: Math.PI },
      { position: [4.6, 0, 7.2], rotationY: Math.PI },
    ],
    chest: [
      { position: [-3.15, 0, 5.6], rotationY: -Math.PI / 2 },
      { position: [11.15, 0, 2.4], rotationY: Math.PI / 2 },
    ],
    locker: [{ position: [3.1, 0, -3.15], rotationY: Math.PI }],
    itemSpawn: [
      { position: [6.0, 0.92, -3.4] },
      { position: [3.0, 0.0, 3.0] },
      { position: [-2.6, 0.92, 9.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [8.0, 0, 0] },
      { position: [0, 0, 8.0] },
      { position: [8.0, 0, 8.0] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, ballroom);
  const { windowAnchors } = room.shell({
    floor: 'parquet',
    wall: 'damaskGreen',
    wainscot: 'panel',
    ceiling: 'coffered',
    pictureRail: true,
    windows: [
      { cell: [0, 0], side: 'north', kind: 'glazed', tall: true },
      { cell: [1, 0], side: 'east', kind: 'broken', tall: true },
      { cell: [0, 1], side: 'west', kind: 'glazed', tall: true },
      { cell: [1, 1], side: 'south', kind: 'glazed', tall: true },
    ],
  });
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.9, anchor.position[2]], [anchor.position[0], 0, anchor.position[2] + 3.4], 2.2);
  }

  // Four columns marking out the dance floor.
  for (const [x, z] of [
    [1.4, 1.4],
    [6.6, 1.4],
    [1.4, 6.6],
    [6.6, 6.6],
  ] as const) {
    column(room, x, z, 0.3);
  }

  // The two chandeliers still up - it takes both to make 250 m2 navigable - and
  // then the one that is not.
  chandelier(room, 4.0, 1.6, 0.95, true, 3);
  chandelier(room, 4.0, 8.8, 0.8, true, 2, false);
  const cx = 4.6;
  const cz = 5.2;
  room.geo('brass', new THREE.TorusGeometry(0.95, 0.02, 4, 22), tiltMatrix([cx, 0.14, cz], [1.42, 0.4, 0.1]), {
    consume: true,
  });
  room.geo('brass', new THREE.TorusGeometry(0.62, 0.018, 4, 18), tiltMatrix([cx + 0.3, 0.4, cz - 0.2], [1.2, 0.9, 0.3]), {
    consume: true,
  });
  room.geo('brass', cyl(0.05, 0.07, 0.8, 8), tiltMatrix([cx - 0.2, 0.3, cz + 0.3], [0.4, 0, 1.1]), {
  });
  for (let i = 0; i < 20; i++) {
    room.geo(
      'glass',
      ball(0.03, 6),
      poseMatrix([cx + room.range(-1.6, 1.6), 0.03, cz + room.range(-1.6, 1.6)]),
      {},
    );
  }
  room.blockCircle(cx, cz, 1.0);
  // And the hole in the ceiling it came out of.
  room.box('ash', [1.6, 0.1, 1.6], [cx, ctx.dims.ceilingHeight - 0.09, cz], 0.3, { castShadow: false });

  // Everything else, sheeted, against the walls.
  sheetedShape(room, -2.6, 9.4, 1.6, 0.9, 0.9, 0.2);
  sheetedShape(room, 10.4, 6.4, 0.9, 1.1, 1.9, -0.1);
  sheetedShape(room, 1.2, -2.7, 2.2, 0.8, 0.8, 0.05);
  for (let i = 0; i < 6; i++) {
    chair(room, 5.2 + (i % 3) * 0.9, -2.4 + Math.floor(i / 3) * 0.8, room.range(-0.4, 0.4), true);
  }
  room.solid('wood', [1.6, 0.86, 0.5], [6.0, 0, -3.4], 0, { tile: 1.4 });
  room.box('woodDark', [1.7, 0.05, 0.56], [6.0, 0.86, -3.4]);

  // A dais at the far end where the band would have been, with the music stands
  // still on it and a branch of candles somebody lit and left.
  room.box('surface.carpet', [5.0, 0.18, 2.2], [4.0, 0, 10.6], 0, { tile: 2.4 });
  room.collider({ kind: 'box', center: [4.0, 10.6], halfExtents: [2.5, 1.1] });
  for (const [sx, sz] of [
    [2.6, 10.2],
    [5.4, 10.9],
  ] as const) {
    // A tripod and a shaft, not one tall cone - a `CylinderGeometry` tapering
    // from 0.02 to 0.18 over a metre is, at ballroom scale, a traffic cone.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      room.geo(
        'ironBlack',
        cyl(0.012, 0.016, 0.34, 5),
        tiltMatrix([sx + Math.cos(a) * 0.1, 0.32, sz + Math.sin(a) * 0.1], [0.55, -a, 0]),
        {},
      );
    }
    room.geo('ironBlack', cyl(0.016, 0.024, 1.0, 6), poseMatrix([sx, 0.68, sz]), {});
    room.geo('ironBlack', new THREE.BoxGeometry(0.44, 0.3, 0.02), tiltMatrix([sx, 1.28, sz + 0.05], [-0.5, 0.2, 0]), {
      consume: true,
    });
    room.geo('paper', new THREE.BoxGeometry(0.34, 0.24, 0.01), tiltMatrix([sx, 1.31, sz + 0.02], [-0.5, 0.2, 0]), {
      consume: true,
    });
  }
  rug(room, 4.0, 4.0, 6.0, 4.0);

  // The third and fourth lights. Two chandeliers over two hundred and fifty
  // square metres left the dais and the whole north-east quarter dark, and a 2x2
  // is the one footprint in the pack that gets a budget of four.
  candelabra(room, [4.0, 0.18, 10.4], 5);
  const branch = new THREE.PointLight(0xffd09a, 15, 10, 2);
  branch.position.set(4.0, 0.75, 10.4);
  room.light(branch);
  // Clear of the item anchor at 6.0, which is the other end of the same table.
  oilLamp(room, [6.55, 0.91, -3.4], true);

  curtains(room, 'north', 2.4, 2.4, 3.0, [0, 0]);
  curtains(room, 'south', 2.4, 2.4, 3.0, [1, 1]);

  debris(room, 4.6, 5.2, 2.6, 18);
  debris(room, 9.0, 9.0, 2.0, 10);
  cobwebs(room, -3.2, -3.2, 0.8, 1.6);
  cobwebs(room, 11.2, 11.2, 3.9, 1.6);
  cobwebs(room, 11.2, -3.2, 2.4, 1.4);

  return room.finish();
}
