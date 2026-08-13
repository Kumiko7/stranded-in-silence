import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { cobwebs, creeper, deadPlant, debris, lightShaft, pendantLamp } from '../kit/props';

/**
 * The Conservatory - the garden got in.
 *
 * The only room where the outside is properly present: a broken north window,
 * moonlight on wet marble, ivy across the sills and a dozen dead ferns that were
 * somebody's whole life. Bright by the manor's standards, and completely open,
 * which makes it a terrible place to be caught.
 */
export const conservatory: RoomBlueprint = {
  id: 'mansion.conservatory',
  nameKey: 'room.mansion.conservatory',
  footprint: [[0, 0]],
  // North is kept solid for the window wall, so it may never become a door.
  doorWalls: wallsFor('east', 'south', 'west'),
  weight: 8,
  tags: ['open', 'moonlit'],
  anchors: {
    chest: [{ position: [-3.0, 0, 2.9], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [1.9, 0.86, -2.4] },
      { position: [-2.2, 0.5, -2.5] },
      { position: [2.7, 0.0, 2.6] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.8] },
      { position: [2.4, 0, 0.6] },
      { position: [-2.2, 0, 0.9] },
    ],
    treasure: [{ position: [0, 0.9, -2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, conservatory);
  const { windowAnchors } = room.shell({
    floor: 'marble',
    wall: 'plaster',
    ceiling: 'boards',
    cornice: false,
    windows: [{ side: 'north', kind: 'broken', light: true, tall: true }],
  });

  // Moonlight on the floor, and the ivy that came in with it.
  for (const anchor of windowAnchors) {
    lightShaft(room, [anchor.position[0], 2.6, anchor.position[2]], [anchor.position[0] * 0.4, 0, 1.4], 1.9);
  }

  /*
   * A glazed roof, hung under the ceiling.
   *
   * The room's whole identity is that it is made of glass, and it was reading as
   * a plaster box with two planters in it: the only glass in the room was the
   * one window the shell cuts. This is a run of glazing bars with panes between
   * them and a ridge down the middle, so the ceiling is the first thing that
   * tells you where you are. It is decoration hung *under* the real ceiling
   * slab, because there is no hole in that slab and there cannot be one.
   */
  const { ceilingHeight } = ctx.dims;
  room.box('woodPale', [0.16, 0.2, 7.4], [0, ceilingHeight - 0.22, 0], 0, { tile: 1.2 });
  for (let i = 0; i < 9; i++) {
    const z = -3.4 + i * 0.85;
    room.box('woodPale', [7.4, 0.12, 0.09], [0, ceilingHeight - 0.34, z], 0, { tile: 1.2 });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -3.0 + i * 0.85;
      room.geo(
        'glass',
        new THREE.PlaneGeometry(3.5, 0.78),
        tiltMatrix([side * 1.85, ceilingHeight - 0.3, z], [Math.PI / 2, Math.PI / 2, 0]),
        { castShadow: false, receiveShadow: false, consume: true },
      );
    }
  }
  // Two cast-iron ribs carrying it, down the walls the generator never opens.
  for (const side of [-1, 1]) {
    room.geo('ironBlack', new THREE.CylinderGeometry(0.05, 0.06, ceilingHeight - 0.4, 8), poseMatrix([side * 3.3, (ceilingHeight - 0.4) / 2, -3.3]), {
      consume: true,
    });
    room.geo('ironBlack', new THREE.TorusGeometry(0.5, 0.04, 4, 10, Math.PI / 2), tiltMatrix([side * 3.3, ceilingHeight - 0.9, -3.3], [0, side > 0 ? Math.PI : Math.PI / 2, side > 0 ? Math.PI / 2 : 0]), {
      consume: true,
    });
  }
  creeper(room, 0, 2.1, -3.5, 1.7, 22);
  creeper(room, -1.4, 0.6, -3.4, 0.9, 10);

  // Raised stone planters along the dead wall.
  for (const x of [-2.4, 0, 2.4]) {
    room.solid('surface.stone', [2.0, 0.5, 0.9], [x, 0, -2.9], 0, { tile: 1.6 });
    room.box('soil', [1.8, 0.1, 0.7], [x, 0.5, -2.9]);
    for (let i = 0; i < 3; i++) {
      deadPlant(room, x + room.range(-0.7, 0.7), 0.56, -2.9 + room.range(-0.22, 0.22), room.range(0.7, 1.15));
    }
  }

  // A wrought-iron table and two chairs, rusted into the marble.
  room.geo('rust', new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16), poseMatrix([1.9, 0.84, -2.4]), { consume: true });
  room.geo('rust', new THREE.CylinderGeometry(0.06, 0.14, 0.82, 8), poseMatrix([1.9, 0.41, -2.4]), { consume: true });
  room.blockCircle(1.9, -2.4, 0.6);
  for (const [cx, cz, rot] of [
    [1.9, -1.35, 0],
    [0.9, -2.5, -1.4],
  ] as const) {
    room.geo('rust', new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12), poseMatrix([cx, 0.44, cz]), { consume: true });
    room.geo('rust', new THREE.TorusGeometry(0.22, 0.02, 4, 12), tiltMatrix([cx, 0.66, cz], [0.35, rot, 0]), {
      consume: true,
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      room.geo('rust', new THREE.CylinderGeometry(0.015, 0.015, 0.44, 5), poseMatrix([cx + Math.cos(a) * 0.17, 0.22, cz + Math.sin(a) * 0.17]), {
        consume: true,
      });
    }
    room.blockCircle(cx, cz, 0.28);
  }

  // A stone bench under the broken glass, and a great many broken panes.
  room.solid('surface.stone', [1.8, 0.46, 0.55], [-2.3, 0, -2.5], 0.08, { tile: 1.4 });
  for (let i = 0; i < 26; i++) {
    room.geo(
      'glass',
      new THREE.PlaneGeometry(room.range(0.08, 0.26), room.range(0.08, 0.26)),
      tiltMatrix([room.range(-3.3, 3.3), 0.012, room.range(-3.4, 0.6)], [-Math.PI / 2, room.range(0, Math.PI), 0]),
      { castShadow: false, receiveShadow: false, consume: true },
    );
  }

  // The manor's last working lamp, over the doorway end.
  pendantLamp(room, 0.4, 2.2, true);

  debris(room, 0.2, -1.2, 2.2, 14);
  cobwebs(room, 3.2, -3.2, 2.4, 1.3);

  return room.finish();
}
