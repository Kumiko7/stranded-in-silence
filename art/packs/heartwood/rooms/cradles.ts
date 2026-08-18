import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  candles,
  cyl,
  disc,
  glowPool,
  hanging,
  litter,
  mothLantern,
  motes,
  quad,
  ring,
  shelf,
} from '../kit/props';

/**
 * The Cradle Boughs - five woven cribs hung from the branches, and one of them
 * is moving.
 *
 * There is no draught in here. There is nothing on the floor. The bedding in
 * four of them is folded back the way you fold it back when you are taking
 * something out. The fifth is not folded back, and the fifth is the one that is
 * rocking.
 *
 * The room is deliberately the emptiest in the Bower: the whole east band is
 * given to the cribs and the mobiles hanging between them, and the rest of it is
 * bare board and one shelf of small things. Negative space is what makes this
 * one land.
 */
export const cradles: RoomBlueprint = {
  id: 'heartwood.cradles',
  nameKey: 'room.heartwood.cradles',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'west', 'south'),
  weight: 8,
  tags: ['bower'],
  anchors: {
    chest: [{ position: [-2.9, 0, 3.3], rotationY: 0 }],
    locker: [{ position: [-3.3, 0, -2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.3, 1.54, -0.85] },
      { position: [-3.52, 1.32, 1.1] },
      { position: [1.9, 0, 3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.3, 0, 1.4] },
      { position: [1.2, 0, -2.9] },
    ],
    enemySpawn: [{ position: [1.8, 0, -3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cradles);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'plank',
    wall: 'birch',
    ceiling: 'boughs',
    band: 'wicker',
    bandHeight: 0.92,
    register: 'sapline',
    mouth: 'carved',
    ports: [{ side: 'east', kind: 'knothole', scene: 'canopy', tall: true }],
  });

  /**
   * The cribs.
   *
   * Each is a woven basket on a hoop slung from the boughs on two cords. Four of
   * them are dead still and go into the room's own batch, where they cost
   * nothing. The fifth - the one that is not folded back - swings, and it is the
   * only thing in this pack that moves on its own.
   *
   * That split is both the cheaper build and the better room: five cradles all
   * rocking is a breeze, and one rocking with four still is not.
   */
  const crib = (
    put: (material: string, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, options?: Record<string, unknown>) => void,
    cx: number,
    cy: number,
    cz: number,
    drop: number,
    occupied: boolean,
  ): void => {
    for (const s of [-1, 1]) {
      put('strand', boxGeometry(0.012, drop, 0.012), poseMatrix([cx + s * 0.24, cy - drop / 2, cz]), { castShadow: false, receiveShadow: false });
    }
    put('timberDark', boxGeometry(0.06, 0.05, 0.62), poseMatrix([cx, cy - drop, cz]), { tile: 0.2, castShadow: false });

    // The basket: a coil of decreasing radius, a rim hoop, and a hood over one
    // end. The hood is what makes it a crib and not a fruit bowl.
    const r = 0.42;
    for (let k = 0; k < 5; k++) {
      const t = k / 5;
      put('surface.wicker', cyl(r * (0.72 + t * 0.28), r * (0.66 + t * 0.28), 0.085, 12, true), tiltMatrix([cx, cy - drop - 0.42 + t * 0.32, cz], [0, 0, 0], [1, 1, 1.6]), { tile: 0.2 });
    }
    put('surface.wicker', disc(r * 0.7, 12), tiltMatrix([cx, cy - drop - 0.46, cz], [-Math.PI / 2, 0, 0], [1, 1.6, 1]), { castShadow: false, receiveShadow: false });
    put('timberDark', ring(r, 0.025, 14), tiltMatrix([cx, cy - drop - 0.1, cz], [Math.PI / 2, 0, 0], [1, 1.6, 1]), { tile: 0.2, castShadow: false });
    for (let k = 0; k < 5; k++) {
      const a = -0.4 + (k / 4) * 0.8;
      put('surface.wicker', cyl(0.02, 0.02, 0.5, 5), tiltMatrix([cx + Math.sin(a) * r * 0.9, cy - drop - 0.14, cz - r * 1.35], [Math.PI / 2 - 0.5, a, 0]), { tile: 0.15, castShadow: false });
    }

    // The bedding: folded back on the empty ones, and not on the other.
    if (occupied) {
      put('linen', quad(0.5, 0.85), tiltMatrix([cx, cy - drop - 0.14, cz], [-Math.PI / 2, 0.2, 0]), { castShadow: false, receiveShadow: false });
      // Something under it. A shape, and nothing more than a shape.
      put('linen', ball(0.15, 7), tiltMatrix([cx, cy - drop - 0.24, cz + 0.14], [0, 0.4, 0], [1, 0.8, 1.5]), { castShadow: true });
    } else {
      put('linen', quad(0.5, 0.5), tiltMatrix([cx, cy - drop - 0.2, cz + 0.22], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
      put('linen', quad(0.5, 0.3), tiltMatrix([cx, cy - drop - 0.08, cz - 0.24], [-0.9, 0, 0]), { castShadow: false, receiveShadow: false });
    }
  };

  const hangY = ceilingHeight - 0.25;
  /**
   * Hung at chest height rather than at knee height.
   *
   * The first pass slung them at about a metre and they were invisible from all
   * three doorways - a dark wicker basket low down in an unlit band is nothing
   * at all from six metres. A cradle is a thing you look INTO, so it hangs where
   * a person would reach it, and that is also the only height at which it reads
   * as a silhouette across the room.
   */
  const still: readonly [number, number, number][] = [
    [2.55, -2.55, 1.52],
    [2.3, -0.85, 1.7],
    [2.45, 2.25, 1.78],
    [3.15, 3.35, 1.6],
  ];
  for (const [cx, cz, hang] of still) {
    crib((material, geometry, matrix, options) => room.geo(material, geometry, matrix, options ?? {}), cx, hangY, cz, hangY - hang, false);
    room.blockCircle(cx, cz, 0.4);
  }

  // The one that moves. Its own batcher, its own group, and the group swings
  // about the CEILING rather than about its own base - pivoting a hanging thing
  // at the bottom is how a cradle ends up scything through the room.
  const swingBatch = new MeshBatcher();
  const swing = new THREE.Group();
  swing.position.set(2.95, hangY, 0.75);
  crib(
    (material, geometry, matrix, options) =>
      swingBatch.add(room.mat(material), geometry, matrix, { castShadow: false, ...(options as object) }),
    0,
    0,
    0,
    hangY - 1.66,
    true,
  );
  const swung = swingBatch.build();
  swing.add(swung.object);
  room.loose(swing);
  room.own(swung);
  room.blockCircle(2.95, 0.75, 0.4);
  const swingPhase = room.range(0, 20);
  room.tick((t) => {
    swing.rotation.z = Math.sin(t * 0.62 + swingPhase) * 0.045;
    swing.rotation.x = Math.cos(t * 0.49 + swingPhase * 1.4) * 0.03;
  });

  /* --- the mobiles ----------------------------------------------------------- */
  // Hung between the cribs: a hoop with small bones, beaks and seed pods on it.
  // Three of them, and they are the reason a player looks up.
  for (const [mx, mz] of [[2.9, -1.7], [2.6, 1.5], [3.3, -3.2]] as const) {
    const y = ceilingHeight - 0.75;
    room.geo('strand', cyl(0.008, 0.008, 0.5, 4), poseMatrix([mx, y + 0.25, mz]), { castShadow: false, receiveShadow: false });
    room.geo('timberDark', ring(0.24, 0.016, 12), tiltMatrix([mx, y, mz], [Math.PI / 2, 0, 0]), { tile: 0.15, castShadow: false });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const drop = room.range(0.14, 0.4);
      const px = mx + Math.cos(a) * 0.24;
      const pz = mz + Math.sin(a) * 0.24;
      room.geo('strand', cyl(0.006, 0.006, drop, 4), poseMatrix([px, y - drop / 2, pz]), { castShadow: false, receiveShadow: false });
      if (i % 2 === 0) {
        room.geo('bone', cyl(0.014, 0.02, 0.16, 5), tiltMatrix([px, y - drop - 0.08, pz], [room.range(-0.3, 0.3), a, 0]), { tile: 0.1, castShadow: false, receiveShadow: false });
      } else {
        room.geo('bone', ball(0.05, 6), tiltMatrix([px, y - drop - 0.05, pz], [0, a, 0], [0.7, 1, 1.5]), { tile: 0.1, castShadow: false, receiveShadow: false });
      }
    }
  }

  /* --- the rest of the room -------------------------------------------------- */
  // One shelf of small things, a chair nobody is sitting in, and eight metres of
  // bare board. That is the whole west half of the room.
  shelf(room, 'west', 1.1, 1.28, 1.7, 0.32);
  for (let i = 0; i < 5; i++) {
    room.geo(i % 2 ? 'pottery' : 'timberPale', cyl(0.05, 0.06, 0.14, 8), poseMatrix([-3.52, 1.35, 0.35 + i * 0.32]), { tile: 0.1, castShadow: false });
  }
  room.geo('linen', quad(0.36, 0.24), tiltMatrix([-3.5, 1.55, 1.7], [0, Math.PI / 2, 0.2]), { castShadow: false, receiveShadow: false });

  hanging(room, 'north', -1.1, 1.5, 1.4, 1.5, 'linen');
  basket(room, 1.9, 3.3, 0.3, 0.44, false);
  basket(room, -2.4, -1.6, 0.22, 0.3, true);
  litter(room, -1.4, -3.3, 0.7, 5);

  // A rocking chair, empty, at the edge of the cribs. It is not rocking, which
  // in this room is the strange part.
  room.box('timberDark', [0.44, 0.05, 0.42], [1.55, 0.4, 1.9], -0.7, { tile: 0.3 });
  room.box('timberDark', [0.42, 0.62, 0.05], [1.55, 0.4, 1.72], -0.7, { tile: 0.3 });
  for (const s of [-1, 1]) {
    room.geo('timberDark', ring(0.34, 0.022, 10), tiltMatrix([1.55 + s * 0.2, 0.34, 1.9], [0, -0.7, 0]), { tile: 0.2, castShadow: false });
  }
  room.geo('weaveGreen', quad(0.36, 0.3), tiltMatrix([1.55, 0.44, 1.9], [-Math.PI / 2, -0.7, 0]), { castShadow: false, receiveShadow: false });
  room.blockCircle(1.55, 1.9, 0.28);

  /* --- light ------------------------------------------------------------------ */
  // One warm lantern low on the north wall, and the cold shaft from the knothole
  // behind the cribs - so the baskets are rimmed cold from one side and warm
  // from the other, and the cords catch both.
  const lamp = mothLantern(room, 'north', -1.9, 2.0, true, 12);
  if (lamp) {
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }
  // Out over the cribs rather than up against the knothole, and much stronger:
  // on the first sheet the five baskets - the entire point of the room - were
  // invisible from all three doorways and only showed on the raised views.
  const cold = new THREE.PointLight(0xb4d0e0, 12, ctx.dims.cellSize * 1.4, 2);
  cold.position.set(2.5, 2.7, 0.5);
  room.light(cold);
  const phase = room.range(0, 20);
  room.tick((t) => {
    cold.intensity = 12 * (1 + 0.08 * Math.sin(t * 0.4 + phase));
  });

  candles(room, -3.5, 1.34, -0.4, 2, 0.08);
  motes(room, 2.6, 0.4, 1.8, 2.8, 14, 'dust');
  glowPool(room, 2.5, 0.6, 3.0, 'moonWash');
  glowPool(room, -2.6, -1.4, 1.8);

  return room.finish();
}
