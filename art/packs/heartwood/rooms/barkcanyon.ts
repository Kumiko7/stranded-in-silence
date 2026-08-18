import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  brackets,
  buttress,
  cyl,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  slab,
  strut,
  toadstools,
  vineFall,
  wrapped,
} from '../kit/props';

/**
 * The Bark Canyon - sixteen metres of rift between two plates of bark, and it
 * narrows in the middle.
 *
 * This is the pack's claustrophobia room and the narrowing is the whole design:
 * you can see the far end from either doorway, you have to walk through a
 * two-and-a-half metre gap between two leaning slabs to get there, and you
 * cannot see what is on the other side of either slab until you are in the gap.
 *
 * There is one wrapped thing hanging in the north lee of the near slab, about
 * three metres up, and it is the only thing in here that is pale.
 */
export const barkCanyon: RoomBlueprint = {
  id: 'heartwood.barkcanyon',
  nameKey: 'room.heartwood.barkcanyon',
  footprint: [
    [0, 0],
    [1, 0],
  ],
  doorWalls: [...wallsOn([0, 0], 'west', 'north', 'south'), ...wallsOn([1, 0], 'east', 'south')],
  weight: 6,
  tags: ['thicket', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.9], rotationY: -Math.PI / 2 }],
    locker: [{ position: [11.3, 0, 2.9], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [4.0, 0.72, -3.1] },
      { position: [8.4, 0, -3.3] },
      { position: [-1.4, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [-1.0, 0, 0 ] },
      { position: [4.0, 0, 0.2] },
      { position: [9.6, 0, -0.4] },
    ],
    enemySpawn: [{ position: [4.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, barkCanyon);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'loam',
    wall: 'bark',
    ceiling: 'knots',
    band: 'root',
    bandHeight: 0.55,
    register: 'weep',
    mouth: 'grown',
    ports: [{ cell: [1, 0], side: 'north', kind: 'knothole', scene: 'hollow', tall: true }],
  });

  /**
   * The narrowing.
   *
   * Two plates of bark leaning in from opposite sides, each built as four
   * overlapping slabs at slightly different rakes so the edge is ragged. They
   * sit between the two cells' door lanes, which is the one band of a 2x1 that
   * is guaranteed free floor for the whole run.
   */
  const plate = (z: number, sign: number, seed: number): void => {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const px = 4.0 + (t - 0.5) * 2.3;
      const h = 3.4 - Math.abs(t - 0.45) * 1.1;
      slab(
        room,
        'barkProp',
        [1.0, h, 0.5],
        [px, h / 2 - 0.2, z + sign * (0.3 - t * 0.25)],
        [sign * (0.16 + t * 0.07), 0.12 - t * 0.18, 0],
        { tile: 1.2, castShadow: true },
      );
      // The torn edge of the plate: lumps down the lee side of each slab.
      for (let k = 0; k < 4; k++) {
        room.geo(
          'barkProp',
          ball(room.range(0.14, 0.3), 6),
          tiltMatrix([px + room.range(-0.4, 0.4), 0.5 + k * 0.75, z - sign * 0.32], [0, seed + k, 0], [1.3, 0.9, 0.7]),
          { tile: 0.5, castShadow: false },
        );
      }
      // Fibre bridging the split - the strings a plate leaves when it tears off.
      for (let k = 0; k < 3; k++) {
        strut(
          room,
          'pulpProp',
          [px - 0.4, 0.6 + k * 0.9, z + sign * 0.28],
          [px + 0.4, 0.8 + k * 0.9, z + sign * 0.42],
          room.range(0.012, 0.03),
          4,
          { tile: 0.2, castShadow: false, receiveShadow: false },
        );
      }
    }
    room.collider({ kind: 'box', center: [4.0, z + sign * 0.15], halfExtents: [1.65, 0.55] });
  };

  plate(-1.7, -1, 3);
  plate(1.7, 1, 11);

  // Sap has run down the inside of both plates and set in columns. It is the one
  // warm colour in this room and it marks the gap you have to walk through.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const px = 3.2 + i * 0.55;
      const len = room.range(0.7, 1.9);
      room.geo('surface.sap', cyl(0.03, 0.055, len, 5), tiltMatrix([px, 2.6 - len / 2, s * 1.35], [s * 0.12, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
      room.geo('surface.sap', ball(room.range(0.05, 0.09), 6), tiltMatrix([px, 2.6 - len, s * 1.35], [0, 0, 0], [1, 1.5, 1]), { castShadow: false, receiveShadow: false });
    }
  }

  /* --- the thing in the lee ---------------------------------------------------- */
  // One wrapped body, hanging behind the north plate. Never more than one per
  // room: it is the pack's most direct prop and it works by being rare.
  wrapped(room, 4.6, -3.2, ceilingHeight - 0.2, 1.5);

  /* --- the rift ---------------------------------------------------------------- */
  // Buttress roots swelling out of both long walls at intervals, always in a
  // corner with a metre and a half of margin, so nothing they carry can seal a
  // door lane on an unlucky seed.
  buttress(room, -3.3, -3.3, 0.6, 2.4, 1.0);
  buttress(room, 11.2, -3.2, -2.4, 2.2, 0.9);
  buttress(room, 6.9, 3.4, 3.0, 2.0, 0.9);

  // Roots crossing overhead, out of one wall and into the other. They are what
  // make a rift read as a rift rather than as a long room.
  for (const [ax, az, bx2, bz2] of [
    [-3.6, -3.0, 1.4, 3.4],
    [6.4, -3.5, 11.4, 1.0],
    [1.8, 3.6, 6.6, -3.4],
  ] as const) {
    limb(room, 'root', [ax, ceilingHeight - 0.3, az], [bx2, ceilingHeight - 0.9, bz2], 0.16, 0.1, 0.4, ax + az, 6, { tile: 0.7, castShadow: true });
  }

  brackets(room, 'south', -2.6, 1.4, 4);
  brackets(room, 'north', 3.0, 1.1, 3, [1, 0]);
  toadstools(room, 1.2, -3.2, 0.9, 9, true);
  toadstools(room, 9.8, 3.0, 0.8, 7, false);
  litter(room, 0.4, 2.6, 1.4, 12);
  litter(room, 7.2, -2.4, 1.4, 12);
  litter(room, 10.6, 0.6, 1.2, 9);
  vineFall(room, 2.2, -3.3, 0.7, 5);
  vineFall(room, 9.4, 3.2, 0.7, 5);

  foxfire(room, [-2.0, 0.3, -1.6], 0.9, 11);
  foxfire(room, [8.6, 0.3, 1.4], 0.8, 9);
  foxfire(room, [4.2, 1.4, -2.15], 0.7, 8, true);
  plume(room, 4.0, 0, 0.6, 1.8, 1.6, 'hazeMist');
  plume(room, 9.4, -1.6, 0.4, 1.4, 1.2, 'hazeSpore');
  motes(room, 2.0, 0, 2.4, 2.6, 18, 'spore');
  motes(room, 9.0, 0, 2.4, 2.6, 14, 'dust');

  /* --- light --------------------------------------------------------------------- */
  // Three lamps for two cells, and they are deliberately at three different
  // heights: a corridor lit at one height is a corridor with no shape in it.
  const near = gillLamp(room, 'south', -2.8, 1.8, true, 9);
  if (near) {
    near.castShadow = true;
    near.shadow.mapSize.set(512, 512);
    near.shadow.autoUpdate = false;
    near.shadow.needsUpdate = true;
  }
  gillLamp(room, 'north', 3.4, 2.3, true, 8, [1, 0]);

  // The one warm point, low and inside the gap, so the two plates are rimmed
  // from between them and a player walking through is silhouetted to anybody at
  // either end of the rift.
  const sap = new THREE.PointLight(0xffa050, 7, ctx.dims.cellSize * 1.2, 2);
  sap.position.set(4.0, 0.7, 0);
  room.light(sap);
  const phase = room.range(0, 20);
  room.tick((t) => {
    sap.intensity = 7 * (1 + 0.11 * Math.sin(t * 0.55 + phase) + 0.05 * Math.sin(t * 1.9 + phase));
  });

  glowPool(room, 4.0, 0, 2.6);
  glowPool(room, -2.2, -1.6, 2.2, 'foxWash');
  glowPool(room, 8.6, 1.4, 2.0, 'foxWash');

  return room.finish();
}
