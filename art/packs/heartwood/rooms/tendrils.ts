import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  brackets,
  cyl,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  toadstools,
  vineFall,
} from '../kit/props';

/**
 * The Grasping Dark - the room where the tree stops being architecture.
 *
 * Fifty tendrils hanging from the boughs at head height, thick as a wrist, wet,
 * and every one of them ends in a blunt tip rather than a leaf. You have to walk
 * through them. They part.
 *
 * This is the pack's claustrophobia room in the way the Bark Canyon is not: the
 * canyon narrows and you can see through the gap, and here you can see nothing
 * at all past two metres in any direction, in a room with three doorways that all
 * look identical once you are inside it.
 *
 * The mass in the west band breathes. It is one point light and a slow sine, and
 * it is doing more work than any geometry in the room.
 */
export const tendrils: RoomBlueprint = {
  id: 'heartwood.tendrils',
  nameKey: 'room.heartwood.tendrils',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['thicket'],
  anchors: {
    chest: [{ position: [2.9, 0, -3.3], rotationY: Math.PI }],
    locker: [{ position: [3.3, 0, 2.9], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0, -2.6] },
      { position: [1.4, 0, 3.2] },
      { position: [-2.5, 0.95, 1.7] },
    ],
    patrolPoint: [
      { position: [0.2, 0, 0] },
      { position: [-1.4, 0, 2.5] },
      { position: [2.3, 0, -1.3] },
    ],
    enemySpawn: [{ position: [-3.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, tendrils);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'loam',
    wall: 'bark',
    ceiling: 'boughs',
    band: 'root',
    bandHeight: 0.6,
    register: 'weep',
    mouth: 'grown',
  });

  /**
   * The curtain.
   *
   * Nine stands of hanging tendril, each its own batcher and its own slow sway.
   * They carry no collider at all, which is the whole design: a player walks
   * straight through and the room simply stops being legible while they do.
   *
   * `vineFall()` is what a swaying stand costs when it is done properly - two
   * draw calls per stand instead of one per leaf (docs/art/ROOM_REVIEW.md).
   */
  for (const [vx, vz, r, n] of [
    [-0.4, -1.9, 1.0, 7],
    [1.5, 0.6, 1.1, 8],
    [-1.9, 1.3, 1.0, 5],
    [0.5, 2.6, 0.9, 4],
    [2.6, -2.4, 0.8, 4],
    [-2.7, -0.4, 0.8, 3],
    [2.8, 1.9, 0.8, 3],
    [-0.9, -3.2, 0.8, 3],
    [3.0, 3.2, 0.7, 3],
  ] as const) {
    vineFall(room, vx, vz, r, n, 'tendril', false);
  }

  // Thicker ones that hang lower and end in a blunt tip. These are the ones a
  // player actually reads, so they are in the room's own batch and they are
  // fatter than anything a plant would grow.
  for (let i = 0; i < 8; i++) {
    const px = room.range(-3.2, 3.2);
    const pz = room.range(-3.2, 3.2);
    const len = room.range(1.4, 2.9);
    limb(
      room,
      'tendril',
      [px, ceilingHeight - 0.15, pz],
      [px + room.range(-0.5, 0.5), ceilingHeight - 0.15 - len, pz + room.range(-0.5, 0.5)],
      room.range(0.05, 0.1),
      room.range(0.03, 0.06),
      0.18,
      i * 3.1,
      6,
      { tile: 0.4, castShadow: i % 3 === 0 },
    );
    // The tip: a swollen blunt end, not a taper. A tendril that comes to a point
    // is a root; one that ends in a knob is looking for something.
    room.geo('tendril', ball(room.range(0.05, 0.09), 7), tiltMatrix([px + room.range(-0.4, 0.4), ceilingHeight - 0.2 - len, pz + room.range(-0.4, 0.4)], [0, i, 0], [1, 1.5, 1]), { tile: 0.15, castShadow: false });
  }

  /* --- the mass ---------------------------------------------------------------- */
  /**
   * What all of it comes out of: a knot of muscle in the west band, low, wide and
   * lit from inside. The tendrils near it are visibly thicker, which is the only
   * thing that tells a player which way the room is organised.
   */
  const mx = -3.1;
  const mz = 0.4;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = i === 0 ? 0 : room.range(0.3, 0.9);
    room.geo(
      'tendril',
      ball(i === 0 ? 1.0 : room.range(0.4, 0.75), 9),
      tiltMatrix([mx + Math.cos(a) * d * 0.5, room.range(0.5, 1.5), mz + Math.sin(a) * d], [0, a, 0], [1.0, 1.05, 1.2]),
      { tile: 0.7, castShadow: true },
    );
  }
  // The seams between the lobes, glowing faintly. It is the only warm thing here
  // and it is the wrong warm.
  for (let i = 0; i < 6; i++) {
    const a = room.range(0, Math.PI * 2);
    limb(
      room,
      'surface.sap',
      [mx - 0.2, 0.4 + room.range(0, 0.4), mz + Math.sin(a) * 0.9],
      [mx - 0.1, 1.7 + room.range(0, 0.5), mz + Math.sin(a + 1.2) * 0.7],
      0.035,
      0.02,
      0.15,
      i * 5,
      5,
      { tile: 0.2, castShadow: false, receiveShadow: false },
    );
  }
  // Where it grips the wall, and where it grips the floor.
  for (let i = 0; i < 7; i++) {
    const a = room.range(-1.3, 1.3);
    limb(room, 'tendril', [mx - 0.3, room.range(0.6, 2.6), mz + Math.sin(a) * 0.8], [-3.7, room.range(0.4, 3.0), mz + Math.sin(a) * 2.4], 0.05, 0.03, 0.2, i * 7, 5, { tile: 0.3, castShadow: false });
    limb(room, 'tendril', [mx + 0.4, 0.15, mz + Math.sin(a) * 0.7], [mx + room.range(1.0, 2.0), 0.06, mz + Math.sin(a) * 2.6], 0.06, 0.025, 0.25, i * 11, 5, { tile: 0.3, castShadow: false, receiveShadow: false });
  }
  room.blockCircle(mx, mz, 1.15);
  // A shelf of old wood the mass has grown around, which is where an item goes.
  room.box('rotProp', [0.7, 0.06, 0.9], [-2.5, 0.92, 1.7], 0.2, { tile: 0.3 });
  for (const s of [-1, 1]) {
    room.geo('root', cyl(0.04, 0.05, 0.92, 5), poseMatrix([-2.5 + s * 0.25, 0.46, 1.7 + s * 0.3]), { tile: 0.2, castShadow: false });
  }

  /* --- the floor ----------------------------------------------------------------- */
  toadstools(room, 2.4, 3.0, 0.8, 7, true);
  toadstools(room, -1.8, -3.0, 0.7, 6, false);
  litter(room, 0.4, 1.4, 1.6, 14);
  litter(room, 2.0, -2.4, 1.2, 9);
  brackets(room, 'north', 2.4, 1.3, 3);
  brackets(room, 'south', -2.6, 1.5, 3);
  foxfire(room, [1.6, 0.3, -3.2], 0.8, 10);
  foxfire(room, [-2.4, 0.3, 3.2], 0.7, 9);
  plume(room, -2.6, 0.4, 0.4, 2.1, 1.7, 'hazeMist');
  motes(room, 0, 0, 3.0, 2.7, 20, 'spore');

  /* --- light ---------------------------------------------------------------------- */
  /**
   * The mass, from OUTSIDE it - a point light sunk inside its own lobe lights the
   * inside of a sphere and nothing else (docs/art/ROOM_REVIEW.md). It breathes
   * rather than flickers, on a period long enough that you see it in the shadows
   * of fifty hanging tendrils before you notice it in the light.
   */
  const heart = new THREE.PointLight(0xd88448, 7, ctx.dims.cellSize * 1.35, 2);
  // Well out from the lobes rather than tucked against them: at 1.25 m the near
  // faces blew out and the whole mass read as one flat orange trapezoid instead
  // of as something with lobes.
  heart.position.set(mx + 2.1, 1.45, mz);
  room.shadowLight(heart);
  const phase = room.range(0, 20);
  room.tick((t) => {
    const breath = Math.sin(t * 0.33 + phase);
    heart.intensity = 7 * (1 + 0.26 * (breath * 0.75 + Math.sin(t * 0.71 + phase * 1.3) * 0.25));
  });

  // The second is cold and on the far side, so a player crossing the curtain is
  // lit from behind on the way in and from in front on the way back.
  gillLamp(room, 'east', 1.5, 1.6, true, 8);

  glowPool(room, mx + 1.0, mz, 2.6);
  glowPool(room, 2.6, 1.2, 2.2, 'foxWash');
  glowPool(room, 1.6, -3.0, 1.6, 'foxWash');

  return room.finish();
}
