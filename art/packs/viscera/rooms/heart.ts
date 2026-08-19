import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, boneDebris, cyl, drools, heartbeat, lumenPod, nerveRun, polyps, strut } from '../kit/props';

/**
 * The Heart - the one room in the map that is unmistakably a machine, and the
 * only one that makes a noise you can feel.
 *
 * A four-chambered mass on a plinth of cartilage, great vessels the width of a
 * body running up into the roof and down through the floor. It beats: two
 * thumps, a pause, and the whole chamber falls to dark red between them - the
 * muscle swells on the beat and the light swells with it. Nothing else in the
 * pack moves this much, and nothing else needed to.
 */
export const heart: RoomBlueprint = {
  id: 'viscera.heart',
  nameKey: 'room.viscera.heart',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 7,
  maxPerMap: 1,
  tags: ['wet', 'landmark'],
  anchors: {
    chest: [{ position: [3.0, 0, 3.0], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.2, 0.82, -2.6] },
      { position: [3.2, 0.0, -2.9] },
    ],
    patrolPoint: [
      { position: [-2.9, 0, 0.4] },
      { position: [0.4, 0, 2.9] },
      { position: [2.9, 0, -0.6] },
    ],
    enemySpawn: [{ position: [-3.1, 0, 3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, heart);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'flesh', wall: 'muscle', ceiling: 'sinew', mouth: 'sphincter' });

  /* --- the organ ------------------------------------------------------------ */
  // A plinth of cartilage it sits in, so it is not a ball on the carpet. Kept
  // small: at the 1.7 m it started on, the mass filled the whole frame from
  // every doorway and the room had nothing else in it.
  room.geo('cartilage', cyl(1.0, 1.2, 0.4, 16), poseMatrix([0, 0.2, 0]), {
    tile: 1.1,
  });
  room.geo('meatDark', cyl(0.86, 1.0, 0.28, 16), poseMatrix([0, 0.48, 0]), { tile: 0.8 });
  room.blockCircle(0, 0, 1.15);

  /**
   * The muscle itself is NOT batched: it is the one thing in the pack that
   * changes shape, and a merged geometry cannot. One extra draw call buys the
   * beat, which is the entire reason this room exists.
   */
  const beating = new THREE.Group();
  const flesh = room.mat('organ');
  for (const [dx, dy, dz, r] of [
    [0, 1.28, 0, 0.66],
    [-0.44, 1.02, 0.16, 0.46],
    [0.42, 1.08, -0.18, 0.42],
    [0.06, 1.75, 0.2, 0.36],
  ] as const) {
    // Built here rather than batched, so the room has to free it: nothing in
    // `MeshBatcher` ever sees these four buffers.
    const geometry = new THREE.SphereGeometry(r, 14, 10);
    room.own(geometry);
    const lobe = new THREE.Mesh(geometry, flesh);
    lobe.position.set(dx, dy, dz);
    lobe.scale.set(1, 1.12, 0.92);
    lobe.castShadow = false;
    beating.add(lobe);
  }
  room.loose(beating);
  room.tick((t) => {
    const cycle = (t % (60 / 34)) / (60 / 34);
    const thump = Math.exp(-Math.pow((cycle - 0.06) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((cycle - 0.2) / 0.06, 2));
    const s = 1 + thump * 0.055;
    beating.scale.set(s, 1 + thump * 0.03, s);
  });

  // Vessels over the surface, and the fat that packs the grooves between lobes.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    strut(room, 'vein', [Math.cos(a) * 0.36, 0.56, Math.sin(a) * 0.36], [Math.cos(a) * 0.62, 1.7, Math.sin(a) * 0.5], 0.04, 6, {
      tile: 0.5,
    });
  }
  room.geo('fat', ball(0.22, 9), tiltMatrix([-0.06, 0.86, 0.4], [0, 0.4, 0], [2.2, 0.6, 1.1]), { tile: 0.6 });
  // A band of glowing vessel round the middle, so the mass still reads as a
  // shape in the dark between beats.
  room.geo('pulse', new THREE.TorusGeometry(0.6, 0.035, 5, 18), tiltMatrix([0, 1.06, 0], [Math.PI / 2 + 0.12, 0, 0]), {
    castShadow: false,
    consume: true,
  });

  /* --- the plumbing --------------------------------------------------------- */
  /**
   * Great vessels, and every one of them runs STEEPLY - two up into the roof,
   * two down into the floor. Vessels sent out sideways to the walls turned the
   * whole organ into a ceiling fan from every doorway: a near-horizontal
   * cylinder lit from above is a blade, whatever it is made of.
   */
  const vessels: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [0.1, 1.9, 0.15, 0.5, ceilingHeight, 0.75, 0.23],
    [-0.3, 1.8, -0.2, -0.85, ceilingHeight, -0.95, 0.18],
    [-0.62, 0.9, 0.42, -1.15, 0, 0.85, 0.16],
    [0.66, 0.86, -0.44, 1.25, 0, -0.9, 0.15],
  ];
  for (const [x0, y0, z0, x1, y1, z1, r] of vessels) {
    strut(room, 'meat', [x0, y0, z0], [x1, y1, z1], r, 10, { tile: 1.0 });
    // A valve collar where it leaves the muscle, and rings down its length.
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      room.geo(
        'cartilage',
        new THREE.TorusGeometry(r * 1.22, 0.045, 5, 12),
        tiltMatrix([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t], [Math.PI / 2 + (y1 > y0 ? 0.16 : -0.16), yaw, 0]),
        { tile: 0.3, consume: true },
      );
    }
  }

  /* --- the room around it ---------------------------------------------------- */
  // A shelf of bone in the north-west corner, holding an item.
  room.solid('bone', [1.0, 0.82, 0.8], [-3.2, 0, -2.6], 0.15, { tile: 0.9 });
  room.geo('bonePale', ball(0.3, 9), tiltMatrix([-3.2, 0.84, -2.6], [0, 0.3, 0], [1.5, 0.3, 1.2]), { tile: 0.5 });

  nerveRun(room, [
    [-3.5, ceilingHeight - 0.4, 1.0],
    [-1.3, ceilingHeight - 0.55, 0.4],
    [1.4, ceilingHeight - 0.5, -0.6],
    [3.4, ceilingHeight - 0.38, -1.4],
  ]);
  polyps(room, 2.9, 0, 1.6, 0.6, 8, false);
  polyps(room, -2.4, 0, -0.6, 0.5, 6, true);
  drools(room, 2.0, -2.2, 1.4, 7);
  boneDebris(room, -2.2, 2.6, 1.0, 8);

  /**
   * The beat itself, and everything in the room is lit by it.
   *
   * It stands BESIDE the muscle, not inside it. Sunk in the mass - which is
   * where it obviously belongs - a point light lights the inside of a sphere
   * and nothing else, and the first pass of this room was a black lump in a
   * black chamber. Off to one side it rims the organ instead, which is what
   * gives it a silhouette. It casts no shadow: a mass this size with a light
   * on it throws the room into hard wedges and swallows the doorways.
   */
  const pulse = new THREE.PointLight(0xff5a3a, 11, ctx.dims.cellSize * 1.8, 2);
  pulse.position.set(1.0, 1.5, 0.75);
  room.light(pulse);
  heartbeat(room, pulse, 11, 0.7);

  // One cold pod on the far wall, so the room is still navigable between beats.
  lumenPod(room, [3.35, 1.15, 0.9], 0.2, true, false, 6);
  room.solid('cartilage', [0.6, 1.15, 0.8], [3.35, 0, 0.9], 0, { tile: 0.7 });

  return room.finish();
}
