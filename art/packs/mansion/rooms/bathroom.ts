import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { cobwebs, cyl, debris, sconce, wallMirror } from '../kit/props';

/**
 * The Bathroom - the tub is full and the water is not clean.
 *
 * White tile taken as far as it goes: every sound in here would ring, every
 * surface shows a mark, and the standing water in the clawfoot tub is the
 * darkest thing in the manor. Small, hard-edged, nowhere to hide.
 */
export const bathroom: RoomBlueprint = {
  id: 'mansion.bathroom',
  nameKey: 'room.mansion.bathroom',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['tight', 'cold'],
  anchors: {
    locker: [{ position: [-3.25, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.5, 0.94, -3.3] },
      { position: [-2.5, 0.62, -2.4] },
      { position: [1.4, 0.0, 2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.6] },
      { position: [-1.8, 0, -1.4] },
      { position: [2.0, 0, 1.6] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, bathroom);
  room.shell({ floor: 'tile', wall: 'tile', wainscot: 'tile', ceiling: 'plaster', skirting: false });

  // The clawfoot tub, on the diagonal, brim full.
  const tx = -2.5;
  const tz = -2.4;
  const rot = 0.42;
  room.geo('porcelain', new THREE.BoxGeometry(1.75, 0.6, 0.82), poseMatrix([tx, 0.44, tz], rot), { tile: 1.2, consume: true });
  room.geo('porcelain', cyl(0.42, 0.42, 1.75, 14), tiltMatrix([tx, 0.6, tz], [0, rot, Math.PI / 2]), {
    tile: 1.2,
  });
  // Water: dark, flat, and absolutely still.
  room.geo('mirror', new THREE.PlaneGeometry(1.6, 0.7), tiltMatrix([tx, 0.62, tz], [-Math.PI / 2, rot, 0]), {
    castShadow: false,
    consume: true,
  });
  for (const [dx, dz] of [
    [-0.72, -0.3],
    [0.72, -0.3],
    [-0.72, 0.3],
    [0.72, 0.3],
  ] as const) {
    const px = tx + dx * Math.cos(rot) + dz * Math.sin(rot);
    const pz = tz - dx * Math.sin(rot) + dz * Math.cos(rot);
    room.geo('brass', cyl(0.05, 0.08, 0.16, 6), poseMatrix([px, 0.08, pz]), {});
  }
  room.geo('brass', cyl(0.025, 0.025, 0.3, 8), poseMatrix([tx - 0.78, 0.85, tz + 0.34]), {
  });
  room.collider({ kind: 'box', center: [tx, tz], halfExtents: [0.85, 0.42], rotationY: rot });

  // Pedestal basin under the mirror, cracked across.
  room.geo('porcelain', cyl(0.13, 0.2, 0.78, 10), poseMatrix([2.5, 0.39, -3.3]), {});
  room.geo('porcelain', new THREE.BoxGeometry(0.72, 0.18, 0.5), poseMatrix([2.5, 0.87, -3.3]), { consume: true });
  room.geo('ash', new THREE.BoxGeometry(0.52, 0.02, 0.32), poseMatrix([2.5, 0.93, -3.3]), { consume: true });
  room.geo('brass', cyl(0.02, 0.02, 0.22, 6), poseMatrix([2.5, 1.05, -3.5]), {});
  room.blockCircle(2.5, -3.3, 0.34);

  wallMirror(room, 'north', -2.5, 1.35, 0.72, 0.9);
  // Both lit. One sconce in a room of white tile still left the north and east
  // doorways looking into a black box - and this is the smallest room in the
  // manor, so there is nothing else in it to catch a stray beam.
  sconce(room, 'north', -1.6, 2.05, true);
  sconce(room, 'north', 2.4, 2.05, true);

  // A bentwood chair with somebody's clothes still folded on it, a slop pail,
  // and a physician's cabinet with the door swung open. The room was three
  // fixtures and a lot of empty tile.
  // Everything here sits outside |x| < 1.5 and |z| < 1.5: this room offers all
  // four walls, so both lanes have to stay walkable whatever the generator does.
  const cx = 2.4;
  const cz = -2.15;
  room.geo('woodPale', new THREE.BoxGeometry(0.42, 0.04, 0.4), poseMatrix([cx, 0.46, cz], 0.5), { consume: true });
  for (const [dx, dz] of [
    [-0.16, -0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [0.16, 0.16],
  ] as const) {
    room.geo('woodPale', cyl(0.018, 0.022, 0.46, 6), poseMatrix([cx + dx, 0.23, cz + dz]), {
    });
  }
  room.geo('woodPale', new THREE.TorusGeometry(0.2, 0.018, 4, 12), tiltMatrix([cx, 0.72, cz + 0.18], [1.35, 0.5, 0]), {
    consume: true,
  });
  room.geo('linen', new THREE.BoxGeometry(0.34, 0.14, 0.3), poseMatrix([cx, 0.55, cz + 0.02], 0.3), { tile: 0.8, consume: true });
  room.blockCircle(cx, cz, 0.28);

  // A slop pail against the skirting, where a pail actually gets left.
  room.geo('iron', cyl(0.19, 0.15, 0.3, 12), poseMatrix([-1.9, 0.15, 3.2]), {});
  room.geo('iron', new THREE.TorusGeometry(0.19, 0.014, 4, 12), tiltMatrix([-1.9, 0.3, 3.2], [Math.PI / 2, 0, 0]), {
    consume: true,
  });

  // A physician's cabinet on the east wall, its door swung open on the bottles.
  room.box('woodPale', [0.62, 0.8, 0.24], [3.34, 1.35, -2.6], Math.PI / 2, { tile: 1 });
  room.geo('woodPale', new THREE.BoxGeometry(0.58, 0.76, 0.03), tiltMatrix([3.02, 1.75, -2.26], [0, Math.PI / 2 + 0.9, 0]), {
    consume: true,
  });
  for (let i = 0; i < 5; i++) {
    room.geo(
      room.pick(['glass', 'porcelain', 'bookGreen'] as const),
      cyl(0.03, 0.035, room.range(0.09, 0.16), 6),
      poseMatrix([3.24, 1.45 + Math.floor(i / 3) * 0.36, -2.84 + (i % 3) * 0.24]),
      {},
    );
  }

  // The lavatory, boxed in, with a high cistern.
  room.solid('porcelain', [0.52, 0.7, 0.72], [3.3, 0, 1.6], -Math.PI / 2);
  room.box('woodPale', [0.44, 0.06, 0.4], [3.3, 0.7, 1.6], -Math.PI / 2);
  room.box('ironBlack', [0.3, 0.42, 0.6], [3.5, 1.75, 1.6], -Math.PI / 2);
  room.geo('copper', cyl(0.022, 0.022, 0.9, 6), poseMatrix([3.5, 1.25, 1.35]), {});

  // A towel rail, still hung, and a lot of fallen tile.
  room.geo('brass', cyl(0.018, 0.018, 1.0, 6), poseMatrix([0.6, 1.5, 3.6], Math.PI / 2), {
  });
  room.geo('linen', new THREE.PlaneGeometry(0.44, 0.8), tiltMatrix([0.35, 1.12, 3.55], [0, 0, 0.05]), {
    castShadow: false,
    consume: true,
  });
  room.geo('linen', new THREE.PlaneGeometry(0.4, 0.62), tiltMatrix([0.9, 1.2, 3.55], [0, 0, -0.08]), {
    castShadow: false,
    consume: true,
  });
  room.box('linen', [0.4, 0.06, 0.3], [1.4, 0.0, 2.9], 0.6);

  // Rust running down from the cistern, and the tiles that gave up.
  for (let i = 0; i < 18; i++) {
    room.geo(
      'porcelain',
      new THREE.BoxGeometry(0.16, 0.016, 0.16),
      poseMatrix([room.range(-3.2, 3.2), 0.012, room.range(-3.2, 3.2)], room.range(0, Math.PI)),
      { tile: 0.4, consume: true },
    );
  }
  debris(room, 0.4, -1.4, 1.6, 8);
  cobwebs(room, -3.2, 3.2, 5.5, 0.9);

  return room.finish();
}
