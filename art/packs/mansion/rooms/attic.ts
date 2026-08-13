import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { cobwebs, debris, lightShaft, oilLamp, pendantLamp, sheetedShape, trunk } from '../kit/props';

/**
 * The Attic (L-shaped) - everything the family stopped wanting.
 *
 * Bare boards, purlins low enough to duck under, and sheeted shapes in rows. The
 * L means the third bay is round a corner you cannot see into, and the dormer at
 * the far end is boarded, so the only honest light is the one bulb on a flex.
 */
export const attic: RoomBlueprint = {
  id: 'mansion.attic',
  nameKey: 'room.mansion.attic',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  doorWalls: [...wallsOn([0, 0], 'west'), ...wallsOn([1, 0], 'east'), ...wallsOn([0, 1], 'south')],
  weight: 5,
  maxPerMap: 1,
  tags: ['cluttered', 'blind'],
  anchors: {
    chest: [{ position: [-2.4, 0, 11.15], rotationY: 0 }],
    locker: [{ position: [4.6, 0, -3.25], rotationY: Math.PI }],
    itemSpawn: [
      { position: [7.0, 0.5, 2.6] },
      { position: [-2.6, 0.46, 6.4] },
      { position: [1.6, 0.0, 9.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [7.2, 0, 0.4] },
      { position: [0.4, 0, 8.6] },
    ],
    enemySpawn: [{ position: [1.2, 0, 10.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, attic);
  const { windowAnchors } = room.shell({
    floor: 'boards',
    wall: 'plaster',
    ceiling: 'boards',
    cornice: false,
    skirting: false,
    windows: [{ cell: [1, 0], side: 'north', kind: 'boarded', light: true }],
  });
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.2, anchor.position[2]], [anchor.position[0], 0, anchor.position[2] + 2.2], 1.1);
  }

  const { ceilingHeight } = ctx.dims;

  // Purlins and rafters: the roof pressing down on the room.
  for (const [ax, az, along] of [
    [0, 0, 'x'],
    [8, 0, 'x'],
    [0, 8, 'z'],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      const t = -3.0 + i * 2.0;
      const rot = along === 'x' ? 0 : Math.PI / 2;
      const x = along === 'x' ? ax + t : ax;
      const z = along === 'x' ? az : az + t;
      room.box('beam', [8.0, 0.3, 0.26], [x, ceilingHeight - 0.32, z], rot === 0 ? Math.PI / 2 : 0);
      // Sloping rafters off each purlin, meeting nothing in particular.
      for (const s of [-1, 1]) {
        room.geo(
          'beam',
          new THREE.BoxGeometry(0.2, 2.4, 0.18),
          tiltMatrix([x + (rot === 0 ? 0 : s * 2.4), ceilingHeight - 1.0, z + (rot === 0 ? s * 2.4 : 0)], [rot === 0 ? s * 0.7 : 0, 0, rot === 0 ? 0 : -s * 0.7]),
          { consume: true },
        );
      }
    }
  }

  // Sheeted furniture in rows, the way a warehouse stacks things.
  sheetedShape(room, -2.4, -2.2, 1.8, 1.0, 0.9, 0.06);
  sheetedShape(room, 2.2, -2.6, 1.2, 1.5, 1.2, -0.2);
  sheetedShape(room, 6.4, -2.4, 2.0, 0.9, 0.8, 0.1);
  sheetedShape(room, -2.6, 6.4, 1.4, 0.46, 1.6, 0.15);
  sheetedShape(room, 2.6, 8.6, 1.6, 1.1, 1.0, -0.1);

  trunk(room, 7.0, 2.6, 0.4, false);
  trunk(room, 6.2, 3.4, -0.5, true);
  trunk(room, -1.2, 9.6, 0.2, false);

  // A cistern in the corner, dripping into a bucket that overflowed long ago.
  room.geo('rust', new THREE.CylinderGeometry(0.72, 0.72, 1.2, 14), poseMatrix([9.8, 0.6, 2.6]), {
    tile: 1.4,
    consume: true,
  });
  room.blockCircle(9.8, 2.6, 0.76);
  room.geo('copper', new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), poseMatrix([9.8, 2.1, 1.8]), { consume: true });
  room.geo('rust', new THREE.CylinderGeometry(0.2, 0.16, 0.28, 10), poseMatrix([9.8, 0.14, 1.6]), { consume: true });
  room.geo('mirror', new THREE.CircleGeometry(0.7, 14), tiltMatrix([9.6, 0.014, 1.5], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    consume: true,
  });

  // Birds got in at some point, and did not get out.
  for (let i = 0; i < 5; i++) {
    room.geo(
      'bone',
      new THREE.BoxGeometry(0.14, 0.05, 0.09),
      poseMatrix([room.range(4.0, 10.0), 0.03, room.range(-3.0, 3.0)], room.range(0, Math.PI)),
      { consume: true },
    );
  }
  room.box('bookRed', [0.3, 0.06, 0.24], [1.6, 0.0, 9.4], 0.6);

  // A tailor's dummy, which is exactly the wrong shape to see out of the corner
  // of your eye.
  room.geo('linen', new THREE.CylinderGeometry(0.2, 0.26, 0.66, 12), poseMatrix([-2.9, 1.16, 3.4]), {
    tile: 0.9,
    consume: true,
  });
  room.geo('linen', new THREE.SphereGeometry(0.16, 10, 8), poseMatrix([-2.9, 1.62, 3.4]), { consume: true });
  room.geo('woodDark', new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), poseMatrix([-2.9, 0.45, 3.4]), { consume: true });
  room.geo('woodDark', new THREE.CylinderGeometry(0.24, 0.24, 0.04, 12), poseMatrix([-2.9, 0.02, 3.4]), { consume: true });
  room.blockCircle(-2.9, 3.4, 0.3);

  // Four lights, which is the whole budget an L-shaped three-cell room gets. One
  // bulb on a flex is the right *idea* for an attic and it left both of the far
  // bays black: a room a player cannot cross is not atmospheric, it is broken.
  // The other two are a hurricane lamp somebody carried up here and left on a
  // trunk, and a second bulb round the corner in the return.
  pendantLamp(room, 0.4, 0.4, true);
  pendantLamp(room, 7.4, 0.2, true);
  oilLamp(room, [-1.2, 0.5, 9.6], true, 'rust');

  debris(room, 4.0, 1.4, 2.2, 16);
  debris(room, -0.6, 6.4, 1.8, 10);
  cobwebs(room, -3.2, -3.2, 0.8, 1.6);
  cobwebs(room, 11.2, -3.2, 2.4, 1.5);
  cobwebs(room, -3.2, 11.2, 5.5, 1.5);

  return room.finish();
}
