import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneDebris, breathe, disc, drools, glowShaft, polyps, strut } from '../kit/props';

/**
 * The Cascade - a wall of vessels the size of drainpipes, one of which has
 * failed.
 *
 * What comes out of it runs down the west wall, across the floor in a channel
 * the beast grew for exactly this, and away under the south wall. The room is
 * lit by the split itself: a hot red seam three metres up, throwing the shadows
 * of forty vessels across everything.
 */
export const veins: RoomBlueprint = {
  id: 'viscera.veins',
  nameKey: 'room.viscera.veins',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['wet', 'warm'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.1], rotationY: Math.PI }],
    locker: [{ position: [-1.4, 0, 3.3], rotationY: 0 }],
    itemSpawn: [
      { position: [1.5, 0.9, 3.0] },
      { position: [3.2, 0.0, 1.6] },
      { position: [-2.2, 0.0, -3.0] },
    ],
    patrolPoint: [
      { position: [0.6, 0, 0.2] },
      { position: [-1.6, 0, -1.8] },
      { position: [2.4, 0, 1.4] },
    ],
    enemySpawn: [{ position: [3.3, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, veins);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'flesh', wall: 'flesh', ceiling: 'sinew', band: 'gut', mouth: 'sphincter' });

  /* --- the wall of vessels ---------------------------------------------------- */
  // Nine cords running floor to ceiling, each bound to the wall at three heights
  // and each a slightly different thickness, so the wall has a rhythm.
  for (let i = 0; i < 9; i++) {
    const z = -3.1 + i * 0.78;
    const r = 0.1 + ((i * 7) % 5) * 0.028;
    const bow = 0.18 + ((i * 3) % 4) * 0.07;
    strut(room, 'vein', [-3.5 + bow * 0.4, 0, z], [-3.5 + bow, ceilingHeight * 0.55, z], r, 8, { tile: 0.7 });
    strut(room, 'vein', [-3.5 + bow, ceilingHeight * 0.55, z], [-3.5 + bow * 0.5, ceilingHeight, z + 0.2], r * 0.9, 8, {
      tile: 0.7,
    });
    for (const y of [0.7, 1.8, 2.8]) {
      room.geo('sinew', new THREE.TorusGeometry(r * 1.35, 0.03, 5, 10), tiltMatrix([-3.46 + bow * 0.7, y, z], [0, Math.PI / 2, 0]), {
        tile: 0.3,
        consume: true,
      });
    }
  }
  room.collider({ kind: 'box', center: [-3.45, 0], halfExtents: [0.24, 3.6] });

  /* --- the split --------------------------------------------------------------- */
  const splitY = 2.75;
  const splitZ = 0.4;
  room.geo('meatDark', ball(0.5, 12), tiltMatrix([-3.2, splitY, splitZ], [0, 0.3, 0], [0.7, 1.5, 1.1]), { tile: 0.7 });
  room.geo('pulse', ball(0.26, 10), tiltMatrix([-3.05, splitY, splitZ], [0, 0, 0], [0.5, 1.9, 1.2]), { castShadow: false });
  // What is coming out of it: a sheet down the wall, then a pool.
  room.geo('blood', new THREE.PlaneGeometry(1.0, splitY), poseMatrix([-3.36, splitY / 2, splitZ], Math.PI / 2), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });
  for (let i = 0; i < 6; i++) {
    room.geo(
      'blood',
      new THREE.CylinderGeometry(0.02, 0.05, room.range(0.6, 2.4), 5),
      poseMatrix([-3.3 + room.range(-0.05, 0.12), room.range(0.5, 1.6), splitZ + room.range(-0.5, 0.5)]),
      { castShadow: false, consume: true },
    );
  }
  glowShaft(room, [-3.1, splitY, splitZ], [0.4, 0.3, 0.6], 1.5, true);

  /* --- the channel -------------------------------------------------------------- */
  // A groove the beast grew, running from under the split to the south wall.
  const channel: readonly (readonly [number, number])[] = [
    [-3.0, 0.4],
    [-1.6, 1.2],
    [-0.4, 2.1],
    [0.4, 3.4],
  ];
  for (let i = 1; i < channel.length; i++) {
    const a = channel[i - 1];
    const b = channel[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    room.geo('blood', new THREE.PlaneGeometry(0.66, len + 0.2), tiltMatrix([(a[0] + b[0]) / 2, 0.024, (a[1] + b[1]) / 2], [-Math.PI / 2, yaw, 0]), {
      castShadow: false,
      receiveShadow: false,
      consume: true,
    });
    for (const s of [-1, 1]) {
      room.geo(
        'meatDark',
        new THREE.BoxGeometry(0.16, 0.1, len + 0.2),
        tiltMatrix([(a[0] + b[0]) / 2 + Math.cos(yaw) * s * 0.4, 0.05, (a[1] + b[1]) / 2 - Math.sin(yaw) * s * 0.4], [0, yaw, 0]),
        { tile: 0.4, consume: true },
      );
    }
  }
  room.geo('blood', disc(0.85, 16), tiltMatrix([-2.95, 0.026, 0.4], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  /* --- the room ------------------------------------------------------------------ */
  room.solid('cartilage', [1.0, 0.9, 0.75], [1.5, 0, 3.2], 0, { tile: 0.9 });
  room.geo('bonePale', ball(0.28, 9), tiltMatrix([1.5, 0.92, 3.2], [0, 0.3, 0], [1.7, 0.3, 1.3]), { tile: 0.5 });

  polyps(room, 3.0, 0, -1.0, 0.6, 8, false);
  polyps(room, -0.8, 0, -3.2, 0.5, 6, true);
  drools(room, -2.0, 2.4, 1.4, 7);
  boneDebris(room, 2.8, 2.4, 0.9, 8);

  // The split is the light. Hot, close to the wall, and it breathes.
  const bleed = new THREE.PointLight(0xff4030, 12, ctx.dims.cellSize * 1.8, 2);
  bleed.position.set(-2.75, splitY - 0.1, splitZ);
  bleed.castShadow = true;
  bleed.shadow.mapSize.set(512, 512);
  bleed.shadow.autoUpdate = false;
  bleed.shadow.needsUpdate = true;
  room.light(bleed);
  breathe(room, bleed, 12, 0.26, 1.7);

  // A cold pod on the far side, so the east half is not pitch black.
  const fill = new THREE.PointLight(0x8ff0c4, 5, ctx.dims.cellSize, 2);
  fill.position.set(3.0, 2.2, 0.6);
  room.light(fill);
  room.geo('lumen', ball(0.16, 10), poseMatrix([3.25, 2.2, 0.6]), { castShadow: false });
  breathe(room, fill, 5, 0.2, 1.1);

  return room.finish();
}
