import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  brackets,
  candles,
  cyl,
  disc,
  glowPool,
  ladder,
  litter,
  motes,
  mothLantern,
  quad,
  stool,
} from '../kit/props';

/**
 * The Leaf Archive - a library of pressed leaves, and something has been eating
 * the record.
 *
 * Four presses down the west wall, each a stack of boards clamped on a screw
 * with sheaves of dried leaf between them. Where a page is missing there is a
 * chewed edge and a scatter of frass on the boards below, and the mycelium
 * running out of the third press is doing better than anything else in the room.
 *
 * The lattice walls are the point of the room's look: light comes through them
 * from nowhere in particular, so the whole space is striped, and a figure
 * standing on the far side of one is a shape you can nearly resolve.
 */
export const archive: RoomBlueprint = {
  id: 'heartwood.archive',
  nameKey: 'room.heartwood.archive',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['bower'],
  anchors: {
    chest: [{ position: [2.9, 0, 3.3], rotationY: 0 }],
    locker: [{ position: [3.3, 0, -2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.45, 1.06, 2.55] },
      { position: [-3.05, 1.62, -2.5] },
      { position: [-1.6, 0, -3.35] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0] },
      { position: [-2.5, 0, -1.6] },
      { position: [2.5, 0, 1.6] },
    ],
    enemySpawn: [{ position: [-2.0, 0, -3.15] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, archive);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'parquet',
    wall: 'lattice',
    ceiling: 'rafters',
    band: 'heart',
    bandHeight: 1.3,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'west', kind: 'shutter' }],
  });

  /**
   * A leaf press: a base, a stack of boards with sheaves between them, two
   * uprights and a wooden screw across the top.
   *
   * The sheaves are what makes it a book: alternating thin pale slabs and dark
   * board, at the thickness a pressed leaf really is, so a stack of forty reads
   * as paper rather than as a striped block.
   */
  const press = (z: number, height: number, gutted: boolean): void => {
    const x = -3.05;
    room.solid('timberDark', [0.7, 0.22, 1.15], [x, 0, z], 0, { tile: 0.4 });
    for (const s of [-1, 1]) {
      room.box('timber', [0.11, height, 0.11], [x, 0.22, z + s * 0.52], 0, { tile: 0.3, castShadow: true });
    }
    let y = 0.22;
    let i = 0;
    while (y < height - 0.3) {
      const board = i % 4 === 0;
      const t = board ? 0.035 : 0.014;
      const missing = gutted && i > 9 && i < 17;
      if (!missing) {
        room.box(board ? 'timber' : 'parchment', [0.62 - (board ? 0 : 0.06), t, 1.0 - (board ? 0 : 0.09)], [x, y, z], 0, { tile: 0.2 });
      }
      y += t + 0.006;
      i++;
    }
    // The screw and its handle across the top.
    room.box('timber', [0.66, 0.14, 1.2], [x, height - 0.02, z], 0, { tile: 0.3 });
    room.geo('timberPale', cyl(0.055, 0.055, 0.34, 8), poseMatrix([x, height + 0.29, z]), { tile: 0.2, castShadow: false });
    room.geo('timberDark', cyl(0.024, 0.024, 0.6, 6), tiltMatrix([x, height + 0.42, z], [Math.PI / 2, 0.5, 0]), { tile: 0.2, castShadow: false });

    if (gutted) {
      // What has been at it: a chewed edge, frass on the base, and a felt of
      // mycelium running down the front of the stack.
      for (let k = 0; k < 9; k++) {
        room.geo('mycelium', ball(room.range(0.03, 0.075), 5), tiltMatrix([x + 0.3, room.range(0.4, height - 0.4), z + room.range(-0.45, 0.45)], [0, k, 0], [1.4, 0.5, 1.2]), { tile: 0.15, castShadow: false, receiveShadow: false });
      }
      for (let k = 0; k < 12; k++) {
        room.geo('parchment', quad(room.range(0.05, 0.12), room.range(0.04, 0.09)), tiltMatrix([x + room.range(0.1, 0.6), 0.24, z + room.range(-0.6, 0.6)], [-Math.PI / 2, room.range(0, 3), 0]), { castShadow: false, receiveShadow: false });
      }
      room.geo('slime', disc(0.3, 10), tiltMatrix([x + 0.32, 0.225, z], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    }
  };

  press(-2.5, 1.5, false);
  press(-0.6, 2.0, true);
  press(1.35, 1.7, false);
  press(3.1, 1.2, false);

  /* --- the reading end -------------------------------------------------------- */
  // A lectern in the south-west corner with a sheaf open on it. The slope is the
  // whole prop: a flat board at that height is a table.
  room.solid('timber', [0.5, 0.9, 0.5], [-2.45, 0, 2.55], 0.3, { tile: 0.4, castShadow: true });
  room.geo('timber', new THREE.BoxGeometry(0.76, 0.05, 0.56), tiltMatrix([-2.45, 0.98, 2.55], [-0.42, 0.3, 0]), { tile: 0.3, castShadow: true, consume: true });
  room.box('timberDark', [0.78, 0.04, 0.07], [-2.45, 0.87, 2.72], 0.3, { tile: 0.2 });
  for (let i = 0; i < 4; i++) {
    room.geo('parchment', quad(0.3, 0.4), tiltMatrix([-2.45 + i * 0.01, 1.03 + i * 0.006, 2.55], [-Math.PI / 2 + 0.42, 0.3, 0]), { castShadow: false, receiveShadow: false });
  }
  // A pressed leaf on the open page - the one legible thing in a room of paper.
  room.geo('leafDead', quad(0.16, 0.11), tiltMatrix([-2.42, 1.06, 2.5], [-Math.PI / 2 + 0.42, 0.9, 0]), { castShadow: false, receiveShadow: false });
  stool(room, -1.9, 3.15, 0.46);

  // A wall rack of rolled sheaves, and the slot where three are missing.
  room.box('timberDark', [0.12, 1.1, 2.4], [-3.55, 0.95, -0.6], 0, { tile: 0.5 });
  for (let row = 0; row < 3; row++) {
    room.box('timber', [0.34, 0.05, 2.4], [-3.42, 0.95 + row * 0.5, -0.6], 0, { tile: 0.3 });
    for (let i = 0; i < 8; i++) {
      if (row === 1 && i > 2 && i < 6) continue;
      room.geo(
        i % 3 === 0 ? 'parchment' : 'linen',
        cyl(0.05, 0.05, 0.3, 7),
        tiltMatrix([-3.4, 1.05 + row * 0.5, -1.65 + i * 0.3], [0, 0, Math.PI / 2]),
        { tile: 0.15, castShadow: false, receiveShadow: false },
      );
      if (i % 4 === 1) room.geo('wax', ball(0.02, 5), poseMatrix([-3.25, 1.05 + row * 0.5, -1.65 + i * 0.3]), { castShadow: false, receiveShadow: false });
    }
  }
  ladder(room, 'north', -3.0, ceilingHeight - 0.5);

  basket(room, -2.2, -3.3, 0.26, 0.36, false);
  basket(room, -2.75, -3.5, 0.19, 0.26, true);
  brackets(room, 'south', -3.0, 1.4, 3);
  litter(room, 2.9, -1.0, 0.9, 6);

  // Loose pages that have got out of a press and blown across the floor. Flat,
  // pale and collider-free: this room is already full of solid things.
  for (let i = 0; i < 14; i++) {
    room.geo(
      'parchment',
      quad(room.range(0.12, 0.24), room.range(0.1, 0.18)),
      tiltMatrix([room.range(-1.4, 3.2), 0.014 + room.range(0, 0.01), room.range(-3.2, 3.2)], [-Math.PI / 2, room.range(0, 3), 0]),
      { castShadow: false, receiveShadow: false },
    );
  }

  /* --- light ------------------------------------------------------------------- */
  // One lantern on the east wall, which is the far side of the room from the
  // presses - so the presses are backlit and the lattice throws stripes across
  // the whole floor. That striping is the room's entire look and it comes free.
  const lamp = mothLantern(room, 'east', 0.2, 2.3, true, 11);
  if (lamp) {
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }
  mothLantern(room, 'north', 1.9, 2.2, false);

  // A reading candle at the lectern, and a second point of warmth deep in the
  // presses so the west wall is not a black slab from the east doorway.
  candles(room, -2.45, 0.92, 2.9, 2, 0.09);
  const shelfLamp = new THREE.PointLight(0xffb060, 6, ctx.dims.cellSize * 1.0, 2);
  shelfLamp.position.set(-2.55, 1.55, -0.6);
  room.light(shelfLamp);
  const phase = room.range(0, 20);
  room.tick((t) => {
    shelfLamp.intensity = 6 * (1 + 0.1 * Math.sin(t * 4.3 + phase));
  });
  room.geo('lumenSap', ball(0.05, 6), poseMatrix([-2.55, 1.55, -0.6]), { castShadow: false, receiveShadow: false });
  room.geo('copper', cyl(0.06, 0.09, 0.1, 8), poseMatrix([-2.55, 1.45, -0.6]), { tile: 0.1, castShadow: false });

  motes(room, -2.2, 0, 1.8, 2.6, 16, 'dust');
  glowPool(room, -2.6, -0.6, 2.0);
  glowPool(room, -2.45, 2.7, 1.4);

  return room.finish();
}
